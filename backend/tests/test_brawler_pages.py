import pytest
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from fastapi import HTTPException

from app.routers import meta
from app.services import brawler_pages


@pytest.fixture
def rows(monkeypatch):
    data = [
        {"character_id": name, "mode": mode, "map_id": map_id,
         "match_type": cohort, "total_matches": 100, "total_wins": wins,
         "updated_at": "2026-10-04T10:00:00Z"}
        for name, wins in (("amber", 50), ("future new hero", 65))
        for cohort in ("ranked", "gachi")
        for mode, map_id in (("gemGrab", "new-map"), ("brawlBall", "shared-map"),
                             ("trioShowdown", "shared-map"))
    ]
    meta.clear_meta_cache()
    monkeypatch.setattr(meta, "get_db", lambda: None)
    monkeypatch.setattr(meta, "_get_cached_macro_data", lambda db: data)
    monkeypatch.setattr(meta, "_get_cached_total_analyzed", lambda db: 100)
    monkeypatch.setattr(meta, "_contextual_pairs", lambda *args: {})
    yield data
    meta.clear_meta_cache()


def test_new_character_is_discovered_without_static_catalog_or_build(rows):
    index = brawler_pages.snapshot()
    assert "future new hero" in index["overview"]["global"]["characters"]
    page = brawler_pages.snapshot("future-new-hero")
    for cohort in ("global", "gachi"):
        assert page["details"][cohort]["future new hero"]["total_matches"] == 300
        assert set(page["contexts"][cohort]["modes"]) == {"gemGrab", "brawlBall"}
        assert page["mapModes"][cohort]["shared-map"] == ["brawlBall", "trioShowdown"]
        for map_id, characters in page["contexts"][cohort]["maps"].items():
            expected = meta.get_tier_list(type=cohort, sub_type="map", id=map_id)["characters"]["future new hero"]
            assert characters["future new hero"]["win_rate"] == expected["win_rate"]
            assert characters["future new hero"]["confidence_interval"] == expected["confidence_interval"]


def test_unknown_character_returns_404(rows):
    brawler_pages.snapshot()  # Index and a punctuation-only ID must have different keys.
    with pytest.raises(HTTPException) as error:
        brawler_pages.snapshot("does-not-exist")
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        brawler_pages.snapshot("---")
    assert error.value.status_code == 404


def test_cache_clear_reflects_new_battle_data(rows):
    brawler_pages.snapshot()
    rows.append({**rows[0], "character_id": "another new hero"})
    meta.clear_meta_cache()
    assert "another new hero" in brawler_pages.snapshot()["overview"]["global"]["characters"]


def test_unavailable_statistics_are_not_mistaken_for_unknown_character(rows):
    rows.clear()
    with pytest.raises(HTTPException) as error:
        brawler_pages.snapshot("amber")
    assert error.value.status_code == 503


def test_index_does_not_wait_for_another_characters_matchup_query(rows, monkeypatch):
    started, release = Event(), Event()
    original = meta.get_character_detail

    def slow_detail(*args, **kwargs):
        started.set()
        assert release.wait(timeout=5)
        return original(*args, **kwargs)

    monkeypatch.setattr(meta, "get_character_detail", slow_detail)
    with ThreadPoolExecutor(max_workers=2) as pool:
        page = pool.submit(brawler_pages.snapshot, "amber")
        try:
            assert started.wait(timeout=2)
            index = pool.submit(brawler_pages.snapshot)
            assert "amber" in index.result(timeout=1)["overview"]["global"]["characters"]
        finally:
            release.set()
        assert page.result(timeout=2)["details"]["global"]["amber"]


def test_finished_page_preserves_fields_and_reuses_details(rows, monkeypatch):
    calls = []
    original = meta.get_character_detail
    def detail(*args, **kwargs):
        calls.append((args, kwargs))
        result = original(*args, **kwargs)
        # Nonneutral pair evidence must survive the completed-response cache.
        return {**result, 'kamo': ['bull'], 'matchups': {'bull': 62.5},
                'synergies': {'colt': {'lift': 4.2, 'matches': 50}}}
    monkeypatch.setattr(meta, 'get_character_detail', detail)
    expected = brawler_pages._build_snapshot(('oracle',), 'amber')
    calls.clear()
    first = brawler_pages.snapshot('amber')
    assert first == expected
    assert brawler_pages.snapshot('AMBER') == expected
    assert len(calls) == 2  # One per cohort, rather than two per request.
    first['details']['global']['amber']['matchups']['bull'] = 0
    assert brawler_pages.snapshot('amber') == expected


def test_same_character_requests_share_one_inflight_build(rows, monkeypatch):
    started, release = Event(), Event()
    original = meta.get_character_detail
    calls = []
    def detail(*args, **kwargs):
        calls.append(kwargs['type'])
        started.set()
        assert release.wait(timeout=5)
        return original(*args, **kwargs)
    monkeypatch.setattr(meta, 'get_character_detail', detail)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(brawler_pages.snapshot, 'amber') for _ in range(8)]
        try:
            assert started.wait(timeout=2)
        finally:
            release.set()
        pages = [future.result(timeout=3) for future in futures]
    assert calls == ['global', 'gachi']
    assert all(page == pages[0] for page in pages)


def test_clear_during_inflight_build_does_not_repopulate_old_cache(rows, monkeypatch):
    started, release = Event(), Event()
    original = meta.get_character_detail
    def detail(*args, **kwargs):
        started.set()
        assert release.wait(timeout=5)
        return original(*args, **kwargs)
    monkeypatch.setattr(meta, 'get_character_detail', detail)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(brawler_pages.snapshot, 'amber')
        try:
            assert started.wait(timeout=2)
            meta.clear_meta_cache()
        finally:
            release.set()
        future.result(timeout=3)
    assert not brawler_pages._pages
    rows[0]['total_wins'] = 80
    assert brawler_pages.snapshot('amber')['details']['global']['amber']['win_rate'] == 60


def test_failure_is_not_cached_and_next_request_can_retry(rows, monkeypatch):
    original = meta.get_character_detail
    def failure(*args, **kwargs):
        raise HTTPException(503, 'temporary failure')
    monkeypatch.setattr(meta, 'get_character_detail', failure)
    with pytest.raises(HTTPException):
        brawler_pages.snapshot('amber')
    assert not brawler_pages._pages and not brawler_pages._pending
    monkeypatch.setattr(meta, 'get_character_detail', original)
    assert brawler_pages.snapshot('amber')['details']['global']['amber']
