import requests
import json

try:
    # ローカルのバックエンドサーバーにリクエストして生データを取得
    response = requests.get("http://localhost:8000/player/V99J0CCV8/dashboard")
    if response.status_code == 200:
        data = response.json()
        recent_battles = data.get("recent_battles", [])
        
        # ranked 関連のバトルを探す
        ranked_battles = [b for b in recent_battles if b.get("type") in ("ranked", "soloRanked", "teamRanked")]
        
        print(f"Total ranked battles found: {len(ranked_battles)}")
        if ranked_battles:
            # 最初の1つの raw_battle を詳しく見る
            print(json.dumps(ranked_battles[0].get("raw_battle", {}), indent=2, ensure_ascii=False))
        else:
            print("No ranked battles. Let's dump a normal one.")
            if recent_battles:
                print(json.dumps(recent_battles[0].get("raw_battle", {}), indent=2, ensure_ascii=False))
    else:
        print(f"Failed: {response.status_code}")
except Exception as e:
    print(e)
