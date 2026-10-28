from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import pytest
import httpx
from fastapi import HTTPException
from app.routers import meta


@pytest.mark.parametrize('error', [httpx.RemoteProtocolError, httpx.ReadError])
def test_interrupted_read_retries_once_before_caching(error):
    attempts = []
    def execute():
        attempts.append(1)
        if len(attempts) == 1:
            raise error('connection terminated')
        return SimpleNamespace(data=[])
    db = SimpleNamespace(rpc=lambda *args: SimpleNamespace(execute=execute))
    assert pairs(db) == {}
    assert pairs(db) == {}
    assert len(attempts) == 2


def test_repeated_transport_failure_is_bounded():
    attempts = []
    def execute():
        attempts.append(1)
        raise httpx.RemoteProtocolError('connection terminated')
    db = SimpleNamespace(rpc=lambda *args: SimpleNamespace(execute=execute))
    with pytest.raises(HTTPException):
        pairs(db)
    assert len(attempts) == 2


class MacroDatabase:
    def __init__(self, execute):
        self.execute = execute

    def table(self, *args): return self
    def select(self, *args): return self
    def order(self, *args): return self
    def range(self, *args): return self


def test_cold_shared_statistics_are_read_once_for_eight_requests():
    started, release = Event(), Event()
    calls = []
    def execute():
        calls.append(1)
        started.set()
        assert release.wait(timeout=5)
        return SimpleNamespace(data=[{'character_id': 'amber', 'total_matches': 100}])
    db = MacroDatabase(execute)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(meta._get_cached_macro_data, db) for _ in range(8)]
        try:
            assert started.wait(timeout=2)
        finally:
            release.set()
        data = [f.result(timeout=2) for f in futures]
    assert len(calls) == 1
    assert all(rows == data[0] for rows in data)


def test_old_shared_statistics_cannot_replace_cleared_cache():
    started, release = Event(), Event()
    def old():
        started.set()
        assert release.wait(timeout=5)
        return SimpleNamespace(data=[{'version': 'old'}])
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(meta._get_cached_macro_data, MacroDatabase(old))
        try:
            assert started.wait(timeout=2)
            meta.clear_meta_cache()
            fresh = meta._get_cached_macro_data(MacroDatabase(lambda: SimpleNamespace(data=[{'version': 'new'}])))
        finally:
            release.set()
        assert future.result(timeout=2) == [{'version': 'old'}]
    assert fresh == meta._MACRO_CACHE['data'] == [{'version': 'new'}]


def test_failed_shared_statistics_can_retry():
    def fail(): raise RuntimeError('database unavailable')
    with pytest.raises(HTTPException):
        meta._get_cached_macro_data(MacroDatabase(fail))
    assert meta._MACRO_PENDING is None
    assert meta._get_cached_macro_data(MacroDatabase(lambda: SimpleNamespace(data=[]))) == []


@pytest.fixture(autouse=True)
def empty_cache():
    meta.clear_meta_cache()
    yield
    meta.clear_meta_cache()


def pairs(db, name="amber"):
    return meta._contextual_pairs(db, "gachi", None, None, "all", character_id=name)


def test_all_character_snapshots_do_not_flush_first_character():
    calls = []
    class DB:
        def rpc(self, name, params):
            calls.append(params["p_character"])
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[{"char_a": params["p_character"]}]))
    db = DB()
    for i in range(107):
        pairs(db, f"hero{i}")
    pairs(db, "hero0")
    assert len(calls) == 107


def test_expiry_matches_aggregate_cache_and_lru_evicts_only_oldest(monkeypatch):
    now = [1000]
    monkeypatch.setattr(meta.time, "time", lambda: now[0])
    monkeypatch.setattr(meta, "_PAIR_CACHE_LIMIT", 3)
    calls = []
    class DB:
        def rpc(self, name, params):
            calls.append(params["p_character"])
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))
    db = DB()
    for name in ["amber", "colt", "shelly"]:
        pairs(db, name)
    now[0] += 301
    pairs(db, "amber")
    pairs(db, "edgar")
    pairs(db, "amber")
    assert calls == ["amber", "colt", "shelly", "edgar"]
    assert len(meta._PAIR_CONTEXT_CACHE) == 3
    now[0] += 3300
    pairs(db, "amber")
    assert calls[-1] == "amber" and len(calls) == 5


def test_concurrent_same_character_shares_rpc_other_characters_do_not_wait():
    started, release, follower = Event(), Event(), Event()
    calls = []
    class DB:
        def rpc(self, name, params):
            char = params["p_character"]
            calls.append(char)
            def execute():
                if char == "amber":
                    started.set()
                    assert release.wait(3)
                return SimpleNamespace(data=[{"char_a": char}])
            return SimpleNamespace(execute=execute)
    db = DB()
    with ThreadPoolExecutor(max_workers=3) as pool:
        first = pool.submit(pairs, db)
        assert started.wait(1)
        def follow():
            follower.set()
            return pairs(db, "AMBER")
        second = pool.submit(follow)
        assert follower.wait(1)
        third = pool.submit(pairs, db, "colt")
        assert third.result(timeout=1) == {"colt": [{"char_a": "colt"}]}
        release.set()
        assert first.result(timeout=1) == second.result(timeout=1)
    assert calls == ["amber", "colt"]


def test_failure_is_retryable():
    calls = []
    class DB:
        def rpc(self, name, params):
            calls.append(name)
            if len(calls) == 1:
                raise RuntimeError("unavailable")
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))
    db = DB()
    with pytest.raises(HTTPException) as error:
        pairs(db)
    assert error.value.status_code == 503
    assert pairs(db) == {}
    assert len(calls) == 2


def test_clear_during_query_cannot_restore_old_statistics():
    started, release = Event(), Event()
    count = [0]
    class DB:
        def rpc(self, name, params):
            count[0] += 1
            version = count[0]
            def execute():
                if version == 1:
                    started.set()
                    assert release.wait(3)
                return SimpleNamespace(data=[{"char_a": "amber", "version": version}])
            return SimpleNamespace(execute=execute)
    db = DB()
    with ThreadPoolExecutor(max_workers=1) as pool:
        old = pool.submit(pairs, db)
        assert started.wait(1)
        meta.clear_meta_cache()
        current = pairs(db)
        release.set()
        assert old.result(timeout=1)["amber"][0]["version"] == 1
    assert pairs(db) == current
    assert current["amber"][0]["version"] == 2
    assert count[0] == 2


def test_public_detail_response_allows_browser_cache(monkeypatch):
    from fastapi import Response
    from app.main import app
    monkeypatch.setattr(meta, "get_db", lambda: None)
    monkeypatch.setattr(meta, "get_tier_list", lambda **kwargs: {
        "characters": {"amber": {"kamo": [], "tenteki": [], "win_rate": 60}},
        "tiers": {"S": ["amber"]},
    })
    response = Response()
    detail = meta.get_character_detail("amber", type="gachi", response=response)
    assert response.headers["cache-control"] == "public, max-age=300"
    assert detail["character_id"] == "amber"
    parameters = app.openapi()["paths"]["/meta/characters/{character_id}"]["get"]["parameters"]
    assert "response" not in {parameter["name"] for parameter in parameters}


@pytest.mark.parametrize("rows", [[], [dict(character_id="amber", match_type="gachi",
    map_id="map", mode="brawlBall", total_matches=50, total_wins=30)]])
def test_tier_and_detail_do_not_wait_for_unused_raw_history_count(monkeypatch, rows):
    monkeypatch.setattr(meta, "get_db", lambda: None)
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: rows)
    monkeypatch.setattr(meta, "_contextual_pairs", lambda *args: {})
    def unused_count(db):
        pytest.fail("Tier/detail requests must not scan raw history for an unused count")
    monkeypatch.setattr(meta, "_get_cached_total_analyzed", unused_count)
    tier = meta.get_tier_list(type="gachi")
    assert tier["metrics"]["analyzed_matches"] == (50 if rows else 0)
    detail = meta.get_character_detail("amber", type="gachi")
    assert detail["total_matches"] == (50 if rows else 0)
