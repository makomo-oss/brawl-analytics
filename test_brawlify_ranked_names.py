import requests

names = [
    "Bronze", "Bronze_1", "Bronze_I", "bronze", "bronze_1", 
    "Mythic", "Mythic_1", "Mythic_I", "mythic", "mythic_1",
    "Mythic1", "mythic1", "Legendary", "legendary", "Masters", "masters"
]

base_urls = [
    "https://cdn.brawlify.com/ranked/regular/{}.png",
    "https://cdn.brawlify.com/ranked/tiered/{}.png",
    "https://cdn.brawlify.com/ranked/{}.png",
    "https://cdn.brawlify.com/rank/{}.png"
]

for base in base_urls:
    print(f"Testing {base}")
    for name in names:
        url = base.format(name)
        try:
            r = requests.head(url, headers={'User-Agent': 'Mozilla/5.0'})
            if r.status_code == 200:
                print(f"SUCCESS: {url}")
        except:
            pass
