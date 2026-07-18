import requests
import json
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
BRAWL_STARS_TOKEN = os.environ.get("BRAWL_STARS_TOKEN")

tag = "V99J0CCV8"
url = f"https://api.brawlstars.com/v1/players/%23{tag}"
headers = {"Authorization": f"Bearer {BRAWL_STARS_TOKEN}"}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    data = response.json()
    # rank 関連のキーを探す
    for key, value in data.items():
        if "rank" in key.lower() or "league" in key.lower() or "score" in key.lower():
            print(f"{key}: {value}")
    
    print("\n--- All keys ---")
    print(list(data.keys()))
else:
    print(f"Failed to fetch: {response.status_code} {response.text}")
