import requests
from bs4 import BeautifulSoup

url = "https://brawlstars.fandom.com/wiki/Ranked"
headers = {'User-Agent': 'Mozilla/5.0'}

try:
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        images = soup.find_all('img')
        for img in images:
            src = img.get('src') or img.get('data-src')
            if src and 'rank' in src.lower() and '.png' in src.lower():
                print(f"Found rank image on wiki: {src}")
    else:
        print(f"Failed to fetch wiki, status: {r.status_code}")
except Exception as e:
    print(e)
