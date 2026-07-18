import requests

urls = [
    "https://cdn.brawlify.com/game-modes/regular/48000000.png",  # これは取れているはず
    "https://cdn.brawlify.com/rank/Legendary.png",
    "https://cdn.brawlstats.com/rank-icons/16.png",
    "https://cdn.brawlstats.com/pl-icons/16.png",
    "https://cdn.brawlstats.com/assets/rank-icons/16.png"
]

for url in urls:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
    except Exception as e:
        print(f"{url} : {e}")
