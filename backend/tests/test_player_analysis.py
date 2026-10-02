from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from app.services.player_analysis import build_player_analysis, fetch_player_history, invalidate_player_analysis

NOW = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)


def battle(index, days=1, **changes):
    return {"match_id": str(index), "match_at": (NOW - timedelta(days=days, seconds=index)).isoformat(),
            "match_type": "ranked", "hero_used": "COLT", "mode": "brawlBall", "map_id": "Test Map",
            "result": "victory", "allies": ["SHELLY", "BULL"], "opponents": ["EDGAR", "PIPER", "CROW"], **changes}


def analyze(rows, macro=None, **filters):
    return build_player_analysis(rows, macro or [], now=NOW, **filters)


def test_saved_history_deduplication_draws_and_invalid_observations():
    rows = [battle(1), battle(1), battle(2, result="defeat"), battle(3, result="draw"),
            battle(4, match_type="friendly"), battle(5, result="unknown"), battle(6, days=61),
            battle(7, match_at="invalid"), battle(8, days=-1)]
    data = analyze(rows)
    assert data["summary"]["matches"] == 3
    assert data["summary"]["win_rate"] == 50
    assert data["summary"]["draws"] == 1
    assert sum(d["matches"] for d in data["timeline"]) == 3
    assert data["characters"][0]["matches"] == 3


def test_period_type_and_context_filters_do_not_mix_normal_and_ranked():
    rows = [battle(1), battle(2, match_type="soloRanked"), battle(3, days=20),
            battle(4, match_type="teamRanked", mode="gemGrab", map_id="Other Map", hero_used="BULL")]
    data = analyze(rows, days=7, match_type="gachi", hero="colt", mode="brawl_ball", map_id="Test Map")
    assert data["summary"]["matches"] == 1
    assert data["coverage"]["retained_matches"] == 4
    assert data["options"]["heroes"] == ["bull", "colt"]
    assert data["options"]["maps"] == ["Test Map"]
    assert analyze(rows, match_type="normal")["summary"]["matches"] == 2


def test_reference_matches_context_and_excludes_duplicate_gachi_cohorts():
    rows = [battle(i, result="defeat") for i in range(30)]
    macro = [{"match_type": "ranked", "mode": "brawlBall", "map_id": "Test Map", "character_id": "colt",
              "total_matches": 100, "total_wins": 90, "weighted_matches": 80, "weighted_wins": 48},
             {"match_type": "gachi", "mode": "brawlBall", "map_id": "Test Map", "character_id": "colt",
              "total_matches": 1000, "total_wins": 1000}]
    data = analyze(rows, macro)
    assert data["characters"][0]["reference_win_rate"] == 60
    assert data["characters"][0]["reference_matches"] == 100
    assert data["practice"][0]["supported"] is True
    assert analyze([battle(1, map_id="Unmatched")], macro)["summary"]["reference_win_rate"] is None
    assert not analyze([battle(1, result="defeat")], macro)["practice"]


def test_incomplete_reference_coverage_never_fabricates_a_comparison():
    rows = [battle(i, map_id="Missing" if i < 3 else "Test Map") for i in range(10)]
    macro = [{"match_type": "ranked", "mode": "brawlBall", "map_id": "Test Map", "character_id": "colt",
              "total_matches": 100, "total_wins": 60}]
    summary = analyze(rows, macro)["summary"]
    assert summary["reference_coverage"] == 70
    assert summary["reference_win_rate"] is None
    assert summary["gap"] is None


def test_reference_gap_compares_the_same_observations_on_both_sides():
    rows = [battle(i, map_id="Missing" if i < 2 else "Test Map", result="defeat" if i < 2 else "victory") for i in range(10)]
    macro = [{"match_type": "ranked", "mode": "brawlBall", "map_id": "Test Map", "character_id": "colt",
              "total_matches": 100, "total_wins": 60}]
    summary = analyze(rows, macro)["summary"]
    assert summary["win_rate"] == 80
    assert summary["comparison_win_rate"] == 100
    assert summary["comparison_matches"] == 8
    assert summary["gap"] == 40


def test_personal_advice_without_macro_data_is_labeled_and_does_not_infer_survival_counters():
    rows = [battle(i) for i in range(15)]
    strength = analyze(rows)["strengths"][0]
    assert strength["basis"] == "personal"
    assert strength["reference_win_rate"] is None
    assert analyze([battle(i, result="defeat") for i in range(15)])["practice"][0]["basis"] == "personal"
    assert not analyze([battle(i, result="defeat", mode="soloShowdown") for i in range(15)])["practice"]


def test_growth_uses_separate_equal_windows_and_requires_ten_decided_games():
    rows = [battle(i, days=1) for i in range(10)] + [battle(i + 10, days=9, result="defeat") for i in range(10)]
    trend = analyze(rows, days=7)["trend"]
    assert trend["current"]["matches"] == trend["previous"]["matches"] == 10
    assert trend["delta"] == 100
    assert analyze(rows[:9], days=7)["trend"]["delta"] is None
    assert analyze(rows, days=60)["trend"]["days"] == 30


def test_pairs_count_a_character_once_per_battle_and_only_decisive_3v3():
    rows = [battle(i, opponents=["EDGAR", "EDGAR", "CROW"]) for i in range(5)]
    rows += [battle(20, mode="soloShowdown"), battle(21, result="draw"), battle(22, allies=[])]
    data = analyze(rows)
    assert data["pair_matches"] == 5
    assert next(r for r in data["opponents"] if r["id"] == "edgar")["matches"] == 5
    assert not analyze(rows[:4])["opponents"]


def test_history_pages_preserve_all_rows_and_invalidation_refreshes_cache():
    db = Mock()
    query = (db.table.return_value.select.return_value.eq.return_value.in_.return_value
             .gte.return_value.lte.return_value.order.return_value.order.return_value.range.return_value)
    query.execute.side_effect = [SimpleNamespace(data=[battle(i) for i in range(1000)], count=1001),
                                 SimpleNamespace(data=[battle(1000)], count=1001),
                                 SimpleNamespace(data=[], count=0)]
    invalidate_player_analysis("TEST")
    rows, truncated = fetch_player_history(db, "TEST", NOW)
    assert len(rows) == 1001 and not truncated
    assert fetch_player_history(db, "TEST", NOW)[0] is rows
    assert query.execute.call_count == 2
    db.table.return_value.select.return_value.eq.assert_called_with("player_tag", "TEST")
    invalidate_player_analysis("TEST")
    assert fetch_player_history(db, "TEST", NOW)[0] == []
