import requests
import json

titles = ["File:Ranked_Bronze_1.png", "File:Ranked_Silver_1.png", "File:Ranked_Gold_1.png", "File:Ranked_Diamond_1.png", "File:Ranked_Mythic_1.png", "File:Ranked_Legendary_1.png", "File:Ranked_Masters.png"]
url = "https://brawlstars.fandom.com/api.php"

for title in titles:
    params = {
        "action": "query",
        "prop": "imageinfo",
        "iiprop": "url",
        "titles": title,
        "format": "json"
    }
    try:
        r = requests.get(url, params=params, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200:
            data = r.json()
            pages = data['query']['pages']
            for page_id in pages:
                if 'imageinfo' in pages[page_id]:
                    img_url = pages[page_id]['imageinfo'][0]['url']
                    print(f"{title}: {img_url}")
                else:
                    print(f"{title}: Not found in imageinfo")
    except Exception as e:
        print(f"Error on {title}: {e}")
