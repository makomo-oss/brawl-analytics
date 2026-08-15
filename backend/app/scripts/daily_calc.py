import os
import sys
import logging
from datetime import datetime, timezone
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

# プロジェクトルートとbackendをパスに追加
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(backend_dir)

load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv(os.path.join(os.path.dirname(backend_dir), ".env"))

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

def fetch_recent_matches(client: Client = None) -> pd.DataFrame:
    """過去のマッチ履歴を全件取得（ページネーション使用）"""
    supabase = client or get_supabase_client()
    logger.info("Fetching recent matches from Supabase...")
    all_data = []
    limit = 1000
    offset = 0
    while True:
        response = supabase.table("match_raw_history").select("*").range(offset, offset + limit - 1).execute()
        data = response.data
        if not data:
            break
        all_data.extend(data)
        if len(data) < limit:
            break
        offset += limit
    
    logger.info(f"Fetched {len(all_data)} match records.")
    return pd.DataFrame(all_data)

def calc_macro_map_stats(df: pd.DataFrame):
    """マクロマップ適性（勝率とピック率偏差値）を計算"""
    logger.info("Calculating macro map stats...")
    if df.empty:
        return []
    
    # マイグレーション互換性: match_type カラムが無い場合は追加
    if "match_type" not in df.columns:
        df["match_type"] = "unknown"

    # null(NaN)を空配列や空文字列に置換して安全にする
    df["match_type"] = df["match_type"].fillna("unknown")
    df["map_id"] = df["map_id"].fillna("")

    # 古いデータの gachi_ プレフィックスから match_type を復元するフォールバック
    df.loc[(df["match_type"] == "unknown") & (df["map_id"].str.startswith("gachi_")), "match_type"] = "soloRanked"
    df["map_id"] = df["map_id"].str.replace(r"^gachi_", "", regex=True)

    # 勝利フラグを数値化
    df["is_win"] = (df["result"] == "victory").astype(int)
    
    # キャラクターIDを小文字に正規化（APIは大文字で返すため）
    df["hero_used"] = df["hero_used"].str.lower()
    
    # "unknown" または "nan" のデータは集計対象外
    df = df[(df["hero_used"] != "unknown") & (df["hero_used"] != "nan")]
    
    # Match ID ユニーク化: 同一試合(match_id)で同一ヒーローの重複ログを排除
    if "match_id" in df.columns:
        valid_match_id = df["match_id"].astype(str).str.strip().str.len() > 0
        if valid_match_id.any():
            df = pd.concat([
                df[valid_match_id].drop_duplicates(subset=["match_id", "hero_used"]),
                df[~valid_match_id]
            ], ignore_index=True)

    # match_type × マップ × ヒーローで集計
    grouped = df.groupby(["match_type", "map_id", "hero_used"]).agg(
        total_matches=("match_id", "count"),
        total_wins=("is_win", "sum")
    ).reset_index()
    
    # 勝率の計算
    grouped["win_rate"] = (grouped["total_wins"] / grouped["total_matches"]) * 100.0
    
    # ピック率偏差値の計算 (マップ内での出現回数の偏差値)
    def calc_deviation(group):
        mean = group["total_matches"].mean()
        std = group["total_matches"].std()
        if pd.isna(std) or std == 0:
            group["pick_rate_deviation"] = 50.0
        else:
            group["pick_rate_deviation"] = 50.0 + 10.0 * (group["total_matches"] - mean) / std
        return group

    grouped = grouped.groupby(["match_type", "map_id"]).apply(calc_deviation).reset_index(drop=True)
    
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

def run_daily_calculation(client: Client = None):
    """
    マッチ履歴を集計し、macro_map_stats と dynamic_counters を最新化する関数。
    クローラー完了時やcronバッチから呼び出される。
    """
    supabase = client or get_supabase_client()
    logger.info("Starting Daily Calculation Batch...")
    df = fetch_recent_matches(supabase)
    
    if df.empty:
        logger.info("No data found. Exiting.")
        return {"macro_stats_count": 0, "dynamic_counters_count": 0}
        
    macro_stats = calc_macro_map_stats(df)
    dynamic_counters = calc_dynamic_counters(df)
    
    # Upsert macro_map_stats
    if macro_stats:
        logger.info(f"Upserting {len(macro_stats)} macro_map_stats records...")
        # 1000件ずつ分割してUpsert
        for i in range(0, len(macro_stats), 1000):
            batch = macro_stats[i:i+1000]
            try:
                supabase.table("macro_map_stats").upsert(batch).execute()
            except Exception as e:
                logger.warning(f"Upsert macro_map_stats failed, trying fallback without match_type: {e}")
                fallback_batch = [{k: v for k, v in item.items() if k != "match_type"} for item in batch]
                supabase.table("macro_map_stats").upsert(fallback_batch).execute()
            
    # Upsert dynamic_counters
    if dynamic_counters:
        logger.info(f"Upserting {len(dynamic_counters)} dynamic_counters records...")
        for i in range(0, len(dynamic_counters), 1000):
            batch = dynamic_counters[i:i+1000]
            supabase.table("dynamic_counters").upsert(batch).execute()
            
    logger.info("Daily Calculation Batch completed successfully.")
    return {
        "macro_stats_count": len(macro_stats),
        "dynamic_counters_count": len(dynamic_counters)
    }

def main():
    run_daily_calculation()

if __name__ == "__main__":
    main()
