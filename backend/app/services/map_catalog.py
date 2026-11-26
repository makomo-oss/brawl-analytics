"""Refresh Brawl Stars map image IDs from BrawlAPI without manual updates."""
import asyncio
import json
import logging
import re
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)
MAPS_API_URL = "https://api.brawlapi.com/v1/maps"
REFRESH_SECONDS = 60 * 60
MAP_CATALOG_PATH = Path(__file__).parents[1] / "data" / "map_catalog.json"
_VALID_MAP_IMAGE_RE = re.compile(r"^https://cdn\.brawlify\.com/maps/regular/(\d+)\.png$")

_map_catalog: dict[str, int] = (
    json.loads(MAP_CATALOG_PATH.read_text(encoding="utf-8"))
    if MAP_CATALOG_PATH.exists()
    else {}
)
_next_refresh = 0.0
_refresh_lock = asyncio.Lock()


def clear_map_catalog_cache() -> None:
    """Force the next map catalog read to refresh from BrawlAPI."""
    global _next_refresh
    _next_refresh = 0.0


def extract_map_image_ids(payload: dict) -> dict[str, int]:
    """Extract map name -> Brawlify regular map image ID, preferring active and newest maps."""
    items = payload.get("list") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError("Empty map catalog")

    selected: dict[str, tuple[bool, int]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        image_url = item.get("imageUrl")
        if not isinstance(name, str) or not name.strip() or not isinstance(image_url, str):
            continue
        match = _VALID_MAP_IMAGE_RE.match(image_url)
        if not match:
            continue
        image_id = int(match.group(1))
        if image_id <= 0:
            continue
        clean_name = name.strip()
        is_active = item.get("disabled") is False
        prev = selected.get(clean_name)
        if prev is None or (not prev[0] and is_active) or (prev[0] == is_active and image_id > prev[1]):
            selected[clean_name] = (is_active, image_id)

    if not selected:
        raise ValueError("No valid map images found")
    return {name: info[1] for name, info in sorted(selected.items())}


def merge_map_catalog(base: dict[str, int], incoming: dict[str, int]) -> dict[str, int]:
    merged: dict[str, int] = {}
    for source in (base, incoming):
        for name, image_id in source.items():
            if isinstance(name, str) and name.strip() and type(image_id) is int and image_id > 0:
                merged[name.strip()] = image_id
    if not merged:
        raise ValueError("Refusing to produce empty map catalog")
    return dict(sorted(merged.items()))


async def refresh_map_catalog(seed_catalog: dict[str, int] | None = None) -> dict[str, int]:
    base = _map_catalog if seed_catalog is None else seed_catalog
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(MAPS_API_URL)
        response.raise_for_status()
        incoming = extract_map_image_ids(response.json())
        return merge_map_catalog(base, incoming)


async def get_map_catalog() -> dict:
    global _map_catalog, _next_refresh
    if time.monotonic() < _next_refresh and _map_catalog:
        return {"maps": _map_catalog}
    async with _refresh_lock:
        if time.monotonic() < _next_refresh and _map_catalog:
            return {"maps": _map_catalog}
        try:
            _map_catalog = await refresh_map_catalog(_map_catalog)
            _next_refresh = time.monotonic() + REFRESH_SECONDS
        except Exception:
            logger.exception("Could not refresh map image catalog; keeping last known data")
            _next_refresh = time.monotonic() + 300
        return {"maps": _map_catalog}
