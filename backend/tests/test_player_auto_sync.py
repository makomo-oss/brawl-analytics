from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from app.services.player_auto_sync import collection_plan, control_hash, checked_tag, _save_collection

NOW = datetime(2026, 10, 3, tzinfo=timezone.utc)


def logs(count=1, minutes=0):
    return [{"battleTime": (NOW-timedelta(minutes=minutes, seconds=i)).strftime("%Y%m%dT%H%M%S.000Z"),
             "event": {"mode": "brawlBall", "map": "Test Map"},
             "battle": {"type": "ranked", "result": "victory", "teams": [
                 [{"tag": "#V99J0CCV8", "brawler": {"name": "COLT"}},
                  {"tag": "#PQQ", "brawler": {"name": "BULL"}}],
                 [{"tag": "#LLQ", "brawler": {"name": "PIPER"}}]]}}
            for i in range(count)]


def test_activity_keeps_five_minute_polling_and_idle_never_expires():
    previous = {"last_observed_at": (NOW-timedelta(days=4)).isoformat(), "idle_runs": 90}
    active = collection_plan(logs(), previous, NOW)
    assert active["interval_minutes"] == 5
    idle = collection_plan(logs(), active, NOW)
    assert idle["interval_minutes"] == 15
    idle = collection_plan(logs(), idle, NOW)
    assert idle["interval_minutes"] == 30
    idle = collection_plan([], {**idle, "idle_runs": 100000}, NOW+timedelta(days=90))
    assert idle["interval_minutes"] == 30
    assert datetime.fromisoformat(idle["next_sync_at"]) > NOW+timedelta(days=90)


def test_gap_requires_full_newer_window_and_does_not_invent_missing_count():
    previous = {"last_observed_at": (NOW-timedelta(minutes=5)).isoformat()}
    assert collection_plan(logs(25), previous, NOW)["gap_detected_at"] == NOW.isoformat()
    assert collection_plan(logs(24), previous, NOW)["gap_detected_at"] is None
    assert collection_plan(logs(25, minutes=5), previous, NOW)["gap_detected_at"] is None
    assert collection_plan(logs(25), {}, NOW)["gap_detected_at"] is None


def test_invalid_or_future_log_dates_do_not_reset_collection_cursor():
    previous = {"last_observed_at": (NOW-timedelta(minutes=5)).isoformat()}
    plan = collection_plan([{"battleTime": "bad"}, None]+logs(minutes=-10), previous, NOW)
    assert plan["last_observed_at"] == previous["last_observed_at"]
    assert plan["interval_minutes"] == 15


def test_control_keys_and_player_tags_are_validated():
    assert control_hash("a"*64) != "a"*64
    assert checked_tag("#v99j0ccv8") == "V99J0CCV8"
    for token in ("", "x"*64, "a"*63):
        with pytest.raises(ValueError): control_hash(token)
    with pytest.raises(ValueError): checked_tag("../player")


class Query:
    def __init__(self, rows): self.rows = rows
    def select(self, *args, **kwargs): return self
    def eq(self, *args, **kwargs): return self
    def limit(self, *args, **kwargs): return self
    def in_(self, *args, **kwargs): return self
    def execute(self): return SimpleNamespace(data=self.rows)


def database(enabled=True, saved=None, lease_valid=True):
    db = Mock()
    db.table.side_effect = lambda table: Query(([{"player_tag": "V99J0CCV8"}] if enabled else []) if table == "player_auto_sync_subscriptions" else (saved or []))
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=lease_valid)
    return db


def test_collection_only_saves_new_observations_in_atomic_completion():
    db = database(saved=[{"match_id": "V99J0CCV8_20261003T000000.000Z"}])
    job = {"player_tag": "V99J0CCV8", "lease_token": "lease"}
    result = _save_collection(db, job, logs(2), NOW)
    assert result == {"saved": 1}
    payload = db.rpc.call_args.args[1]
    assert len(payload["p_records"]) == 1
    assert payload["p_records"][0]["match_id"].endswith("20261002T235959.000Z")
    assert payload["p_state"]["last_new_matches"] == 1


def test_off_and_stale_leases_cannot_save_or_advance_collection():
    job = {"player_tag": "V99J0CCV8", "lease_token": "lease"}
    db = database(enabled=False)
    assert _save_collection(db, job, logs(), NOW) is None
    db.rpc.assert_not_called()
    assert _save_collection(database(lease_valid=False), job, logs(), NOW) is None
