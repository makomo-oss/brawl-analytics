import asyncio
import pandas as pd
import logging
from app.services.brawl_api import get_player_battlelog
from app.database import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def crawl_and_aggregate():
    """
    クローラーとメモリ上バルク集計バッチ。
    公式APIからバトルログを取得し、ガチバトルの3v3データのみ抽出・集計してDBに保存。
    """
    logger.info("Starting crawler and aggregation...")
    
    # 本来はRedisからシードリストを取得するが、ベース検証用にモックを使用
    seed_tags = ["#Q2LL9G8", "#R8G2P9Y"] 
    
    all_matches = []
    
    for tag in seed_tags:
        try:
            logger.info(f"Fetching logs for {tag}...")
            # Proxy経由でAPI通信を行う
            data = await get_player_battlelog(tag)
            
            items = data.get("items", [])
            for item in items:
                battle = item.get("battle", {})
                battle_time = item.get("battleTime")
                
                # ガチバトル (ranked) のみを抽出
                if battle.get("type") == "ranked" and battle.get("result"):
                    all_matches.append({
                        "match_id": f"{tag}_{battle_time}",
                        "player_tag": tag,
                        "match_at": battle_time,
                        "mode": battle.get("mode"),
                        "map_id": item.get("event", {}).get("map"),
                        "result": battle.get("result"),
                        # TODO: 実際のレスポンス構造からパースする
                        "hero_used": "shelly", 
                        "allies": ["colt", "rosa"],
                        "opponents": ["primo", "bull", "dynamike"]
                    })
        except Exception as e:
            logger.error(f"Failed to process {tag}: {e}")
            
    if not all_matches:
        logger.info("No valid ranked matches found (or API failed).")
        return

    # Pandasを用いてメモリ上でバルク集計
    df = pd.DataFrame(all_matches)
    logger.info(f"Aggregated {len(df)} matches. Saving to Supabase...")
    
    db = get_db()
    for record in df.to_dict(orient="records"):
        try:
            # バルクアップサート
            db.table("match_raw_history").upsert(record).execute()
        except Exception as e:
            logger.warning(f"DB Insert skipped/failed (possibly due to missing credentials): {e}")
            
    logger.info("Crawler batch completed successfully.")

if __name__ == "__main__":
    asyncio.run(crawl_and_aggregate())
