"""Compact live input for character pages, using the existing Tier calculations."""
from functools import lru_cache
from threading import RLock

from fastapi import HTTPException

_lock = RLock()
_FIELDS = ("score", "win_rate", "use_rate", "total_matches", "rank_position",
           "sample_sufficient", "confidence_interval", "adjusted_win_rate")
_MAIN_MODES = {"soloShowdown", "duoShowdown", "brawlBall", "hotZone",
               "knockout", "gemGrab", "heist", "bounty"}


def _compact(stats):
    return {key: stats[key] for key in _FIELDS if key in stats}


@lru_cache(maxsize=1024)
def _cached_tier(generation, cohort, kind=None, scope=None):
    from app.routers import meta
    data = meta.get_tier_list(type=cohort, sub_type=kind, id=scope)
    return {**data, "characters": {name: _compact(stats)
                                   for name, stats in data["characters"].items()}}


def _tier(generation, cohort, kind=None, scope=None):
    with _lock:
        return _cached_tier(generation, cohort, kind, scope)


def clear_cache():
    with _lock:
        _cached_tier.cache_clear()


def snapshot(character_id=None):
    from app.routers import meta
    rows = meta._get_cached_macro_data(meta.get_db())
    # A fresh database snapshot has a new identity, even when timestamps coincide.
    generation = (id(rows), meta._MACRO_CACHE["timestamp"])
    overview = {cohort: _tier(generation, cohort) for cohort in ("global", "gachi")}
    names = {name for data in overview.values() for name, stats in data["characters"].items()
             if stats["total_matches"] > 0}
    if not names:
        raise HTTPException(503, "Character statistics are not available yet")
    name = next((name for name in names if meta._normalize_id(name) == meta._normalize_id(character_id)), None) if character_id else None
    if character_id and not name:
        raise HTTPException(404, "Character not found")
    result = {"catalog": [], "overview": overview,
              "details": {c: {} for c in overview},
              "contexts": {c: {"modes": {}, "maps": {}} for c in overview},
              "mapModes": {c: {} for c in overview}}
    if name is None:
        return result
    for cohort in overview:
        categories = meta.get_categories(type=cohort)
        for mode, maps in categories["mode_to_maps"].items():
            for map_id in maps:
                result["mapModes"][cohort].setdefault(map_id, []).append(mode)
        for kind in ("mode", "map"):
            scopes = categories[f"{kind}s"]
            if kind == "mode":
                scopes = [mode for mode in scopes if mode in _MAIN_MODES]
            for scope in scopes:
                stats = _tier(generation, cohort, kind, scope)["characters"].get(name)
                if stats and stats["total_matches"] > 0:
                    result["contexts"][cohort][f"{kind}s"][scope] = {name: stats}
        if name in overview[cohort]["characters"]:
            result["details"][cohort][name] = meta.get_character_detail(name, type=cohort)
    return result
