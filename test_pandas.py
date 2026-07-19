import pandas as pd

def test_logic():
    # モックデータ
    data = [
        {
            "match_id": "test_1",
            "player_tag": "A",
            "match_at": "2023-10-01T00:00:00",
            "mode": "brawlBall",
            "map_id": "map_1",
            "result": "victory",
            "hero_used": "shelly",
            "allies": ["colt", "bull"],
            "opponents": ["nita", "el_primo", "poco"]
        },
        {
            "match_id": "test_2",
            "player_tag": "A",
            "match_at": "2023-10-01T00:10:00",
            "mode": "brawlBall",
            "map_id": "map_1",
            "result": "defeat",
            "hero_used": "shelly",
            "allies": ["colt", "bull"],
            "opponents": ["nita", "el_primo", "poco"]
        }
    ]
    df = pd.DataFrame(data)
    
    from backend.app.scripts.daily_calc import calc_macro_map_stats, calc_dynamic_counters
    
    macro = calc_macro_map_stats(df)
    print("Macro:", macro)
    
    dynamic = calc_dynamic_counters(df)
    print("Dynamic:", dynamic)

if __name__ == "__main__":
    test_logic()
