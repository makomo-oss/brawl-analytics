import requests
import json

try:
    # ローカルのバックエンドサーバーに同期をリクエスト（同期すると最新データになる可能性）
    requests.get("http://localhost:8000/player/V99J0CCV8/sync")
    
    # ダッシュボードのエンドポイントを叩く
    response = requests.get("http://localhost:8000/player/V99J0CCV8/dashboard")
    if response.status_code == 200:
        data = response.json()
        profile = data.get("profile", {})
        print("Profile data from backend:")
        print(json.dumps(profile, indent=2, ensure_ascii=False))
        
    else:
        print(f"Failed: {response.status_code}")
except Exception as e:
    print(e)
