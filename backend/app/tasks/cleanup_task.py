import logging
import asyncio
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.algorithm.statistics import ANALYSIS_WINDOW_DAYS

logger = logging.getLogger(__name__)
CLEANUP_BATCH_SIZE = 5000
MAX_CLEANUP_BATCHES = 50


async def run_cleanup_task():
    """Delete only observations outside the 60-day analysis window."""
    threshold = (datetime.now(timezone.utc) - timedelta(days=ANALYSIS_WINDOW_DAYS)).isoformat()
    return await asyncio.to_thread(_delete_expired_battles, get_db(), threshold)


def _delete_expired_battles(db, threshold: str) -> dict:
    def expired_count() -> int:
        response = (db.table("match_raw_history")
                    .select("match_id", count="exact", head=True)
                    .lt("match_at", threshold).execute())
        return response.count or 0

    remaining = expired_count()
    deleted = 0
    for _ in range(MAX_CLEANUP_BATCHES):
        if remaining == 0:
            logger.info("%s-day cleanup completed: deleted %s observations.", ANALYSIS_WINDOW_DAYS, deleted)
            return {"deleted_count": deleted, "remaining_expired": 0}
        # Delete in bounded RPC batches so large backlogs stay well under PostgREST timeouts.
        batch_response = db.rpc("cleanup_expired_match_history", {
            "p_before": threshold,
            "p_batch_size": CLEANUP_BATCH_SIZE,
        }).execute()
        batch_deleted = int(batch_response.data or 0)
        after = expired_count()
        if batch_deleted <= 0 or after >= remaining:
            raise RuntimeError(f"{ANALYSIS_WINDOW_DAYS}-day cleanup made no progress")
        deleted += batch_deleted
        remaining = after
    raise RuntimeError(f"{ANALYSIS_WINDOW_DAYS}-day cleanup incomplete: {remaining} expired observations remain")
