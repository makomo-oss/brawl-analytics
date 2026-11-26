"""Sync brawler_catalog.json seed files for both backend and frontend.

Usage:
    python -m app.scripts.sync_brawler_catalog
    python -m app.scripts.sync_brawler_catalog --api-url https://brawl-analytics-s000.onrender.com
    python -m app.scripts.sync_brawler_catalog --check
"""
import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import httpx

from app.services.brawler_catalog import (
    CATALOG_PATH,
    allowed_image,
    refresh_brawler_catalog,
    valid_rarity,
)
from app.services.map_catalog import (
    MAP_CATALOG_PATH,
    merge_map_catalog,
    refresh_map_catalog,
)

logger = logging.getLogger(__name__)
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_CATALOG_PATH = CATALOG_PATH
FRONTEND_CATALOG_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "brawler-catalog.json"
BACKEND_MAP_CATALOG_PATH = MAP_CATALOG_PATH
FRONTEND_MAP_CATALOG_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "map-catalog.json"


def _valid_jp_name(name_ja: str | None, name: str) -> str | None:
    if not isinstance(name_ja, str) or not name_ja.strip() or "\ufffd" in name_ja:
        return None
    stripped = name_ja.strip()
    return None if stripped.casefold() == name.strip().casefold() else stripped


def merge_catalog_rows(base_rows: list[dict], incoming_rows: list[dict]) -> list[dict]:
    """Merge incoming catalog entries into base without losing valid translations, images, or rarities."""
    merged: dict[int, dict] = {}
    for row in base_rows:
        if isinstance(row, dict) and type(row.get("id")) is int and isinstance(row.get("name"), str) and row["name"].strip():
            merged[row["id"]] = dict(row)

    for row in incoming_rows:
        if not isinstance(row, dict):
            continue
        identifier = row.get("id")
        raw_name = row.get("name")
        if type(identifier) is not int or not isinstance(raw_name, str) or not raw_name.strip():
            continue
        old = merged.get(identifier, {})
        name = old.get("name") or raw_name.strip()
        new_ja = _valid_jp_name(row.get("nameJa"), name)
        old_ja = _valid_jp_name(old.get("nameJa"), name)
        new_img = row.get("imageUrl") if allowed_image(row.get("imageUrl")) else ""
        old_img = old.get("imageUrl") if allowed_image(old.get("imageUrl")) else ""
        new_rarity = valid_rarity(row.get("rarity"))
        old_rarity = valid_rarity(old.get("rarity"))
        merged[identifier] = {
            "id": identifier,
            "name": name,
            "nameJa": new_ja or old_ja or name,
            "imageUrl": new_img or old_img or "",
            "rarity": new_rarity or old_rarity,
        }

    result = sorted(merged.values(), key=lambda item: item["id"], reverse=True)
    if not result:
        raise ValueError("Refusing to write an empty brawler catalog")
    if base_rows and len(result) < len(base_rows):
        raise ValueError(f"Refusing to shrink brawler catalog ({len(base_rows)} -> {len(result)})")
    return result


async def fetch_remote_catalog(api_url: str, cron_secret: str = "") -> list[dict]:
    base = api_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        if cron_secret:
            try:
                await client.post(f"{base}/meta/clear-cache", headers={"cron-secret": cron_secret})
            except httpx.HTTPError:
                logger.warning("Could not clear remote meta cache before fetching catalog")
        response = await client.get(f"{base}/meta/brawlers")
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("brawlers") if isinstance(payload, dict) else None
        if not isinstance(rows, list) or not rows:
            raise ValueError("Remote /meta/brawlers returned an invalid catalog payload")
        return rows


async def sync_catalog_files(
    backend_path: Path = BACKEND_CATALOG_PATH,
    frontend_path: Path = FRONTEND_CATALOG_PATH,
    api_url: str = "",
    cron_secret: str = "",
    check_only: bool = False,
) -> tuple[bool, int]:
    existing = json.loads(backend_path.read_text(encoding="utf-8"))
    rows = existing

    if api_url:
        try:
            remote_rows = await fetch_remote_catalog(api_url, cron_secret=cron_secret)
            rows = merge_catalog_rows(rows, remote_rows)
        except Exception:
            logger.warning("Could not read remote catalog from %s; falling back to direct refresh", api_url)

    try:
        direct_rows = await refresh_brawler_catalog(rows)
        rows = merge_catalog_rows(rows, direct_rows)
    except Exception:
        if rows is existing:
            raise
        logger.warning("Direct catalog refresh failed; keeping remote catalog result")

    serialized = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    changed = False
    for path in (backend_path, frontend_path):
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current != serialized:
            changed = True
            if not check_only:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(serialized, encoding="utf-8")

    return changed, len(rows)


async def sync_map_catalog_files(
    backend_path: Path = BACKEND_MAP_CATALOG_PATH,
    frontend_path: Path = FRONTEND_MAP_CATALOG_PATH,
    check_only: bool = False,
) -> tuple[bool, int]:
    existing = json.loads(backend_path.read_text(encoding="utf-8")) if backend_path.exists() else {}
    rows = merge_map_catalog(existing, await refresh_map_catalog(existing))
    serialized = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    changed = False
    for path in (backend_path, frontend_path):
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current != serialized:
            changed = True
            if not check_only:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(serialized, encoding="utf-8")
    return changed, len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync backend and frontend brawler & map catalog JSON seed files.")
    parser.add_argument("--api-url", default=os.getenv("SYNC_API_URL", ""), help="Optional live backend URL (e.g. Render) to also pull official API discoveries from.")
    parser.add_argument("--check", action="store_true", help="Exit with code 1 if catalog seed files are out of date without writing.")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    async def run():
        b_changed, b_count = await sync_catalog_files(
            api_url=args.api_url,
            cron_secret=os.getenv("CRON_SECRET", ""),
            check_only=args.check,
        )
        m_changed, m_count = await sync_map_catalog_files(check_only=args.check)
        return b_changed, b_count, m_changed, m_count

    b_changed, b_count, m_changed, m_count = asyncio.run(run())
    changed = b_changed or m_changed
    if args.check:
        print(f"Catalog check: {b_count} brawlers ({'out of date' if b_changed else 'up to date'}), {m_count} maps ({'out of date' if m_changed else 'up to date'})")
        return 1 if changed else 0
    print(f"Catalog sync complete: {b_count} brawlers ({'updated' if b_changed else 'no changes'}), {m_count} maps ({'updated' if m_changed else 'no changes'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
