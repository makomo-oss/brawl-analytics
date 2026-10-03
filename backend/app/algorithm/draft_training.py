"""Batch-only fitting on unique complete Ranked games with temporal validation.

A nuisance observer indicator adjusts for the collection cohort winning more
often than untracked opponents. Predictions omit it to compare equal-skill teams.
Every observer of a game stays on the same side of the validation split.
"""
from datetime import datetime, timezone
import logging
import math
import numpy as np
from app.algorithm.draft_outcome import MODEL_VERSION, normalize, composition_features
from app.algorithm.statistics import ANALYSIS_WINDOW_DAYS

logger = logging.getLogger(__name__)
MODES = {"brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"}
# Chosen on temporal validation; narrow pair effects need stronger shrinkage.
PENALTIES = {"c_global": 10, "c_mode": 20, "c_map": 40, "pair_global": 160, "pair_mode": 320}


def canonical_games(records, eligible_tags, now=None, population="gachi"):
    now = now or datetime.now(timezone.utc)
    games, contradictions = {}, set()
    for row in records:
        allowed = ("soloRanked", "teamRanked") if population == "gachi" else ("ranked", "soloRanked", "teamRanked")
        if row.get("player_tag") not in eligible_tags or row.get("match_type") not in allowed:
            continue
        if row.get("result") not in ("victory", "defeat") or row.get("mode") not in MODES:
            continue
        own = tuple(sorted(normalize(c) for c in [row.get("hero_used")] + (row.get("allies") or [])))
        enemy = tuple(sorted(normalize(c) for c in (row.get("opponents") or [])))
        if len(own) != 3 or len(enemy) != 3 or (population == "gachi" and len(set(own + enemy)) != 6) or any(c in ("", "unknown", "none") for c in own + enemy):
            continue
        try:
            date = datetime.fromisoformat(str(row["match_at"]).replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError, KeyError):
            continue
        age = max(0, (now - date).total_seconds() / 86400)
        if age > ANALYSIS_WINDOW_DAYS:
            continue
        win, observer = int(row["result"] == "victory"), 1
        if own > enemy:
            own, enemy, win, observer = enemy, own, 1 - win, -1
        # Only identified battles can be safely deduplicated across observers.
        # Keep legacy records in storage, but do not train on ambiguous copies.
        key = row.get("battle_uid")
        if not key:
            continue
        value = dict(own=own, enemy=enemy, win=win, date=date, game=key, match_type=row["match_type"],
                     mode=row["mode"], map=row["map_id"], observers={observer},
                     weight=2 ** (-min(age, 30) / 30 - max(age - 30, 0) / 7))
        if key in games:
            old = games[key]
            if any(old[k] != value[k] for k in ("own", "enemy", "win", "date", "mode", "map")):
                contradictions.add(key)
            else:
                old["observers"].add(observer)
        else:
            games[key] = value
    return sorted((v for k, v in games.items() if k not in contradictions), key=lambda g: g["date"])


def _penalty(key):
    if key == "o|global|bias":
        return 1.0
    kind, context, _ = key.split("|", 2)
    scope = context.split(":", 1)[0]
    return PENALTIES[f"c_{scope}" if kind == "c" else f"pair_{scope}"]


def _fit(indices, values, outcomes, weights, penalties, offset=None, prior=None):
    size = len(penalties)
    flat = indices.ravel()
    coef = np.zeros(size)
    offset = np.zeros(len(outcomes)) if offset is None else offset
    prior = np.zeros(size) if prior is None else prior
    def objective(beta):
        z = np.sum(beta[indices] * values, axis=1) + offset
        return np.dot(weights, np.logaddexp(0, z) - outcomes * z) + .5 * np.dot(penalties, (beta - prior) ** 2)
    loss = objective(coef)
    for _ in range(100):
        z = np.sum(coef[indices] * values, axis=1) + offset
        probability = 1 / (1 + np.exp(-np.clip(z, -25, 25)))
        gradient = np.bincount(flat, weights=(((probability - outcomes) * weights)[:, None] * values).ravel(), minlength=size) + penalties * (coef - prior)
        diagonal = np.bincount(flat, weights=((probability * (1 - probability) * weights)[:, None] * values ** 2).ravel(), minlength=size) + penalties
        step = gradient / diagonal
        rate = 1.0
        for _ in range(14):
            candidate = coef - rate * step
            candidate_loss = objective(candidate)
            if candidate_loss <= loss - 1e-4 * rate * np.dot(gradient, step):
                break
            rate *= .5
        if candidate_loss > loss:
            break
        coef = candidate
        if abs(loss - candidate_loss) < 1e-6 * loss:
            break
        loss = candidate_loss
    return coef


def train_draft_model(records, eligible_tags, now=None):
    games = canonical_games(records, eligible_tags, now)
    if len(games) < 1000:
        logger.warning("Keeping previous draft model: only %s complete games", len(games))
        return None
    def features(game):
        result = composition_features(game["own"], game["enemy"], game["mode"], game["map"])
        result["o|global|bias"] = sum(game["observers"])
        return result
    keys = sorted({key for game in games for key in features(game)})
    names = {key: index + 1 for index, key in enumerate(keys)}
    indices = np.zeros((len(games), 49), dtype=np.int32)
    values = np.zeros((len(games), 49))
    for index, game in enumerate(games):
        for column, (key, value) in enumerate(features(game).items()):
            indices[index, column], values[index, column] = names[key], value
    outcomes = np.array([game["win"] for game in games])
    weights = np.array([game["weight"] for game in games])
    penalties = np.array([1.0] + [_penalty(key) for key in keys])
    cut_date = games[int(len(games) * .8)]["date"]
    train = np.array([i for i, game in enumerate(games) if game["date"] < cut_date])
    validation = np.array([i for i, game in enumerate(games) if game["date"] >= cut_date])
    if len(train) < 500 or len(validation) < 200:
        return None
    coef = _fit(indices[train], values[train], outcomes[train], weights[train], penalties)
    z = np.sum(coef[indices[validation]] * values[validation], axis=1)
    probability = 1 / (1 + np.exp(-np.clip(z, -25, 25)))
    actual = outcomes[validation]
    loss = float(np.average(np.logaddexp(0, z) - actual * z, weights=weights[validation]))
    # Measure public forecasts without knowing which side supplied the log.
    unbiased = z - coef[names["o|global|bias"]] * values[validation, -1]
    composition_loss = float(np.average(np.logaddexp(0, unbiased) - actual * unbiased, weights=weights[validation]))
    public_probability = 1 / (1 + np.exp(-np.clip(unbiased, -25, 25)))
    if not math.isfinite(loss) or not math.isfinite(composition_loss) or max(loss, composition_loss) >= math.log(2):
        logger.warning("Keeping previous draft model: temporal loss does not beat neutral")
        return None
    validation_metrics = {"training_games": len(train), "validation_games": len(validation),
                          "split_at": cut_date.isoformat(), "log_loss": composition_loss,
                          "cohort_log_loss": loss,
                          "composition_log_loss": composition_loss,
                          "brier_score": float(np.average((actual - public_probability) ** 2, weights=weights[validation])),
                          "accuracy": float(np.mean((public_probability >= .5) == actual)),
                          "neutral_log_loss": math.log(2)}
    coef = _fit(indices, values, outcomes, weights, penalties)
    support = np.bincount(indices.ravel(), weights=(weights[:, None] * values ** 2).ravel(), minlength=len(penalties))
    return {"version": MODEL_VERSION, "trained_at": (now or datetime.now(timezone.utc)).isoformat(),
            "games": len(games), "validation": validation_metrics,
            "weights": {key: round(float(coef[names[key]]), 8) for key in keys if not key.startswith("o|")},
            "support": {key: round(float(support[names[key]]), 2) for key in keys if not key.startswith("o|")}}
