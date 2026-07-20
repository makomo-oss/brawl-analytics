import sys
import os
import json

os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "dummy_key"

try:
    from app.routers.meta import get_tier_list
    print("Import successful!")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)

class MockDB:
    def table(self, name):
        return self
    def select(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
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
                        "char_b": "nita",
                        "win_count": 2,
                        "match_count": 3,
                        "char_a": "shelly",
                        "counter_coefficient": 1.2
                    }
                ]
        return Res()
    def eq(self, *args, **kwargs):
        return self

import app.routers.meta
app.routers.meta.get_db = lambda: MockDB()

try:
    print("Running get_tier_list...")
    res = get_tier_list()
    print("Success!")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
