import copy
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.algorithm.draft import predict_draft
from app.routers import meta

ALLIES = ["elprimo", "damian", "frank"]
ENEMIES = ["griff", "lumi", "colette"]


def scope(n=0, wins=0):
    return {"totals": {"matches": 1000, "wins": 500}, "characters": {}, "pairs": {
        own: {"counter": {enemy: {"matches": n, "wins": wins} for enemy in ENEMIES}}
        for own in ALLIES
    }}


def test_sparse_map_uses_wider_losses_instead_of_hiding_prediction():
    scopes = [scope(600, 180), scope(100, 35), scope(10, 10)]
    result = predict_draft(scopes, ALLIES, ENEMIES)
    assert 0 < result["winRate"] < 50
    assert result["matchupAdvantage"] < 0
    assert result["confidence"] == "low"
    assert predict_draft(scopes, ENEMIES, ALLIES)["winRate"] + result["winRate"] == 100


def test_same_games_at_three_scopes_are_counted_once():
    selected = scope(100, 30)
    disjoint = [scope(), scope(), selected]
    overlapping = [copy.deepcopy(selected) for _ in range(3)]
    assert predict_draft(disjoint, ALLIES, ENEMIES)["winRate"] == predict_draft(overlapping, ALLIES, ENEMIES)["winRate"]


def test_reciprocal_records_do_not_double_support_or_change_prediction():
    global_scope = scope(100, 30)
    before = predict_draft([global_scope, scope(), scope()], ALLIES, ENEMIES)
    for enemy in ENEMIES:
        global_scope["pairs"][enemy] = {"counter": {own: {"matches": 100, "wins": 70} for own in ALLIES}}
    after = predict_draft([global_scope, scope(), scope()], ALLIES, ENEMIES)
    assert before == after


def test_one_map_win_cannot_overrule_substantial_wider_counter_evidence():
    result = predict_draft([scope(200, 61), scope(60, 19), scope(1, 1)], ALLIES, ENEMIES)
    assert result["winRate"] < 50
    assert result["coverage"]["mapMatchups"] == 0
    assert result["coverage"]["globalMatchups"] == 9


def test_neutral_prior_remains_visible_with_low_confidence_without_observations():
    result = predict_draft([scope(), scope(), scope()], ALLIES, ENEMIES)
    assert result["winRate"] == 50
    assert result["confidence"] == "low"
    assert result["matchupAdvantage"] == pytest.approx(0)


def test_opponent_synergy_reduces_prediction_without_adding_popularity():
    global_scope = scope()
    for i, first in enumerate(ENEMIES):
        global_scope["pairs"][first] = {"synergy": {
            second: {"matches": 100, "wins": 80} for second in ENEMIES[i + 1:]
        }}
    scopes = [global_scope, scope(), scope()]
    result = predict_draft(scopes, ALLIES, ENEMIES)
    assert result["winRate"] < 50
    assert result["enemySynergyAvg"] > 0
    global_scope["characters"]["elprimo"] = {"matches": 0, "wins": 0, "score": 100, "use_rate": 99}
    assert predict_draft(scopes, ALLIES, ENEMIES)["winRate"] == result["winRate"]


def test_endpoint_loads_only_selected_ranked_characters_and_caches_result(monkeypatch):
    monkeypatch.setattr(meta, "get_db", lambda: None)
    monkeypatch.setattr(meta, "_DRAFT_CACHE", {})
    monkeypatch.setattr(meta, "_DRAFT_EVIDENCE_CACHE", {})
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: [
        dict(character_id="el primo", match_type="gachi", map_id="Triple Dribble", mode="brawlBall",
             weighted_matches=100, weighted_wins=50),
        dict(character_id="el primo", match_type="ranked", map_id="Triple Dribble", mode="brawlBall",
             weighted_matches=10000, weighted_wins=10000),
    ])
    calls = []

    class Database:
        def rpc(self, name, params):
            calls.append((name, params))
            return self

        def execute(self):
            class Result:
                data = []
            return Result()

    monkeypatch.setattr(meta, "get_db", Database)
    request = meta.DraftAnalysisRequest(allies=["el primo", "damian", "frank"], enemies=ENEMIES, mode="brawlBall", map="Triple Dribble")
    result = meta.draft_analysis(request)
    assert result["winRate"] == 50  # Normal games cannot contaminate ranked.
    assert meta.draft_analysis(request) == result
    assert calls == [("selected_draft_evidence", {"p_characters": ALLIES + ENEMIES, "p_mode": "brawlBall", "p_map": "Triple Dribble"})]


def test_endpoint_rejects_incomplete_duplicate_or_incompatible_drafts(monkeypatch):
    monkeypatch.setattr(meta, "_DRAFT_CACHE", {})
    monkeypatch.setattr(meta, "get_db", lambda: None)
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: [])
    app = FastAPI()
    app.include_router(meta.router)
    client = TestClient(app)
    body = dict(allies=ALLIES, enemies=ENEMIES, mode="brawlBall", map="Triple Dribble")
    assert client.post("/meta/draft-analysis", json=body).status_code == 422
    assert client.post("/meta/draft-analysis", json={**body, "allies": ALLIES[:2]}).status_code == 422
    assert client.post("/meta/draft-analysis", json={**body, "enemies": ALLIES}).status_code == 422
