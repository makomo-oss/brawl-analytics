import logging
from datetime import datetime, timedelta, timezone
from app.database import get_db

logger = logging.getLogger(__name__)

async def run_cleanup_task():
    """
    Historical battles remain available for later analysis and comparison.
    This legacy endpoint only reports how many observations are over 30 days old.
    """
    logger.info("Starting read-only battle retention audit...")
    db = get_db()
    threshold = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    response = (db.table("match_raw_history")
                .select("match_id", count="exact", head=True)
                .lt("match_at", threshold).execute())
    old_count = response.count or 0
    logger.info("Retained %s battle observations older than 30 days.", old_count)
    return {"retained_older_than_30_days": old_count}
