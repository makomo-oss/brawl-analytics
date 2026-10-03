"""Adjusted composition effects and permutation-invariant team residuals.

Only observed battle outcomes train these features. No role or ability labels.
The sparse effects control the other five characters and mode/map together;
they describe conditional team associations, not causal lane win probabilities.
"""
from itertools import combinations, permutations
import numpy as np
from app.algorithm.draft_outcome import sigmoid

VERSION = "ranked_joint_v4"


def character_effect(model, name, mode=None, map_id=None):
    scopes = ["global"] + ([f"mode:{mode}"] if mode else []) + ([f"map:{mode}:{map_id}"] if mode and map_id else [])
    value = 0.
    for scope in scopes:
        center = model.get("pair_centering", {}).get(scope, {})
        value += model["weights"].get(f"c|{scope}|{name}", 0)
        value += 3 * center.get("e", {}).get(name, 0) + 2 * center.get("s", {}).get(name, 0)
    return value / model.get("temperature", 1)


def center_pairs(model):
    """Fix the pair/main-effect gauge without changing complete 3v3 odds.

    Skew enemy rows and off-diagonal symmetric teammate rows sum to zero.
    Sparse offsets avoid materializing millions of unseen map pairs.
    """
    names = sorted(k.split("|", 2)[2] for k in model["weights"] if k.startswith("c|global|"))
    if len(names) < 3:
        return model
    scopes = {k.split("|", 2)[1] for k in model["weights"]}
    centers = {}
    for scope in scopes:
        rows = {kind: dict.fromkeys(names, 0.) for kind in ("e", "s")}
        for key, value in model["weights"].items():
            kind, context, pair = key.split("|", 2)
            if context != scope or kind not in rows:
                continue
            a, b = pair.split(":")
            rows[kind][a] += value
            rows[kind][b] += -value if kind == "e" else value
        n = len(names)
        mean = sum(rows["s"].values()) / (2 * (n - 1))
        centers[scope] = {"e": {a: v / n for a, v in rows["e"].items()},
                          "s": {a: (v - mean) / (n - 2) for a, v in rows["s"].items()}}
    model["pair_centering"] = centers
    return model


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
    sign = 1 if kind == "s" or first < second else -1
    value = 0.
    for scope in scopes:
        value += sign * model["weights"].get(f"{kind}|{scope}|{pair}", 0)
        offset = model.get("pair_centering", {}).get(scope, {}).get(kind, {})
        value -= offset.get(first, 0)
        value += (-1 if kind == "s" else 1) * offset.get(second, 0)
    return value / model.get("temperature", 1)


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
    return outcome_probabilities(model, score(model, allies, enemies, mode, map_id), mode)[0]


def outcome_probabilities(model, z, mode):
    # Integrate unknown equal-population skill differences; zero means absent
    # training information, never a claim that an unknown player is a beginner.
    variance = model.get("ability_variance", 0) / model.get("temperature", 1) ** 2
    nodes = (-2.85697, -1.35563, 0., 1.35563, 2.85697)
    weights = (.0112574, .2220759, .5333334, .2220759, .0112574)
    nu = model.get("draw_strength", {}).get(mode, 0.)
    win = loss = draw = 0.
    import math
    for node, weight in zip(nodes, weights):
        value = max(-30., min(30., z + node * math.sqrt(variance)))
        a, b = math.exp(value / 2), math.exp(-value / 2)
        total = a + b + nu
        win += weight * a / total
        loss += weight * b / total
        draw += weight * nu / total
    return win, loss, draw


def predict(model, allies, enemies, mode, map_id):
    f = features(allies, enemies, mode, map_id)
    temp = model.get("temperature", 1)
    def part(kind):
        if kind == "e" and model.get("pair_centering"):
            return sum(pair_effect(model, a, b, mode, map_id) for a in allies for b in enemies)
        return sum(model["weights"].get(k, 0) * v for k, v in f.items() if k.startswith(kind + "|")) / temp
    def own_part(team, kind):
        if model.get("pair_centering"):
            if kind == "c":
                return sum(character_effect(model, a, mode, map_id) for a in team)
            return sum(pair_effect(model, a, b, mode, map_id, "s") for a, b in combinations(team, 2))
        return sum(model["weights"].get(k, 0) * v for k, v in features(team, [], mode, map_id).items() if k.startswith(kind + "|")) / temp
    z = score(model, allies, enemies, mode, map_id)
    p, loss, draw = outcome_probabilities(model, z, mode)
    components = {"environment": own_part(allies, "c") - own_part(enemies, "c"),
                  "enemy": part("e"), "teammate": own_part(allies, "s") - own_part(enemies, "s"),
                  "composition": set_residual(model, allies, enemies, mode) / temp}
    # Average every attribution order; contributions sum to P(draft)-P(neutral).
    attribution = dict.fromkeys(components, 0.)
    for order in permutations(components):
        current = 0.
        for key in order:
            before = outcome_probabilities(model, current, mode)[0]
            current += components[key]
            attribution[key] += 100 * (outcome_probabilities(model, current, mode)[0] - before) / 24
    support = model.get("support", {})
    minimum = min((support.get(k, 0) for k in f if k.startswith(("e|mode:", "s|mode:"))), default=0)
    return {"winRate": round(100 * p),
            "allyEnvAvg": 100 * sigmoid(own_part(allies, "c") / 3),
            "enemyEnvAvg": 100 * sigmoid(own_part(enemies, "c") / 3),
            "matchupAdvantage": 100 * (p - outcome_probabilities(model, z - part("e"), mode)[0]),
            "allySynergyAvg": 100 * (p - outcome_probabilities(model, z - own_part(allies, "s"), mode)[0]),
            "enemySynergyAvg": 100 * (loss - outcome_probabilities(model, -z - own_part(enemies, "s"), mode)[0]),
            "compositionEffect": 100 * (p - sigmoid(z - set_residual(model, allies, enemies, mode) / temp)),
            "confidence": "medium" if minimum >= 40 else "low", "method": model.get("version", VERSION),
            "targetUnit": model.get("target_unit", "api_record"), "drawRate": 100 * draw, "lossRate": 100 * loss,
            "modelTrainedAt": model.get("trained_at"), "contributions": attribution,
            "neutralWinRate": 100 * outcome_probabilities(model, 0, mode)[0]}


def effect_rows(model):
    rows = []
    for key, count in model.get("support", {}).items():
        kind, scope, pair = key.split("|", 2)
        if kind not in ("c", "e", "s") or count <= 0:
            continue
        args = scope.split(":", 2)
        mode = args[1] if len(args) > 1 else None
        map_id = args[2] if len(args) > 2 else None
        a, b = (pair, "") if kind == "c" else pair.split(":")
        # Save the individual scope, rather than cumulative global+map effects.
        value = model["weights"].get(key, 0.)
        offsets = model.get("pair_centering", {}).get(scope, {})
        if kind == "c":
            value += 3 * offsets.get("e", {}).get(a, 0) + 2 * offsets.get("s", {}).get(a, 0)
        else:
            value -= offsets.get(kind, {}).get(a, 0)
            value += (-1 if kind == "s" else 1) * offsets.get(kind, {}).get(b, 0)
        rows.append({"kind": kind, "context": scope, "char_a": a, "char_b": b,
                     "effect_log_odds": float(value / model.get("temperature", 1)),
                     "weighted_matches": count, "effective_matches": model.get("effective_support", {}).get(key)})
    return rows


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
