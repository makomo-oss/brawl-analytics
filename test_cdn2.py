import requests

urls = [
    "https://media.brawltime.ninja/rank/16.png",
    "https://media.brawltime.ninja/ranks/16.png",
    "https://media.brawltime.ninja/badges/16.png",
    "https://cdn.brawlify.com/ranks/16.png",
    "https://cdn.brawlify.com/rank/Mythic.png",
    "https://media.brawltime.ninja/assets/images/ranks/16.png"
]

for url in urls:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
    except Exception as e:
        print(f"{url} : {e}")
