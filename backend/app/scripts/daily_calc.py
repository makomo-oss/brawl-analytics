import os
import sys
import logging
from datetime import datetime, timezone
import pandas as pd
from supabase import create_client, Client

# プロジェクトルートをパスに追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("Supabase credentials not found. Exiting.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_recent_matches():
    """過去30日間のマッチ履歴を取得"""
    logger.info("Fetching recent matches from Supabase...")
    # 全件取得 (ページネーションを使用)
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
    
    # 勝利フラグを数値化
    df["is_win"] = (df["result"] == "victory").astype(int)
    
    # キャラクターIDを小文字に正規化（APIは大文字で返すため）
    df["hero_used"] = df["hero_used"].str.lower()
    
    # "unknown" のデータは集計対象外
    df = df[df["hero_used"] != "unknown"]
    
    # マップ × ヒーローで集計
    grouped = df.groupby(["map_id", "hero_used"]).agg(
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

    grouped = grouped.groupby("map_id").apply(calc_deviation).reset_index(drop=True)
    
    now_str = datetime.now(timezone.utc).isoformat()
    
    stats_list = []
    for _, row in grouped.iterrows():
        stats_list.append({
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
    """対面相性（カウンター係数）を計算"""
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
        char_a = row["hero_used"]
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
            records.append({
                "char_a": char_a,
                "char_b": char_b,
                "is_win": is_win
            })
            # 逆視点も追加 (対戦相手から見た自分)
            records.append({
                "char_a": char_b,
                "char_b": char_a,
                "is_win": 1 - is_win
            })

    if not records:
        return []
        
    pairs_df = pd.DataFrame(records)
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
        # サービス開始直後はデータが少ないため、閾値を50から1試合に緩和
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

def main():
    logger.info("Starting Daily Calculation Batch...")
    df = fetch_recent_matches()
    
    if df.empty:
        logger.info("No data found. Exiting.")
        return
        
    macro_stats = calc_macro_map_stats(df)
    dynamic_counters = calc_dynamic_counters(df)
    
    # Upsert macro_map_stats
    if macro_stats:
        logger.info(f"Upserting {len(macro_stats)} macro_map_stats records...")
        # 1000件ずつ分割してUpsert
        for i in range(0, len(macro_stats), 1000):
            batch = macro_stats[i:i+1000]
            supabase.table("macro_map_stats").upsert(batch).execute()
            
    # Upsert dynamic_counters
    if dynamic_counters:
        logger.info(f"Upserting {len(dynamic_counters)} dynamic_counters records...")
        for i in range(0, len(dynamic_counters), 1000):
            batch = dynamic_counters[i:i+1000]
            supabase.table("dynamic_counters").upsert(batch).execute()
            
    logger.info("Daily Calculation Batch completed successfully.")

if __name__ == "__main__":
    main()
