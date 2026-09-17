"""Conservative evidence scores; constants are policy choices, not fitted accuracy claims."""
import hashlib
import json
import math

PRIOR_MATCHES = 20.0
TIER_EVIDENCE_Z = 1.2815515655446004  # One-sided 90% normal approximation.
MIN_TIER_MATCHES = 20
MIN_TIER_WEIGHT = 10.0
HALF_LIFE_DAYS = 14.0


def posterior_rate(wins: float, matches: float, baseline: float = 0.5) -> float:
    return (wins + PRIOR_MATCHES * baseline) / (matches + PRIOR_MATCHES)


def supported_win_lift(wins: float, matches: float, baseline: float) -> tuple[float, float, float]:
    """Return posterior lift, conservative pick lift, and uncertainty margin.

    A Beta prior centered on the context baseline supplies PRIOR_MATCHES
    pseudo-observations. Recency-weighted observations form a power likelihood;
    the normal-approximation margin reflects their limited evidence. A Tier
    used for picks should require evidence before rewarding an apparent gain;
    observed losses retain their posterior estimate instead of being rewarded
    merely for having less evidence.
    """
    mean = posterior_rate(wins, matches, baseline)
    margin = TIER_EVIDENCE_Z * math.sqrt(mean * (1 - mean) / (matches + PRIOR_MATCHES + 1))
    lift = mean - baseline
    supported = min(lift, max(0.0, lift - margin))
    return lift, supported, margin


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
            tag = player.get("tag", "").replace("#", "").upper()
            if not tag:
                return None
            members.append((tag, (player.get("brawler") or {}).get("name", "")))
        participants.append(sorted(members))
    identity = [item["battleTime"], item.get("event"), battle.get("type"),
                battle.get("mode"), sorted(participants)]
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
