from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, StrictBool
from app.services.brawl_api import get_player_battlelog, get_player
from app.database import get_db
from app.services.player_profiles import profile_record
from app.services.battle_records import clean_tag as normalize_player_tag, parse_battlelog, save_battle_records
from app.services.player_analysis import get_saved_player_analysis, invalidate_player_analysis
import logging
import asyncio
from datetime import datetime, timezone
from typing import Literal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/player", tags=["Player"])


class AutoSyncSetting(BaseModel):
    enabled: StrictBool


@router.get("/{player_tag}/auto-sync")
async def read_auto_sync(player_tag: str, auto_sync_token: str | None = Header(None, max_length=64)):
    from app.services.player_auto_sync import auto_sync_status, checked_tag
    try:
        tag = checked_tag(player_tag)
        return await asyncio.to_thread(auto_sync_status, get_db(), tag, auto_sync_token)
    except ValueError:
        raise HTTPException(status_code=422, detail="プレイヤータグまたは設定キーが不正です。")
    except Exception:
        logger.exception("Could not read auto-sync settings")
        raise HTTPException(status_code=503, detail="自動同期の設定を取得できませんでした。")


@router.put("/{player_tag}/auto-sync")
async def update_auto_sync(player_tag: str, setting: AutoSyncSetting,
                           auto_sync_token: str = Header(..., min_length=64, max_length=64)):
    from app.services.player_auto_sync import set_auto_sync, checked_tag
    try:
        tag = checked_tag(player_tag)
        return await asyncio.to_thread(set_auto_sync, get_db(), tag, auto_sync_token, setting.enabled)
    except ValueError:
        raise HTTPException(status_code=422, detail="プレイヤータグまたは設定キーが不正です。")
    except Exception as exc:
        if "auto_sync_capacity" in str(exc):
            raise HTTPException(status_code=409, detail="現在、自動同期の登録枠がいっぱいです。時間をおいて再試行してください。")
        if "player_not_found" in str(exc):
            raise HTTPException(status_code=404, detail="先にプレイヤーを同期してください。")
        logger.exception("Could not update auto-sync settings")
        raise HTTPException(status_code=503, detail="自動同期の設定を保存できませんでした。")

import time

# --- Player Enrichment Cache Layer (tag -> ({icon_id, highest_ranked_rank}, timestamp)) ---
_PLAYER_SEARCH_ENRICH_CACHE: dict[str, tuple[dict, float]] = {}
_ENRICH_CACHE_TTL = 86400.0  # 24 hours


def _save_synced_player(db, tag: str, player_info: dict, battlelog: dict) -> int:
    """Persist profile before its battle observations; fail the sync on write errors."""
    records, _ = parse_battlelog(tag, (battlelog or {}).get("items") or [])
    db.table("players").upsert(profile_record(tag, player_info)).execute()
    if records:
        save_battle_records(db, records)
    invalidate_player_analysis(tag)
    return len(records)

@router.get("/search")
async def search_players(q: str = Query(..., min_length=1, description="Player tag or name to search")):
    """
    プレイヤーを名前で部分一致検索する
    クエリが '#' で始まる場合はそのままタグとして返す
    
    Why: エンリッチキャッシュ（TTL 24h）を併用することで、
    初検索時でもアイコン・最高ランクを高速補完し、2回目以降は 0ms（DBのみ 15ms）で即時返却する。
    """
    clean_q = q.strip()
    if clean_q.startswith("#"):
        tag_val = normalize_player_tag(clean_q)
        # キャッシュがあれば適用
        cached_entry = _PLAYER_SEARCH_ENRICH_CACHE.get(tag_val)
        icon_id = cached_entry[0].get("icon_id", 28000000) if cached_entry else 28000000
        highest_rank = cached_entry[0].get("highest_ranked_rank", 0) if cached_entry else 0
        return [{
            "player_tag": tag_val,
            "name": f"#{tag_val}",
            "trophies": 0,
            "highest_trophies": 0,
            "icon_id": icon_id,
            "highest_ranked_rank": highest_rank
        }]
        
    try:
        db = get_db()
        # Supabaseのilike検索（トロフィー数降順で上位10件）
        res = db.table("players").select("player_tag, name, trophies, highest_trophies").not_.like("name", "Mock (Error:%").or_("unlocked_characters->>profile_status.is.null,unlocked_characters->>profile_status.neq.not_found").ilike("name", f"%{clean_q}%").order("trophies", desc=True).limit(10).execute()
        
        players = res.data or []
        if not players:
            return []

        now = time.time()
        missing_enrich = []

        for p in players:
            p["trophies"] = p.get("trophies") or 0
            p["highest_trophies"] = p.get("highest_trophies") or 0
            tag = p.get("player_tag", "").upper()
            
            cached = _PLAYER_SEARCH_ENRICH_CACHE.get(tag)
            if cached and (now - cached[1]) < _ENRICH_CACHE_TTL:
                p["icon_id"] = cached[0].get("icon_id", 28000000)
                p["highest_ranked_rank"] = cached[0].get("highest_ranked_rank", 0)
            else:
                p["icon_id"] = 28000000
                p["highest_ranked_rank"] = 0
                missing_enrich.append(p)

        # キャッシュ未登録のプレイヤーのみ、短時間タイムアウトで並列エンリッチ
        if missing_enrich:
            async def fetch_enrich(player_obj):
                tag_to_fetch = player_obj.get("player_tag", "")
                try:
                    # タイムアウト付きで安全にフェッチ
                    info = await asyncio.wait_for(get_player(tag_to_fetch), timeout=2.0)
                    icon_val = (info.get("icon") or {}).get("id", 28000000) or 28000000
                    rank_val = int(info.get("highestAllTimeRankedRank") or info.get("rankedRank") or 0)
                    
                    player_obj["icon_id"] = icon_val
                    player_obj["highest_ranked_rank"] = rank_val
                    
                    _PLAYER_SEARCH_ENRICH_CACHE[tag_to_fetch.upper()] = (
                        {"icon_id": icon_val, "highest_ranked_rank": rank_val},
                        time.time()
                    )
                except Exception as e:
                    logger.debug(f"Failed to fetch enrich info for {tag_to_fetch}: {e}")

            await asyncio.gather(*(fetch_enrich(p) for p in missing_enrich), return_exceptions=True)
            
        return players
    except Exception as e:
        logger.error(f"Failed to search players by name: {e}")
        return []

@router.get("/{player_tag}/analysis")
async def analyze_player(player_tag: str, days: int = Query(30, ge=7, le=60),
                         match_type: Literal["all", "normal", "gachi"] = "all",
                         hero: str = Query("all", max_length=50),
                         mode: str = Query("all", max_length=50),
                         map_id: str = Query("all", max_length=100)):
    """Read only this player's saved 60-day history; filters never call the game API."""
    if days not in (7, 30, 60):
        raise HTTPException(status_code=422, detail="分析期間は7日・30日・60日から選択してください。")
    try:
        tag = normalize_player_tag(player_tag)
        return await asyncio.to_thread(get_saved_player_analysis, get_db(), tag,
                                       days=days, match_type=match_type, hero=hero,
                                       mode=mode, map_id=map_id)
    except Exception:
        logger.exception("Could not load saved analysis for player")
        raise HTTPException(status_code=503, detail="保存済みの戦績を分析できませんでした。時間をおいて再試行してください。")


@router.get("/{player_tag}/sync")
async def sync_player(player_tag: str):
    """
    プレイヤータグから戦績や保有キャラを同期する
    """
    try:
        clean_tag = normalize_player_tag(player_tag)
        player_info, battlelog = await asyncio.gather(
            get_player(clean_tag), get_player_battlelog(clean_tag)
        )
        
        # データベースにプレイヤー情報を保存（Upsert）して名前検索の候補に追加する
        try:
            db = get_db()
            icon_id = (player_info.get("icon") or {}).get("id", 28000000) or 28000000
            highest_rank = int(player_info.get("highestAllTimeRankedRank") or player_info.get("rankedRank") or 0)
            
            saved = await asyncio.to_thread(_save_synced_player, db, clean_tag, player_info, battlelog)

            _PLAYER_SEARCH_ENRICH_CACHE[clean_tag] = (
                {"icon_id": icon_id, "highest_ranked_rank": highest_rank},
                time.time()
            )
        except Exception as db_err:
            logger.warning(f"Failed to upsert player data during sync: {db_err}")
            raise HTTPException(status_code=503, detail="Failed to save player")

        return {"player_tag": clean_tag, "status": "synced", "name": player_info.get("name"),
                "battle_records_saved": saved}
    except HTTPException:
        raise
    except ValueError as e:
        if str(e) == "Player not found":
            raise HTTPException(status_code=404, detail="Player not found")
        raise HTTPException(status_code=500, detail="Failed to sync player")
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync player")

def determine_battle_result(battle: dict) -> tuple[str, bool]:
    """
    バトルログから勝敗文字列 ("victory"/"defeat"/"draw") と勝敗フラグ (is_win) を決定する。
    
    Why:
    Brawl Stars APIでは Showdown (Solo/Duo/Trio Showdown) や一部特殊モードで
    battle.result フィールドが存在せず None になる。そのため rank や trophyChange から
    勝敗を動的に判定してログ消失を防ぐ。
    """
    raw_result = battle.get("result")
    if raw_result:
        is_win = (raw_result == "victory")
        return raw_result, is_win
    
    rank = battle.get("rank")
    trophy_change = battle.get("trophyChange")
    mode = str(battle.get("mode", "")).lower()
    
    if rank is not None:
        if mode == "soloshowdown":
            is_win = (rank <= 4) or (trophy_change is not None and trophy_change > 0)
        elif mode in ["duoshowdown", "trioshowdown"]:
            is_win = (rank <= 2) or (trophy_change is not None and trophy_change > 0)
        else:
            is_win = (rank <= 2) or (trophy_change is not None and trophy_change > 0)
            
        result_str = "victory" if is_win else ("defeat" if rank > 2 else "draw")
        return result_str, is_win
    
    if trophy_change is not None and trophy_change != 0:
        is_win = (trophy_change > 0)
        result_str = "victory" if is_win else "defeat"
        return result_str, is_win

    return "unknown", False

@router.get("/{player_tag}/dashboard")
async def get_dashboard(player_tag: str):
    """
    Brawl Stars APIから取得した直近のバトルログを解析してダッシュボード用のデータを返す
    - get_player と get_player_battlelog を完全並列化 (asyncio.gather)
    - macro_map_stats の全件走査を廃止しインメモリキャッシュを活用
    """
    try:
        clean_tag = normalize_player_tag(player_tag)
        
        # 1. プレイヤー基本情報とバトルログを完全並列フェッチ (待ち時間半減)
        player_info, battlelog = await asyncio.gather(
            get_player(clean_tag),
            get_player_battlelog(clean_tag)
        )
        
        # 2. 同期の成功を返す前にプロフィールと対応する試合を保存する。
        try:
            db = get_db()
            ranked_rank = player_info.get("rankedRank") or 0
            highest_ranked_rank = int(player_info.get("highestAllTimeRankedRank") or player_info.get("highestSeasonRankedRank") or ranked_rank)
            icon_id = (player_info.get("icon") or {}).get("id", 28000000) or 28000000
            
            await asyncio.to_thread(_save_synced_player, db, clean_tag, player_info, battlelog)

            _PLAYER_SEARCH_ENRICH_CACHE[clean_tag] = (
                {"icon_id": icon_id, "highest_ranked_rank": highest_ranked_rank},
                time.time()
            )
        except Exception as db_err:
            logger.exception("Failed to save player battles during dashboard sync: %s", db_err)
            raise HTTPException(status_code=503, detail="戦績データを保存できませんでした。時間をおいて再試行してください。")

        items = battlelog.get("items", []) if battlelog else []
        
        char_stats = {}
        mode_stats = {}
        total_matches = 0
        wins = 0
        recent_battles = []
        
        for item in items:
            battle = item.get("battle") or {}
            event = item.get("event") or {}
            
            result_str, is_win = determine_battle_result(battle)
            if result_str != "unknown":
                total_matches += 1
                if is_win:
                    wins += 1
                    
                hero_used = "unknown"
                my_team = []
                opponent_teams = []
                
                # スタープレイヤーの判定
                star_player_tag = normalize_player_tag((battle.get("starPlayer") or {}).get("tag"))
                is_star_player = (star_player_tag == clean_tag)
                
                teams = battle.get("teams") or []
                players = battle.get("players") or []
                
                if teams:
                    for team in teams:
                        is_my_team = False
                        team_data = []
                        for p in team:
                            ptag = normalize_player_tag(p.get("tag"))
                            brawler_name = ((p.get("brawler") or {}).get("name") or "unknown").lower()
                            team_data.append({
                                "name": p.get("name", "Unknown"),
                                "brawler": brawler_name,
                                "tag": ptag
                            })
                            if ptag == clean_tag:
                                is_my_team = True
                                hero_used = brawler_name
                        
                        if is_my_team:
                            my_team = team_data
                        else:
                            opponent_teams.append(team_data)
                elif players:
                    # Solo Showdown など
                    for p in players:
                        ptag = normalize_player_tag(p.get("tag"))
                        brawler_name = ((p.get("brawler") or {}).get("name") or "unknown").lower()
                        p_data = {
                            "name": p.get("name", "Unknown"),
                            "brawler": brawler_name,
                            "tag": ptag
                        }
                        if ptag == clean_tag:
                            hero_used = brawler_name
                            my_team.append(p_data)
                        else:
                            opponent_teams.append([p_data])
                            
                if hero_used != "unknown":
                    if hero_used not in char_stats:
                        char_stats[hero_used] = {"matches": 0, "wins": 0}
                    char_stats[hero_used]["matches"] += 1
                    if is_win:
                        char_stats[hero_used]["wins"] += 1
                        
                # モード別統計の集計
                event_mode = event.get("mode")
                battle_mode = battle.get("mode")
                if event_mode and event_mode != "unknown":
                    raw_mode = event_mode
                elif battle_mode and battle_mode != "unknown":
                    raw_mode = battle_mode
                else:
                    raw_mode = "unknown"

                if raw_mode in ["duoShowdown", "duo_showdown"] and teams and any(len(t) >= 3 for t in teams):
                    raw_mode = "trioShowdown"

                mode_name = raw_mode.replace("_", " ").title()
                if mode_name not in mode_stats:
                    mode_stats[mode_name] = {"matches": 0, "wins": 0, "star_player": 0, "brawlers": {}}
                
                mode_stats[mode_name]["matches"] += 1
                if is_win:
                    mode_stats[mode_name]["wins"] += 1
                if is_star_player:
                    mode_stats[mode_name]["star_player"] += 1
                
                if hero_used != "unknown":
                    mode_stats[mode_name]["brawlers"][hero_used] = mode_stats[mode_name]["brawlers"].get(hero_used, 0) + 1
                    
                match_type = battle.get("type", "unknown")
                if not match_type or match_type == "unknown":
                    if battle.get("trophyChange") is not None:
                        match_type = "ranked"
                    else:
                        match_type = "friendly"
                
                recent_battles.append({
                    "time": item.get("battleTime", ""),
                    "mode": raw_mode,
                    "map": event.get("map", "Unknown"),
                    "type": match_type,
                    "result": result_str,
                    "hero": hero_used,
                    "trophy_change": battle.get("trophyChange"),
                    "my_team": my_team,
                    "opponent_teams": opponent_teams,
                    "raw_battle": battle
                })
                        
        gap_analysis = []
        hidden_weapons = []
        needs_practice = []
        
        # 3. インメモリキャッシュからマクロ勝率を高速集計 (DB全件クエリゼロ)
        global_win_rates: dict[str, float] = {}
        try:
            from app.routers.meta import _get_cached_macro_data
            db = get_db()
            macro_data = _get_cached_macro_data(db)
            char_totals: dict[str, dict[str, int]] = {}
            for row in macro_data:
                if str(row.get("match_type", "")).startswith("gachi"):
                    continue
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
            logger.warning(f"Failed to fetch global win rates from macro cache: {e}")

        for char, stats in char_stats.items():
            if stats["matches"] > 0:
                char_key = char.lower().strip()
                personal_wr = round((stats["wins"] / stats["matches"]) * 100, 1)
                
                # 1. DB集計の最新実効勝率 2. フォールバック辞書 3. デフォルト 51.5% の順で参照
                global_wr = global_win_rates.get(char_key)
                if global_wr is None:
                    continue
                
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
        
        highest_rank = max(player_info.get("highestAllTimeRankedRank") or 0,
                           player_info.get("highestSeasonRankedRank") or 0,
                           player_info.get("rankedRank") or 0)

        return {
            "player_tag": clean_tag,
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
                "gap_analysis": gap_analysis[:5],
                "hidden_weapons": hidden_weapons[:3],
                "needs_practice": needs_practice[:3],
                "mode_analysis": mode_analysis
            }
        }
    except HTTPException:
        raise
    except ValueError as e:
        if str(e) == "Player not found":
            raise HTTPException(status_code=404, detail="Player not found")
        raise HTTPException(status_code=502, detail="戦績データを取得できませんでした。時間をおいて再試行してください。")
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        raise HTTPException(status_code=502, detail="戦績データを取得できませんでした。時間をおいて再試行してください。")
