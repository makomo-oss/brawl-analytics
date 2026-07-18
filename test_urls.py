import requests

urls_to_test = [
    "https://cdn.brawlify.com/rank/Legendary.png",
    "https://cdn.brawlify.com/rank/19.png",
    "https://cdn.brawlify.com/pl/19.png",
    "https://cdn.brawlify.com/league/19.png",
    "https://cdn-old.brawlify.com/rank/Legendary.png",
]

for url in urls_to_test:
    res = requests.head(url)
    print(f"{url} -> {res.status_code}")
