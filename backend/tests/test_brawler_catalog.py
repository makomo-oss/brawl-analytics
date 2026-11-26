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


@pytest.mark.parametrize("value", [None, {}, {"id": True, "name": "Rare"}, {"id": -1, "name": "Rare"}, {"id": 2, "name": ""}])
def test_invalid_rarity_is_not_published(value):
    assert catalog.valid_rarity(value) is None


def test_catalog_includes_valid_rarity_for_future_characters():
    row = catalog.localized_rows({"list": [{"id": 16000111, "name": "Future", "rarity": {"id": 7, "name": "Ultra Legendary", "color": "#fff"}}]}, {}, {})[0]
    assert row["rarity"] == {"id": 7, "name": "Ultra Legendary"}


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
        {"list": [{"id": 16000111, "name": "Future", "avatarId": 28001339, "rarity": {"id": 5, "name": "Mythic"}}]},
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
    assert first["brawlers"][0]["rarity"] == {"id": 5, "name": "Mythic"}
    assert catalog._next_refresh == 100 + 60 * 60
    assert client.get.await_count == 3


def test_bundled_catalog_includes_thunder_frogs():
    by_name = {row["name"].lower(): row for row in catalog._catalog}
    entry = by_name.get("thunder frogs")
    assert entry is not None
    assert entry["id"] == 16000111
    assert entry["nameJa"] == "サンダーフロッグ"
    assert entry["imageUrl"].startswith("https://cdn.brawlify.com/") and entry["imageUrl"].endswith(".png")
    assert entry["rarity"] == {"id": 6, "name": "Legendary"}


def test_official_brawlers_include_unreleased_and_brawlapi_missing_entries():
    rows = catalog.localized_rows(
        {"list": [
            {"id": 16000110, "name": "Vince", "released": False, "rarity": {"id": 5, "name": "Mythic"}},
            {"id": 16000112, "name": "Hidden", "released": False},
        ]},
        {"Stacker": {"id": 16000110, "TID": "TID_STACKER"},
         "Frog": {"id": 16000111, "TID": "TID_FROG"}},
        {"TID_STACKER": {"JP": "ヴィンス"}, "TID_FROG": {"JP": "サンダーフロッグ"}},
        official_brawlers=[
            {"id": 16000110, "name": "VINCE"},
            {"id": 16000111, "name": "THUNDER FROGS"},
            {"id": 16000066, "name": "R-T"},
        ],
    )
    by_id = {row["id"]: row for row in rows}
    assert set(by_id) == {16000110, 16000111, 16000066}
    assert by_id[16000110]["nameJa"] == "ヴィンス"
    assert by_id[16000111]["name"] == "Thunder Frogs"
    assert by_id[16000111]["nameJa"] == "サンダーフロッグ"
    assert by_id[16000111]["imageUrl"] == "https://cdn.brawlify.com/brawlers/borders/16000111.png"
    assert by_id[16000066]["name"] == "R-T"


def test_refresh_discovers_official_brawler_with_cdn_image_and_wiki_fallback(monkeypatch):
    monkeypatch.setattr(catalog, "_catalog", [])
    monkeypatch.setattr(catalog, "_next_refresh", 0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    monkeypatch.setattr(catalog.config, "BRAWL_API_TOKEN", "real-token")
    monkeypatch.setattr(catalog.brawl_api, "get_brawlers", AsyncMock(return_value={
        "items": [
            {"id": 16000110, "name": "VINCE"},
            {"id": 16000111, "name": "THUNDER FROGS"},
        ]
    }))
    client = AsyncMock()
    client.__aenter__.return_value = client
    request = httpx.Request("GET", catalog.API_BASE)
    wiki_request = httpx.Request("GET", catalog.WIKI_API_URL)
    client.get.side_effect = [
        httpx.Response(200, request=request, json={"list": [
            {"id": 16000110, "name": "Vince", "released": True,
             "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000110.png",
             "rarity": {"id": 5, "name": "Mythic"}},
        ]}),
        httpx.Response(200, request=request, json={"Stacker": {"id": 16000110, "TID": "TID_STACKER"}}),
        httpx.Response(200, request=request, json={"TID_STACKER": {"JP": "ヴィンス"}}),
        httpx.Response(200, request=wiki_request, json={"query": {"pages": {
            "76283": {
                "title": "Thunder Frogs",
                "revisions": [{"slots": {"main": {"*": "{{Brawler Infobox\n|Rarity = Legendary\n}}"}} }],
                "langlinks": [{"lang": "ja", "*": "サンダーフロッグ"}],
            }
        }}}),
    ]
    client.head.return_value = httpx.Response(200, headers={"content-type": "image/png"})
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    result = asyncio.run(catalog.get_brawler_catalog())["brawlers"]
    by_id = {row["id"]: row for row in result}
    assert by_id[16000111] == {
        "id": 16000111,
        "name": "Thunder Frogs",
        "nameJa": "サンダーフロッグ",
        "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000111.png",
        "rarity": {"id": 6, "name": "Legendary"},
    }


def test_wiki_failure_is_non_fatal_and_later_brawlapi_translation_upgrades_name(monkeypatch):
    monkeypatch.setattr(catalog, "_catalog", [])
    monkeypatch.setattr(catalog, "_next_refresh", 0)
    monkeypatch.setattr(catalog, "_refresh_lock", asyncio.Lock())
    monkeypatch.setattr(catalog.config, "BRAWL_API_TOKEN", "real-token")
    monkeypatch.setattr(catalog.brawl_api, "get_brawlers", AsyncMock(return_value={
        "items": [{"id": 16000199, "name": "NEW HERO"}]
    }))
    client = AsyncMock()
    client.__aenter__.return_value = client
    request = httpx.Request("GET", catalog.API_BASE)
    # First refresh: missing in BrawlAPI and Wiki fails -> falls back to English + borderless image.
    client.get.side_effect = [
        httpx.Response(200, request=request, json={"list": []}),
        httpx.Response(200, request=request, json={}),
        httpx.Response(200, request=request, json={}),
        httpx.ConnectError("wiki unavailable"),
    ]
    client.head.side_effect = [
        httpx.Response(404),
        httpx.Response(200, headers={"content-type": "image/png"}),
    ]
    monkeypatch.setattr(catalog.httpx, "AsyncClient", lambda **kwargs: client)

    first = asyncio.run(catalog.get_brawler_catalog())["brawlers"]
    assert first == [{
        "id": 16000199,
        "name": "New Hero",
        "nameJa": "New Hero",
        "imageUrl": "https://cdn.brawlify.com/brawlers/borderless/16000199.png",
        "rarity": None,
    }]

    # Second refresh after cache clear: BrawlAPI adds JP localization, rarity, and bordered portrait.
    catalog.clear_catalog_cache()
    client.get.side_effect = [
        httpx.Response(200, request=request, json={"list": [
            {"id": 16000199, "name": "New Hero", "released": True,
             "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000199.png",
             "rarity": {"id": 6, "name": "Legendary"}},
        ]}),
        httpx.Response(200, request=request, json={"NewHero": {"id": 16000199, "TID": "TID_NEW_HERO"}}),
        httpx.Response(200, request=request, json={"TID_NEW_HERO": {"JP": "ニューヒーロー"}}),
    ]
    client.head.side_effect = [httpx.Response(200, headers={"content-type": "image/png"})]

    second = asyncio.run(catalog.get_brawler_catalog())["brawlers"]
    assert second == [{
        "id": 16000199,
        "name": "New Hero",
        "nameJa": "ニューヒーロー",
        "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000199.png",
        "rarity": {"id": 6, "name": "Legendary"},
    }]


def test_sync_brawler_catalog_merges_and_writes_both_seed_files(tmp_path, monkeypatch):
    import json
    from app.scripts import sync_brawler_catalog as sync_script

    backend_file = tmp_path / "backend_catalog.json"
    frontend_file = tmp_path / "frontend_catalog.json"
    seed = [{"id": 16000110, "name": "Vince", "nameJa": "ヴィンス",
             "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000110.png",
             "rarity": {"id": 5, "name": "Mythic"}}]
    backend_file.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    frontend_file.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    monkeypatch.setattr(sync_script, "refresh_brawler_catalog", AsyncMock(return_value=[
        {"id": 16000111, "name": "Thunder Frogs", "nameJa": "サンダーフロッグ",
         "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000111.png",
         "rarity": {"id": 6, "name": "Legendary"}},
        {"id": 16000110, "name": "Vince", "nameJa": "Vince", "imageUrl": "", "rarity": None},
    ]))

    changed, count = asyncio.run(sync_script.sync_catalog_files(backend_path=backend_file, frontend_path=frontend_file))
    assert changed is True
    assert count == 2
    written_backend = json.loads(backend_file.read_text(encoding="utf-8"))
    written_frontend = json.loads(frontend_file.read_text(encoding="utf-8"))
    assert written_backend == written_frontend
    assert [row["id"] for row in written_backend] == [16000111, 16000110]
    # Existing Japanese name, image, and rarity for Vince must be preserved.
    assert written_backend[1]["nameJa"] == "ヴィンス"
    assert written_backend[1]["imageUrl"].endswith("16000110.png")
    assert written_backend[1]["rarity"] == {"id": 5, "name": "Mythic"}
