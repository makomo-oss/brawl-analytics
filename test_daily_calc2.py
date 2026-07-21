import pandas as pd
import numpy as np
import ast

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
        "match_type": np.nan,  # NaN
        "map_id": "Gem Fort",
        "result": "defeat",
        "hero_used": "Colt",
        "allies": None,
        "opponents": None
    }
]

df = pd.DataFrame(data)

if "match_type" not in df.columns:
    df["match_type"] = "unknown"

# isnaを埋める処理がない場合どうなるか
expanded_records = []
for _, row in df.iterrows():
    match_type = row.get("match_type")
    if pd.isna(match_type):
        match_type = "unknown"
        
    map_id = row.get("map_id")
    if pd.isna(map_id):
        map_id = ""
        
    match_id = row.get("match_id", "")
    is_win = 1 if row.get("result") == "victory" else 0
    
    hero_used = str(row.get("hero_used", "unknown")).lower()
    if hero_used != "unknown":
        expanded_records.append({
            "match_id": match_id,
            "match_type": match_type,
            "map_id": map_id,
            "hero_used": hero_used,
            "is_win": is_win
        })
        
    allies = row.get("allies")
    if pd.isna(allies) if not isinstance(allies, (list, np.ndarray, pd.Series)) else False:
        allies = []
    elif isinstance(allies, str):
        try: allies = ast.literal_eval(allies)
        except: allies = []
    if allies is None: allies = []
    
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

expanded_df = pd.DataFrame(expanded_records)
print(expanded_df)

grouped = expanded_df.groupby(["match_type", "map_id", "hero_used"]).agg(
    total_matches=("match_id", "count"),
    total_wins=("is_win", "sum")
).reset_index()

print("--- Grouped ---")
print(grouped)
