"""Jointly fitted team outcome effects, not individual lane win rates.

Battle logs measure team victories. Enemy coefficients adjust for the other
five characters; the same contributions rank picks and predict final drafts.
"""
import math
from itertools import combinations

MODEL_VERSION = "composition_logistic_v2"


def normalize(name):
    return str(name).strip().lower().translate(str.maketrans("", "", " _-.&"))


def sigmoid(value):
    return 1 / (1 + math.exp(-max(-30, min(30, value))))


def composition_features(allies, enemies, mode, map_id):
    features = {}
    for team, sign in ((allies, 1), (enemies, -1)):
        for name in team:
            for context in ("global", f"mode:{mode}", f"map:{mode}:{map_id}"):
                key = f"c|{context}|{name}"
                features[key] = features.get(key, 0) + sign
        for first, second in combinations(sorted(team), 2):
            for context in ("global", f"mode:{mode}"):
                key = f"s|{context}|{first}:{second}"
                features[key] = features.get(key, 0) + sign
    for first in allies:
        for second in enemies:
            if first == second:
                continue
            pair = ":".join(sorted((first, second)))
            for context in ("global", f"mode:{mode}"):
                key = f"e|{context}|{pair}"
                features[key] = features.get(key, 0) + (1 if first < second else -1)
    return features


def contribution(model, features, kind=None):
    return sum(model["weights"].get(key, 0) * value for key, value in features.items()
               if kind is None or key.startswith(kind + "|"))


def draft_score(model, allies, enemies, mode, map_id):
    if model.get("version") in ("composition_set_v3", "ranked_joint_v4"):
        from app.algorithm.composition_model import score
        return score(model, allies, enemies, mode, map_id)
    return contribution(model, composition_features(allies, enemies, mode, map_id))


def predict_draft(model, allies, enemies, mode, map_id):
    if model.get("version") in ("composition_set_v3", "ranked_joint_v4"):
        from app.algorithm.composition_model import predict
        return predict(model, allies, enemies, mode, map_id)
    features = composition_features(allies, enemies, mode, map_id)
    base = contribution(model, features, "c")
    counter = contribution(model, features, "e")
    own_features = composition_features(allies, [], mode, map_id)
    enemy_features = composition_features(enemies, [], mode, map_id)
    own_syn = contribution(model, own_features, "s")
    enemy_syn = contribution(model, enemy_features, "s")
    total = base + counter + own_syn - enemy_syn
    support = model.get("support", {})
    required = [key for key in features if key.startswith(("e|mode:", "s|mode:"))]
    enough = all(support.get(key, 0) >= 40 for key in required)
    return {
        "winRate": round(100 * sigmoid(total)),
        "allyEnvAvg": 100 * sigmoid(contribution(model, own_features, "c")),
        "enemyEnvAvg": 100 * sigmoid(contribution(model, enemy_features, "c")),
        "matchupAdvantage": 100 * (sigmoid(total) - sigmoid(total - counter)),
        "allySynergyAvg": 100 * (sigmoid(total) - sigmoid(total - own_syn)),
        "enemySynergyAvg": 100 * (sigmoid(-total) - sigmoid(-total - enemy_syn)),
        # Marginal sample sizes do not establish confidence in an unseen draft.
        "confidence": "medium" if enough else "low",
        "method": MODEL_VERSION,
    }


def recommend_picks(model, allies, enemies, candidates, excluded, mode, map_id):
    if model.get("version") in ("composition_set_v3", "ranked_joint_v4"):
        from app.algorithm.composition_model import recommendations
        return recommendations(model, allies, enemies, candidates, excluded, mode, map_id)
    results = []
    before = draft_score(model, allies, enemies, mode, map_id)
    support = model.get("support", {})
    for name in candidates:
        if name in excluded or name in allies or name in enemies:
            continue
        score = draft_score(model, allies + [name], enemies, mode, map_id)
        effects = []
        for enemy in enemies:
            pair_features = composition_features([name], [enemy], mode, map_id)
            effect = contribution(model, pair_features, "e")
            pair_key = ":".join(sorted((name, enemy)))
            if support.get(f"e|global|{pair_key}", 0) >= 50:
                effects.append({"enemy": enemy, "points": round(100 * (sigmoid(score) - sigmoid(score - effect)), 1)})
        effects.sort(key=lambda item: -abs(item["points"]))
        results.append({"name": name, "score": 100 * sigmoid(score - before),
                        "counterEffects": [item for item in effects if abs(item["points"]) >= 2][:2]})
    return sorted(results, key=lambda item: (-item["score"], item["name"]))[:10]
