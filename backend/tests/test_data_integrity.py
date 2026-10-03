import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pandas as pd
import pytest
from app.services import brawl_api
from app.scripts.daily_calc import calc_macro_map_stats, calc_dynamic_counters, calc_dynamic_synergies
from app.routers import meta, player

@pytest.mark.parametrize("status", [403, 429, 500])
@pytest.mark.parametrize("method", ["get_player", "get_player_battlelog", "get_club", "get_club_members"])
def test_upstream_failure_never_returns_fake_data(monkeypatch, status, method):
    response = httpx.Response(status, request=httpx.Request("GET", "https://example.com"))
    monkeypatch.setattr(brawl_api, "get_http_client", lambda: SimpleNamespace(get=AsyncMock(return_value=response)))
    with pytest.raises(brawl_api.BrawlAPIError):
        asyncio.run(getattr(brawl_api, method)("#ABC"))


def test_transient_battlelog_failure_is_retried(monkeypatch):
    request = httpx.Request("GET", "https://example.com")
    client = SimpleNamespace(get=AsyncMock(side_effect=[
        httpx.Response(503, request=request),
        httpx.Response(200, json={"items": []}, request=request),
    ]))
    monkeypatch.setattr(brawl_api, "get_http_client", lambda: client)
    monkeypatch.setattr(brawl_api.asyncio, "sleep", AsyncMock())
    assert asyncio.run(brawl_api.get_player_battlelog("#ABC")) == {"items": []}
    assert client.get.await_count == 2

def row(**overrides):
    data = dict(match_id="a", player_tag="ABC", result="victory", hero_used="COLT", map_id="map", mode="brawlBall", match_type="ranked", allies=["SHELLY"], opponents=["BULL"])
    return {**data, **overrides}

def test_trophy_matches_are_not_competitive_ranked():
    frame = pd.DataFrame([row(), row(match_id="b", match_type="soloRanked")])
    result = calc_macro_map_stats(frame, {"all_elite": {"ABC"}, "mythic": {"ABC"}})
    assert next(r for r in result if r["match_type"] == "gachi")["total_matches"] == 1
    assert "is_win" not in frame

def test_draws_do_not_create_reverse_wins():
    frame = pd.DataFrame([row(result="draw")])
    assert calc_dynamic_counters(frame) == []
    assert calc_dynamic_synergies(frame) == []
    assert calc_macro_map_stats(frame) == []

def test_missing_ids_are_not_collapsed():
    frame = pd.DataFrame([row(match_id=None), row(match_id=None, result="defeat")])
    result = calc_macro_map_stats(frame)
    assert result[0]["total_matches"] == 2
    assert result[0]["win_rate"] == 50

def test_duplicate_observations_do_not_change_macro_results():
    assert calc_macro_map_stats(pd.DataFrame([row(),row()]))[0]["total_matches"] == 1

def test_survival_result_does_not_imply_winning_every_matchup():
    assert calc_dynamic_counters(pd.DataFrame([row(mode="soloShowdown")])) == []

def test_dashboard_failure_is_http_error(monkeypatch):
    monkeypatch.setattr(player,"get_player",AsyncMock(side_effect=brawl_api.BrawlAPIError("offline")))
    monkeypatch.setattr(player,"get_player_battlelog",AsyncMock(return_value={"items":[]}))
    with pytest.raises(Exception) as error:
        asyncio.run(player.get_dashboard("ABC"))
    assert error.value.status_code == 502


@pytest.mark.parametrize("route", [player.get_dashboard, player.sync_player])
def test_player_sync_persists_crawler_compatible_battles(monkeypatch, route):
    from unittest.mock import Mock, call

    info = {"tag": "#ABC", "name": "Test", "club": {}}
    battlelog = {"items": [{
        "battleTime": "20260918T120000.000Z",
        "event": {"mode": "brawlBall", "map": "Test Map"},
        "battle": {"type": "soloRanked", "result": "victory", "teams": [
            [{"tag": "#ABC", "brawler": {"name": "COLT"}}],
            [{"tag": "#DEF", "brawler": {"name": "BULL"}}],
        ]},
    }]}
    db = Mock()
    monkeypatch.setattr(player, "get_db", lambda: db)
    monkeypatch.setattr(player, "get_player", AsyncMock(return_value=info))
    monkeypatch.setattr(player, "get_player_battlelog", AsyncMock(return_value=battlelog))
    from app.routers import meta
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda database: [])

    result = asyncio.run(route("ABC"))
    assert db.table.call_args_list[:2] == [call("players"), call("match_raw_history")]
    records = db.table.return_value.upsert.call_args_list[-1].args[0]
    assert records[0]["match_id"] == "ABC_20260918T120000.000Z"
    assert records[0]["match_type"] == "soloRanked"
    assert records[0]["hero_used"] == "COLT"
    if route is player.sync_player:
        assert result["battle_records_saved"] == 1


def test_dashboard_reports_failed_battle_persistence(monkeypatch):
    from unittest.mock import Mock

    db = Mock()
    db.table.return_value.upsert.return_value.execute.side_effect = [None, RuntimeError("write failed")]
    monkeypatch.setattr(player, "get_db", lambda: db)
    monkeypatch.setattr(player, "get_player", AsyncMock(return_value={"tag": "#ABC", "name": "Test"}))
    monkeypatch.setattr(player, "get_player_battlelog", AsyncMock(return_value={"items": [{
        "battleTime": "20260918T120000.000Z", "event": {"mode": "brawlBall"},
        "battle": {"type": "ranked", "result": "victory", "players": [
            {"tag": "#ABC", "brawler": {"name": "COLT"}}
        ]},
    }]}))
    with pytest.raises(Exception) as error:
        asyncio.run(player.get_dashboard("ABC"))
    assert error.value.status_code == 503


@pytest.mark.parametrize("route", [player.get_dashboard, player.sync_player])
def test_player_tag_letter_o_alias_preserves_team_and_saved_history(monkeypatch, route):
    from unittest.mock import Mock

    canonical = "C9PQRGG0P"
    info = {"tag": f"#{canonical}", "name": "Test"}
    log = {"items": [{
        "battleTime": "20261001T042132.000Z", "event": {"mode": "knockout", "map": "Test Map"},
        "battle": {"type": "ranked", "result": "victory", "starPlayer": {"tag": f"#{canonical}"}, "teams": [
            [{"tag": f"#{canonical}", "name": "Test", "brawler": {"name": "PIPER"}},
             {"tag": "#V99J0CCV8", "name": "Teammate", "brawler": {"name": "PIPER"}}],
            [{"tag": "#2UYRGRQPCU", "name": "Opponent", "brawler": {"name": "COLT"}}],
        ]},
    }]}
    db = Mock()
    monkeypatch.setattr(player, "get_db", lambda: db)
    monkeypatch.setattr(player, "get_player", AsyncMock(return_value=info))
    monkeypatch.setattr(player, "get_player_battlelog", AsyncMock(return_value=log))
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda database: [])

    result = asyncio.run(route("#c9pqrggop"))
    player.get_player.assert_awaited_once_with(canonical)
    assert result["player_tag"] == canonical
    profile = db.table.return_value.upsert.call_args_list[0].args[0]
    records = db.table.return_value.upsert.call_args_list[1].args[0]
    assert profile["player_tag"] == canonical
    assert records[0]["player_tag"] == canonical
    assert records[0]["hero_used"] == "PIPER"
    assert records[0]["allies"] == ["PIPER"]
    assert records[0]["opponents"] == ["COLT"]
    if route is player.get_dashboard:
        battle = result["recent_battles"][0]
        assert battle["hero"] == "piper"
        assert [p["tag"] for p in battle["my_team"]] == [canonical, "V99J0CCV8"]
        assert len(battle["opponent_teams"]) == 1


def test_battle_without_requested_player_is_not_saved():
    from app.services.battle_records import parse_battlelog

    records, _ = parse_battlelog("C9PQRGG0P", [{
        "battleTime": "20261001T042132.000Z", "event": {"mode": "knockout"},
        "battle": {"type": "ranked", "result": "victory", "players": [
            {"tag": "#V99J0CCV8", "brawler": {"name": "COLT"}},
        ]},
    }])
    assert records == []

def test_tier_counts_observations_without_dividing_by_six(monkeypatch):
    monkeypatch.setattr(meta,"get_db",lambda:None)
    monkeypatch.setattr(meta,"_get_cached_total_analyzed",lambda db:999)
    monkeypatch.setattr(meta,"_get_cached_macro_data",lambda db:[dict(match_type="gachi",map_id="map",character_id="colt",total_matches=12,total_wins=6,updated_at="2026-09-16")])
    result=meta.get_tier_list(type="gachi")
    assert result["metrics"]["analyzed_matches"] == 12
    assert result["updated_at"] == "2026-09-16"


def test_recommendation_uses_shared_model_and_passes_bans(monkeypatch):
    from app.algorithm.recommender import recommend_picks
    calls = []
    def recommendations(request):
        calls.append(request)
        return {"suggestions": [{"name": "shelly", "score": 60, "counterEffects": []}]}
    monkeypatch.setattr(meta, "draft_recommendations", recommendations)
    result = recommend_picks("map", "brawlBall", ["el_primo"], [], 1, True, ["COLT"])
    assert [r["character_id"] for r in result] == ["shelly"]
    assert calls[0].excluded == ["COLT"]
    assert calls[0].allies == ["el_primo"]


def test_empty_recommendation_has_no_fabricated_characters(monkeypatch):
    from app.algorithm.recommender import recommend_picks
    monkeypatch.setattr(meta, "get_tier_list", lambda **kwargs: {"characters": {}})
    assert recommend_picks("map", "brawlBall", [], [], 1, True) == []


def test_snapshot_is_published_atomically_and_errors_propagate(monkeypatch):
    from app.scripts import daily_calc
    from unittest.mock import Mock
    monkeypatch.setattr(daily_calc, "fetch_recent_matches", lambda db: pd.DataFrame())
    monkeypatch.setattr(daily_calc, "fetch_player_rank_segments", lambda *args, **kwargs: {})
    db = Mock()
    db.rpc.return_value.execute.side_effect = RuntimeError("transaction failed")
    with pytest.raises(RuntimeError, match="transaction failed"):
        daily_calc.run_daily_calculation(db)
    db.rpc.assert_called_once_with("replace_analytics_snapshot", {"macro_rows": [], "counter_rows": [], "synergy_rows": []})
    db.table.assert_not_called()


def test_failed_crawl_does_not_delete_or_write_data(monkeypatch):
    from app.tasks import crawler_task
    from unittest.mock import Mock
    db = Mock()
    db.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    monkeypatch.setattr(crawler_task, "get_db", lambda: db)
    monkeypatch.setattr(crawler_task, "select_anchor_tags", lambda database: {"ABC"})
    monkeypatch.setattr(crawler_task, "select_elite_refresh_tags", lambda database, excluded: [])
    monkeypatch.setattr(crawler_task, "get_player", AsyncMock(side_effect=brawl_api.BrawlAPIError("403")))
    with pytest.raises(RuntimeError, match="valid player profiles"):
        asyncio.run(crawler_task.run_crawler_task())
    db.table.return_value.upsert.assert_not_called()
    db.table.return_value.delete.assert_not_called()


def test_cleanup_deletes_only_expired_battles_and_checks_remaining(monkeypatch):
    from unittest.mock import Mock
    from app.tasks import cleanup_task

    db = Mock()
    db.table.return_value.select.return_value.lt.return_value.execute.side_effect = [
        SimpleNamespace(count=2), SimpleNamespace(count=0)
    ]
    monkeypatch.setattr(cleanup_task, "get_db", lambda: db)
    assert asyncio.run(cleanup_task.run_cleanup_task()) == {"deleted_count": 2, "remaining_expired": 0}
    db.table.return_value.delete.assert_called_once_with()
    cutoff = db.table.return_value.delete.return_value.lt.call_args.args
    assert cutoff[0] == "match_at"
    assert (pd.Timestamp.now(tz="UTC") - pd.Timestamp(cutoff[1])).days == 60


def test_crawler_anchors_come_from_verified_profiles():
    from unittest.mock import Mock
    from app.tasks.crawler_task import select_anchor_tags

    db = Mock()
    query = db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value
    query.execute.return_value.data = [{"player_tag": "#ABC", "rank": "16"},
                                       {"player_tag": "DEF", "rank": "13"}]
    assert select_anchor_tags(db) == {"ABC", "DEF"}
    db.table.return_value.select.return_value.eq.assert_called_once_with(
        "unlocked_characters->>profile_status", "verified"
    )


def test_crawler_anchors_include_elite_outside_recent_profiles(monkeypatch):
    from unittest.mock import Mock
    from app.tasks.crawler_task import select_anchor_tags

    db = Mock()
    query = db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value
    query.execute.side_effect = [
        SimpleNamespace(data=[{"player_tag": f"LOW{i}", "rank": "2"} for i in range(1000)]),
        SimpleNamespace(data=[{"player_tag": "ELITE", "rank": "13",
                              "updated_at": pd.Timestamp.now(tz="UTC").isoformat()},
                              {"player_tag": "LEGEND", "rank": "16",
                               "updated_at": pd.Timestamp.now(tz="UTC").isoformat()}]),
    ]
    monkeypatch.setattr("app.tasks.crawler_task.random.sample", lambda values, count: list(values)[:count])
    anchors = select_anchor_tags(db)
    assert len(anchors) == 10
    assert {"ELITE", "LEGEND"} <= anchors
    assert query.execute.call_count == 2


def test_elite_refresh_skips_recent_or_anchor_players():
    from unittest.mock import Mock
    from app.tasks.crawler_task import select_elite_refresh_tags

    db = Mock()
    query = (db.table.return_value.select.return_value.eq.return_value.lt.return_value
             .order.return_value.range.return_value)
    query.execute.return_value.data = [
        {"player_tag": "ANCHOR", "rank": "18"},
        {"player_tag": "OLD_ELITE", "rank": "13"},
        {"player_tag": "OLD_LOW", "rank": "12"},
    ]
    assert select_elite_refresh_tags(db, {"ANCHOR"}) == ["OLD_ELITE"]
    db.table.return_value.select.return_value.eq.return_value.lt.assert_called_once()


def test_encountered_targets_include_high_rank_and_new_players(monkeypatch):
    from unittest.mock import Mock
    from app.tasks import crawler_task

    db = Mock()
    db.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
        {"player_tag": "HIGH", "rank": "19", "status": "verified"},
        {"player_tag": "LOW", "rank": "10", "status": "verified"},
        {"player_tag": "BAD", "rank": "0", "status": "not_found"},
    ]
    monkeypatch.setattr(crawler_task.random, "shuffle", lambda candidates: None)
    assert crawler_task.select_encountered_tags(db, {"HIGH", "LOW", "BAD", "NEW"}, limit=3) == [
        "HIGH", "NEW", "LOW"
    ]


def test_ranked_encounters_are_prioritized_over_other_unknown_players(monkeypatch):
    from unittest.mock import Mock
    from app.tasks import crawler_task
    from app.services.battle_records import ranked_encountered_tags

    items = [{"battle": {"type": "soloRanked", "teams": [[{"tag": "#ELITE"}]]}},
             {"battle": {"type": "ranked", "teams": [[{"tag": "#NORMAL"}]]}}]
    assert ranked_encountered_tags(items) == {"ELITE"}
    db = Mock()
    db.table.return_value.select.return_value.in_.return_value.execute.return_value.data = []
    monkeypatch.setattr(crawler_task.random, "shuffle", lambda candidates: None)
    assert crawler_task.select_encountered_tags(db, {"NORMAL", "ELITE"}, limit=1,
                                                 ranked_tags={"ELITE"}) == ["ELITE"]


def test_background_crawler_failure_is_visible_to_workflow(monkeypatch):
    import asyncio
    from app.routers import cron

    async def failing_crawler(report_stage, aggregate=True):
        report_stage("saving_matches")
        raise RuntimeError("failed match write")

    monkeypatch.setattr(cron, "run_crawler_task", failing_crawler)
    cron._batch_runs["test-run"] = {"status": "accepted", "stage": "queued"}
    asyncio.run(cron._run_batch_with_status("test-run"))
    assert cron._batch_runs.pop("test-run") == {
        "status": "failed", "stage": "saving_matches",
        "error_type": "RuntimeError", "error_code": "", "error_column": None,
    }


def test_crawler_saves_battles_with_missing_map_or_brawler_name(monkeypatch):
    from unittest.mock import Mock
    from app.tasks import crawler_task
    from app.scripts import daily_calc

    db = Mock()
    db.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    monkeypatch.setattr(crawler_task, "get_db", lambda: db)
    monkeypatch.setattr(crawler_task, "select_anchor_tags", lambda database: {"ABC"})
    monkeypatch.setattr(crawler_task, "select_elite_refresh_tags", lambda database, excluded: [])

    async def player_info(tag):
        if tag != "ABC":
            raise ValueError("not found")
        return {"tag": "#ABC", "name": "Test", "club": {}}

    async def battlelog(tag):
        return {"items": [{"battleTime": "20260917T120000.000Z",
                           "event": {"mode": "brawlBall", "map": None},
                           "battle": {"type": "ranked", "result": "victory",
                                      "teams": [[{"tag": "#ABC", "brawler": {"name": None}}],
                                                [{"tag": "#DEF", "brawler": None}]]}},
                          {"battleTime": "invalid", "battle": {"type": "ranked", "result": "victory"}},
                          {"battleTime": "20260917T120100Z",
                           "event": {"mode": "brawlBall", "map": "Test Map"},
                           "battle": {"type": "ranked", "result": "defeat",
                                      "teams": [[{"tag": "#ABC", "brawler": {"name": "COLT"}}]]}}]}

    monkeypatch.setattr(crawler_task, "get_player", player_info)
    monkeypatch.setattr(crawler_task, "get_player_battlelog", battlelog)
    def unexpected_aggregation(client):
        raise AssertionError("Render must not run aggregation")

    monkeypatch.setattr(daily_calc, "run_daily_calculation", unexpected_aggregation)

    result = asyncio.run(crawler_task.run_crawler_task(aggregate=False))
    saved = db.table.return_value.upsert.call_args_list[-1].args[0]
    assert result["battle_records_fetched"] == 2
    assert result["aggregation"] is None
    assert saved[0]["map_id"] == "unknown"
    assert saved[0]["hero_used"] == "unknown"
    assert saved[0]["opponents"] == ["unknown"]
    assert saved[1]["match_at"] == "2026-09-17T12:01:00+00:00"


def test_duplicate_battle_ids_are_removed_before_upsert():
    from app.services.battle_records import deduplicate_battle_records, parse_battlelog

    item = {"battleTime": "20260918T120000.000Z",
            "event": {"mode": "brawlBall", "map": "unknown"},
            "battle": {"type": "ranked", "result": "victory", "teams": [
                [{"tag": "#ABC", "brawler": {"name": "COLT"}}],
                [{"tag": "#DEF", "brawler": {"name": "BULL"}}]]}}
    improved = {**item, "event": {**item["event"], "map": "Test Map"}}
    records, _ = parse_battlelog("ABC", [item, improved])
    assert len(records) == 1
    assert records[0]["map_id"] == "Test Map"
    assert len(deduplicate_battle_records(records + records)) == 1
