import os
from supabase import create_client
import json

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
    res = supabase.table("macro_map_stats").select("map_id").execute()
    maps = set()
    for r in res.data:
        m = r.get("map_id")
        if m:
            maps.add(m)
    print("ALL MAPS:", sorted(list(maps)))
except Exception as e:
    print("Error:", e)
