import os
from backend.app.database import get_db

def test():
    db = get_db()
    
    # Check if there are any ranked matches in raw history
    res_raw = db.table('match_raw_history').select('map_id').like('map_id', 'gachi_%').limit(5).execute()
    print("Raw history gachi matches:", res_raw.data)
    
    # Check if there are any ranked matches in macro map stats
    res_macro = db.table('macro_map_stats').select('map_id').like('map_id', 'gachi_%').limit(5).execute()
    print("Macro map stats gachi matches:", res_macro.data)

if __name__ == "__main__":
    test()
