import requests
from bs4 import BeautifulSoup
import re

url = "https://brawlify.com/stats/profile/V99J0CCV8"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

try:
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        images = soup.find_all('img')
        for img in images:
            src = img.get('src')
            if src and ('rank' in src.lower() or 'league' in src.lower() or 'tier' in src.lower()):
                print(f"Found related image: {src}")
    else:
        print(f"Failed to fetch profile, status: {r.status_code}")
except Exception as e:
    print(e)
