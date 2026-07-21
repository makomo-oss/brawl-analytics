import pandas as pd
import numpy as np

# モックデータ
data = [
    {
        "match_id": "m1",
        "match_type": "soloRanked",
        "map_id": "Mined Out",
        "result": "victory",
        "hero_used": "Shelly",
        "allies": ["Colt", "Bull"],
        "opponents": ["Piper", "Spike", "Crow"]
    },
    {
        "match_id": "m2",
        "match_type": "unknown",
        "map_id": "gachi_Gem Fort",
        "result": "defeat",
        "hero_used": "Colt",
        "allies": "['Shelly']",
        "opponents": "['Spike']"
    }
]

df = pd.DataFrame(data)

# daily_calc.py のロジックをシミュレーション
if "match_type" not in df.columns:
    df["match_type"] = "unknown"
df.loc[(df["match_type"] == "unknown") & (df["map_id"].str.startswith("gachi_")), "match_type"] = "soloRanked"
df["map_id"] = df["map_id"].str.replace(r"^gachi_", "", regex=True)
df["is_win"] = (df["result"] == "victory").astype(int)

expanded_records = []
import ast
for _, row in df.iterrows():
    match_type = row.get("match_type", "unknown")
    map_id = row.get("map_id", "")
    match_id = row.get("match_id", "")
    is_win = row["is_win"]
    
    # 自分
    hero_used = str(row.get("hero_used", "unknown")).lower()
    if hero_used != "unknown":
        expanded_records.append({
            "match_id": match_id,
            "match_type": match_type,
            "map_id": map_id,
            "hero_used": hero_used,
            "is_win": is_win
        })
        
    # 味方
    allies = row.get("allies", [])
    if isinstance(allies, str):
        try: allies = ast.literal_eval(allies)
        except: allies = []
    elif pd.isna(allies).all() if isinstance(allies, (pd.Series, np.ndarray)) else pd.isna(allies):
        allies = []
    for ally in allies:
        ally = str(ally).lower()
        if ally != "unknown":
            expanded_records.append({
                "match_id": match_id,
                "match_type": match_type,
                "map_id": map_id,
                "hero_used": ally,
                "is_win": is_win
            })
            
    # 敵
    opponents = row.get("opponents", [])
    if isinstance(opponents, str):
        try: opponents = ast.literal_eval(opponents)
        except: opponents = []
    elif pd.isna(opponents).all() if isinstance(opponents, (pd.Series, np.ndarray)) else pd.isna(opponents):
        opponents = []
    for opponent in opponents:
        opponent = str(opponent).lower()
        if opponent != "unknown":
            expanded_records.append({
                "match_id": match_id,
                "match_type": match_type,
                "map_id": map_id,
                "hero_used": opponent,
                "is_win": 1 - is_win
            })

expanded_df = pd.DataFrame(expanded_records)
print("--- Expanded DF ---")
print(expanded_df)

grouped = expanded_df.groupby(["match_type", "map_id", "hero_used"]).agg(
    total_matches=("match_id", "count"),
    total_wins=("is_win", "sum")
).reset_index()

print("--- Grouped DF ---")
print(grouped)
