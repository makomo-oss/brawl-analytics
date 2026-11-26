"""Refresh display assets and game-localized names without changing analytics IDs."""
import asyncio
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app import config
from app.services import brawl_api

logger = logging.getLogger(__name__)
API_BASE = "https://api.brawlapi.com"
WIKI_API_URL = "https://brawlstars.fandom.com/api.php"
REFRESH_SECONDS = 60 * 60
CATALOG_PATH = Path(__file__).parents[1] / "data" / "brawler_catalog.json"
_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
_next_refresh = 0.0
_refresh_lock = asyncio.Lock()

RARITY_BY_NAME: dict[str, dict] = {
    "starting brawler": {"id": 1, "name": "Common"},
    "common": {"id": 1, "name": "Common"},
    "rare": {"id": 2, "name": "Rare"},
    "super rare": {"id": 3, "name": "Super Rare"},
    "epic": {"id": 4, "name": "Epic"},
    "mythic": {"id": 5, "name": "Mythic"},
    "legendary": {"id": 6, "name": "Legendary"},
    "ultra legendary": {"id": 7, "name": "Ultra Legendary"},
}
_WIKI_RARITY_RE = re.compile(r"\|\s*Rarity\s*=\s*([^\n|}]+)", re.IGNORECASE)
_WIKI_LINK_RE = re.compile(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]")


def clear_catalog_cache() -> None:
    """Force the next catalog read to refresh from upstream sources."""
    global _next_refresh
    _next_refresh = 0.0


def valid_rarity(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    identifier, name = value.get("id"), value.get("name")
    if type(identifier) is not int or not 1 <= identifier <= 1000 or not isinstance(name, str) or not name.strip() or len(name) > 80:
        return None
    return {"id": identifier, "name": name.strip()}


def parse_rarity_name(raw: str | None) -> dict | None:
    if not isinstance(raw, str):
        return None
    cleaned = _WIKI_LINK_RE.sub(r"\1", raw)
    cleaned = re.sub(r"<!--.*?-->", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().casefold()
    return dict(RARITY_BY_NAME[cleaned]) if cleaned in RARITY_BY_NAME else None


def format_official_name(raw: str) -> str:
    """Convert official API UPPERCASE brawler names into readable Title Case."""
    cleaned = re.sub(r"\s+", " ", raw.strip())
    if not cleaned:
        return cleaned
    if cleaned != cleaned.upper():
        return cleaned
    # Preserve short hyphenated acronyms such as R-T.
    if re.fullmatch(r"[A-Z](?:-[A-Z])+", cleaned):
        return cleaned

    def cap_token(match: re.Match) -> str:
        word = match.group(0)
        return word[0].upper() + word[1:].lower()

    return re.sub(r"[A-Za-z]+", cap_token, cleaned)


def _valid_jp_label(label, english_name: str) -> str | None:
    if not isinstance(label, str) or not label.strip() or "\ufffd" in label:
        return None
    stripped = label.strip()
    if stripped.casefold() == english_name.strip().casefold():
        return None
    return stripped


def localized_rows(listing: dict, characters: dict, japanese: dict,
                   official_brawlers: list[dict] | None = None) -> list[dict]:
    by_id = {row.get("id"): row for row in characters.values() if isinstance(row, dict)}
    official_by_id: dict[int, str] = {}
    for item in official_brawlers or []:
        if not isinstance(item, dict):
            continue
        identifier, name = item.get("id"), item.get("name")
        if type(identifier) is int and isinstance(name, str) and name.strip():
            official_by_id[identifier] = name.strip()

    rows = []
    seen_ids: set[int] = set()
    for brawler in listing.get("list", []):
        identifier, name = brawler.get("id"), brawler.get("name")
        if type(identifier) is not int or not isinstance(name, str) or not name.strip():
            continue
        # Include early-access / newly released brawlers if the official API already serves them.
        if brawler.get("released") is False and identifier not in official_by_id:
            continue
        seen_ids.add(identifier)
        character = by_id.get(identifier, {})
        raw_jp = japanese.get(character.get("TID"), {}).get("JP")
        label = _valid_jp_label(raw_jp, name)
        has_official_jp = isinstance(raw_jp, str) and bool(raw_jp.strip()) and "\ufffd" not in raw_jp
        rows.append({"id": identifier, "name": name.strip(), "nameJa": label,
                     "hasOfficialJp": has_official_jp,
                     "imageUrl": brawler.get("imageUrl"), "avatarId": brawler.get("avatarId"),
                     "rarity": valid_rarity(brawler.get("rarity"))})

    for identifier, raw_name in official_by_id.items():
        if identifier in seen_ids:
            continue
        name = format_official_name(raw_name)
        character = by_id.get(identifier, {})
        raw_jp = japanese.get(character.get("TID"), {}).get("JP")
        label = _valid_jp_label(raw_jp, name)
        has_official_jp = isinstance(raw_jp, str) and bool(raw_jp.strip()) and "\ufffd" not in raw_jp
        rows.append({"id": identifier, "name": name, "nameJa": label,
                     "hasOfficialJp": has_official_jp,
                     "imageUrl": f"https://cdn.brawlify.com/brawlers/borders/{identifier}.png",
                     "avatarId": None, "rarity": None})

    if not rows:
        raise ValueError("Empty brawler catalog")
    return rows


def allowed_image(url: str | None) -> bool:
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.netloc == "cdn.brawlify.com" and parsed.path.endswith(".png")


async def _head_image_ok(client, url: str) -> bool:
    try:
        response = await client.head(url)
        return response.status_code == 200 and response.headers.get("content-type", "").startswith("image/")
    except httpx.HTTPError:
        return False


async def resolve_image(client, row: dict, previous: dict) -> str | None:
    prev_url = previous.get("imageUrl")
    candidates: list[str] = []

    portrait = row.get("imageUrl")
    if allowed_image(portrait):
        candidates.append(portrait)

    # New bordered portraits can lag behind the game's avatar assets.
    avatar = row.get("avatarId")
    if type(avatar) is int and avatar > 0:
        avatar_url = f"https://cdn.brawlify.com/profile-icons/regular/{avatar}.png"
        if avatar_url not in candidates:
            candidates.append(avatar_url)

    identifier = row.get("id")
    if type(identifier) is int and identifier > 0:
        for path in (f"brawlers/borders/{identifier}.png", f"brawlers/borderless/{identifier}.png"):
            fallback_url = f"https://cdn.brawlify.com/{path}"
            if fallback_url not in candidates:
                candidates.append(fallback_url)

    for url in candidates:
        if url == prev_url:
            return url
        if await _head_image_ok(client, url):
            return url
    return prev_url


async def fetch_wiki_fallback(client, names: list[str]) -> dict[str, dict]:
    """Fetch missing rarity and Japanese interwiki titles from Brawl Stars Wiki API."""
    unique_names = list(dict.fromkeys(name.strip() for name in names if isinstance(name, str) and name.strip()))
    if not unique_names:
        return {}
    result: dict[str, dict] = {}
    for start in range(0, len(unique_names), 20):
        batch = unique_names[start:start + 20]
        try:
            response = await client.get(
                WIKI_API_URL,
                params={
                    "action": "query",
                    "titles": "|".join(batch),
                    "prop": "revisions|langlinks",
                    "rvprop": "content",
                    "rvslots": "main",
                    "lllang": "ja",
                    "redirects": "1",
                    "format": "json",
                },
                headers={"User-Agent": "brawl-lab-catalog/1.0"},
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            logger.warning("Could not fetch Brawl Stars Wiki fallback for %s", batch)
            continue

        query = payload.get("query") or {}
        alias_map: dict[str, str] = {}
        for item in query.get("normalized", []):
            if isinstance(item, dict) and item.get("from") and item.get("to"):
                alias_map[item["to"]] = item["from"]
        for item in query.get("redirects", []):
            if isinstance(item, dict) and item.get("from") and item.get("to"):
                alias_map[item["to"]] = alias_map.get(item["from"], item["from"])

        for page in (query.get("pages") or {}).values():
            if not isinstance(page, dict) or "missing" in page:
                continue
            title = page.get("title") or ""
            canonical = alias_map.get(title, title)
            content = ""
            revisions = page.get("revisions") or []
            if revisions and isinstance(revisions[0], dict):
                content = ((revisions[0].get("slots") or {}).get("main") or {}).get("*") or ""
            rarity_match = _WIKI_RARITY_RE.search(content)
            rarity = parse_rarity_name(rarity_match.group(1)) if rarity_match else None
            ja_title = None
            for link in page.get("langlinks") or []:
                if isinstance(link, dict) and link.get("lang") == "ja":
                    ja_title = _valid_jp_label(link.get("*"), canonical)
                    break
            if rarity or ja_title:
                entry = {"rarity": rarity, "nameJa": ja_title}
                result[canonical.casefold()] = entry
                result[title.casefold()] = entry
    return result


async def _fetch_official_brawlers() -> list[dict]:
    token = config.BRAWL_API_TOKEN
    if not token or token == "mock_token_for_tests":
        return []
    try:
        payload = await brawl_api.get_brawlers()
        items = payload.get("items") if isinstance(payload, dict) else None
        return items if isinstance(items, list) else []
    except Exception:
        logger.warning("Could not fetch official Brawl Stars brawler list; continuing with BrawlAPI only")
        return []


async def refresh_brawler_catalog(seed_catalog: list[dict] | None = None) -> list[dict]:
    """Fetch and merge the latest brawler catalog without discarding valid known fields."""
    base_catalog = _catalog if seed_catalog is None else seed_catalog
    async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
        brawlapi_task = asyncio.gather(*(client.get(f"{API_BASE}/{path}") for path in (
            "v1/brawlers", "game/csv_logic/characters", "game/localization/jp")))
        official_task = _fetch_official_brawlers()
        responses, official_brawlers = await asyncio.gather(brawlapi_task, official_task)
        for response in responses:
            response.raise_for_status()
        rows = localized_rows(*(response.json() for response in responses),
                              official_brawlers=official_brawlers)
        previous = {row["id"]: row for row in base_catalog}

        # Only query Brawl Stars Wiki when a brawler is missing rarity or Japanese name.
        needs_wiki: list[str] = []
        for row in rows:
            old = previous.get(row["id"], {})
            has_rarity = bool(row["rarity"] or valid_rarity(old.get("rarity")))
            old_ja = _valid_jp_label(old.get("nameJa"), row["name"])
            has_ja = bool(row["nameJa"] or old_ja or row.get("hasOfficialJp"))
            if not has_rarity or not has_ja:
                needs_wiki.append(old.get("name") or row["name"])
        wiki_data = await fetch_wiki_fallback(client, needs_wiki) if needs_wiki else {}

        updated = dict(previous)
        semaphore = asyncio.Semaphore(4)

        async def enrich(row):
            async with semaphore:
                old = previous.get(row["id"], {})
                display_name = old.get("name") or row["name"]
                wiki = wiki_data.get(display_name.casefold()) or wiki_data.get(row["name"].casefold()) or {}
                old_ja = _valid_jp_label(old.get("nameJa"), display_name)
                image = await resolve_image(client, row, old)
                updated[row["id"]] = {
                    "id": row["id"],
                    "name": display_name,
                    "nameJa": row["nameJa"] or old_ja or wiki.get("nameJa") or display_name,
                    "imageUrl": image or "",
                    "rarity": row["rarity"] or valid_rarity(old.get("rarity")) or wiki.get("rarity"),
                }

        await asyncio.wait_for(asyncio.gather(*(enrich(row) for row in rows)), timeout=30)
        return sorted(updated.values(), key=lambda row: row["id"], reverse=True)


async def get_brawler_catalog() -> dict:
    global _catalog, _next_refresh
    if time.monotonic() < _next_refresh:
        return {"brawlers": _catalog}
    async with _refresh_lock:
        if time.monotonic() < _next_refresh:
            return {"brawlers": _catalog}
        try:
            _catalog = await refresh_brawler_catalog(_catalog)
            _next_refresh = time.monotonic() + REFRESH_SECONDS
        except Exception:
            logger.exception("Could not refresh brawler display catalog; keeping last known data")
            _next_refresh = time.monotonic() + 300
        return {"brawlers": _catalog}
