from fastapi import APIRouter, HTTPException, Query
from app.services.brawl_api import get_player_battlelog, get_player
from app.database import get_db
import logging
import asyncio
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/player", tags=["Player"])

@router.get("/search")
async def search_players(q: str = Query(..., min_length=1, description="Player tag or name to search")):
    """
    プレイヤーを名前で部分一致検索する
    クエリが '#' で始まる場合はそのままタグとして返す
    """
    if q.startswith("#"):
        # タグ検索の場合は、APIから直接取得するか、あるいはタグをそのまま返す
        return [{"player_tag": q.replace("#", ""), "name": f"Tag Search: {q}", "trophies": 0, "icon_id": 28000000}]
        
    try:
        db = get_db()
        # Supabaseのilike検索
        res = db.table("players").select("player_tag, name, trophies, highest_trophies").ilike("name", f"%{q}%").order("trophies", desc=True).limit(10).execute()
        
        players = res.data
        if not players:
            return []
            
        # APIで追加情報（アイコン、ガチバトルランク）を取得
        async def fetch_extra(p):
            p["trophies"] = p.get("trophies") or 0
            p["highest_trophies"] = p.get("highest_trophies") or 0
            try:
                info = await get_player(p["player_tag"])
                p["icon_id"] = (info.get("icon") or {}).get("id", 28000000) or 28000000
                p["highest_ranked_rank"] = int(info.get("highestAllTimeRankedRank") or 0)
            except Exception:
                p["icon_id"] = 28000000
                p["highest_ranked_rank"] = 0
            return p
            
        enriched_players = await asyncio.gather(*(fetch_extra(p) for p in players))
        return enriched_players
    except Exception as e:
        logger.error(f"Failed to search players by name: {e}")
        return []

@router.get("/{player_tag}/sync")
async def sync_player(player_tag: str):
    """
    プレイヤータグから戦績や保有キャラを同期する
    """
    try:
        player_info = await get_player(player_tag)
        
        # データベースにプレイヤー情報を保存（Upsert）して名前検索の候補に追加する
        try:
            db = get_db()
            clean_tag = player_tag.replace("#", "").upper()
            player_data = {
                "player_tag": clean_tag,
                "name": player_info.get("name", "Unknown"),
                "trophies": player_info.get("trophies", 0),
                "highest_trophies": player_info.get("highestTrophies", 0),
                "unlocked_characters": {},
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            db.table("players").upsert(player_data).execute()
        except Exception as db_err:
            logger.warning(f"Failed to upsert player data during sync: {db_err}")

        return {"player_tag": player_tag, "status": "synced", "name": player_info.get("name")}
    except ValueError as e:
        if str(e) == "Player not found":
            raise HTTPException(status_code=404, detail="Player not found")
        raise HTTPException(status_code=500, detail="Failed to sync player")
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync player")

@router.get("/{player_tag}/dashboard")
async def get_dashboard(player_tag: str):
    """
    Brawl Stars APIから取得した直近のバトルログを解析してダッシュボード用のデータを返す
    """
    try:
        player_info = await get_player(player_tag)
        
        # データベースにプレイヤー情報を保存（Upsert）して名前検索の候補に追加する
        try:
            db = get_db()
            clean_tag = player_tag.replace("#", "").upper()
            player_data = {
                "player_tag": clean_tag,
                "name": player_info.get("name", "Unknown"),
                "trophies": player_info.get("trophies", 0),
                "highest_trophies": player_info.get("highestTrophies", 0),
                "unlocked_characters": {},
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            db.table("players").upsert(player_data).execute()
        except Exception as db_err:
            logger.warning(f"Failed to upsert player data during dashboard fetch: {db_err}")

        battlelog = await get_player_battlelog(player_tag)
        items = battlelog.get("items", [])
        
        char_stats = {}
        mode_stats = {}
        total_matches = 0
        wins = 0
        recent_battles = []
        
        player_tag_fmt = f"#{player_tag.replace('%23', '').replace('#', '').upper()}"
        
        for item in items:
            battle = item.get("battle", {})
            event = item.get("event", {})
            
            if battle.get("result"):
                total_matches += 1
                is_win = (battle.get("result") == "victory")
                if is_win:
                    wins += 1
                    
                hero_used = "unknown"
                
                my_team = []
                opponent_teams = []
                
                # スタープレイヤーの判定
                star_player_tag = (battle.get("starPlayer") or {}).get("tag", "").replace("#", "")
                is_star_player = (star_player_tag == player_tag_fmt.replace("#", ""))
                
                for team in battle.get("teams", []):
                    is_my_team = False
                    team_data = []
                    for p in team:
                        team_data.append({
                            "name": p.get("name", "Unknown"),
                            "brawler": (p.get("brawler") or {}).get("name", "unknown").lower(),
                            "tag": p.get("tag", "").replace("#", "")
                        })
                        if p.get("tag") == player_tag_fmt:
                            is_my_team = True
                            hero_used = (p.get("brawler") or {}).get("name", "unknown").lower()
                    
                    if is_my_team:
                        my_team = team_data
                    else:
                        opponent_teams.append(team_data)
                            
                if hero_used != "unknown":
                    if hero_used not in char_stats:
                        char_stats[hero_used] = {"matches": 0, "wins": 0}
                    char_stats[hero_used]["matches"] += 1
                    if is_win:
                        char_stats[hero_used]["wins"] += 1
                        
                # モード別統計の集計
                mode_name = battle.get("mode", "unknown").replace("_", " ").title()
                if mode_name not in mode_stats:
                    mode_stats[mode_name] = {"matches": 0, "wins": 0, "star_player": 0, "brawlers": {}}
                
                mode_stats[mode_name]["matches"] += 1
                if is_win:
                    mode_stats[mode_name]["wins"] += 1
                if is_star_player:
                    mode_stats[mode_name]["star_player"] += 1
                
                if hero_used != "unknown":
                    if hero_used not in mode_stats[mode_name]["brawlers"]:
                        mode_stats[mode_name]["brawlers"][hero_used] = 0
                    mode_stats[mode_name]["brawlers"][hero_used] += 1
                        
                # バトル履歴用データの作成
                trophy_change = battle.get("trophyChange")
                if trophy_change is None:
                    trophy_change = 8 if is_win else (-6 if battle.get("result") == "defeat" else 0)
                
                recent_battles.append({
                    "time": item.get("battleTime", ""),
                    "mode": mode_name,
                    "map": event.get("map", "Unknown"),
                    "type": battle.get("type", "unknown"),
                    "result": battle.get("result", "draw"),
                    "hero": hero_used,
                    "trophy_change": trophy_change,
                    "my_team": my_team,
                    "opponent_teams": opponent_teams,
                    "raw_battle": battle
                })
                        
        gap_analysis = []
        hidden_weapons = []
        needs_practice = []
        
        # 実データ（macro_map_stats）からキャラクターごとの全体平均勝率を動的計算
        global_win_rates: dict[str, float] = {}
        try:
            db = get_db()
            macro_res = db.table("macro_map_stats").select("character_id, total_wins, total_matches").execute()
            if macro_res.data:
                char_totals: dict[str, dict[str, int]] = {}
                for row in macro_res.data:
                    cid = str(row.get("character_id", "")).lower().strip()
                    tw = row.get("total_wins") or 0
                    tm = row.get("total_matches") or 0
                    if cid and tm > 0:
                        if cid not in char_totals:
                            char_totals[cid] = {"wins": 0, "matches": 0}
                        char_totals[cid]["wins"] += tw
                        char_totals[cid]["matches"] += tm
                
                for cid, totals in char_totals.items():
                    if totals["matches"] > 0:
                        global_win_rates[cid] = round((totals["wins"] / totals["matches"]) * 100, 1)
        except Exception as e:
            logger.warning(f"Failed to fetch global win rates from macro_map_stats: {e}")

        # フォールバック用の一般的キャラクター平均勝率（小文字キー）
        fallback_global_win_rates: dict[str, float] = {
            "shelly": 50.8, "colt": 49.2, "bull": 51.5, "brock": 48.9, "el primo": 53.1,
            "barley": 51.0, "poco": 52.4, "rosa": 52.8, "rico": 50.3, "darryl": 51.9,
            "penny": 50.1, "carl": 51.2, "jacky": 53.5, "piper": 52.7, "pam": 51.8,
            "frank": 54.1, "bibi": 52.9, "bea": 50.4, "nani": 49.8, "edgar": 52.6,
            "mortis": 47.9, "tara": 51.4, "gene": 50.2, "crow": 49.7, "spike": 51.3,
            "leon": 52.1, "sandy": 53.0, "amber": 52.2, "meg": 53.4, "surge": 51.6
        }

        for char, stats in char_stats.items():
            if stats["matches"] > 0:
                char_key = char.lower().strip()
                personal_wr = round((stats["wins"] / stats["matches"]) * 100, 1)
                
                # 1. DB集計の最新実効勝率 2. フォールバック辞書 3. デフォルト 51.5% の順で参照
                global_wr = global_win_rates.get(char_key) or fallback_global_win_rates.get(char_key, 51.5)
                
                gap_analysis.append({
                    "char": char,
                    "global_win_rate": global_wr,
                    "personal_win_rate": personal_wr,
                    "matches": stats["matches"]
                })
                
                if personal_wr > global_wr + 4.0 and global_wr < 54.0:
                    hidden_weapons.append(char)
                elif personal_wr < global_wr - 4.0 and global_wr > 48.0:
                    needs_practice.append(char)
                    
        gap_analysis.sort(key=lambda x: x["matches"], reverse=True)
        
        mode_analysis = []
        for mode_n, stats in mode_stats.items():
            top_brawlers = sorted(stats["brawlers"].items(), key=lambda x: x[1], reverse=True)[:3]
            top_brawlers_names = [b[0] for b in top_brawlers]
            win_rate = round((stats["wins"] / stats["matches"]) * 100, 1) if stats["matches"] > 0 else 0.0
            mode_analysis.append({
                "mode": mode_n,
                "matches": stats["matches"],
                "wins": stats["wins"],
                "win_rate": win_rate,
                "star_player_count": stats["star_player"],
                "top_brawlers": top_brawlers_names
            })
        mode_analysis.sort(key=lambda x: x["matches"], reverse=True)
        
        highest_rank = player_info.get("rankedRank") or player_info.get("highestAllTimeRankedRank") or player_info.get("highestRank")
        if not highest_rank:
            highest_trophies = player_info.get("highestTrophies", 0)
            if highest_trophies >= 80000: highest_rank = 19
            elif highest_trophies >= 60000: highest_rank = 16
            elif highest_trophies >= 45000: highest_rank = 13
            elif highest_trophies >= 30000: highest_rank = 10
            elif highest_trophies >= 20000: highest_rank = 7
            elif highest_trophies >= 10000: highest_rank = 4
            else: highest_rank = 1
        
        return {
            "player_tag": player_tag,
            "profile": {
                "name": player_info.get("name", "Unknown"),
                "icon_id": (player_info.get("icon") or {}).get("id", 28000000),
                "trophies": player_info.get("trophies", 0),
                "highest_trophies": player_info.get("highestTrophies", 0),
                "highest_rank": highest_rank,
                "ranked_elo": player_info.get("rankedElo", 0),
                "highest_ranked_elo": player_info.get("highestAllTimeRankedElo", 0),
                "ranked_rank": player_info.get("rankedRank", 0),
                "highest_ranked_rank": player_info.get("highestAllTimeRankedRank", 0),
                "level": player_info.get("expLevel", 0),
                "3v3_victories": player_info.get("3vs3Victories", 0),
                "club_name": (player_info.get("club") or {}).get("name", "No Club"),
                "club_tag": (player_info.get("club") or {}).get("tag", "")
            },
            "brawlers": player_info.get("brawlers", []),
            "recent_battles": recent_battles,
            "metrics": {
                "total_matches_analyzed": total_matches,
                "overall_win_rate": round((wins / total_matches * 100) if total_matches > 0 else 0, 1)
            },
            "insights": {
                "gap_analysis": gap_analysis[:5] if gap_analysis else [{"char": "no data", "global_win_rate": 50.0, "personal_win_rate": 50.0, "matches": 0}],
                "hidden_weapons": hidden_weapons[:3],
                "needs_practice": needs_practice[:3],
                "mode_analysis": mode_analysis
            }
        }
    except ValueError as e:
        if str(e) == "Player not found":
            raise HTTPException(status_code=404, detail="Player not found")
        return {"error": "Failed to generate dashboard"}
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return {"error": "Failed to generate dashboard"}
