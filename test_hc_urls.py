import requests

urls = [
    "https://cdn.brawlify.com/hypercharges/23000613.png",
    "https://cdn.brawlify.com/hypercharges/regular/23000613.png",
    "https://cdn.brawlify.com/hypercharges/borderless/23000613.png",
    "https://cdn.brawlify.com/hypercharge/23000613.png"
]

for url in urls:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
    except Exception as e:
        print(f"{url} : {e}")
