"""Refresh display assets and game-localized names without changing analytics IDs."""
import asyncio
import json
import logging
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)
API_BASE = "https://api.brawlapi.com"
REFRESH_SECONDS = 7 * 24 * 60 * 60
_catalog = json.loads((Path(__file__).parents[1] / "data" / "brawler_catalog.json").read_text(encoding="utf-8"))
_next_refresh = 0.0
_refresh_lock = asyncio.Lock()


def cached_brawler_names():
    """Read the weekly display catalog without a network call during a draft."""
    return [row["name"] for row in _catalog]


def localized_rows(listing: dict, characters: dict, japanese: dict) -> list[dict]:
    by_id = {row.get("id"): row for row in characters.values() if isinstance(row, dict)}
    rows = []
    for brawler in listing.get("list", []):
        identifier, name = brawler.get("id"), brawler.get("name")
        if not isinstance(identifier, int) or not isinstance(name, str) or not name.strip() or brawler.get("released") is False:
            continue
        character = by_id.get(identifier, {})
        label = japanese.get(character.get("TID"), {}).get("JP")
        # Never replace a known translation with corrupt/missing upstream text.
        if not isinstance(label, str) or not label.strip() or "\ufffd" in label or label.strip().casefold() == name.strip().casefold():
            label = None
        rows.append({"id": identifier, "name": name.strip(), "nameJa": label,
                     "imageUrl": brawler.get("imageUrl"), "avatarId": brawler.get("avatarId")})
    if not rows:
        raise ValueError("Empty brawler catalog")
    return rows


def allowed_image(url: str | None) -> bool:
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.netloc == "cdn.brawlify.com" and parsed.path.endswith(".png")


async def resolve_image(client, row: dict, previous: dict) -> str | None:
    portrait = row.get("imageUrl")
    if allowed_image(portrait):
        if portrait == previous.get("imageUrl"):
            return portrait
        try:
            response = await client.head(portrait)
            if response.status_code == 200 and response.headers.get("content-type", "").startswith("image/"):
                return portrait
        except httpx.HTTPError:
            pass
    # New bordered portraits can lag behind the game's avatar assets.
    avatar = row.get("avatarId")
    if isinstance(avatar, int) and avatar > 0:
        url = f"https://cdn.brawlify.com/profile-icons/regular/{avatar}.png"
        if url == previous.get("imageUrl"):
            return url
        try:
            response = await client.head(url)
            if response.status_code == 200 and response.headers.get("content-type", "").startswith("image/"):
                return url
        except httpx.HTTPError:
            pass
    return previous.get("imageUrl")


async def get_brawler_catalog() -> dict:
    global _catalog, _next_refresh
    if time.monotonic() < _next_refresh:
        return {"brawlers": _catalog}
    async with _refresh_lock:
        if time.monotonic() < _next_refresh:
            return {"brawlers": _catalog}
        try:
            async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
                responses = await asyncio.gather(*(client.get(f"{API_BASE}/{path}") for path in (
                    "v1/brawlers", "game/csv_logic/characters", "game/localization/jp")))
                for response in responses:
                    response.raise_for_status()
                rows = localized_rows(*(response.json() for response in responses))
                previous = {row["id"]: row for row in _catalog}
                updated = dict(previous)
                semaphore = asyncio.Semaphore(4)

                async def enrich(row):
                    async with semaphore:
                        old = previous.get(row["id"], {})
                        image = await resolve_image(client, row, old)
                        updated[row["id"]] = {"id": row["id"], "name": row["name"],
                            "nameJa": row["nameJa"] or old.get("nameJa") or row["name"],
                            "imageUrl": image or ""}

                await asyncio.wait_for(asyncio.gather(*(enrich(row) for row in rows)), timeout=30)
                _catalog = sorted(updated.values(), key=lambda row: row["id"], reverse=True)
                _next_refresh = time.monotonic() + REFRESH_SECONDS
        except Exception:
            logger.exception("Could not refresh brawler display catalog; keeping last known data")
            _next_refresh = time.monotonic() + 300
        return {"brawlers": _catalog}
