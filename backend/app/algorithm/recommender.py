"""Compatibility adapter: every pick endpoint uses the fitted outcome model."""


def recommend_picks(map_id: str, mode: str, allies: list[str], opponents: list[str], pick_turn: int, is_proxy_pick: bool, bans: list[str] | None = None):
    from app.routers.meta import DraftRecommendationRequest, draft_recommendations
    result = draft_recommendations(DraftRecommendationRequest(
        allies=allies, enemies=opponents, excluded=bans or [], mode=mode, map=map_id))
    return [{"character_id": row["name"], "score": round(row["score"], 2),
             "reason": "マップと現在の編成に合わせた候補",
             "counter_effects": row["counterEffects"], "personalization_available": False}
            for row in result["suggestions"][:3]]
