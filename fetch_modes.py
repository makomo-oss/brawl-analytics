import urllib.request
import json

try:
    url = "https://api.brawlapi.com/v1/gamemodes"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req)
    data = json.loads(response.read())
    
    for mode in data['list']:
        name = mode['name']
        img = mode.get('imageUrl', mode.get('imageUrl2', ''))
        print(f"Name: {name}, Image: {img}")
except Exception as e:
    print("Error:", e)
