import os
import sys
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

# プロジェクトルートとbackendをパスに追加
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(backend_dir)

load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv(os.path.join(os.path.dirname(backend_dir), ".env"))

from app.services.brawl_api import get_player

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def get_supabase_client() -> Client:
    """Supabaseクライアントを取得する"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        from app.database import SUPABASE_URL, SUPABASE_KEY
        url = url or SUPABASE_URL
        key = key or SUPABASE_KEY
    if not url or not key:
        raise ValueError("Supabase credentials not found in environment variables.")
    return create_client(url, key)

async def auto_sync_missing_player_ranks(missing_tags: list[str], supabase: Client):
    """
    集計時にガチバトルランクが未取得（未同期）のプレイヤーが存在した場合、
    Brawl Stars APIから非同期並列で自動補完同期（Auto-Heal）する。
    """
    if not missing_tags:
        return
    logger.info(f"Auto-healing {len(missing_tags)} un-synced player ranks from Brawl API...")
    semaphore = asyncio.Semaphore(20)
    
    async def fetch_one(tag: str):
        async with semaphore:
            try:
                p_info = await get_player(tag)
                if not p_info: return None
                c_rank = p_info.get("rankedRank") or 0
                c_name = p_info.get("rankedRankName") or ""
                h_rank = p_info.get("highestAllTimeRankedRank") or p_info.get("highestSeasonRankedRank") or c_rank
                h_name = p_info.get("highestAllTimeRankedRankName") or p_info.get("highestSeasonRankedRankName") or c_name
                return {
                    "player_tag": tag,
                    "name": p_info.get("name", "Unknown"),
                    "trophies": p_info.get("trophies", 0),
                    "highest_trophies": p_info.get("highestTrophies", 0),
                    "unlocked_characters": {
                        "ranked_rank": c_rank,
                        "highest_ranked_rank": h_rank,
                        "ranked_name": c_name,
                        "highest_ranked_name": h_name
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            except Exception:
                return None

    # 最大300件ずつ自己修復
    tasks = [fetch_one(t) for t in missing_tags[:300]]
    results = await asyncio.gather(*tasks)
    valid_updates = [r for r in results if r is not None]
    if valid_updates:
        for i in range(0, len(valid_updates), 100):
            supabase.table("players").upsert(valid_updates[i:i+100]).execute()
        logger.info(f"Successfully auto-healed {len(valid_updates)} player profiles!")

def fetch_recent_matches(client: Client = None) -> pd.DataFrame:
    """過去のマッチ履歴を全件取得（ページネーション使用）"""
    supabase = client or get_supabase_client()
    logger.info("Fetching recent matches from Supabase...")
    all_data = []
    limit = 1000
    offset = 0
    threshold = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    while True:
        response = supabase.table("match_raw_history").select("*,players!inner(name)").not_.ilike("players.name", "Mock%").gte("match_at", threshold).order("match_id").range(offset, offset + limit - 1).execute()
        data = response.data
        if not data:
            break
        all_data.extend(data)
        if len(data) < limit:
            break
        offset += limit
    
    logger.info(f"Fetched {len(all_data)} match records.")
    return pd.DataFrame(all_data)

def fetch_player_rank_segments(client: Client = None, match_df: pd.DataFrame = None) -> dict:
    """
    プレイヤーを純粋なガチバトルのランク階級（エリート, レジェンド, マスター）のみで分類する。
    - 未同期のプレイヤー、または最終同期から3日以上経過した古いプロファイルを自動再同期（Auto-Refresh / Auto-Heal）
    - Rank 13〜15: Mythic (エリート)
    - Rank 16〜18: Legendary (レジェンド)
    - Rank 19+:    Masters (マスター・プロ)
    """
    supabase = client or get_supabase_client()
    logger.info("Fetching pure ranked ranks (Rank 1-19+) from Supabase...")
    all_players = []
    offset = 0
    limit = 1000
    while True:
        res = supabase.table("players").select("player_tag, updated_at, unlocked_characters").not_.ilike("name", "Mock%").order("player_tag").range(offset, offset + limit - 1).execute()
        if not res.data:
            break
        all_players.extend(res.data)
        if len(res.data) < limit:
            break
        offset += limit
        
    mythic_tags = set()
    legendary_tags = set()
    masters_tags = set()
    fresh_synced_tags = set()
    stale_or_missing_tags = set()
    now_utc = datetime.now(timezone.utc)
    
    for p in all_players:
        tag = str(p.get("player_tag", "")).replace("#", "").upper().strip()
        if not tag:
            continue
        
        chars_json = p.get("unlocked_characters") or {}
        if isinstance(chars_json, str):
            try: chars_json = json.loads(chars_json)
            except: chars_json = {}
            
        ranked_rank = int(chars_json.get("ranked_rank") or 0)
        has_rank_info = (ranked_rank > 0) or ("highest_ranked_name" in chars_json)
        
        # 鮮度チェック: 3日 (259,200秒) 以内に更新されているか
        updated_at_str = p.get("updated_at")
        is_fresh = False
        if updated_at_str and has_rank_info:
            try:
                up_dt = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                if (now_utc - up_dt).total_seconds() < 3 * 86400:
                    is_fresh = True
            except:
                is_fresh = False
                
        if is_fresh:
            fresh_synced_tags.add(tag)
        else:
            stale_or_missing_tags.add(tag)
        
        # 純粋なガチバトルランク（Rank 13+ = エリート, 16+ = レジェンド, 19+ = マスター）
        if ranked_rank >= 19:
            masters_tags.add(tag)
        elif ranked_rank >= 16:
            legendary_tags.add(tag)
        elif ranked_rank >= 13:
            mythic_tags.add(tag)
            
    # Auto-Refresh: マッチ履歴に存在するプレイヤーのうち、古い（3日経過）または未同期のタグを自動再取得
    if match_df is not None and "player_tag" in match_df.columns:
        match_tags = set(match_df["player_tag"].astype(str).str.replace("#", "").str.upper().str.strip().unique())
        need_refresh = list((match_tags - fresh_synced_tags) | (match_tags & stale_or_missing_tags))
        if need_refresh:
            logger.info(f"Detected {len(need_refresh)} active players needing fresh rank verification. Triggering Auto-Refresh...")
            try:
                asyncio.run(auto_sync_missing_player_ranks(need_refresh, supabase))
                # 再同期後に再読み込み
                return fetch_player_rank_segments(supabase, match_df=None)
            except Exception as e:
                logger.warning(f"Auto-refresh skipped or failed: {e}")
            
    all_elite_tags = mythic_tags | legendary_tags | masters_tags
    logger.info(f"Pure Rank Segmentation: Mythic={len(mythic_tags)}, Legendary={len(legendary_tags)}, Masters={len(masters_tags)}, Total Elite+={len(all_elite_tags)}")
    
    return {
        "mythic": mythic_tags,
        "legendary": legendary_tags,
        "masters": masters_tags,
        "all_elite": all_elite_tags
    }

def prepare_observations(df: pd.DataFrame) -> pd.DataFrame:
    """Use decisive, identifiable observations; leave the caller's frame unchanged."""
    df = df.copy()
    if df.empty:
        return df
    df = df[df["result"].isin(["victory", "defeat"])].copy()
    df["hero_used"] = df["hero_used"].fillna("").astype(str).str.lower().str.strip()
    df = df[~df["hero_used"].isin(["", "unknown", "nan"])].copy()
    if "match_id" in df:
        valid = df["match_id"].notna() & df["match_id"].astype(str).str.strip().ne("")
        df = pd.concat([df[valid].drop_duplicates("match_id"), df[~valid]], ignore_index=True)
    return df


def calc_macro_map_stats(df: pd.DataFrame, rank_segments: dict = None):
    """マクロマップ適性（勝率とピック率偏差値）を計算 (ランク帯別ガチバトル専用集計対応)"""
    logger.info("Calculating macro map stats with rank brackets...")
    df = prepare_observations(df)
    if df.empty:
        return []
    
    if rank_segments is None:
        rank_segments = {"mythic": set(), "legendary": set(), "masters": set(), "all_elite": set()}
    
    # マイグレーション互換性: match_type カラムが無い場合は追加
    if "match_type" not in df.columns:
        df["match_type"] = "unknown"

    df["match_type"] = df["match_type"].fillna("unknown")
    df["map_id"] = df["map_id"].fillna("")

    # 古いデータの gachi_ プレフィックスから match_type を復元するフォールバック
    df.loc[(df["match_type"] == "unknown") & (df["map_id"].str.startswith("gachi_")), "match_type"] = "soloRanked"
    df["map_id"] = df["map_id"].str.replace(r"^gachi_", "", regex=True)

    # 勝利フラグを数値化
    df["is_win"] = (df["result"] == "victory").astype(int)
    
    # キャラクターIDを小文字に正規化
    df["hero_used"] = df["hero_used"].str.lower().str.strip()
    df = df[(df["hero_used"] != "unknown") & (df["hero_used"] != "nan")]
    
    # Match ID ユニーク化: 同一試合(match_id)で同一ヒーローの重複ログを排除
    if "match_id" in df.columns:
        valid_match_id = df["match_id"].notna() & df["match_id"].astype(str).str.strip().ne("")
        if valid_match_id.any():
            df = pd.concat([
                df[valid_match_id].drop_duplicates(subset=["match_id", "hero_used"]),
                df[~valid_match_id]
            ], ignore_index=True)

    df["clean_tag"] = df["player_tag"].astype(str).str.replace("#", "").str.upper().str.strip()

    # 集計データセットの構築
    dfs_to_aggregate = [df.copy()]

    # 1. ガチバトル総合 (エリート以上: Mythic, Legendary, Masters, Pro のみ 100% 厳密抽出)
    # ガチバトルの試合のみ（soloRanked / teamRanked / ranked）を対象とするフィルター
    is_ranked_match = df["match_type"].isin(["soloRanked", "teamRanked"])
    
    # 1. ガチバトル総合 (エリート以上: Mythic, Legendary, Masters) かつ ガチバトルの試合のみ
    df_gachi_all = df[is_ranked_match & df["clean_tag"].isin(rank_segments.get("all_elite", set()))].copy()
    if not df_gachi_all.empty:
        df_gachi_all["match_type"] = "gachi"
        dfs_to_aggregate.append(df_gachi_all)

    # 2. エリート帯 (Mythic: Rank 13-15) かつ ガチバトルの試合のみ
    df_gachi_mythic = df[is_ranked_match & df["clean_tag"].isin(rank_segments.get("mythic", set()))].copy()
    if not df_gachi_mythic.empty:
        df_gachi_mythic["match_type"] = "gachi_mythic"
        dfs_to_aggregate.append(df_gachi_mythic)

    # 3. レジェンド帯 (Legendary: Rank 16-18) かつ ガチバトルの試合のみ
    df_gachi_legendary = df[is_ranked_match & df["clean_tag"].isin(rank_segments.get("legendary", set()))].copy()
    if not df_gachi_legendary.empty:
        df_gachi_legendary["match_type"] = "gachi_legendary"
        dfs_to_aggregate.append(df_gachi_legendary)

    # 4. マスター・プロ帯 (Masters & Pro: Rank 19+) かつ ガチバトルの試合のみ
    df_gachi_masters = df[is_ranked_match & df["clean_tag"].isin(rank_segments.get("masters", set()))].copy()
    if not df_gachi_masters.empty:
        df_gachi_masters["match_type"] = "gachi_masters"
        dfs_to_aggregate.append(df_gachi_masters)

    combined_df = pd.concat(dfs_to_aggregate, ignore_index=True)

    # match_type × マップ × ヒーローで集計
    grouped = combined_df.groupby(["match_type", "map_id", "hero_used"]).agg(
        total_matches=("is_win", "size"),
        total_wins=("is_win", "sum")
    ).reset_index()
    
    # 勝率の計算
    grouped["win_rate"] = (grouped["total_wins"] / grouped["total_matches"]) * 100.0
    
    # ピック率偏差値の計算 (マップ内での出現回数の偏差値)
    counts = grouped.groupby(["match_type", "map_id"])["total_matches"]
    mean = counts.transform("mean")
    std = counts.transform("std").replace(0, float("nan"))
    grouped["pick_rate_deviation"] = (50.0 + 10.0 * (grouped["total_matches"] - mean) / std).fillna(50.0)

    now_str = datetime.now(timezone.utc).isoformat()
    
    stats_list = []
    for _, row in grouped.iterrows():
        stats_list.append({
            "match_type": row.get("match_type", "unknown"),
            "map_id": row["map_id"],
            "character_id": row["hero_used"],
            "total_wins": int(row["total_wins"]),
            "total_matches": int(row["total_matches"]),
            "win_rate": float(round(row["win_rate"], 2)),
            "pick_rate_deviation": float(round(row["pick_rate_deviation"], 2)),
            "updated_at": now_str
        })
        
    return stats_list

def calc_dynamic_counters(df: pd.DataFrame):
    """対面相性（カウンター係数）を計算 (Match ID ユニーク化対応)"""
    logger.info("Calculating dynamic counters...")
    df = prepare_observations(df)
    if "mode" in df:
        df = df[df["mode"].isin(["brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"])].copy()
    if df.empty:
        return []
        
    # 全体のヒーロー別平均勝率を計算
    df["is_win"] = (df["result"] == "victory").astype(int)
    df["hero_used"] = df["hero_used"].str.lower()
    global_win_rates = df.groupby("hero_used")["is_win"].mean().to_dict()
    
    # hero_used (char_a) と opponents (char_b) のペアを展開
    records = []
    for _, row in df.iterrows():
        match_id = str(row.get("match_id", "") or "").strip()
        char_a = str(row.get("hero_used", "") or "").lower()
        is_win = row["is_win"]
        
        # 敵チームとのマッチアップ
        opponents = row.get("opponents", [])
        if isinstance(opponents, str): # 万が一文字列化されていた場合
            import ast
            try:
                opponents = ast.literal_eval(opponents)
            except:
                opponents = []
                
        for char_b in opponents:
            char_b = str(char_b).lower()
            if not char_a or not char_b or char_a == "unknown" or char_b == "unknown":
                continue
            records.append({
                "match_id": match_id,
                "char_a": char_a,
                "char_b": char_b,
                "is_win": is_win
            })
            # 逆視点も追加 (対戦相手から見た自分)
            records.append({
                "match_id": match_id,
                "char_a": char_b,
                "char_b": char_a,
                "is_win": 1 - is_win
            })

    if not records:
        return []
        
    pairs_df = pd.DataFrame(records)

    # Match ID ユニーク化: 同一試合(match_id)における同一対戦ペア(char_a, char_b)の重複カウントを徹底排除
    if "match_id" in pairs_df.columns:
        valid_match_id = pairs_df["match_id"].astype(str).str.strip().str.len() > 0
        if valid_match_id.any():
            pairs_df = pd.concat([
                pairs_df[valid_match_id].drop_duplicates(subset=["match_id", "char_a", "char_b"]),
                pairs_df[~valid_match_id]
            ], ignore_index=True)

    grouped = pairs_df.groupby(["char_a", "char_b"]).agg(
        match_count=("is_win", "count"),
        win_count=("is_win", "sum")
    ).reset_index()
    
    counter_list = []
    for _, row in grouped.iterrows():
        char_a = row["char_a"]
        char_b = row["char_b"]
        m_count = int(row["match_count"])
        w_count = int(row["win_count"])
        
        # "unknown" は除外
        if char_a == "unknown" or char_b == "unknown":
            continue
            
        # 相性係数の計算
        if m_count < 1:
            coef = 0.0
        else:
            base_wr = global_win_rates.get(char_a, 0.5)
            actual_wr = w_count / m_count
            coef = float(round(actual_wr - base_wr, 4))
            
        counter_list.append({
            "char_a": char_a,
            "char_b": char_b,
            "match_count": m_count,
            "win_count": w_count,
            "counter_coefficient": coef
        })
        
    return counter_list

def calc_dynamic_synergies(df: pd.DataFrame):
    """味方ペア共起シナジー（実戦勝率＆リフト値）を計算 (Match ID ユニーク化対応)"""
    logger.info("Calculating dynamic teammate synergies...")
    df = prepare_observations(df)
    if "mode" in df:
        df = df[df["mode"].isin(["brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"])].copy()
    if df.empty:
        return []
        
    # 全体のヒーロー別平均勝率を計算
    df["is_win"] = (df["result"] == "victory").astype(int)
    df["hero_used"] = df["hero_used"].str.lower()
    global_win_rates = df.groupby("hero_used")["is_win"].mean().to_dict()
    
    records = []
    for _, row in df.iterrows():
        match_id = str(row.get("match_id", "") or "").strip()
        char_a = str(row.get("hero_used", "") or "").lower()
        is_win = row["is_win"]
        
        allies = row.get("allies", [])
        if isinstance(allies, str):
            import ast
            try:
                allies = ast.literal_eval(allies)
            except:
                allies = []
                
        for char_b in allies:
            char_b = str(char_b).lower()
            if not char_a or not char_b or char_a == "unknown" or char_b == "unknown" or char_a == char_b:
                continue
            records.append({
                "match_id": match_id,
                "char_a": char_a,
                "char_b": char_b,
                "is_win": is_win
            })
            # 双方向ペアとして追加
            records.append({
                "match_id": match_id,
                "char_a": char_b,
                "char_b": char_a,
                "is_win": is_win
            })

    if not records:
        return []
        
    pairs_df = pd.DataFrame(records)

    # Match ID ユニーク化: 同一試合における同一ペア(char_a, char_b)の重複カウントを排除
    if "match_id" in pairs_df.columns:
        valid_match_id = pairs_df["match_id"].astype(str).str.strip().str.len() > 0
        if valid_match_id.any():
            pairs_df = pd.concat([
                pairs_df[valid_match_id].drop_duplicates(subset=["match_id", "char_a", "char_b"]),
                pairs_df[~valid_match_id]
            ], ignore_index=True)

    grouped = pairs_df.groupby(["char_a", "char_b"]).agg(
        match_count=("is_win", "count"),
        win_count=("is_win", "sum")
    ).reset_index()
    
    synergy_list = []
    for _, row in grouped.iterrows():
        char_a = row["char_a"]
        char_b = row["char_b"]
        m_count = int(row["match_count"])
        w_count = int(row["win_count"])
        
        if char_a == "unknown" or char_b == "unknown" or m_count < 1:
            continue
            
        pair_wr = (w_count / m_count) * 100.0
        wr_a = global_win_rates.get(char_a, 0.5) * 100.0
        wr_b = global_win_rates.get(char_b, 0.5) * 100.0
        expected_wr = (wr_a + wr_b) / 2.0
        raw_lift = pair_wr - expected_wr
        
        # ベイズ縮小（データ数に応じた信頼度平滑化）
        shrinkage = m_count / (m_count + 5.0)
        regressed_lift = float(round(raw_lift * shrinkage, 2))
        
        synergy_list.append({
            "char_a": char_a,
            "char_b": char_b,
            "match_count": m_count,
            "win_count": w_count,
            "win_rate": float(round(pair_wr, 2)),
            "lift": regressed_lift
        })
        
    return synergy_list

def run_daily_calculation(client: Client = None):
    """
    マッチ履歴を集計し、macro_map_stats, dynamic_counters, dynamic_synergies を最新化する関数。
    クローラー完了時やcronバッチから呼び出される。
    """
    supabase = client or get_supabase_client()
    logger.info("Starting Daily Calculation Batch...")
    df = fetch_recent_matches(supabase)
    
        
    rank_segments = fetch_player_rank_segments(supabase, match_df=df)
    macro_stats = calc_macro_map_stats(df, rank_segments)
    dynamic_counters = calc_dynamic_counters(df)
    dynamic_synergies = calc_dynamic_synergies(df)
    
    # Publish all derived tables in one transaction, including removal of expired rows.
    # Requires the analytics_snapshot_and_clubs migration; fail closed if absent.
    now = datetime.now(timezone.utc).isoformat()
    for row in dynamic_synergies:
        row["updated_at"] = now
    supabase.rpc("replace_analytics_snapshot", {
        "macro_rows": macro_stats,
        "counter_rows": dynamic_counters,
        "synergy_rows": dynamic_synergies,
    }).execute()

    # キャッシュを即座に破棄して最新データをAPIに反映
    try:
        from app.routers.meta import clear_meta_cache
        clear_meta_cache()
        logger.info("API meta cache cleared and refreshed successfully.")
    except Exception as e:
        logger.warning(f"Failed to clear meta cache: {e}")

    logger.info("Daily Calculation Batch completed successfully.")
    return {
        "macro_stats_count": len(macro_stats),
        "dynamic_counters_count": len(dynamic_counters),
        "dynamic_synergies_count": len(dynamic_synergies)
    }

def main():
    run_daily_calculation()

if __name__ == "__main__":
    main()
