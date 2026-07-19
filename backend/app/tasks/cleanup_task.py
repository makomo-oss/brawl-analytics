import logging
from datetime import datetime, timedelta, timezone
from app.database import get_db

logger = logging.getLogger(__name__)

async def run_cleanup_task():
    """
    バックグラウンドで実行されるデータクリーンアップタスク
    1ヶ月（30日）以上経過した古いバトルログを自動削除し、DB容量と鮮度を保つ
    """
    logger.info("Starting background DB cleanup task...")
    db = get_db()
    
    # 30日前の日時を計算
    threshold_date = datetime.now(timezone.utc) - timedelta(days=30)
    threshold_iso = threshold_date.isoformat()
    
    try:
        logger.info(f"Deleting match_raw_history records older than {threshold_iso}...")
        # Supabase Python クライアントの削除オペレーション
        response = db.table("match_raw_history").delete().lt("match_at", threshold_iso).execute()
        
        # 削除されたレコードの数をログに出力
        deleted_count = len(response.data)
        logger.info(f"Cleanup completed successfully. Deleted {deleted_count} old records.")
    except Exception as e:
        logger.error(f"Failed to clean up old records: {e}")
