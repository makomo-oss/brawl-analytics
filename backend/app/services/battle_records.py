"""Convert Brawl API battle logs into the observations used by analytics."""
import logging
from datetime import datetime, timezone

from app.algorithm.statistics import battle_identity

logger = logging.getLogger(__name__)
SUPPORTED_TYPES = {"ranked", "soloRanked", "teamRanked"}


def parse_battle_time(raw: str) -> str:
    for format_string in ("%Y%m%dT%H%M%S.%fZ", "%Y%m%dT%H%M%SZ"):
        try:
            return datetime.strptime(raw, format_string).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    raise ValueError("Invalid battle time")


def clean_tag(tag: str) -> str:
    return str(tag or "").replace("%23", "#").replace("#", "").strip().upper().replace("O", "0")


def ranked_encountered_tags(items: list) -> set[str]:
    """Find players encountered in actual Ranked battles for crawler discovery."""
    tags = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        battle = item.get("battle") or {}
        if not isinstance(battle, dict):
            continue
        if battle.get("type") not in ("soloRanked", "teamRanked"):
            continue
        teams = battle.get("teams") or [battle.get("players") or []]
        for team in teams:
            for player in team:
                if isinstance(player, dict) and player.get("tag"):
                    tags.add(clean_tag(player["tag"]))
    return tags


def deduplicate_battle_records(records: list[dict]) -> list[dict]:
    """Keep one observation per database key within a single upsert payload."""
    unique = {}
    for record in records:
        key = record["match_id"]
        previous = unique.get(key)
        if previous is None or _record_quality(record) > _record_quality(previous):
            unique[key] = record
    return list(unique.values())


def _record_quality(record: dict) -> int:
    return (int(record.get("hero_used") not in (None, "", "unknown"))
            + int(record.get("map_id") not in (None, "", "unknown"))
            + len(record.get("allies") or []) + len(record.get("opponents") or []))


def parse_battlelog(player_tag: str, items: list) -> tuple[list[dict], set[str]]:
    """Keep each valid observation even when a neighboring log item is malformed."""
    tag = clean_tag(player_tag)
    records = []
    encountered = set()
    for item in items or []:
        try:
            battle = item.get("battle") or {}
            event = item.get("event") or {}
            battle_type = battle.get("type")
            if battle_type not in SUPPORTED_TYPES:
                continue
            raw_mode = event.get("mode")
            if not raw_mode or raw_mode == "unknown":
                raw_mode = battle.get("mode") or "unknown"
            result = battle.get("result")
            if not result:
                rank = battle.get("rank")
                trophy_change = battle.get("trophyChange")
                if rank is not None:
                    winner = rank <= (4 if str(raw_mode).lower() == "soloshowdown" else 2)
                    result = "victory" if winner else "defeat"
                elif trophy_change is not None and trophy_change != 0:
                    result = "victory" if trophy_change > 0 else "defeat"
            if not result:
                continue

            battle_time = item.get("battleTime")
            if not battle_time:
                continue
            match_at = parse_battle_time(battle_time)
            teams = battle.get("teams") or []
            players = battle.get("players") or []
            hero_used = "unknown"
            allies = []
            opponents = []
            participants = set()

            if teams:
                for team in teams:
                    my_team = any(clean_tag(p.get("tag")) == tag for p in team)
                    for player in team:
                        participant = clean_tag(player.get("tag"))
                        if participant:
                            participants.add(participant)
                        brawler = (player.get("brawler") or {}).get("name") or "unknown"
                        if my_team:
                            if participant == tag:
                                hero_used = brawler
                            else:
                                allies.append(brawler)
                        else:
                            opponents.append(brawler)
            elif players:
                for player in players:
                    participant = clean_tag(player.get("tag"))
                    if participant:
                        participants.add(participant)
                    brawler = (player.get("brawler") or {}).get("name") or "unknown"
                    if participant == tag:
                        hero_used = brawler
                    else:
                        opponents.append(brawler)

            # A battle without the requested player is not their observation.
            if hero_used == "unknown":
                continue

            mode = raw_mode
            if mode in ("duoShowdown", "duo_showdown") and teams and any(len(t) >= 3 for t in teams):
                mode = "trioShowdown"

            records.append({
                "match_id": f"{tag}_{battle_time}",
                "battle_uid": battle_identity(item),
                "player_tag": tag,
                "match_at": match_at,
                "match_type": battle_type,
                "mode": mode,
                "map_id": str(event.get("map") or "unknown").strip() or "unknown",
                "result": result,
                "hero_used": hero_used,
                "allies": allies,
                "opponents": opponents,
            })
            encountered.update(participants)
        except (AttributeError, TypeError, ValueError, KeyError) as exc:
            logger.warning("Skipping invalid battle for %s: %s", tag, exc)
    return deduplicate_battle_records(records), encountered
