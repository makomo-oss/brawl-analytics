"""Personal analytics from saved observations, with explicit sample limits."""
from collections import defaultdict, OrderedDict
from datetime import datetime, timedelta, timezone
import logging
import re
from threading import RLock
import time

from app.algorithm.statistics import posterior_rate, wilson_interval

logger = logging.getLogger(__name__)
HISTORY_DAYS = 60
PAGE_SIZE = 1000
MAX_HISTORY = 10000
HISTORY_COLUMNS = "match_id,match_at,match_type,mode,map_id,result,hero_used,allies,opponents"
MATCH_TYPES = {"ranked", "soloRanked", "teamRanked"}
TEAM_MODES = {"gemgrab", "brawlball", "heist", "bounty", "hotzone", "knockout", "wipeout", "siege", "basketbrawl", "volleybrawl", "paintbrawl", "payload", "presentplunder"}
_history_cache = OrderedDict()
_cache_lock = RLock()


def invalidate_player_analysis(tag: str):
    with _cache_lock:
        _history_cache.pop(tag, None)


def fetch_player_history(db, tag: str, now: datetime) -> tuple[list[dict], bool]:
    """Use the existing (player_tag, match_at) index; bound memory and page stably."""
    with _cache_lock:
        cached = _history_cache.get(tag)
        if cached and time.monotonic() - cached[0] < 90:
            _history_cache.move_to_end(tag)
            return cached[1], cached[2]
    rows, truncated = [], False
    cutoff = (now - timedelta(days=HISTORY_DAYS)).isoformat()
    for offset in range(0, MAX_HISTORY, PAGE_SIZE):
        response = (db.table("match_raw_history").select(HISTORY_COLUMNS, count="exact")
                    .eq("player_tag", tag).in_("match_type", sorted(MATCH_TYPES))
                    .gte("match_at", cutoff).lte("match_at", now.isoformat())
                    .order("match_at", desc=True).order("match_id", desc=True)
                    .range(offset, offset + PAGE_SIZE - 1).execute())
        page = response.data or []
        rows.extend(page)
        if isinstance(response.count, int):
            truncated = response.count > MAX_HISTORY
        if len(page) < PAGE_SIZE:
            break
    with _cache_lock:
        _history_cache[tag] = (time.monotonic(), rows, truncated)
        _history_cache.move_to_end(tag)
        while len(_history_cache) > 24 or sum(len(entry[1]) for entry in _history_cache.values()) > 25000:
            _history_cache.popitem(last=False)
    return rows, truncated


def _key(value) -> str:
    return re.sub(r"[\s_.&-]", "", str(value or "").lower())


def _date(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _normalize(rows: list[dict], now: datetime) -> list[dict]:
    unique = {}
    for row in rows:
        at = _date(row.get("match_at"))
        if (at is None or not now - timedelta(days=HISTORY_DAYS) <= at <= now
                or row.get("result") not in {"victory", "defeat", "draw"}
                or row.get("match_type") not in MATCH_TYPES):
            continue
        hero = str(row.get("hero_used") or "unknown").strip().lower()
        mode = str(row.get("mode") or "unknown")
        map_id = str(row.get("map_id") or "unknown").removeprefix("gachi_").strip()
        record = {**row, "at": at, "hero": hero, "mode": mode, "map": map_id}
        # A player observation has a stable ID; legacy rows can use their timestamp.
        unique[row.get("match_id") or at.isoformat()] = record
    return sorted(unique.values(), key=lambda r: r["at"], reverse=True)


def _context(row) -> tuple:
    return row["match_type"], _key(row["mode"]), row["map"], _key(row["hero"])


def _reference_index(macro_rows: list[dict]) -> dict:
    """Use original cohorts only; gachi and rank subsets would double count them."""
    totals = defaultdict(lambda: [0.0, 0.0, 0])
    for row in macro_rows:
        if row.get("match_type") not in MATCH_TYPES:
            continue
        count = int(row.get("total_matches") or 0)
        weighted = row.get("weighted_matches")
        weighted = float(count if weighted is None else weighted)
        wins = row.get("weighted_wins")
        wins = float((row.get("total_wins") or 0) if wins is None else wins)
        if weighted <= 0:
            continue
        context = (row["match_type"], _key(row.get("mode")),
                   str(row.get("map_id") or "unknown").removeprefix("gachi_").strip(), _key(row.get("character_id")))
        total = totals[context]
        total[0] += wins
        total[1] += weighted
        total[2] += count
    return {key: (min(1.0, max(0.0, wins / weight)), count)
            for key, (wins, weight, count) in totals.items() if count >= 20 and weight >= 10}


def _stats(rows: list[dict]) -> dict:
    wins = sum(r["result"] == "victory" for r in rows)
    losses = sum(r["result"] == "defeat" for r in rows)
    decided = wins + losses
    low, high = wilson_interval(wins, decided)
    return {"matches": len(rows), "wins": wins, "losses": losses,
            "draws": len(rows) - decided, "decided": decided,
            "win_rate": round(wins / decided * 100, 1) if decided else None,
            "interval_low": round(low * 100, 1) if decided else None,
            "interval_high": round(high * 100, 1) if decided else None,
            "evidence": "low" if decided < 10 else "medium" if decided < 30 else "high"}


def _with_reference(rows: list[dict], reference: dict) -> dict:
    stats = _stats(rows)
    matched_rows = [r for r in rows if r["result"] != "draw" and _context(r) in reference]
    matched = [reference[_context(r)][0] for r in matched_rows]
    coverage = len(matched) / stats["decided"] if stats["decided"] else 0
    # Show a context-adjusted baseline only when it covers most personal games.
    rate = sum(matched) / len(matched) * 100 if matched and coverage >= 0.8 else None
    matched_wins = sum(r["result"] == "victory" for r in matched_rows)
    personal_rate = matched_wins / len(matched) * 100 if rate is not None else None
    contexts = {_context(r) for r in rows if _context(r) in reference}
    return {**stats, "reference_win_rate": round(rate, 1) if rate is not None else None,
            "reference_matches": sum(reference[c][1] for c in contexts),
            "reference_coverage": round(coverage * 100, 1),
            "comparison_matches": len(matched), "comparison_wins": matched_wins,
            "comparison_win_rate": round(personal_rate, 1) if personal_rate is not None else None,
            "gap": round(personal_rate - rate, 1) if rate is not None else None}


def _groups(rows: list[dict], reference: dict, dimension: str) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        value = (row["mode"], row["map"]) if dimension == "map" else row[dimension]
        if dimension == "hero" and row["hero"] in {"unknown", ""}:
            continue
        groups[value].append(row)
    result = []
    for value, observations in groups.items():
        identity = {"id": "|".join(value), "label": value[1], "mode": value[0]} if dimension == "map" else {"id": value, "label": value}
        result.append({**identity, **_with_reference(observations, reference)})
    return sorted(result, key=lambda r: (-r["matches"], r["id"]))


def _is_team(row) -> bool:
    return (_key(row["mode"]) in TEAM_MODES and len(row.get("allies") or []) == 2
            and len(row.get("opponents") or []) == 3 and row["result"] != "draw")


def _pairs(rows: list[dict], reference: dict, side: str) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        if not _is_team(row):
            continue
        for hero in {str(h).lower().strip() for h in row.get(side) or [] if h and _key(h) != "unknown"}:
            groups[hero].append(row)
    pairs = [{"id": hero, "label": hero, **_with_reference(observations, reference)}
             for hero, observations in groups.items() if len(observations) >= 5]
    # Keep tiny undefeated samples from outranking well-supported pairings.
    return sorted(pairs, key=lambda r: (
        -r["interval_low"] if side == "allies" else r["interval_high"], -r["matches"], r["id"]))[:10]


def build_player_analysis(rows: list[dict], macro_rows: list[dict], *, now: datetime,
                          days: int = 30, match_type: str = "all", hero: str = "all",
                          mode: str = "all", map_id: str = "all", truncated: bool = False,
                          reference_available: bool = True) -> dict:
    history = _normalize(rows, now)
    kind_history = [r for r in history if match_type == "all"
                    or (match_type == "normal" and r["match_type"] == "ranked")
                    or (match_type == "gachi" and r["match_type"] in {"soloRanked", "teamRanked"})]
    # Options come from retained history, allowing filters even in an empty short window.
    options = {"heroes": sorted({r["hero"] for r in kind_history if r["hero"] != "unknown"}),
               "modes": sorted({r["mode"] for r in kind_history}),
               "maps": sorted({r["map"] for r in kind_history if mode == "all" or _key(r["mode"]) == _key(mode)})}
    context_history = [r for r in kind_history if (hero == "all" or _key(r["hero"]) == _key(hero))
                       and (mode == "all" or _key(r["mode"]) == _key(mode))
                       and (map_id == "all" or r["map"] == map_id)]
    selected = [r for r in context_history if r["at"] >= now - timedelta(days=days)]
    reference = _reference_index(macro_rows)
    characters = _groups(selected, reference, "hero")
    modes = _groups(selected, reference, "mode")
    maps = _groups(selected, reference, "map")
    contexts = defaultdict(list)
    for row in selected:
        if row["hero"] not in {"", "unknown"}:
            contexts[(row["hero"], row["mode"], row["map"])].append(row)
    map_characters = [{"id": "|".join(key), "label": key[0], "mode": key[1], "map": key[2],
                       **_with_reference(observations, reference)} for key, observations in contexts.items()]
    map_characters.sort(key=lambda r: (-r["matches"], r["id"]))

    practice, strengths = [], []
    for dimension, groups in (("character", characters), ("map_character", map_characters)):
        for row in groups:
            baseline = row["reference_win_rate"]
            if row["decided"] < 10:
                continue
            if baseline is None:
                # Useful personal observations remain available without inventing a macro rate.
                advice = {**row, "dimension": dimension, "supported": False, "basis": "personal"}
                if dimension == "character" and row["interval_low"] > 50:
                    strengths.append((row["interval_low"] * row["decided"] / 100, advice))
                elif dimension == "map_character" and row["interval_high"] < 50:
                    observations = contexts[(row["label"], row["mode"], row["map"])]
                    if all(_is_team(r) or r["result"] == "draw" for r in observations):
                        practice.append(((50 - row["interval_high"]) * row["decided"], advice))
                continue
            if row["comparison_matches"] < 10:
                continue
            adjusted_gap = (posterior_rate(row["comparison_wins"], row["comparison_matches"], baseline / 100) * 100 - baseline)
            low, high = wilson_interval(row["comparison_wins"], row["comparison_matches"])
            advice = {**row, "dimension": dimension, "basis": "reference", "supported": high * 100 < baseline if adjusted_gap < 0 else low * 100 > baseline}
            if adjusted_gap <= -5:
                practice.append(((-adjusted_gap) * row["comparison_matches"], advice))
            elif dimension == "character" and adjusted_gap >= 5:
                strengths.append((adjusted_gap * row["comparison_matches"], advice))
    practice.sort(key=lambda r: r[0], reverse=True)
    strengths.sort(key=lambda r: r[0], reverse=True)

    comparison_days = min(days, 30)
    comparison_start = now - timedelta(days=comparison_days)
    previous_start = now - timedelta(days=comparison_days * 2)
    current = _stats([r for r in context_history if r["at"] >= comparison_start])
    previous = _stats([r for r in context_history if previous_start <= r["at"] < comparison_start])
    comparable = current["decided"] >= 10 and previous["decided"] >= 10
    trend = {"days": comparison_days, "current": current, "previous": previous,
             "comparable": comparable,
             "delta": round(current["win_rate"] - previous["win_rate"], 1) if comparable else None}
    jst = timezone(timedelta(hours=9))
    daily = defaultdict(list)
    for row in selected:
        daily[row["at"].astimezone(jst).date().isoformat()].append(row)
    start_date = (now - timedelta(days=days)).astimezone(jst).date()
    today = now.astimezone(jst).date()
    timeline = []
    while start_date <= today:
        date = start_date.isoformat()
        timeline.append({"date": date, **_stats(daily.get(date, []))})
        start_date += timedelta(days=1)
    streak, best_streak = 0, 0
    for row in reversed(selected):
        streak = streak + 1 if row["result"] == "victory" else 0
        best_streak = max(streak, best_streak)

    return {"filters": {"days": days, "match_type": match_type, "hero": hero, "mode": mode, "map": map_id},
            "coverage": {"retained_matches": len(history), "earliest": history[-1]["at"].isoformat() if history else None,
                         "latest": history[0]["at"].isoformat() if history else None, "truncated": truncated,
                         "reference_available": reference_available, "history_days": HISTORY_DAYS},
            "options": options, "summary": {**_with_reference(selected, reference), "active_days": len(daily), "best_win_streak": best_streak},
            "trend": trend, "timeline": timeline, "characters": characters, "modes": modes, "maps": maps,
            "map_characters": map_characters, "allies": _pairs(selected, reference, "allies"),
            "opponents": _pairs(selected, reference, "opponents"),
            "practice": [item for _, item in practice[:5]], "strengths": [item for _, item in strengths[:3]],
            "pair_matches": sum(_is_team(r) for r in selected), "generated_at": now.isoformat()}


def get_saved_player_analysis(db, tag: str, **filters) -> dict:
    now = datetime.now(timezone.utc)
    rows, truncated = fetch_player_history(db, tag, now)
    try:
        from app.routers.meta import _get_cached_macro_data
        macro_rows = _get_cached_macro_data(db)
        reference_available = True
    except Exception:
        logger.exception("Personal analysis reference snapshot unavailable")
        macro_rows, reference_available = [], False
    return build_player_analysis(rows, macro_rows, now=now, truncated=truncated,
                                 reference_available=reference_available, **filters)
