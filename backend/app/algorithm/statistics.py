"""Conservative evidence scores; constants are policy choices, not fitted accuracy claims."""
import hashlib
import json
import math

PRIOR_MATCHES = 20.0
TIER_EVIDENCE_MATCHES = 50.0  # Single Beta prior for positive lift: half credit at 50 weighted observations.
TIER_WIN_WEIGHT = 0.7
TIER_USAGE_WEIGHT = 0.3
TIER_USAGE_STD_POINTS = 4.0  # Scales 1σ of log-pick-rate to typical ~4pt win-lift spread before 70/30 blend.
TIER_NAMES = ("S+", "S", "A+", "A", "B", "C")
DYNAMIC_TIER_Z = (1.75, 1.0, 0.35, -0.35, -1.0, -1.75)
TIER_PRIOR_CHARS = 10.0
TIER_PRIOR_MEAN = 50.0
TIER_PRIOR_STD = 2.5
MIN_TIER_STD = 1.0
MIN_TIER_MATCHES = 20
MIN_TIER_WEIGHT = 10.0
ANALYSIS_WINDOW_DAYS = 60
RECENT_WINDOW_DAYS = 30
HALF_LIFE_DAYS = 30.0
OLDER_HALF_LIFE_DAYS = 7.0


def posterior_rate(wins: float, matches: float, baseline: float = 0.5) -> float:
    if matches <= 0:
        return baseline
    return (wins + PRIOR_MATCHES * baseline) / (matches + PRIOR_MATCHES)


def supported_win_lift(wins: float, matches: float, baseline: float) -> tuple[float, float, float]:
    """Return posterior lift, conservative pick lift, and sample discount.

    A Beta prior centered on the context baseline supplies PRIOR_MATCHES
    pseudo-observations for the posterior lift. Positive lift uses a stronger
    single Beta prior (TIER_EVIDENCE_MATCHES) instead of shrinking twice, so
    50 recency-weighted observations earn exactly half of the raw positive lift.
    Observed losses retain their posterior estimate instead of being rewarded
    merely for having less evidence.
    """
    if matches <= 0:
        return 0.0, 0.0, 0.0
    mean = posterior_rate(wins, matches, baseline)
    lift = mean - baseline
    supported = (wins - matches * baseline) / (matches + TIER_EVIDENCE_MATCHES) if lift > 0 else lift
    return lift, supported, lift - supported


def blend_tier_score(performance_score: float, pick_deviation: float, usage_cap: float) -> tuple[float, float, float]:
    """Blend deviations from 50 with a smooth, bounded popularity contribution."""
    win_adjustment = TIER_WIN_WEIGHT * (performance_score - 50.0)
    if usage_cap <= 0:
        usage_adjustment = 0.0
    else:
        pick_z = (pick_deviation - 50.0) / 10.0
        raw_usage = TIER_USAGE_WEIGHT * TIER_USAGE_STD_POINTS * pick_z
        usage_adjustment = usage_cap * math.tanh(raw_usage / usage_cap)
    return 50.0 + win_adjustment + usage_adjustment, win_adjustment, usage_adjustment


def dynamic_tier_thresholds(scores: list[float]) -> tuple[tuple[float, str], ...]:
    """Compute Empirical-Bayes dynamic Tier thresholds from a cohort's score distribution.

    Shrinks the sample mean and variance toward a neutral prior (mean=50,
    std=2.5, weight=10 characters) with a minimum std floor so small or tied
    cohorts remain stable. Thresholds are rounded to 1 decimal place to match
    displayed scores.
    """
    count = len(scores)
    if not count:
        eff_mean = TIER_PRIOR_MEAN
        eff_std = TIER_PRIOR_STD
    else:
        mean = sum(scores) / count
        variance = sum((score - mean) ** 2 for score in scores) / count
        eff_mean = (count * mean + TIER_PRIOR_CHARS * TIER_PRIOR_MEAN) / (count + TIER_PRIOR_CHARS)
        eff_std = max(
            MIN_TIER_STD,
            math.sqrt((count * variance + TIER_PRIOR_CHARS * (TIER_PRIOR_STD ** 2)) / (count + TIER_PRIOR_CHARS)),
        )
    return tuple((round(eff_mean + z * eff_std, 1), name) for z, name in zip(DYNAMIC_TIER_Z, TIER_NAMES))


def assign_tier(displayed_score: float, thresholds: tuple[tuple[float, str], ...]) -> str:
    """Assign a Tier using the 1-decimal displayed score so UI and Tier always match."""
    rounded = round(displayed_score, 1)
    return next((name for threshold, name in thresholds if rounded >= threshold), "D")


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
