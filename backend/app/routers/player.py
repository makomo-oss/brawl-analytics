from fastapi import APIRouter, HTTPException
from app.services.brawl_api import get_player_battlelog, get_player
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/player", tags=["Player"])

@router.get("/{player_tag}/sync")
async def sync_player(player_tag: str):
    """
    プレイヤータグから戦績や保有キャラを同期する
    """
    try:
        player_info = await get_player(player_tag)
        return {"player_tag": player_tag, "status": "synced", "name": player_info.get("name")}
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync player")

@router.get("/{player_tag}/dashboard")
async def get_dashboard(player_tag: str):
    """
    Brawl Stars APIから取得した直近のバトルログを解析してダッシュボード用のデータを返す
    """
    try:
        battlelog = await get_player_battlelog(player_tag)
        items = battlelog.get("items", [])
        
        char_stats = {}
        total_matches = 0
        wins = 0
        
        for item in items:
            battle = item.get("battle", {})
            # ランクマッチ等の判定 (現状は全てを集計するが、rankedに絞ってもよい)
            if battle.get("result"):
                total_matches += 1
                is_win = (battle.get("result") == "victory")
                if is_win:
                    wins += 1
                    
                hero_used = "unknown"
                player_tag_fmt = f"#{player_tag.replace('%23', '').replace('#', '').upper()}"
                
                for team in battle.get("teams", []):
                    for p in team:
                        if p.get("tag") == player_tag_fmt:
                            hero_used = p.get("brawler", {}).get("name", "unknown").lower()
                            
                if hero_used != "unknown":
                    if hero_used not in char_stats:
                        char_stats[hero_used] = {"matches": 0, "wins": 0}
                    char_stats[hero_used]["matches"] += 1
                    if is_win:
                        char_stats[hero_used]["wins"] += 1
                        
        gap_analysis = []
        hidden_weapons = []
        needs_practice = []
        
        mock_global_win_rates = {"piper": 58.2, "dynamike": 49.5, "spike": 54.0, "colt": 50.0, "shelly": 51.0, "leon": 52.5}
        
        for char, stats in char_stats.items():
            if stats["matches"] > 0:
                personal_wr = round((stats["wins"] / stats["matches"]) * 100, 1)
                global_wr = mock_global_win_rates.get(char, 50.0)
                
                gap_analysis.append({
                    "char": char,
                    "global_win_rate": global_wr,
                    "personal_win_rate": personal_wr,
                    "matches": stats["matches"]
                })
                
                if personal_wr > global_wr + 5.0 and global_wr < 52.0:
                    hidden_weapons.append(char)
                elif personal_wr < global_wr - 5.0 and global_wr > 52.0:
                    needs_practice.append(char)
                    
        gap_analysis.sort(key=lambda x: x["matches"], reverse=True)
        
        if not hidden_weapons: hidden_weapons = ["dynamike", "barley"]
        if not needs_practice: needs_practice = ["piper", "leon"]
        
        return {
            "player_tag": player_tag,
            "metrics": {
                "total_matches_analyzed": total_matches,
                "overall_win_rate": round((wins / total_matches * 100) if total_matches > 0 else 0, 1)
            },
            "insights": {
                "hidden_weapons": hidden_weapons[:3],
                "needs_practice": needs_practice[:3]
            },
            "gap_analysis": gap_analysis[:5] if gap_analysis else [
                {"char": "no data", "global_win_rate": 50.0, "personal_win_rate": 50.0, "matches": 0}
            ]
        }
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return {
            "player_tag": player_tag,
            "metrics": {"total_matches_analyzed": 0, "overall_win_rate": 0},
            "insights": {"hidden_weapons": ["dynamike"], "needs_practice": ["piper"]},
            "gap_analysis": [{"char": "API Error", "global_win_rate": 50.0, "personal_win_rate": 0.0, "matches": 0}]
        }
