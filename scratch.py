import os
from supabase import create_client

env_path = "c:\\MyFolder\\projects\\brawl-analytics\\backend\\.env"
with open(env_path, "r") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"): continue
        if "=" in line:
            key, val = line.split("=", 1)
            os.environ[key] = val

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

try:
    res = supabase.table("macro_map_stats").select("match_type, map_id").execute()
    types_macro = {}
    maps = set()
    for r in res.data:
        t = r.get("match_type")
        types_macro[t] = types_macro.get(t, 0) + 1
        maps.add(r.get("map_id"))
    print("macro_map_stats match_types:", types_macro)
    print("macro_map_stats some maps:", list(maps)[:5])
except Exception as e:
    print("Error fetching macro_map_stats:", e)
