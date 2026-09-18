import logging
import asyncio
from datetime import datetime, timedelta, timezone
from app.database import get_db

logger = logging.getLogger(__name__)

async def run_cleanup_task():
    """Delete only observations outside the 30-day analysis window."""
    threshold = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    return await asyncio.to_thread(_delete_expired_battles, get_db(), threshold)


def _delete_expired_battles(db, threshold: str) -> dict:
    def expired_count() -> int:
        response = (db.table("match_raw_history")
                    .select("match_id", count="exact", head=True)
                    .lt("match_at", threshold).execute())
        return response.count or 0

    remaining = expired_count()
    deleted = 0
    # Repeat in case PostgREST applies a maximum row count to one deletion.
    for _ in range(20):
        if remaining == 0:
            logger.info("30-day cleanup completed: deleted %s observations.", deleted)
            return {"deleted_count": deleted, "remaining_expired": 0}
        db.table("match_raw_history").delete().lt("match_at", threshold).execute()
        after = expired_count()
        if after >= remaining:
            raise RuntimeError("30-day cleanup made no progress")
        deleted += remaining - after
        remaining = after
    raise RuntimeError(f"30-day cleanup incomplete: {remaining} expired observations remain")
