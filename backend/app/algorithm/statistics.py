"""Conservative evidence scores; constants are policy choices, not fitted accuracy claims."""
import hashlib
import json
import math
from statistics import NormalDist

PRIOR_MATCHES = 20.0
TIER_EVIDENCE_MATCHES = 50.0  # Half credit for positive lift at 50 recency-weighted observations.
TIER_WIN_WEIGHT = 0.7
TIER_USAGE_WEIGHT = 0.3
NORMAL_TIER_Z = (2.0, 1.2, 0.4, -0.4, -1.2, -2.0)
MIN_TIER_MATCHES = 20
MIN_TIER_WEIGHT = 10.0
HALF_LIFE_DAYS = 14.0


def posterior_rate(wins: float, matches: float, baseline: float = 0.5) -> float:
    return (wins + PRIOR_MATCHES * baseline) / (matches + PRIOR_MATCHES)


def supported_win_lift(wins: float, matches: float, baseline: float) -> tuple[float, float, float]:
    """Return posterior lift, conservative pick lift, and sample discount.

    A Beta prior centered on the context baseline supplies PRIOR_MATCHES
    pseudo-observations. Positive lift gets a smooth reliability factor based
    on recency-weighted observations, avoiding a hard evidence cutoff that
    collapses nearby scores to 50. Observed losses retain their posterior
    estimate instead of being rewarded merely for having less evidence.
    """
    mean = posterior_rate(wins, matches, baseline)
    lift = mean - baseline
    supported = lift * matches / (matches + TIER_EVIDENCE_MATCHES) if lift > 0 else lift
    return lift, supported, lift - supported


def blend_tier_score(performance_score: float, pick_deviation: float, usage_cap: float) -> tuple[float, float, float]:
    """Blend deviations from 50 while limiting popularity's contribution."""
    win_adjustment = TIER_WIN_WEIGHT * (performance_score - 50.0)
    usage_adjustment = max(-usage_cap, min(usage_cap, TIER_USAGE_WEIGHT * (pick_deviation - 50.0)))
    return 50.0 + win_adjustment + usage_adjustment, win_adjustment, usage_adjustment


def normal_tier_boundaries(descending_scores: list[float]) -> list[int]:
    """Cumulative Tier sizes following normal quantiles without splitting displayed ties."""
    count = len(descending_scores)
    if not count:
        return [0] * len(NORMAL_TIER_Z)
    # The UI displays one decimal, so equal displayed scores keep the same Tier.
    group_ends = [0] + [index for index in range(1, count)
                        if round(descending_scores[index - 1], 1) > round(descending_scores[index], 1)] + [count]
    normal = NormalDist()
    boundaries = []
    previous = 0
    for z in NORMAL_TIER_Z:
        target = count * (1.0 - normal.cdf(z))
        boundary = min((end for end in group_ends if end >= previous),
                       key=lambda end: (abs(end - target), end))
        boundaries.append(boundary)
        previous = boundary
    return boundaries


def wilson_interval(wins: float, matches: float) -> tuple[float, float]:
    if matches <= 0:
        return 0.0, 1.0
    p = min(max(wins / matches, 0), 1)
    z = 1.96
    center = p + z * z / (2 * matches)
    spread = z * math.sqrt(p * (1-p) / matches + z*z / (4*matches*matches))
    denominator = 1 + z*z / matches
    return (center-spread)/denominator, (center+spread)/denominator


def battle_identity(item: dict) -> str | None:
    """Observer-independent identity for newly acquired logs, including participants."""
    battle = item.get("battle") or {}
    teams = battle.get("teams") or [[p] for p in battle.get("players", [])]
    if not item.get("battleTime") or not teams:
        return None
    participants = []
    for team in teams:
        members = []
        for player in team:
            tag = (player.get("tag") or "").replace("%23", "#").replace("#", "").upper()
            if not tag:
                return None
            members.append((tag, (player.get("brawler") or {}).get("name", "")))
        participants.append(sorted(members))
    identity = [item["battleTime"], item.get("event"), battle.get("type"),
                battle.get("mode"), sorted(participants)]
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
