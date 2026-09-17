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

def test_tier_counts_observations_without_dividing_by_six(monkeypatch):
    monkeypatch.setattr(meta,"get_db",lambda:None)
    monkeypatch.setattr(meta,"_get_cached_total_analyzed",lambda db:999)
    monkeypatch.setattr(meta,"_get_cached_macro_data",lambda db:[dict(match_type="gachi",map_id="map",character_id="colt",total_matches=12,total_wins=6,updated_at="2026-09-16")])
    result=meta.get_tier_list(type="gachi")
    assert result["metrics"]["analyzed_matches"] == 12
    assert result["updated_at"] == "2026-09-16"


def test_recommendation_uses_data_and_excludes_bans(monkeypatch):
    from app.algorithm.recommender import recommend_picks
    def tier(**kwargs):
        return {"characters": {"colt": {"score": 80}, "shelly": {"score": 60}, "el primo": {"score": 90}}}
    monkeypatch.setattr(meta, "get_tier_list", tier)
    result = recommend_picks("map", "brawlBall", ["el_primo"], [], 1, True, ["COLT"])
    assert [r["character_id"] for r in result] == ["shelly"]


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
    monkeypatch.setattr(crawler_task, "DEFAULT_SEED_TAGS", {"ABC"})
    monkeypatch.setattr(crawler_task, "get_player", AsyncMock(side_effect=brawl_api.BrawlAPIError("403")))
    with pytest.raises(RuntimeError, match="valid player profiles"):
        asyncio.run(crawler_task.run_crawler_task())
    db.table.return_value.upsert.assert_not_called()
    db.table.return_value.delete.assert_not_called()


def test_background_crawler_failure_is_visible_to_workflow(monkeypatch):
    import asyncio
    from app.routers import cron

    async def failing_crawler(report_stage):
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
    monkeypatch.setattr(crawler_task, "DEFAULT_SEED_TAGS", {"ABC"})

    async def player_info(tag):
        if tag != "ABC":
            raise ValueError("not found")
        return {"tag": "#ABC", "name": "Test", "club": {}}

    async def battlelog(tag):
        return {"items": [{"battleTime": "20260917T120000.000Z",
                           "event": {"mode": "brawlBall", "map": None},
                           "battle": {"type": "ranked", "result": "victory",
                                      "teams": [[{"tag": "#ABC", "brawler": {"name": None}}],
                                                [{"tag": "#DEF", "brawler": {"name": "BULL"}}]]}}]}

    monkeypatch.setattr(crawler_task, "get_player", player_info)
    monkeypatch.setattr(crawler_task, "get_player_battlelog", battlelog)
    monkeypatch.setattr(daily_calc, "run_daily_calculation", lambda client: {"macro_stats_count": 1})

    result = asyncio.run(crawler_task.run_crawler_task())
    saved = db.table.return_value.upsert.call_args_list[-1].args[0]
    assert result["battle_records_fetched"] == 1
    assert saved[0]["map_id"] == "unknown"
    assert saved[0]["hero_used"] == "unknown"
