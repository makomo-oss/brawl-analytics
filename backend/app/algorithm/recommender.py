def get_weights(enemy_count: int, is_proxy_pick: bool):
    # (W_map, W_counter, W_syn, W_pers)
    if enemy_count == 0:
        base = (0.7, 0.0)
    elif enemy_count == 1:
        base = (0.5, 0.2)
    elif enemy_count == 2:
        base = (0.3, 0.4)
    else:
        base = (0.2, 0.5)
        
    if is_proxy_pick:
        return (*base, 0.3, 0.0)
    else:
        return (*base, 0.1, 0.2)

def calculate_score(char_id: str, f_own: float, s_map: float, s_counter: float, s_syn: float, s_pers: float, weights: tuple):
    w_map, w_counter, w_syn, w_pers = weights
    score = f_own * (w_map * s_map + w_counter * s_counter + w_syn * s_syn + w_pers * s_pers)
    return score

def recommend_picks(map_id: str, mode: str, allies: list[str], opponents: list[str], pick_turn: int, is_proxy_pick: bool, bans: list[str] | None = None):
    from app.routers.meta import get_tier_list, _normalize_id
    map_data = get_tier_list(type="gachi", sub_type="map", id=map_id, include_details=True)
    mode_data = get_tier_list(type="gachi", sub_type="mode", id=mode)
    excluded = {_normalize_id(c) for c in allies + opponents + (bans or [])}
    weights = get_weights(len(opponents), is_proxy_pick)
    results = []
    for char, stats in (map_data.get("characters") or {}).items():
        if _normalize_id(char) in excluded:
            continue
        map_score = stats["score"]
        mode_score = (mode_data.get("characters") or {}).get(char, {}).get("score", 50.0)
        counter = sum(stats.get("matchups", {}).get(_normalize_id(c), 50.0) for c in opponents) / len(opponents) if opponents else 50.0
        synergy = 50.0 + (sum(stats.get("synergies", {}).get(_normalize_id(c), {}).get("lift", 0.0) for c in allies) / len(allies) if allies else 0.0)
        score = calculate_score(char, 1.0, (map_score + mode_score) / 2, counter, synergy, 50.0, weights)
        results.append({"character_id": char, "score": round(score, 2),
                        "reason": f"Map:{map_score:.1f}, Mode:{mode_score:.1f}, Matchup:{counter:.1f}",
                        "personalization_available": False})
    return sorted(results, key=lambda r: (-r["score"], r["character_id"]))[:3]
