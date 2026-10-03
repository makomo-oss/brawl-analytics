"""Offline fitting, low-rank pooling, team residual and untouched time audit."""
from datetime import datetime, timezone
from itertools import combinations
from collections import Counter
import logging
import numpy as np
from app.algorithm.draft_training import canonical_games, _fit
from app.algorithm.draft_outcome import composition_features
from app.algorithm.composition_model import VERSION, features, set_inputs, score

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


def _arrays(games, keys):
    names = {key: i + 1 for i, key in enumerate(keys)}
    width = max(len(features(g["own"], g["enemy"], g["mode"], g["map"])) for g in games)
    indices = np.zeros((len(games), width), dtype=np.int32)
    values = np.zeros((len(games), width))
    for row, game in enumerate(games):
        for column, (key, value) in enumerate(features(game["own"], game["enemy"], game["mode"], game["map"]).items()):
            indices[row, column], values[row, column] = names.get(key, 0), value if key in names else 0
    return indices, values


def _factors(names, weights):
    size = len(names)
    lookup = {name: i for i, name in enumerate(names)}
    enemy, ally = np.zeros((size, size)), np.zeros((size, size))
    for key, value in weights.items():
        kind, context, pair = key.split("|", 2)
        if context != "global" or kind == "c":
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
        grad = (1 / (1 + np.exp(-np.clip(z, -30, 30))) - y[batch]) * weights[batch] / weights[batch].sum()
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


def _fit_model(games, use_network):
    characters = sorted({c for g in games for c in g["own"] + g["enemy"]})
    counts = Counter()
    for game in games:
        counts.update({k: game["weight"] * v * v for k, v in features(game["own"], game["enemy"], game["mode"], game["map"]).items()})
    keys = {k for k, n in counts.items() if not k.startswith(("e|map:", "s|map:")) or n >= 20}
    keys.update(f"{kind}|global|{a}:{b}" for a, b in combinations(characters, 2) for kind in ("e", "s"))
    keys = sorted(keys)
    indices, values = _arrays(games, keys)
    y, weights = np.array([g["win"] for g in games]), np.array([g["weight"] for g in games])
    penalties = np.array([1.] + [_penalty(k) for k in keys])
    beta = _fit(indices, values, y, weights, penalties)
    vectors, r, s = _factors(characters, dict(zip(keys, beta[1:])))
    vector_map = dict(zip(characters, vectors.tolist()))
    prior = np.zeros(len(beta))
    for index, key in enumerate(keys, 1):
        kind, scope, pair = key.split("|", 2)
        if kind in ("e", "s") and scope == "global":
            a, b = pair.split(":")
            prior[index] = np.array(vector_map[a]) @ (r if kind == "e" else s) @ np.array(vector_map[b])
    beta = _fit(indices, values, y, weights, penalties, prior=prior)
    support = np.bincount(indices.ravel(), weights=(weights[:, None] * values ** 2).ravel(), minlength=len(beta))
    model = {"version": VERSION, "weights": dict(zip(keys, beta[1:].tolist())),
             "support": dict(zip(keys, support[1:].tolist())), "temperature": 1.,
             "vectors": vector_map, "vector_size": vectors.shape[1],
             "set_modes": sorted({g["mode"] for g in games}), "network": None}
    if use_network:
        base = np.sum(beta[indices] * values, axis=1)
        model["network"] = _train_network(model, games, base, y, weights)
        # Joint adjustment: coefficients are fitted conditional on the set effect.
        from app.algorithm.composition_model import set_residual
        offset = np.array([set_residual(model, g["own"], g["enemy"], g["mode"]) for g in games])
        beta = _fit(indices, values, y, weights, penalties, offset=offset, prior=prior)
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
    return model


def _scores(model, games):
    return np.array([score(model, g["own"], g["enemy"], g["mode"], g["map"]) for g in games])


def train_composition_model(records, eligible_tags, now=None, population="gachi"):
    now = now or datetime.now(timezone.utc)
    games = canonical_games(records, eligible_tags, now, population)
    if len(games) < 4000:
        logger.warning("Keeping previous %s model: too few identified games", population)
        return None
    # Boundaries are timestamps: tied games never straddle a split.
    boundaries = [games[int(len(games) * fraction)]["date"] for fraction in (.6, .75, .85)]
    train = [g for g in games if g["date"] < boundaries[0]]
    selection = [g for g in games if boundaries[0] <= g["date"] < boundaries[1]]
    calibration = [g for g in games if boundaries[1] <= g["date"] < boundaries[2]]
    test = [g for g in games if g["date"] >= boundaries[2]]
    if min(map(len, (selection, calibration, test))) < 300:
        return None
    logger.info("Fitting %s: train=%s selection=%s calibration=%s test=%s", population, len(train), len(selection), len(calibration), len(test))
    selected_y, selected_w = np.array([g["win"] for g in selection]), np.array([g["weight"] for g in selection])
    plain = _fit_model(train, False)
    full = dict(plain)
    y, w = np.array([g["win"] for g in train]), np.array([g["weight"] for g in train])
    full["network"] = _train_network(full, train, _scores(plain, train), y, w)
    use_network = _metrics(_scores(full, selection), selected_y, selected_w)["log_loss"] < _metrics(_scores(plain, selection), selected_y, selected_w)["log_loss"]
    # Refit the chosen architecture before calibration; do not refit after test.
    model = _fit_model(train + selection, use_network)
    z = _scores(model, calibration)
    cal_y, cal_w = np.array([g["win"] for g in calibration]), np.array([g["weight"] for g in calibration])
    temperatures = np.exp(np.linspace(np.log(.5), np.log(2), 41))
    model["temperature"] = float(min(temperatures, key=lambda t: _metrics(z / t, cal_y, cal_w)["log_loss"]))
    # Matched v2 baseline, trained on the same past interval (no observer feature).
    baseline_keys = sorted({k for g in train + selection for k in composition_features(g["own"], g["enemy"], g["mode"], g["map"])})
    bi, bv = _arrays(train + selection, baseline_keys)
    beta = _fit(bi, bv, np.array([g["win"] for g in train + selection]), np.array([g["weight"] for g in train + selection]), np.array([1.] + [_penalty(k) for k in baseline_keys]))
    baseline = {"weights": dict(zip(baseline_keys, beta[1:].tolist()))}
    def baseline_scores(rows):
        return np.array([sum(baseline["weights"].get(k, 0) * v for k, v in composition_features(g["own"], g["enemy"], g["mode"], g["map"]).items()) for g in rows])
    baseline_cal = baseline_scores(calibration)
    baseline_temp = float(min(temperatures, key=lambda t: _metrics(baseline_cal / t, cal_y, cal_w)["log_loss"]))
    test_y, test_w = np.array([g["win"] for g in test]), np.array([g["weight"] for g in test])
    prediction, old_prediction = _scores(model, test), baseline_scores(test) / baseline_temp
    metrics, old_metrics = _metrics(prediction, test_y, test_w), _metrics(old_prediction, test_y, test_w)
    interval = improvement_interval(prediction, old_prediction, test, test_y, test_w)
    groups = {}
    for mode in sorted({g["mode"] for g in test}):
        mask = np.array([g["mode"] == mode for g in test])
        groups[mode] = {"games": int(mask.sum()), "model": _metrics(prediction[mask], test_y[mask], test_w[mask]),
                        "baseline": _metrics(old_prediction[mask], test_y[mask], test_w[mask])}
    accepted = interval["upper_95"] is not None and interval["upper_95"] < 0 and metrics["log_loss"] < min(old_metrics["log_loss"], np.log(2)) and all(
        v["games"] < 500 or v["model"]["log_loss"] <= v["baseline"]["log_loss"] + .01 for v in groups.values())
    model.update({"population": population, "games": len(train) + len(selection), "source_games": len(games),
                  "trained_at": now.isoformat(), "accepted": bool(accepted),
                  "validation": {"boundaries": [b.isoformat() for b in boundaries], "selection_games": len(selection),
                                 "calibration_games": len(calibration), "test_games": len(test),
                                 "model": metrics, "baseline": old_metrics, "modes": groups,
                                 "improvement_interval": interval,
                                 "set_residual_selected": bool(use_network), "uses_collected_at": False}})
    logger.info("%s validation: new=%.6f baseline=%.6f accepted=%s residual=%s", population, metrics["log_loss"], old_metrics["log_loss"], accepted, use_network)
    return model
