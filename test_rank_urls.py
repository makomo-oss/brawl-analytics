import requests
import json

urls_to_test = [
    "https://cdn.brawlify.com/ranks/regular/1.png",
    "https://cdn.brawlify.com/ranks/1.png",
    "https://cdn.brawlify.com/rank/1.png",
    "https://cdn.brawlify.com/ranks/borderless/1.png"
]

for url in urls_to_test:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
        if r.status_code == 200:
            print(f"Content-Type: {r.headers.get('Content-Type')}")
            print(f"Content-Length: {r.headers.get('Content-Length')}")
    except Exception as e:
        print(e)
