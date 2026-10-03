"""Hierarchical, recency-weighted composition estimates, not a calibrated model.

Use disjoint global-other-modes / mode-other-maps / selected-map evidence.
Pair effects are residuals from character strength, avoiding counting the same
character's win advantage again as a counter or teammate effect. Pseudo-counts
regularize small samples; no role-based penalties or Tier popularity are used.
"""
import math

PRIOR_MATCHES = (20.0, 40.0, 40.0)


def _logit(rate):
    rate = min(1 - 1e-6, max(1e-6, rate))
    return math.log(rate / (1 - rate))


def _sigmoid(value):
    return 1 / (1 + math.exp(-max(-30, min(30, value))))


def _mean(values):
    return sum(values) / len(values) if values else 0.0


def _subtract(wide, narrow):
    n = max(0.0, wide.get("matches", 0) - narrow.get("matches", 0))
    w = min(n, max(0.0, wide.get("wins", 0) - narrow.get("wins", 0)))
    return {"matches": n, "wins": w}


def _pair(scope, kind, first, second):
    forward = scope.get("pairs", {}).get(first, {}).get(kind, {}).get(second, {})
    reverse = scope.get("pairs", {}).get(second, {}).get(kind, {}).get(first, {})
    # Reciprocal rows describe the same games, so never add their counts.
    n = max(forward.get("matches", 0), reverse.get("matches", 0))
    if not n:
        return {}
    rates = []
    for value, inverted in [(forward, False), (reverse, kind == "counter")]:
        if value.get("matches", 0) == n:
            rate = value.get("wins", 0) / n
            rates.append(1 - rate if inverted else rate)
    return {"matches": n, "wins": n * _mean(rates)}


def _residual(prior, observations, expected, strength):
    n, w = observations.get("matches", 0), observations.get("wins", 0)
    posterior = (w + strength * _sigmoid(expected + prior)) / (n + strength)
    return _logit(posterior) - expected


def predict_draft(scopes, allies, enemies):
    """scopes are [global ranked elite+, selected mode, selected map]."""
    names = allies + enemies
    # Wide priors must exclude games subsequently used at a narrower level.
    layers = []
    for index, scope in enumerate(scopes):
        narrow = scopes[index + 1] if index + 1 < len(scopes) else {}
        totals = _subtract(scope.get("totals", {}), narrow.get("totals", {}))
        baseline = totals["wins"] / totals["matches"] if totals["matches"] else 0.5
        characters = {name: _subtract(scope.get("characters", {}).get(name, {}),
                                      narrow.get("characters", {}).get(name, {})) for name in names}
        layers.append((scope, narrow, baseline, characters))

    strengths = {name: 0.0 for name in names}
    counters = {(a, b): 0.0 for a in allies for b in enemies}
    teammate_pairs = [(group[i], group[j]) for group in [allies, enemies]
                      for i in range(3) for j in range(i + 1, 3)]
    synergies = {pair: 0.0 for pair in teammate_pairs}
    for index, (scope, narrow, baseline, characters) in enumerate(layers):
        prior_matches = PRIOR_MATCHES[index]
        for name in names:
            strengths[name] = _residual(strengths[name], characters[name], _logit(baseline), prior_matches)
        for a, b in counters:
            observed = _subtract(_pair(scope, "counter", a, b), _pair(narrow, "counter", a, b))
            expected = strengths[a] - strengths[b]
            counters[a, b] = _residual(counters[a, b], observed, expected, prior_matches)
        for a, b in synergies:
            observed = _subtract(_pair(scope, "synergy", a, b), _pair(narrow, "synergy", a, b))
            expected = _logit(baseline) + (strengths[a] + strengths[b]) / 2
            synergies[a, b] = _residual(synergies[a, b], observed, expected, prior_matches)

    own_strength = _mean([strengths[name] for name in allies])
    enemy_strength = _mean([strengths[name] for name in enemies])
    own_synergy = _mean([synergies[pair] for pair in teammate_pairs[:3]])
    enemy_synergy = _mean([synergies[pair] for pair in teammate_pairs[3:]])
    advantage = own_strength - enemy_strength + _mean(list(counters.values())) + own_synergy - enemy_synergy

    def synergy_points(pairs):
        return 100 * _mean([_sigmoid((strengths[a] + strengths[b]) / 2 + synergies[a, b])
                            - _sigmoid((strengths[a] + strengths[b]) / 2) for a, b in pairs])

    map_scope, global_scope = scopes[-1], scopes[0]
    map_pairs = sum(_pair(map_scope, "counter", a, b).get("matches", 0) >= 10 for a, b in counters)
    global_pairs = sum(_pair(global_scope, "counter", a, b).get("matches", 0) >= 10 for a, b in counters)
    global_synergies = sum(_pair(global_scope, "synergy", a, b).get("matches", 0) >= 10 for a, b in synergies)
    # Coverage alone cannot make ten observations "high confidence". Use the
    # weakest required component so a single poorly observed interaction is visible.
    def complete_support(scope, minimum):
        return all(scope.get("characters", {}).get(name, {}).get("matches", 0) >= minimum for name in names) and all(
            _pair(scope, kind, a, b).get("matches", 0) >= minimum
            for kind, pairs in [("counter", counters), ("synergy", synergies)] for a, b in pairs
        )
    confidence = "high" if complete_support(map_scope, 100) else "medium" if complete_support(global_scope, 20) else "low"
    return {
        "winRate": round(100 * _sigmoid(advantage)),
        "allyEnvAvg": 100 * _mean([_sigmoid(strengths[name]) for name in allies]),
        "enemyEnvAvg": 100 * _mean([_sigmoid(strengths[name]) for name in enemies]),
        "matchupAdvantage": 100 * _mean([_sigmoid(strengths[a] - strengths[b] + effect)
                                          - _sigmoid(strengths[a] - strengths[b]) for (a, b), effect in counters.items()]),
        "allySynergyAvg": synergy_points(teammate_pairs[:3]),
        "enemySynergyAvg": synergy_points(teammate_pairs[3:]),
        "confidence": confidence,
        "coverage": {"mapMatchups": map_pairs, "globalMatchups": global_pairs, "globalSynergies": global_synergies},
        "method": "disjoint_hierarchical_win_residuals_v1",
    }
