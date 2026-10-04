import pytest
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
    with pytest.raises(HTTPException) as error:
        brawler_pages.snapshot("does-not-exist")
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
