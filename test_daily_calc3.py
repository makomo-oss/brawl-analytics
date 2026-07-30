import sys
import os

os.environ["SUPABASE_URL"] = "http://dummy"
os.environ["SUPABASE_KEY"] = "dummy"

sys.path.append(os.path.abspath("backend"))

import pandas as pd
import numpy as np
from app.scripts.daily_calc import calc_macro_map_stats

data = [
    {
        "match_id": "m1",
        "match_type": "ranked",
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
        "opponents": np.nan
    },
    {
        "match_id": "m3",
        "match_type": "unknown",
        "map_id": np.nan,
        "result": "victory",
        "hero_used": "Spike",
        "allies": "['Crow']",
        "opponents": "invalid string"
    }
]

df = pd.DataFrame(data)

try:
    stats = calc_macro_map_stats(df)
    print("Success! Generated stats length:", len(stats))
    import json
    for s in stats:
        print(s)
except Exception as e:
    import traceback
    traceback.print_exc()
