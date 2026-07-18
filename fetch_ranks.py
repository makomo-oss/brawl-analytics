import urllib.request
import json

try:
    url = "https://api.brawlapi.com/v1/ranks"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    data = json.loads(response.read())
    
    print(f"Total ranks: {len(data)}")
    # 最初の数個と最後を表示
    for key, rank in list(data.items())[:3] + list(data.items())[-3:]:
        print(f"Key: {key}, Name: {rank.get('name')}, Image: {rank.get('imageUrl')}")
except Exception as e:
    print("Error:", e)
