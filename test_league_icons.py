import requests

# BrawlAPIのイベントや他のエンドポイントにアイコンがないか探す
urls_to_test = [
    "https://api.brawlapi.com/v1/icons",
    "https://api.brawlapi.com/v1/league",
]

for url in urls_to_test:
    try:
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            if 'list' in data:
                print(f"Items found: {len(data['list'])}")
                print(data['list'][0])
            else:
                print(list(data.keys()))
    except Exception as e:
        print(e)
