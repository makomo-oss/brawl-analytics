"""Persistent, opt-in battle collection. Browser control keys never leave as hashes."""
import asyncio
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.services.battle_records import clean_tag, parse_battlelog, parse_battle_time
from app.services.brawl_api import get_player_battlelog
from app.services.player_analysis import invalidate_player_analysis

logger = logging.getLogger(__name__)
_run_lock = asyncio.Lock()
STATUS_COLUMNS = "last_sync_at,next_sync_at,interval_minutes,last_new_matches,last_error,gap_detected_at"


def control_hash(token: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise ValueError("Invalid auto-sync control key")
    return hashlib.sha256(token.encode()).hexdigest()


def checked_tag(tag: str) -> str:
    tag = clean_tag(tag)
    if not re.fullmatch(r"[0289PYLQGRJCUV]{3,15}", tag):
        raise ValueError("Invalid player tag")
    return tag


def auto_sync_status(db, tag: str, token: str | None) -> dict:
    enabled = False
    if token:
        rows = (db.table("player_auto_sync_subscriptions").select("enabled")
                .eq("player_tag", tag).eq("token_hash", control_hash(token)).limit(1).execute()).data or []
        enabled = bool(rows and rows[0]["enabled"])
    # Do not disclose another browser's subscriptions or control keys.
    state = {"enabled": enabled, "last_sync_at": None, "next_sync_at": None,
             "interval_minutes": 5, "last_new_matches": 0, "last_error": None,
             "gap_detected_at": None}
    if enabled:
        rows = db.table("player_auto_sync_queue").select(STATUS_COLUMNS).eq("player_tag", tag).limit(1).execute().data or []
        if rows:
            state.update(rows[0])
        gap = state.get("gap_detected_at")
        if gap and datetime.fromisoformat(gap.replace("Z", "+00:00")) < datetime.now(timezone.utc) - timedelta(days=60):
            state["gap_detected_at"] = None
    return state


def set_auto_sync(db, tag: str, token: str, enabled: bool) -> dict:
    db.rpc("set_player_auto_sync", {"p_tag": tag, "p_token_hash": control_hash(token),
                                     "p_enabled": enabled}).execute()
    return auto_sync_status(db, tag, token)


def collection_plan(items: list, previous: dict, now: datetime) -> dict:
    dates = []
    for item in items:
        try:
            at = parse_battle_time(item.get("battleTime", ""))
            if datetime.fromisoformat(at) <= now:
                dates.append(at)
        except (AttributeError, TypeError, ValueError):
            continue
    last = previous.get("last_observed_at")
    last_at = datetime.fromisoformat(last.replace("Z", "+00:00")) if last else None
    latest = max(dates) if dates else last
    active = bool(dates and (last_at is None or datetime.fromisoformat(max(dates)) > last_at))
    idle_runs = 0 if active else int(previous.get("idle_runs") or 0) + 1
    minutes = 5 if active else 15 if idle_runs == 1 else 30
    # A full, entirely newer window can indicate missing games; its count is unknowable.
    possible_gap = bool(last_at and len(dates) >= 25 and datetime.fromisoformat(min(dates)) > last_at)
    return {"last_observed_at": latest, "idle_runs": idle_runs, "interval_minutes": minutes,
            "next_sync_at": (now + timedelta(minutes=minutes)).isoformat(),
            "gap_detected_at": now.isoformat() if possible_gap else previous.get("gap_detected_at")}


def _still_enabled(db, job: dict) -> bool:
    rows = (db.table("player_auto_sync_subscriptions").select("player_tag")
            .eq("player_tag", job["player_tag"]).eq("enabled", True).limit(1).execute()).data or []
    return bool(rows)


def _save_collection(db, job: dict, items: list, now: datetime) -> dict | None:
    # OFF prevents writes from a request that was already in flight.
    if not _still_enabled(db, job):
        return None
    records, _ = parse_battlelog(job["player_tag"], items)
    cutoff = now - timedelta(days=60)
    records = [r for r in records if cutoff <= datetime.fromisoformat(r["match_at"]) <= now]
    existing = set()
    if records:
        rows = (db.table("match_raw_history").select("match_id")
                .in_("match_id", [r["match_id"] for r in records]).execute()).data or []
        existing = {r["match_id"] for r in rows}
    new_records = [r for r in records if r["match_id"] not in existing]
    # One transactional RPC checks the lease and opt-in again, then saves and advances.
    plan = collection_plan(items, job, now)
    payload = {**plan, "last_sync_at": now.isoformat(), "last_new_matches": len(new_records),
               "last_error": None, "error_runs": 0}
    result = db.rpc("finish_player_auto_sync", {"p_tag": job["player_tag"],
                    "p_lease": job["lease_token"], "p_records": new_records, "p_state": payload}).execute().data
    if result:
        invalidate_player_analysis(job["player_tag"])
    return {"saved": len(new_records)} if result else None


def _save_error(db, job: dict):
    errors = int(job.get("error_runs") or 0) + 1
    minutes = min(30, 5 * 2 ** min(errors - 1, 3))
    db.rpc("finish_player_auto_sync", {"p_tag": job["player_tag"], "p_lease": job["lease_token"],
            "p_records": [], "p_state": {"error_runs": errors, "last_error": "retrying",
            "interval_minutes": minutes, "next_sync_at": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()}}).execute()


async def run_auto_sync_task() -> dict:
    if _run_lock.locked():
        return {"status": "busy"}
    async with _run_lock:
        db = get_db()
        jobs = (await asyncio.to_thread(lambda: db.rpc("claim_player_auto_sync", {"p_limit": 50}).execute())).data or []
        semaphore = asyncio.Semaphore(3)

        async def collect(job):
            async with semaphore:
                try:
                    if not await asyncio.to_thread(_still_enabled, db, job):
                        return None
                    log = await get_player_battlelog(job["player_tag"])
                    items = log.get("items")
                    if not isinstance(items, list):
                        raise ValueError("Malformed battle log")
                    return await asyncio.to_thread(_save_collection, db, job, items, datetime.now(timezone.utc))
                except Exception:
                    logger.exception("Automatic battle collection failed for %s", job["player_tag"])
                    try:
                        await asyncio.to_thread(_save_error, db, job)
                    except Exception:
                        logger.exception("Failed to schedule automatic collection retry")
                    return None

        try:
            async with asyncio.timeout(120):
                results = await asyncio.gather(*(collect(job) for job in jobs))
        except TimeoutError:
            # Expiring DB leases recover unfinished jobs without disabling their subscriptions.
            return {"status": "retrying", "players": len(jobs)}
        return {"status": "completed", "players": len(jobs),
                "saved": sum(r["saved"] for r in results if r),
                "completed": sum(r is not None for r in results)}
