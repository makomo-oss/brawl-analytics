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
