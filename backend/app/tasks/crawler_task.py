import asyncio
import logging
import random
from datetime import datetime, timezone
from app.database import get_db
from app.services.brawl_api import get_player_battlelog, get_player, get_club_members, get_club

logger = logging.getLogger(__name__)

# 多様なアクティブトッププレイヤーのシードタグ（フォールバックおよびベース補完用）
DEFAULT_SEED_TAGS = {
    "Q2LL9G8", "R8G2P9Y", "2P0VR28P", "80V09RRV", "20P0J8V0",
    "8YRRU0LV", "9L8GYV0U", "L08J28VR", "8VPP9U2L", "8P0QLL8U",
    "2G80L9RU", "80RGYL2V", "2L8U9P0R", "90J8V2RU", "8L9R0P2V"
}

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

    base_player_tags = set()
    try:
        # 常に更新日時が古いプレイヤーを15人取得して巡回
        response = db.table("players").select("player_tag").order("updated_at", desc=False).limit(15).execute()
        if response.data:
            base_player_tags = set(row["player_tag"].replace("#", "") for row in response.data)
    except Exception as e:
        logger.error(f"Failed to fetch player tags from DB: {e}")

    # シードタグを合成して巡回の偏りと停滞を防止
    base_player_tags.update(DEFAULT_SEED_TAGS)
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
                        b_type = battle.get("type")
                        
                        raw_result = battle.get("result")
                        rank = battle.get("rank")
                        trophy_change = battle.get("trophyChange")
                        mode_str = str(battle.get("mode", "")).lower()
                        
                        # Showdownや特殊モード対応の勝率判定
                        is_win = False
                        result_str = raw_result
                        if not result_str:
                            if rank is not None:
                                is_win = (rank <= 4) if mode_str == "soloshowdown" else (rank <= 2)
                                result_str = "victory" if is_win else ("defeat" if rank > 2 else "draw")
                            elif trophy_change is not None and trophy_change != 0:
                                is_win = (trophy_change > 0)
                                result_str = "victory" if is_win else "defeat"

                        # ranked=トロフィーマッチ、soloRanked/teamRanked=ガチバトル
                        if b_type in ["ranked", "soloRanked", "teamRanked"] and result_str:
                            battle_time = item.get("battleTime")
                            match_id = f"{clean_tag}_{battle_time}"
                            
                            original_map_id = item.get("event", {}).get("map", "unknown")
                            map_id = original_map_id
                            
                            hero_used = "unknown"
                            allies = []
                            opponents = []
                            teams = battle.get("teams", [])
                            players = battle.get("players", [])
                            
                            if teams:
                                for team in teams:
                                    is_my_team = any(p.get("tag", "").replace("%23", "#").replace("#", "").upper() == clean_tag for p in team)
                                    team_brawlers = [p.get("brawler", {}).get("name", "unknown") for p in team]
                                    
                                    for p in team:
                                        ptag = p.get("tag", "")
                                        if ptag:
                                            encountered_players.add(ptag.replace("#", "").upper())
                                    
                                    if is_my_team:
                                        for p in team:
                                            if p.get("tag", "").replace("%23", "#").replace("#", "").upper() == clean_tag:
                                                hero_used = p.get("brawler", {}).get("name", "unknown")
                                            else:
                                                allies.append(p.get("brawler", {}).get("name", "unknown"))
                                    else:
                                        opponents.extend(team_brawlers)
                            elif players:
                                for p in players:
                                    ptag = p.get("tag", "").replace("#", "").upper()
                                    if ptag:
                                        encountered_players.add(ptag)
                                    bname = p.get("brawler", {}).get("name", "unknown")
                                    if ptag == clean_tag:
                                        hero_used = bname
                                    else:
                                        opponents.append(bname)

                            battle_log_data.append({
                                "match_id": match_id,
                                "player_tag": clean_tag,
                                "match_at": datetime.strptime(battle_time, "%Y%m%dT%H%M%S.%fZ").isoformat() if "T" in battle_time else datetime.now(timezone.utc).isoformat(),
                                "match_type": b_type,
                                "mode": battle.get("mode", "unknown"),
                                "map_id": map_id,
                                "result": result_str,
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
                    
    # フェーズ3: 新規プレイヤーのデータを取得
    if new_player_tags:
        logger.info(f"Found {len(new_player_tags)} new players (from clubs & battles). Fetching their data...")
        # ランダムサンプリングで偏りを排除し、毎回新しいプレイヤーを開拓
        candidate_list = list(new_player_tags)
        target_count = min(len(candidate_list), 60)
        target_new_players = random.sample(candidate_list, target_count)
        new_tasks = [fetch_player_and_matches(tag) for tag in target_new_players]
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

    if upsert_clubs:
        try:
            logger.info(f"Bulk upserting {len(upsert_clubs)} clubs...")
            db.table("clubs").upsert(upsert_clubs).execute()
        except Exception as e:
            logger.error(f"Failed to upsert clubs: {e}")
            
    if upsert_matches:
        try:
            logger.info(f"Bulk upserting {len(upsert_matches)} matches...")
            db.table("match_raw_history").upsert(upsert_matches).execute()
        except Exception as e:
            logger.warning(f"Failed to upsert matches directly, trying fallback without match_type: {e}")
            try:
                fallback_matches = [{k: v for k, v in m.items() if k != "match_type"} for m in upsert_matches]
                db.table("match_raw_history").upsert(fallback_matches).execute()
                logger.info(f"Successfully upserted {len(fallback_matches)} matches via fallback")
            except Exception as fallback_err:
                logger.error(f"Failed fallback match upsert: {fallback_err}")
            
    logger.info("Crawler task completed successfully.")

