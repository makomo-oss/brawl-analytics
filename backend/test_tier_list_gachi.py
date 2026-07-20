import sys
import os

os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "dummy_key"

class MockDB:
    def table(self, name):
        return self
    def select(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
        return self
    def eq(self, *args, **kwargs):
        return self
    def execute(self):
        class Res:
            def __init__(self):
                self.count = 1000
                self.data = [
                    {
                        "character_id": "shelly",
                        "total_wins": 5,
                        "total_matches": 10,
                        "pick_rate_deviation": 55.0,
                        "map_id": "gachi_some_map"
                    },
                    {
                        "character_id": "nita",
                        "total_wins": 0,
                        "total_matches": 0,
                        "pick_rate_deviation": 50.0,
                        "map_id": "gachi_other_map"
                    }
                ]
        return Res()

import app.routers.meta
app.routers.meta.get_db = lambda: MockDB()

try:
    print("Running get_tier_list with type=gachi...")
    res = app.routers.meta.get_tier_list(type="gachi")
    print("Success!")
    print(res["tiers"])
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
