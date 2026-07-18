import requests

urls = [
    "https://media.brawltime.ninja/ranks/1.png",
    "https://media.brawltime.ninja/ranks/10.png",
    "https://media.brawltime.ninja/ranks/19.png",
    "https://media.brawltime.ninja/ranks/Bronze.png",
    "https://media.brawltime.ninja/ranks/Diamond.png"
]

for url in urls:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
    except Exception as e:
        print(f"{url} : {e}")
