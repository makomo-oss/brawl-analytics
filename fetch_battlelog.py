import urllib.request
import json
import os

try:
    # Use a known tag like V99J0CCV8
    tag = "V99J0CCV8"
    url = f"https://api.brawlapi.com/v1/player/{tag}/battlelog"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    data = json.loads(response.read())
    
    # ranked (soloRanked or teamRanked) を探して構造を出力
    for item in data.get('items', []):
        battle = item.get('battle', {})
        if battle.get('type') in ['soloRanked', 'teamRanked']:
            print("--- Ranked Battle Found ---")
            print(json.dumps(item, indent=2, ensure_ascii=False))
            break
            
    # 時間のフォーマット確認用に最初の要素も出力
    print("--- First Battle Time Format ---")
    if data.get('items'):
        print(data['items'][0].get('battleTime'))
        
except Exception as e:
    print("Error:", e)
