import asyncio
import logging
from datetime import datetime, timezone
from app.database import get_db
from app.services.brawl_api import get_player_battlelog, get_player

logger = logging.getLogger(__name__)

async def run_crawler_task():
    """
    バックグラウンドで実行されるデータクローラータスク
    1. Supabaseから対象プレイヤーのタグ一覧を取得
    2. Semaphoreを用いて並列でBrawl Stars APIへリクエスト
    3. 結果を整形してSupabaseへBulk Upsert
    """
    logger.info("Starting background crawler task...")
    
    db = get_db()
    
    # 1. プレイヤータグ一覧の取得
    # 仕様: playersテーブルからタグを取得。もしテーブルが空の場合はシードタグを使う
    try:
        response = db.table("players").select("player_tag").execute()
        player_tags = [row["player_tag"] for row in response.data]
    except Exception as e:
        logger.error(f"Failed to fetch player tags from DB: {e}")
        return

    # 初回稼働時などデータがない場合のシードデータ
    if not player_tags:
        logger.info("No players found in DB, using seed tags.")
        player_tags = ["Q2LL9G8", "R8G2P9Y"]
        
    logger.info(f"Target players count: {len(player_tags)}")
    
    # 2. 並列データ取得 (Semaphoreで最大5並列)
    semaphore = asyncio.Semaphore(5)
    
    async def fetch_and_process(tag: str):
        async with semaphore:
            try:
                # プレイヤー情報の取得 (最新のトロフィー数など)
                player_info = await get_player(tag)
                # バトルログの取得 (ガチバトルの履歴等)
                # battle_log = await get_player_battlelog(tag) # 必要に応じて履歴保存もここに実装
                
                # バルクアップサート用のデータ整形
                return {
                    "player_tag": tag,
                    "name": player_info.get("name", "Unknown"),
                    "trophies": player_info.get("trophies", 0),
                    "highest_trophies": player_info.get("highestTrophies", 0),
                    "unlocked_characters": {}, # FIXME: 将来的にBrawl APIからアンロック情報をパースする
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            except Exception as e:
                logger.warning(f"Failed to fetch data for player {tag}: {e}")
                return None

    # 並列実行タスクの生成
    tasks = [fetch_and_process(tag) for tag in player_tags]
    results = await asyncio.gather(*tasks)
    
    # 成功したデータのみを抽出
    upsert_data = [r for r in results if r is not None]
    
    if not upsert_data:
        logger.info("No data successfully fetched.")
        return

    # 3. SupabaseへのBulk Upsert
    try:
        logger.info(f"Bulk upserting {len(upsert_data)} records into Supabase...")
        db.table("players").upsert(upsert_data).execute()
        logger.info("Crawler task completed successfully.")
    except Exception as e:
        logger.error(f"Failed to bulk upsert data into Supabase: {e}")
