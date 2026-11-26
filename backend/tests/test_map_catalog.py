import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import map_catalog as catalog


def test_extract_map_image_ids_prefers_active_then_newest_and_rejects_non_cdn():
    rows = catalog.extract_map_image_ids({"list": [
        {"id": 15000001, "name": "Hard Rock Mine", "disabled": True,
         "imageUrl": "https://cdn.brawlify.com/maps/regular/15000001.png"},
        {"id": 15000007, "name": "Hard Rock Mine", "disabled": False,
         "imageUrl": "https://cdn.brawlify.com/maps/regular/15000007.png"},
        {"id": 15000100, "name": "Center Stage", "disabled": False,
         "imageUrl": "https://cdn.brawlify.com/maps/regular/15000100.png"},
        {"id": 15000132, "name": "Center Stage", "disabled": False,
         "imageUrl": "https://cdn.brawlify.com/maps/regular/15000132.png"},
        {"id": 15009999, "name": "Untrusted", "disabled": False,
         "imageUrl": "https://evil.example/maps/15009999.png"},
    ]})
    assert rows == {
        "Center Stage": 15000132,
        "Hard Rock Mine": 15000007,
    }
    with pytest.raises(ValueError):
        catalog.extract_map_image_ids({"list": []})


def test_map_catalog_failure_retains_last_known_data(monkeypatch):
    monkeypatch.setattr(catalog, "_map_catalog", {"Hard Rock Mine": 15000007})
    monkeypatch.setattr(catalog, "_next_refresh", 0.0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.get.side_effect = httpx.ConnectError("offline")
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    async def run():
        first = await catalog.get_map_catalog()
        second = await catalog.get_map_catalog()
        return first, second

    first, second = asyncio.run(run())
    assert first == second == {"maps": {"Hard Rock Mine": 15000007}}
    assert client.get.await_count == 1


def test_map_catalog_refresh_merges_new_map_and_reuses_hourly_cache(monkeypatch):
    monkeypatch.setattr(catalog, "_map_catalog", {"Old Map": 15000001})
    monkeypatch.setattr(catalog, "_next_refresh", 0.0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    monkeypatch.setattr(catalog.time, "monotonic", lambda: 200.0)
    client = AsyncMock()
    client.__aenter__.return_value = client
    request = httpx.Request("GET", catalog.MAPS_API_URL)
    client.get.return_value = httpx.Response(200, request=request, json={"list": [
        {"id": 15001999, "name": "Future Map", "disabled": False,
         "imageUrl": "https://cdn.brawlify.com/maps/regular/15001999.png"},
    ]})
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    async def run():
        first = await catalog.get_map_catalog()
        second = await catalog.get_map_catalog()
        return first, second

    first, second = asyncio.run(run())
    assert first == second == {"maps": {"Future Map": 15001999, "Old Map": 15000001}}
    assert catalog._next_refresh == 200.0 + 3600
    assert client.get.await_count == 1


def test_bundled_map_catalog_contains_standard_maps():
    assert catalog._map_catalog.get("Hard Rock Mine")
    assert catalog._map_catalog.get("Center Stage")
    assert catalog._map_catalog.get("Alchemy")
