import requests
import json
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
BRAWL_STARS_TOKEN = os.environ.get("BRAWL_STARS_TOKEN")

tag = "V99J0CCV8"
url = f"https://api.brawlstars.com/v1/players/%23{tag}/battlelog"
headers = {"Authorization": f"Bearer {BRAWL_STARS_TOKEN}"}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    data = response.json()
    items = data.get("items", [])
    
    print(f"Total battles fetched: {len(items)}")
    
    # 時間のフォーマット確認
    if items:
        print("Time format example:", items[0].get("battleTime"))
        
    # ranked/soloRanked/teamRanked に関連するバトルのデータを抽出して確認
    ranked_battles = [item for item in items if item.get("battle", {}).get("type") in ("ranked", "soloRanked", "teamRanked")]
    
    if ranked_battles:
        print("\nFound ranked battle!")
        # 表示してみる
        print(json.dumps(ranked_battles[0], indent=2, ensure_ascii=False))
    else:
        print("\nNo ranked battles found in this log. Let's dump the first one instead.")
        print(json.dumps(items[0], indent=2, ensure_ascii=False))
else:
    print(f"Failed to fetch: {response.status_code} {response.text}")
