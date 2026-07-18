import urllib.request
import json

try:
    url = "https://api.brawlapi.com/v1/brawlers"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    data = json.loads(response.read())
    
    res = {}
    for b in data['list']:
        name = b['name']
        img = b.get('imageUrl', b.get('imageUrl2', ''))
        res[name.lower()] = {
            'id': name,
            'image': img
        }
    with open('brawler_api_data.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"Successfully fetched {len(res)} brawlers.")
except Exception as e:
    print("Error:", e)
