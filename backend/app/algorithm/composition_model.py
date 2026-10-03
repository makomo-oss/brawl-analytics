"""Adjusted composition effects and permutation-invariant team residuals.

Only observed battle outcomes train these features. No role or ability labels.
The sparse effects control the other five characters and mode/map together;
they describe conditional team associations, not causal lane win probabilities.
"""
from itertools import combinations
import numpy as np
from app.algorithm.draft_outcome import sigmoid

VERSION = "composition_set_v3"


def features(allies, enemies, mode, map_id):
    result = {}
    for team, sign in ((allies, 1), (enemies, -1)):
        for name in team:
            for scope in ("global", f"mode:{mode}", f"map:{mode}:{map_id}"):
                key = f"c|{scope}|{name}"
                result[key] = result.get(key, 0) + sign
        for first, second in combinations(sorted(team), 2):
            if first == second:
                continue
            for scope in ("global", f"mode:{mode}", f"map:{mode}:{map_id}"):
                key = f"s|{scope}|{first}:{second}"
                result[key] = result.get(key, 0) + sign
    for first in allies:
        for second in enemies:
            if first == second:
                continue
            for scope in ("global", f"mode:{mode}", f"map:{mode}:{map_id}"):
                key = f"e|{scope}|{':'.join(sorted((first, second)))}"
                result[key] = result.get(key, 0) + (1 if first < second else -1)
    return result


def pair_effect(model, first, second, mode=None, map_id=None, kind="e"):
    if first == second:
        return 0.0
    pair = ":".join(sorted((first, second)))
    scopes = ["global"]
    if mode:
        scopes.append(f"mode:{mode}")
    if mode and map_id:
        scopes.append(f"map:{mode}:{map_id}")
    value = sum(model["weights"].get(f"{kind}|{scope}|{pair}", 0) for scope in scopes)
    return value * (1 if kind == "s" or first < second else -1) / model.get("temperature", 1)


def pair_points(model, first, second, mode=None, map_id=None, kind="e"):
    # Centered conditional log-odds contribution, never a measured 1v1 win rate.
    return 100 * (sigmoid(pair_effect(model, first, second, mode, map_id, kind)) - .5)


def team_vector(model, team):
    vectors = model.get("vectors", {})
    size = model.get("vector_size", 8)
    matrix = np.array([vectors.get(name, [0.] * size) for name in sorted(team)], dtype=float)
    if not len(matrix):
        return np.zeros(2 * size)
    return np.concatenate([matrix.sum(axis=0), (matrix * matrix).sum(axis=0)])


def set_inputs(model, allies, enemies, mode):
    own, enemy = team_vector(model, allies), team_vector(model, enemies)
    modes = model.get("set_modes", [])
    context = np.array([float(mode == value) for value in modes])
    return np.concatenate([own, enemy, context]), np.concatenate([enemy, own, context])


def set_residual(model, allies, enemies, mode):
    net = model.get("network")
    if not net or len(allies) != 3 or len(enemies) != 3:
        return 0.0
    # At most a few hundred tiny arrays per request; all weights are immutable.
    w1, bias, w2 = np.asarray(net["w1"]), np.asarray(net["bias"]), np.asarray(net["w2"])
    first, reverse = set_inputs(model, allies, enemies, mode)
    return float((np.tanh(first @ w1 + bias) - np.tanh(reverse @ w1 + bias)) @ w2 / 2)


def score(model, allies, enemies, mode, map_id):
    base = sum(model["weights"].get(key, 0) * value
               for key, value in features(allies, enemies, mode, map_id).items())
    return (base + set_residual(model, allies, enemies, mode)) / model.get("temperature", 1)


def probability(model, allies, enemies, mode, map_id):
    return sigmoid(score(model, allies, enemies, mode, map_id))


def predict(model, allies, enemies, mode, map_id):
    f = features(allies, enemies, mode, map_id)
    temp = model.get("temperature", 1)
    def part(kind):
        return sum(model["weights"].get(k, 0) * v for k, v in f.items() if k.startswith(kind + "|")) / temp
    def own_part(team, kind):
        return sum(model["weights"].get(k, 0) * v for k, v in features(team, [], mode, map_id).items() if k.startswith(kind + "|")) / temp
    z = score(model, allies, enemies, mode, map_id)
    p = sigmoid(z)
    support = model.get("support", {})
    minimum = min((support.get(k, 0) for k in f if k.startswith(("e|mode:", "s|mode:"))), default=0)
    return {"winRate": round(100 * p),
            "allyEnvAvg": 100 * sigmoid(own_part(allies, "c")),
            "enemyEnvAvg": 100 * sigmoid(own_part(enemies, "c")),
            "matchupAdvantage": 100 * (p - sigmoid(z - part("e"))),
            "allySynergyAvg": 100 * (p - sigmoid(z - own_part(allies, "s"))),
            "enemySynergyAvg": 100 * (sigmoid(-z) - sigmoid(-z - own_part(enemies, "s"))),
            "compositionEffect": 100 * (p - sigmoid(z - set_residual(model, allies, enemies, mode) / temp)),
            "confidence": "medium" if minimum >= 40 else "low", "method": VERSION}


def recommendations(model, allies, enemies, candidates, excluded, mode, map_id):
    pool = sorted(set(candidates) - set(allies) - set(enemies) - set(excluded))
    # Empirical completed teams, sampled without looking at victory/defeat.
    teams = model.get("completion_teams", {}).get(mode, [])
    if not teams:
        teams = model.get("completion_teams", {}).get("all", [])
    rng = np.random.default_rng(1729)
    plans = []
    for _ in range(64):
        if teams:
            plans.append((teams[int(rng.integers(len(teams)))], teams[int(rng.integers(len(teams)))]))
        else:
            plans.append((list(rng.permutation(pool)), list(rng.permutation(pool))))
    results = []
    for name in pool:
        predicted = []
        for own_template, enemy_template in plans:
            own, enemy = list(allies) + [name], list(enemies)
            available = [c for c in pool if c != name]
            rng_local = np.random.default_rng(len(predicted) + 42)
            fallback = list(rng_local.permutation(available))
            for team, template in ((enemy, enemy_template), (own, own_template)):
                for candidate in list(template) + fallback:
                    if len(team) == 3:
                        break
                    if candidate not in own and candidate not in enemy and candidate not in excluded and candidate in candidates:
                        team.append(candidate)
            if len(own) == len(enemy) == 3:
                predicted.append(probability(model, own, enemy, mode, map_id))
        if not predicted:
            continue
        effects = [{"enemy": enemy, "points": round(pair_points(model, name, enemy, mode, map_id), 1)}
                   for enemy in enemies if model.get("support", {}).get(f"e|global|{':'.join(sorted((name, enemy)))}", 0) >= 50]
        effects.sort(key=lambda v: -abs(v["points"]))
        results.append({"name": name, "score": 100 * float(np.mean(predicted)),
                        "counterEffects": [v for v in effects if abs(v["points"]) >= 2][:2]})
    return sorted(results, key=lambda v: (-v["score"], v["name"]))[:10]
