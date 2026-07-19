import asyncio
import logging
from datetime import datetime, timezone
from app.database import get_db
from app.services.brawl_api import get_player_battlelog, get_player, get_club_members

logger = logging.getLogger(__name__)

async def run_crawler_task():
    """
    バックグラウンドで実行される高度なデータクローラータスク
    1. Supabaseから対象プレイヤーのタグ一覧を取得
    2. 並列でBrawl APIからプレイヤー情報とバトルログを取得
    3. 所属クラブから新メンバーを抽出（芋づる式クローリング）
    4. プレイヤー情報とバトル履歴をSupabaseへBulk Upsert
    """
    logger.info("Starting advanced background crawler task...")
    db = get_db()
    
    try:
        # 重複して保存されてしまった古い「#付き」の不正データを自動削除（クリーニング）
        db.table("match_raw_history").delete().like("match_id", "#%").execute()
        db.table("players").delete().like("player_tag", "#%").execute()
    except Exception as e:
        logger.warning(f"Cleanup failed (might be ok if empty): {e}")

    try:
        # 常に更新日時が古い（またはまだクロールされていない）プレイヤーを5人だけシードとして取得
        response = db.table("players").select("player_tag").order("updated_at", desc=False).limit(5).execute()
        base_player_tags = set(row["player_tag"].replace("#", "") for row in response.data)
    except Exception as e:
        logger.error(f"Failed to fetch player tags from DB: {e}")
        return

    if not base_player_tags:
        logger.info("No players found in DB, using seed tags.")
        base_player_tags = {"#Q2LL9G8", "#R8G2P9Y"}
        
    logger.info(f"Target base players count: {len(base_player_tags)}")
    
    semaphore = asyncio.Semaphore(5)
    
    upsert_players = []
    upsert_matches = []
    found_clubs = set()

    async def fetch_player_and_matches(tag: str):
        clean_tag = tag.replace("#", "")
        raw_tag = f"#{clean_tag}"
        
        async with semaphore:
            try:
                # 1. プレイヤー情報の取得
                player_info = await get_player(clean_tag)
                
                player_data = {
                    "player_tag": clean_tag, # URL等の不具合防止のためDB上は#抜きで統一か、#ありか。仕様に合わせてそのまま
                    "name": player_info.get("name", "Unknown"),
                    "trophies": player_info.get("trophies", 0),
                    "highest_trophies": player_info.get("highestTrophies", 0),
                    "unlocked_characters": {}, 
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                club_tag = player_info.get("club", {}).get("tag")
                
                # 2. バトルログの取得
                battle_log_data = []
                encountered_players = set()
                try:
                    logs = await get_player_battlelog(clean_tag)
                    items = logs.get("items", [])
                    for item in items:
                        battle = item.get("battle", {})
                        if battle.get("type") == "ranked" and battle.get("result"):
                            battle_time = item.get("battleTime")
                            match_id = f"{clean_tag}_{battle_time}"
                            
                            # モックやAPIから取得したチームメンバーを味方/敵に分類
                            hero_used = "unknown"
                            allies = []
                            opponents = []
                            teams = battle.get("teams", [])
                            
                            # 自チームと敵チームの判定ロジック
                            for team in teams:
                                is_my_team = any(p.get("tag", "").replace("%23", "#") == raw_tag for p in team)
                                team_brawlers = [p.get("brawler", {}).get("name", "unknown") for p in team]
                                
                                for p in team:
                                    ptag = p.get("tag", "")
                                    if ptag:
                                        encountered_players.add(ptag.replace("#", ""))
                                
                                if is_my_team:
                                    for p in team:
                                        if p.get("tag", "").replace("%23", "#") == raw_tag:
                                            hero_used = p.get("brawler", {}).get("name", "unknown")
                                        else:
                                            allies.append(p.get("brawler", {}).get("name", "unknown"))
                                else:
                                    opponents.extend(team_brawlers)

                            battle_log_data.append({
                                "match_id": match_id,
                                "player_tag": clean_tag,
                                "match_at": datetime.strptime(battle_time, "%Y%m%dT%H%M%S.%fZ").isoformat() if "T" in battle_time else datetime.now(timezone.utc).isoformat(),
                                "mode": battle.get("mode", "unknown"),
                                "map_id": item.get("event", {}).get("map", "unknown"),
                                "result": battle.get("result"),
                                "hero_used": hero_used,
                                "allies": allies,
                                "opponents": opponents
                            })
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
            
    # フェーズ2: クラブから新メンバーを抽出 (芋づる式クローリング制限：最大10クラブ)
    new_player_tags = set()
    clubs_to_crawl = list(found_clubs)[:10]
    
    async def fetch_club_members_task(ctag):
        async with semaphore:
            try:
                c_data = await get_club_members(ctag)
                return [m.get("tag") for m in c_data.get("items", []) if m.get("tag")]
            except Exception as e:
                logger.warning(f"Failed to fetch club {ctag}: {e}")
                return []
                
    if clubs_to_crawl:
        logger.info(f"Crawling {len(clubs_to_crawl)} clubs to find new players...")
        club_tasks = [fetch_club_members_task(ctag) for ctag in clubs_to_crawl]
        club_results = await asyncio.gather(*club_tasks)
        for members in club_results:
            for m in members:
                if m:
                    m_clean = m.replace("#", "")
                    if m_clean not in base_player_tags:
                        new_player_tags.add(m_clean)
                        
    # バトルで遭遇したプレイヤーも新規取得リストに加える（クラブ抽出と並行）
    for m_clean in encountered_in_battles:
        if m_clean not in base_player_tags:
            new_player_tags.add(m_clean)
                    
    # フェーズ3: 新規プレイヤーのデータを取得
    if new_player_tags:
        logger.info(f"Found {len(new_player_tags)} new players (from clubs & battles). Fetching their data...")
        # ランダム性を持たせるため、今回は順序を保持しつつ上限50人に制限 (本来はランダムサンプリングがベスト)
        target_new_players = list(new_player_tags)[:50]
        new_tasks = [fetch_player_and_matches(tag) for tag in target_new_players] # 制限: 1バッチにつき最大50人まで
        new_results = await asyncio.gather(*new_tasks)
        
        for p_data, m_data, _, _ in new_results:
            if p_data:
                upsert_players.append(p_data)
            if m_data:
                upsert_matches.extend(m_data)

    # 4. SupabaseへのBulk Upsert
    if upsert_players:
        try:
            logger.info(f"Bulk upserting {len(upsert_players)} players...")
            db.table("players").upsert(upsert_players).execute()
        except Exception as e:
            logger.error(f"Failed to upsert players: {e}")
            
    if upsert_matches:
        try:
            logger.info(f"Bulk upserting {len(upsert_matches)} matches...")
            db.table("match_raw_history").upsert(upsert_matches).execute()
        except Exception as e:
            logger.error(f"Failed to upsert matches: {e}")
            
    logger.info("Crawler task completed successfully.")
