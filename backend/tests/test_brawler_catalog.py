import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import brawler_catalog as catalog


def test_localization_joins_game_ids_instead_of_translating_english_names():
    rows = catalog.localized_rows({"list": [
        {"id": 16000109, "name": "Cosmo", "released": True},
        {"id": 16000111, "name": "Future", "released": True},
        {"id": 16000112, "name": "Unreleased", "released": False},
    ]}, {"Attractor": {"id": 16000109, "TID": "TID_ATTRACTOR"},
         "FutureInternalName": {"id": 16000111, "TID": "TID_FUTURE"}},
        {"TID_ATTRACTOR": {"JP": "コスモ"}, "TID_FUTURE": {"JP": "新キャラ"}})
    assert [(row["name"], row["nameJa"]) for row in rows] == [("Cosmo", "コスモ"), ("Future", "新キャラ")]
    with pytest.raises(ValueError):
        catalog.localized_rows({"list": []}, {}, {})


@pytest.mark.parametrize("label", [None, "", "\ufffd", "COSMO"])
def test_missing_or_corrupt_localization_is_not_published_as_a_translation(label):
    row = catalog.localized_rows({"list": [{"id": 16000109, "name": "Cosmo"}]},
        {"Attractor": {"id": 16000109, "TID": "TID_ATTRACTOR"}}, {"TID_ATTRACTOR": {"JP": label}})[0]
    assert row["nameJa"] is None


def test_missing_portrait_uses_verified_game_avatar():
    client = AsyncMock()
    client.head.side_effect = [httpx.Response(404), httpx.Response(200, headers={"content-type": "image/png"})]
    image = asyncio.run(catalog.resolve_image(client,
        {"imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000109.png", "avatarId": 28001337}, {}))
    assert image == "https://cdn.brawlify.com/profile-icons/regular/28001337.png"
    assert client.head.await_count == 2


def test_asset_failure_retains_previous_image_without_fetching_arbitrary_urls():
    client = AsyncMock()
    client.head.side_effect = httpx.ConnectError("offline")
    image = asyncio.run(catalog.resolve_image(client,
        {"imageUrl": "http://localhost/private", "avatarId": 28001337}, {"imageUrl": "previous.png"}))
    assert image == "previous.png"
    client.head.assert_awaited_once_with("https://cdn.brawlify.com/profile-icons/regular/28001337.png")


def test_catalog_failure_keeps_last_known_data_and_backs_off(monkeypatch):
    monkeypatch.setattr(catalog, "_catalog", [{"id": 16000109, "name": "Cosmo", "nameJa": "コスモ", "imageUrl": "previous.png"}])
    monkeypatch.setattr(catalog, "_next_refresh", 0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.get.side_effect = httpx.ConnectError("offline")
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    async def run():
        first = await catalog.get_brawler_catalog()
        second = await catalog.get_brawler_catalog()
        return first, second

    first, second = asyncio.run(run())
    assert first == second
    assert first["brawlers"][0]["nameJa"] == "コスモ"
    assert client.get.await_count == 3


def test_successful_refresh_adds_future_brawler_and_reuses_hourly_cache(monkeypatch):
    monkeypatch.setattr(catalog, "_catalog", [])
    monkeypatch.setattr(catalog, "_next_refresh", 0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    monkeypatch.setattr(catalog.time, "monotonic", lambda: 100)
    client = AsyncMock()
    client.__aenter__.return_value = client
    request = httpx.Request("GET", catalog.API_BASE)
    client.get.side_effect = [httpx.Response(200, request=request, json=payload) for payload in (
        {"list": [{"id": 16000111, "name": "Future", "avatarId": 28001339}]},
        {"Internal": {"id": 16000111, "TID": "TID_FUTURE"}},
        {"TID_FUTURE": {"JP": "新キャラ"}},
    )]
    client.head.return_value = httpx.Response(200, headers={"content-type": "image/png"})
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    async def run():
        first = await catalog.get_brawler_catalog()
        second = await catalog.get_brawler_catalog()
        return first, second

    first, second = asyncio.run(run())
    assert first == second
    assert first["brawlers"][0]["nameJa"] == "新キャラ"
    assert first["brawlers"][0]["imageUrl"].endswith("28001339.png")
    assert catalog._next_refresh == 100 + 60 * 60
    assert client.get.await_count == 3
