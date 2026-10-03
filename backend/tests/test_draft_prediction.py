from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.algorithm.draft_outcome import MODEL_VERSION, composition_features, predict_draft, recommend_picks, draft_score
from app.algorithm.draft_training import canonical_games
from app.routers import meta

ALLIES = ["elprimo", "damian", "frank"]
ENEMIES = ["griff", "lumi", "colette"]


def model():
    return {"version": MODEL_VERSION,
            "weights": {"e|global|colette:elprimo": .5, "c|map:brawlBall:Triple Dribble|elprimo": .1},
            "support": {"e|global|colette:elprimo": 100, "c|global|elprimo": 100, "c|global|shelly": 100}}


def test_counter_effect_and_recommendation_use_same_joint_model():
    fitted = model()
    result = predict_draft(fitted, ALLIES, ENEMIES, "brawlBall", "Triple Dribble")
    assert result["winRate"] < 50
    assert result["matchupAdvantage"] < 0
    reverse = predict_draft(fitted, ENEMIES, ALLIES, "brawlBall", "Triple Dribble")
    assert reverse["winRate"] + result["winRate"] == 100
    assert reverse["matchupAdvantage"] == pytest.approx(-result["matchupAdvantage"])
    assert composition_features(ALLIES, ENEMIES, "brawlBall", "Triple Dribble") == {
        key: -value for key, value in composition_features(ENEMIES, ALLIES, "brawlBall", "Triple Dribble").items()}
    suggestions = recommend_picks(fitted, ALLIES[1:], ENEMIES, ["elprimo", "shelly", "colette"], set(), "brawlBall", "Triple Dribble")
    assert [s["name"] for s in suggestions] == ["shelly", "elprimo"]
    assert suggestions[1]["counterEffects"][0]["points"] < 0
    assert draft_score(fitted, ALLIES, ENEMIES, "brawlBall", "Triple Dribble") == pytest.approx(-.4)
    assert recommend_picks(fitted, [], [], ["elprimo"], {"elprimo"}, "brawlBall", "Triple Dribble") == []


def test_training_deduplicates_observers_and_excludes_contradictions_and_old_games():
    now = datetime(2026, 10, 3, tzinfo=timezone.utc)
    row = dict(match_id="a", battle_uid="game", player_tag="A", match_at="2026-10-01T00:00:00",
               mode="brawlBall", map_id="Triple Dribble", result="victory", match_type="soloRanked",
               hero_used="EL PRIMO", allies=["DAMIAN", "FRANK"], opponents=["GRIFF", "LUMI", "COLETTE"])
    reverse = {**row, "match_id": "b", "player_tag": "B", "hero_used": "COLETTE", "allies": ["GRIFF", "LUMI"], "opponents": ["EL PRIMO", "DAMIAN", "FRANK"], "result": "defeat"}
    games = canonical_games([row, row, reverse, {**row, "battle_uid": "normal", "match_type": "ranked"},
                             {**row, "battle_uid": None, "match_id": "legacy"},
                             {**row, "battle_uid": "old", "match_at": "2026-01-01T00:00:00"}], {"A", "B"}, now)
    assert len(games) == 1
    assert games[0]["observers"] == {1, -1}
    assert games[0]["win"] == 0  # Canonical first team is colette/griff/lumi.
    assert canonical_games([row, {**reverse, "result": "victory"}], {"A", "B"}, now) == []


def setup(monkeypatch, db):
    monkeypatch.setattr(meta, "get_db", lambda: db)
    monkeypatch.setattr(meta, "_DRAFT_MODEL_CACHE", {"model": None, "timestamp": 0})
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: [
        dict(character_id="el primo", match_type="gachi", map_id="Triple Dribble", mode="brawlBall")])


def test_forecast_and_recommendation_share_cached_snapshot_without_raw_queries(monkeypatch):
    calls = []
    class Database:
        def table(self, name):
            calls.append(name)
            assert name == "draft_outcome_models"
            return self
        def select(self, *args): return self
        def eq(self, *args): return self
        def limit(self, *args): return self
        def execute(self): return SimpleNamespace(data=[{"model": model()}])
    setup(monkeypatch, Database())
    assert meta.draft_analysis(meta.DraftAnalysisRequest(allies=ALLIES, enemies=ENEMIES, mode="brawlBall", map="Triple Dribble"))["winRate"] < 50
    result = meta.draft_recommendations(meta.DraftRecommendationRequest(allies=[], enemies=["colette"], excluded=["shelly"], mode="brawlBall", map="Triple Dribble"))
    assert result["suggestions"][0]["name"] == "elprimo"
    assert result["suggestions"][0]["counterEffects"][0]["points"] < 0
    assert calls == ["draft_outcome_models"]


def test_endpoint_rejects_invalid_drafts_and_does_not_cache_database_failure(monkeypatch):
    class Database:
        def table(self, name): raise RuntimeError("unavailable")
    setup(monkeypatch, Database())
    app = FastAPI()
    app.include_router(meta.router)
    client = TestClient(app)
    body = dict(allies=ALLIES, enemies=ENEMIES, mode="brawlBall", map="Triple Dribble")
    assert client.post("/meta/draft-analysis", json={**body, "allies": ALLIES[:2]}).status_code == 422
    assert client.post("/meta/draft-analysis", json={**body, "enemies": ALLIES}).status_code == 422
    assert client.post("/meta/draft-analysis", json={**body, "map": "wrong"}).status_code == 422
    assert client.post("/meta/draft-analysis", json=body).status_code == 503
    assert meta._DRAFT_MODEL_CACHE["model"] is None
