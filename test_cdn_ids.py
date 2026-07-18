import requests

urls = [
    # Brawler ID
    "https://cdn.brawlify.com/brawler/16000000.png",
    # Gadget ID
    "https://cdn.brawlify.com/gadgets/23000255.png",
    # Star Power ID
    "https://cdn.brawlify.com/star-powers/23000076.png",
    # Gear ID
    "https://cdn.brawlify.com/gears/62000002.png"
]

for url in urls:
    try:
        r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
        print(f"{url} : {r.status_code}")
    except Exception as e:
        print(f"{url} : {e}")
