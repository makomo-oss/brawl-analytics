import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Callable
from app.database import get_db
from app.services.player_profiles import profile_record
from app.services.battle_records import parse_battlelog
from app.services.brawl_api import get_player_battlelog, get_player, get_club_members, get_club

logger = logging.getLogger(__name__)

# 多様なアクティブトッププレイヤーのシードタグ（フォールバックおよびベース補完用）
DEFAULT_SEED_TAGS = {
    "Q2LL9G8", "R8G2P9Y", "2P0VR28P", "80V09RRV", "20P0J8V0",
    "8YRRU0LV", "9L8GYV0U", "L08J28VR", "8VPP9U2L", "8P0QLL8U",
    "2G80L9RU", "80RGYL2V", "2L8U9P0R", "90J8V2RU", "8L9R0P2V"
}

async def run_crawler_task(report_stage: Callable[[str], None] | None = None, aggregate: bool = True):
    """
    バックグラウンドで実行される高度なデータクローラータスク
    1. Supabaseから対象プレイヤーのタグ一覧を取得
    2. 並列でBrawl APIからプレイヤー情報とバトルログを取得
    3. 所属クラブから新メンバーを抽出（芋づる式クローリング）
    4. プレイヤー情報とバトル履歴をSupabaseへBulk Upsert
    """
    logger.info("Starting advanced background crawler task...")
    report = report_stage or (lambda stage: None)
    report("fetching_players")
    db = get_db()
    
    # Rotate a few known anchors to discover opponents and club members. Existing
    # profiles are otherwise revisited only when discovered again in battle logs.
    seed_tags = sorted(DEFAULT_SEED_TAGS)
    seed_count = min(5, len(seed_tags))
    hour = int(datetime.now(timezone.utc).timestamp() // 3600)
    start_index = (hour * seed_count) % len(seed_tags) if seed_tags else 0
    base_player_tags = {seed_tags[(start_index + i) % len(seed_tags)] for i in range(seed_count)}
    logger.info(f"Target base players count: {len(base_player_tags)}")
    
    semaphore = asyncio.Semaphore(5)
    
    upsert_players = []
    upsert_matches = []
    found_clubs = set()

    async def fetch_player_and_matches(tag: str):
        clean_tag = tag.replace("#", "").upper()
        
        async with semaphore:
            try:
                # 1. プレイヤー情報の取得
                player_info = await get_player(clean_tag)
                
                player_data = profile_record(clean_tag, player_info)

                club_tag = (player_info.get("club") or {}).get("tag")
                
                # 2. バトルログの取得。ダッシュボード同期と同じ変換規則を使う。
                battle_log_data = []
                encountered_players = set()
                try:
                    logs = await get_player_battlelog(clean_tag)
                    battle_log_data, encountered_players = parse_battlelog(clean_tag, logs.get("items") or [])
                except Exception as e:
                    logger.warning(f"Failed to fetch battlelog for {clean_tag}: {e}")

                return player_data, battle_log_data, club_tag, encountered_players
            except Exception as e:
                logger.warning(f"Failed to fetch data for player {clean_tag}: {e}")
                return None, [], None, set()

    # フェーズ1: 既存プレイヤーのデータと所属クラブを取得
    tasks = [fetch_player_and_matches(tag) for tag in base_player_tags]
    results = await asyncio.gather(*tasks)
    
    encountered_in_battles = set()
    
    for p_data, m_data, c_tag, e_players in results:
        if p_data:
            upsert_players.append(p_data)
        if m_data:
            upsert_matches.extend(m_data)
        if c_tag:
            found_clubs.add(c_tag)
        if e_players:
            encountered_in_battles.update(e_players)
            
    # フェーズ2: クラブから新メンバーを抽出 & クラブ情報を保存 (芋づる式クローリング制限：最大10クラブ)
    new_player_tags = set()
    upsert_clubs = []
    clubs_to_crawl = list(found_clubs)[:10]
    
    async def fetch_club_details_task(ctag):
        async with semaphore:
            try:
                c_details = await get_club(ctag)
                clean_ctag = ctag.replace("#", "")
                club_record = {
                    "club_tag": clean_ctag,
                    "name": c_details.get("name", "Unknown"),
                    "description": c_details.get("description", ""),
                    "trophies": c_details.get("trophies", 0),
                    "required_trophies": c_details.get("requiredTrophies", 0),
                    "badge_id": c_details.get("badgeId", 0),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                c_data = await get_club_members(ctag)
                members = [m.get("tag") for m in c_data.get("items", []) if m.get("tag")]
                return club_record, members
            except Exception as e:
                logger.warning(f"Failed to fetch club {ctag}: {e}")
                return None, []
                
    if clubs_to_crawl:
        logger.info(f"Crawling {len(clubs_to_crawl)} clubs to find new players and store club details...")
        club_tasks = [fetch_club_details_task(ctag) for ctag in clubs_to_crawl]
        club_results = await asyncio.gather(*club_tasks)
        for club_rec, members in club_results:
            if club_rec:
                upsert_clubs.append(club_rec)
            for m in members:
                if m:
                    m_clean = m.replace("#", "")
                    if m_clean not in base_player_tags:
                        new_player_tags.add(m_clean)
                        
    # バトルで遭遇したプレイヤーも新規取得リストに加える（クラブ抽出と並行）
    for m_clean in encountered_in_battles:
        if m_clean not in base_player_tags:
            new_player_tags.add(m_clean)
                    
    # フェーズ3: 対戦相手・クラブメンバーを取得（登録済みの再取得も許可）
    if new_player_tags:
        logger.info(f"Found {len(new_player_tags)} encountered players (from clubs & battles). Fetching their data...")
        # ランダムサンプリングで偏りを排除し、毎回新しいプレイヤーを開拓
        candidate_list = list(new_player_tags)
        target_count = min(len(candidate_list), 75)
        target_new_players = random.sample(candidate_list, target_count)
        new_tasks = [fetch_player_and_matches(tag) for tag in target_new_players]
        new_results = await asyncio.gather(*new_tasks)
        
        for p_data, m_data, _, _ in new_results:
            if p_data:
                upsert_players.append(p_data)
            if m_data:
                upsert_matches.extend(m_data)

    if not upsert_players:
        raise RuntimeError("Crawler could not fetch any valid player profiles")
    if not upsert_matches:
        raise RuntimeError("Crawler could not fetch any supported battle records")

    report("saving_players")

    # 4. SupabaseへのBulk Upsert
    if upsert_players:
        try:
            logger.info(f"Bulk upserting {len(upsert_players)} players...")
            db.table("players").upsert(upsert_players).execute()
        except Exception as e:
            logger.error(f"Failed to upsert players: {e}")
            raise

    if upsert_clubs:
        try:
            logger.info(f"Bulk upserting {len(upsert_clubs)} clubs...")
            db.table("clubs").upsert(upsert_clubs).execute()
        except Exception as e:
            logger.error(f"Failed to upsert clubs: {e}")
            
    if upsert_matches:
        try:
            report("saving_matches")
            logger.info(f"Bulk upserting {len(upsert_matches)} matches...")
            db.table("match_raw_history").upsert(upsert_matches).execute()
        except Exception:
            logger.exception("Failed to persist matches; aggregation cancelled")
            raise

    # GitHub Actions runs aggregation on its larger runner after this phase.
    # Direct CLI callers can still request the complete pipeline.
    calc_result = None
    if aggregate:
        try:
            report("aggregating")
            logger.info("Triggering automatic macro statistics and counter calculation...")
            from app.scripts.daily_calc import run_daily_calculation
            calc_result = await asyncio.to_thread(run_daily_calculation, db)
            logger.info(f"Automatic calculation completed: {calc_result}")
        except Exception as calc_err:
            logger.error(f"Failed to run automatic macro calculations after crawl: {calc_err}")
            raise
            
    logger.info("Crawler task completed successfully.")
    return {"players_fetched": len(upsert_players), "battle_records_fetched": len(upsert_matches),
            "clubs_fetched": len(upsert_clubs), "aggregation": calc_result}

