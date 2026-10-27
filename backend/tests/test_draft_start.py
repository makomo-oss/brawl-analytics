from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.routers import meta
from app.routers import match
from app.algorithm.recommender import get_weights, calculate_score
from app.algorithm.statistics import posterior_rate


def setup_map(monkeypatch, db=None):
    monkeypatch.setattr(meta, "get_db", lambda: db)
    monkeypatch.setattr(meta, "_get_cached_total_analyzed", lambda db: 20)
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: [
        dict(character_id="colt", match_type="gachi", map_id="Dry Season", mode="bounty",
             total_matches=20, total_wins=10, weighted_matches=15, weighted_wins=7.5),
    ])


def test_draft_retains_map_pairs_without_display_only_broad_query(monkeypatch):
    setup_map(monkeypatch)
    calls = []

    def pairs(db, type, sub_type, selected_id, rank_tier, mode=None, character_id=None):
        calls.append((type, sub_type, selected_id, rank_tier, mode))
        return {"colt": [
            dict(kind="counter", char_b="bull", match_count=20, weighted_matches=15, weighted_wins=12),
            dict(kind="synergy", char_b="rico", match_count=20, weighted_matches=15, weighted_wins=12),
        ]}

    monkeypatch.setattr(meta, "_contextual_pairs", pairs)
    data = meta.get_tier_list(type="gachi", sub_type="map", id="Dry Season", mode="bounty",
                             include_details=True, include_matchup_fallback=False)
    assert calls == [("gachi", "map", "Dry Season", "all", "bounty")]
    assert "bull" in data["characters"]["colt"]["matchups"]
    assert "rico" in data["characters"]["colt"]["synergies"]


def test_pair_timeout_returns_readable_cors_response_and_is_not_cached(monkeypatch):
    calls = []

    class Database:
        def rpc(self, name, params):
            calls.append(name)
            return self

        def execute(self):
            raise APIError({"message": "canceling statement due to statement timeout", "code": "57014", "details": None, "hint": None})

    setup_map(monkeypatch, Database())
    monkeypatch.setattr(meta, "_PAIR_CONTEXT_CACHE", {})
    app = FastAPI()
    origin = "https://brawl-lab.sozai-hub.com"
    app.add_middleware(CORSMiddleware, allow_origins=[origin])
    app.include_router(meta.router)
    client = TestClient(app)
    for _ in range(2):
        response = client.get("/meta/tier-list", params={"type": "gachi", "sub_type": "map",
            "id": "Dry Season", "mode": "bounty", "include_details": True,
            "include_matchup_fallback": False}, headers={"Origin": origin})
        assert response.status_code == 503
        assert response.headers["access-control-allow-origin"] == origin
        assert response.json()["detail"].startswith("相性データを取得できませんでした")
        assert "statement timeout" not in response.text
    assert calls == ["contextual_pair_stats", "contextual_pair_stats"]


def test_recommendation_uses_map_pairs_even_when_broad_fallback_times_out(monkeypatch):
    """The unrelated display fallback must not fail a valid recommendation."""
    from types import SimpleNamespace
    from collections import OrderedDict

    calls = []

    class Database:
        def rpc(self, name, params):
            calls.append((name, params))
            if params["p_map"] is None:
                raise APIError({"message": "statement timeout", "code": "57014",
                                "details": None, "hint": None})
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[
                dict(kind="counter", char_a="colt", char_b="bull", match_count=20,
                     weighted_matches=15, weighted_wins=12),
                dict(kind="synergy", char_a="colt", char_b="rico", match_count=20,
                     weighted_matches=15, weighted_wins=12),
            ]))

    setup_map(monkeypatch, Database())
    monkeypatch.setattr(meta, "_PAIR_CONTEXT_CACHE", OrderedDict())
    app = FastAPI()
    app.include_router(match.router)
    response = TestClient(app).post("/match/recommend", json={
        "map_id": "Dry Season", "mode": "bounty", "allies": ["rico"],
        "opponents": ["bull"], "bans": [], "pick_turn": 3, "is_proxy_pick": False,
    })
    assert response.status_code == 200
    recommendation = response.json()["recommendations"][0]
    # Preserve actual selected-map counter/synergy signals, not neutral defaults.
    counter = round(posterior_rate(12, 15) * 100, 1)
    lift = round((posterior_rate(12, 15, .5) - .5) * 100, 1)
    expected = calculate_score("colt", 1, 50, counter, 50 + lift, 50, get_weights(1, False))
    assert recommendation["character_id"] == "colt"
    assert recommendation["score"] == round(expected, 2)
    assert recommendation["reason"].endswith(f"Matchup:{counter:.1f}")
    assert calls == [("contextual_pair_stats", {"p_type": "gachi", "p_mode": "bounty",
                                              "p_map": "Dry Season", "p_rank": "all"})]
