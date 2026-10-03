from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.routers import meta


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
