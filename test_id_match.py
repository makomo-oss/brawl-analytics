import requests
import json

try:
    r = requests.get('https://api.brawlapi.com/v1/brawlers')
    if r.status_code == 200:
        data = r.json()
        brawlers = data.get('list', [])
        shelly = next(b for b in brawlers if b['name'].upper() == 'SHELLY')
        print(f"Shelly BrawlAPI ID: {shelly['id']}")
        print(f"Shelly Brawler Image URL: {shelly['imageUrl']}")
        print(f"Shelly Gadget Image URL: {shelly['gadgets'][0]['imageUrl']}")
        print(f"Shelly Gadget ID: {shelly['gadgets'][0]['id']}")
        print(f"Shelly StarPower ID: {shelly['starPowers'][0]['id']}")
except Exception as e:
    print(f"Error: {e}")
