"""Offline fitting, low-rank pooling, team residual and untouched time audit."""
from datetime import datetime, timezone
from itertools import combinations
from collections import Counter
import logging
import numpy as np
from app.algorithm.draft_training import canonical_games, _fit
from app.algorithm.draft_outcome import composition_features
from app.algorithm.composition_model import VERSION, features, set_inputs, score
from app.algorithm.ranked_dataset import build_games, training_features

logger = logging.getLogger(__name__)


def improvement_interval(prediction, baseline, games, y, weights):
    difference = (np.logaddexp(0, prediction) - y * prediction) - (np.logaddexp(0, baseline) - y * baseline)
    days = sorted({g["date"].date() for g in games})
    blocks = []
    for day in days:
        mask = np.array([g["date"].date() == day for g in games])
        blocks.append([float(np.sum(weights[mask] * difference[mask])), float(weights[mask].sum())])
    blocks = np.array(blocks)
    if len(blocks) < 3:
        return {"days": len(blocks), "upper_95": None}
    sampled = np.random.default_rng(2026).integers(len(blocks), size=(2000, len(blocks)))
    totals = blocks[sampled].sum(axis=1)
    return {"days": len(blocks), "upper_95": float(np.quantile(totals[:, 0] / totals[:, 1], .95))}


def _penalty(key):
    kind, scope, _ = key.split("|", 2)
    if kind in ("o", "n"):
        return 20.
    scale = scope.split(":", 1)[0]
    return {"c": {"global": 10, "mode": 20, "map": 40},
            "e": {"global": 160, "mode": 320, "map": 640},
            "s": {"global": 160, "mode": 320, "map": 640}}[kind][scale]


def _metrics(z, y, weights):
    p = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
    bins = []
    for lo in np.arange(0, 1, .1):
        mask = (p >= lo) & (p < lo + .1)
        if mask.any():
            bins.append({"predicted": float(np.average(p[mask], weights=weights[mask])),
                         "actual": float(np.average(y[mask], weights=weights[mask])), "games": int(mask.sum())})
    return {"log_loss": float(np.average(np.logaddexp(0, z) - y * z, weights=weights)),
            "brier_score": float(np.average((p - y) ** 2, weights=weights)),
            "unweighted_log_loss": float(np.mean(np.logaddexp(0, z) - y * z)),
            "accuracy": float(np.mean((p >= .5) == y)), "calibration": bins}


def _outcome_metrics(model, games):
    from app.algorithm.composition_model import outcome_probabilities
    probabilities = np.array([outcome_probabilities(model, score(model, g["own"], g["enemy"], g["mode"], g["map"]), g["mode"]) for g in games])
    targets = np.array([2 if g.get("draw") else (0 if g["win"] == 1 else 1) for g in games])
    weights = np.array([g["weight"] for g in games])
    labels = np.eye(3)[targets]
    return {"log_loss": float(np.average(-np.log(np.maximum(probabilities[np.arange(len(games)), targets], 1e-12)), weights=weights)),
            "brier_score": float(np.average(np.sum((probabilities - labels) ** 2, axis=1), weights=weights)),
            "draw_games": int(np.sum(targets == 2))}


def _arrays(games, keys, controls=True):
    names = {key: i + 1 for i, key in enumerate(keys)}
    width = max(len(training_features(g, controls)) for g in games)
    indices = np.zeros((len(games), width), dtype=np.int32)
    values = np.zeros((len(games), width))
    for row, game in enumerate(games):
        for column, (key, value) in enumerate(training_features(game, controls).items()):
            indices[row, column], values[row, column] = names.get(key, 0), value if key in names else 0
    return indices, values


def _factors(names, weights):
    size = len(names)
    lookup = {name: i for i, name in enumerate(names)}
    enemy, ally = np.zeros((size, size)), np.zeros((size, size))
    for key, value in weights.items():
        kind, context, pair = key.split("|", 2)
        if context != "global" or kind not in ("e", "s"):
            continue
        first, second = pair.split(":")
        i, j = lookup[first], lookup[second]
        target = enemy if kind == "e" else ally
        target[i, j], target[j, i] = value, -value if kind == "e" else value
    u, singular, _ = np.linalg.svd(np.concatenate([enemy, ally], axis=1), full_matrices=False)
    k = min(8, size)
    vectors = u[:, :k] * np.sqrt(singular[:k])
    inverse = np.linalg.pinv(vectors)
    return vectors, inverse @ enemy @ inverse.T, inverse @ ally @ inverse.T


def _train_network(model, games, base, y, weights):
    if len(games) < 1000:
        return None
    x, reverse = zip(*(set_inputs(model, g["own"], g["enemy"], g["mode"]) for g in games))
    x, reverse = np.asarray(x), np.asarray(reverse)
    scale = np.maximum(np.sqrt(np.mean(np.concatenate([x, reverse]) ** 2, axis=0)), .1)
    x, reverse = x / scale, reverse / scale
    rng = np.random.default_rng(20261003)
    w1 = rng.normal(0, .1, (x.shape[1], 16))
    bias, w2 = np.zeros(16), np.zeros(16)
    params = [w1, bias, w2]
    first_moment = [np.zeros_like(p) for p in params]
    second_moment = [np.zeros_like(p) for p in params]
    # Fixed bounded fitting; model selection uses a separate chronological block.
    for step in range(1, 301):
        batch = rng.choice(len(games), min(4096, len(games)), replace=False)
        a, b = np.tanh(x[batch] @ w1 + bias), np.tanh(reverse[batch] @ w1 + bias)
        z = base[batch] + (a - b) @ w2 / 2
        nu = np.array([model.get("draw_strength", {}).get(games[i]["mode"], 0) for i in batch])
        a_odds, b_odds = np.exp(np.clip(z / 2, -15, 15)), np.exp(np.clip(-z / 2, -15, 15))
        denominator = a_odds + b_odds + nu
        error = .5 * (a_odds - b_odds) / denominator - (y[batch] - .5)
        grad = error * weights[batch] / weights[batch].sum()
        da = grad[:, None] * w2 * (1 - a * a) / 2
        db = -grad[:, None] * w2 * (1 - b * b) / 2
        grads = [x[batch].T @ da + reverse[batch].T @ db + .01 * w1,
                 (da + db).sum(axis=0) + .01 * bias,
                 (a - b).T @ grad / 2 + .01 * w2]
        for i, (param, gradient) in enumerate(zip(params, grads)):
            first_moment[i] = .9 * first_moment[i] + .1 * gradient
            second_moment[i] = .999 * second_moment[i] + .001 * gradient ** 2
            param -= .003 * first_moment[i] / (1 - .9 ** step) / (np.sqrt(second_moment[i] / (1 - .999 ** step)) + 1e-8)
    return {"w1": (w1 / scale[:, None]).tolist(), "bias": bias.tolist(), "w2": w2.tolist()}


def _fit_model(games, use_network, controls=True):
    characters = sorted({c for g in games for c in g["own"] + g["enemy"]})
    counts = Counter()
    for game in games:
        counts.update({k: game["weight"] * v * v for k, v in training_features(game, controls).items()})
    keys = {k for k, n in counts.items() if not k.startswith(("e|map:", "s|map:")) or n >= 20}
    keys.update(f"{kind}|global|{a}:{b}" for a, b in combinations(characters, 2) for kind in ("e", "s"))
    keys = sorted(keys)
    indices, values = _arrays(games, keys, controls)
    y, weights = np.array([g["win"] for g in games]), np.array([g["weight"] for g in games])
    draw_strength = {}
    for mode in {g["mode"] for g in games}:
        rows = [g for g in games if g["mode"] == mode]
        rate = (sum(g["weight"] * g.get("draw", False) for g in rows) + .1) / (sum(g["weight"] for g in rows) + 100)
        draw_strength[mode] = 2 * rate / (1 - rate)
    nu = np.array([draw_strength[g["mode"]] for g in games]) if controls else None
    penalties = np.array([1.] + [_penalty(k) for k in keys])
    beta = _fit(indices, values, y, weights, penalties, draw_strength=nu)
    vectors, r, s = _factors(characters, dict(zip(keys, beta[1:])))
    vector_map = dict(zip(characters, vectors.tolist()))
    prior = np.zeros(len(beta))
    for index, key in enumerate(keys, 1):
        kind, scope, pair = key.split("|", 2)
        if kind in ("e", "s") and scope == "global":
            a, b = pair.split(":")
            prior[index] = np.array(vector_map[a]) @ (r if kind == "e" else s) @ np.array(vector_map[b])
    beta = _fit(indices, values, y, weights, penalties, prior=prior, draw_strength=nu)
    support = np.bincount(indices.ravel(), weights=(weights[:, None] * values ** 2).ravel(), minlength=len(beta))
    model = {"version": VERSION, "weights": dict(zip(keys, beta[1:].tolist())),
             "support": dict(zip(keys, support[1:].tolist())), "temperature": 1.,
             "vectors": vector_map, "vector_size": vectors.shape[1],
             "set_modes": sorted({g["mode"] for g in games}), "network": None,
             "draw_strength": draw_strength if controls else {}}
    if use_network:
        base = np.sum(beta[indices] * values, axis=1)
        model["network"] = _train_network(model, games, base, y, weights)
        # Joint adjustment: coefficients are fitted conditional on the set effect.
        from app.algorithm.composition_model import set_residual
        offset = np.array([set_residual(model, g["own"], g["enemy"], g["mode"]) for g in games])
        beta = _fit(indices, values, y, weights, penalties, offset=offset, prior=prior, draw_strength=nu)
        model["weights"] = dict(zip(keys, beta[1:].tolist()))
    # Keep a bounded, deterministic outcome-independent reservoir of observed teams.
    rng = np.random.default_rng(42)
    templates = {}
    for mode in model["set_modes"]:
        teams = [team for g in games if g["mode"] == mode for team in (g["own"], g["enemy"])]
        templates[mode] = [list(teams[i]) for i in rng.choice(len(teams), min(256, len(teams)), replace=False)]
    model["completion_teams"] = templates
    model["weights"] = {k: round(v, 8) for k, v in model["weights"].items()}
    model["support"] = {k: round(v, 2) for k, v in model["support"].items()}
    squares = Counter()
    for game in games:
        squares.update({k: (game["weight"] * v * v) ** 2 for k, v in training_features(game, controls).items()})
    model["effective_support"] = {k: round(counts[k] ** 2 / squares[k], 2) for k in counts if squares[k] > 0}
    model["nuisance_weights"] = {k: v for k, v in model["weights"].items() if k.startswith(("o|", "n|"))}
    model["weights"] = {k: v for k, v in model["weights"].items() if not k.startswith(("o|", "n|"))}
    ability = [sum(v * model["nuisance_weights"].get(k, 0) for k, v in g.get("nuisance", {}).items() if k.startswith("n|")) for g in games]
    model["ability_variance"] = float(np.average(np.array(ability) ** 2, weights=weights))
    return model


def _scores(model, games):
    from app.algorithm.composition_model import outcome_probabilities
    values = []
    for g in games:
        z = score(model, g["own"], g["enemy"], g["mode"], g["map"])
        p, loss, _ = outcome_probabilities(model, z, g["mode"])
        values.append(float(np.log(p / loss)))
    return np.array(values)


def train_composition_model(records, eligible_tags, now=None, population="gachi", observations=(), snapshots=()):
    now = now or datetime.now(timezone.utc)
    games = build_games(records, eligible_tags, observations, snapshots, now, population)
    if len(games) < 4000:
        logger.warning("Keeping previous %s model: too few identified games", population)
        return None
    # Boundaries are timestamps: tied games never straddle a split.
    boundaries = [games[int(len(games) * fraction)]["date"] for fraction in (.6, .75, .85)]
    def available(g, cutoff):
        return g.get("collected_at") is None or g["collected_at"] < cutoff
    train = [g for g in games if g["date"] < boundaries[0] and available(g, boundaries[0])]
    selection = [g for g in games if boundaries[0] <= g["date"] < boundaries[1] and available(g, boundaries[1])]
    calibration = [g for g in games if boundaries[1] <= g["date"] < boundaries[2] and available(g, boundaries[2])]
    test = [g for g in games if g["date"] >= boundaries[2]]
    if min(map(len, (selection, calibration, test))) < 300:
        return None
    logger.info("Fitting %s: train=%s selection=%s calibration=%s test=%s", population, len(train), len(selection), len(calibration), len(test))
    selected_y, selected_w = np.array([g["win"] for g in selection]), np.array([g["weight"] for g in selection])
    plain = _fit_model(train, False)
    full = dict(plain)
    y, w = np.array([g["win"] for g in train]), np.array([g["weight"] for g in train])
    controlled_base = _scores(plain, train) + np.array([sum(plain.get("nuisance_weights", {}).get(k, 0) * v
                                                           for k, v in g.get("nuisance", {}).items()) for g in train])
    full["network"] = _train_network(full, train, controlled_base, y, w)
    use_network = _metrics(_scores(full, selection), selected_y, selected_w)["log_loss"] < _metrics(_scores(plain, selection), selected_y, selected_w)["log_loss"]
    # Refit the chosen architecture before calibration; do not refit after test.
    refit = [g for g in train + selection if available(g, boundaries[1])]
    model = _fit_model(refit, use_network)
    z = _scores(model, calibration)
    cal_y, cal_w = np.array([g["win"] for g in calibration]), np.array([g["weight"] for g in calibration])
    temperatures = np.exp(np.linspace(np.log(.5), np.log(2), 41))
    model["temperature"] = float(min(temperatures, key=lambda t: _metrics(z / t, cal_y, cal_w)["log_loss"]))
    # Matched v3 baseline. Both public predictions compare equal-skill teams.
    baseline = _fit_model(refit, False, controls=False)
    def baseline_scores(rows):
        return _scores(baseline, rows)
    baseline_cal = baseline_scores(calibration)
    baseline_temp = float(min(temperatures, key=lambda t: _metrics(baseline_cal / t, cal_y, cal_w)["log_loss"]))
    test_y, test_w = np.array([g["win"] for g in test]), np.array([g["weight"] for g in test])
    prediction, old_prediction = _scores(model, test), baseline_scores(test) / baseline_temp
    metrics, old_metrics = _metrics(prediction, test_y, test_w), _metrics(old_prediction, test_y, test_w)
    # Evaluate actual victory/defeat/draw probabilities as well as the historical
    # conditional win/loss metric. Give the baseline the same empirical draw prior.
    baseline["temperature"] = baseline_temp
    baseline["draw_strength"] = model["draw_strength"]
    outcomes, old_outcomes = _outcome_metrics(model, test), _outcome_metrics(baseline, test)
    interval = improvement_interval(prediction, old_prediction, test, test_y, test_w)
    groups = {}
    for mode in sorted({g["mode"] for g in test}):
        mask = np.array([g["mode"] == mode for g in test])
        groups[mode] = {"games": int(mask.sum()), "model": _metrics(prediction[mask], test_y[mask], test_w[mask]),
                        "baseline": _metrics(old_prediction[mask], test_y[mask], test_w[mask])}
    accepted = interval["upper_95"] is not None and interval["upper_95"] < 0 and outcomes["log_loss"] < old_outcomes["log_loss"] and metrics["log_loss"] < min(old_metrics["log_loss"], np.log(2)) and all(
        v["games"] < 500 or v["model"]["log_loss"] <= v["baseline"]["log_loss"] + .01 for v in groups.values())
    from app.algorithm.composition_model import center_pairs
    center_pairs(model)
    model.update({"population": population, "games": len(refit), "source_games": len(games), "target_unit": "api_record",
                  "trained_at": now.isoformat(), "accepted": bool(accepted),
                  "validation": {"boundaries": [b.isoformat() for b in boundaries], "selection_games": len(selection),
                                 "calibration_games": len(calibration), "test_games": len(test),
                                 "model": metrics, "baseline": old_metrics, "modes": groups,
                                 "outcomes": outcomes, "baseline_outcomes": old_outcomes,
                                 "improvement_interval": interval,
                                 "set_residual_selected": bool(use_network),
                                 "collection_timestamps_known": sum(g.get("collected_at") is not None for g in games),
                                 "legacy_collection_timestamps_unknown": sum(g.get("collected_at") is None for g in games),
                                 "controls_available": {key: sum(key in g.get("nuisance", {}) for g in games)
                                                        for key in ("n|global|rank_gap", "n|global|power_gap", "n|global|past_skill_gap")},
                                 "baseline_version": "composition_set_v3",
                                 "cohort": "as_of_rank_when_known_else_latest_verified",
                                 "prediction_condition": "equal_skill_power_and_collection_cohort"}})
    logger.info("%s validation: new=%.6f baseline=%.6f accepted=%s residual=%s", population, metrics["log_loss"], old_metrics["log_loss"], accepted, use_network)
    return model
