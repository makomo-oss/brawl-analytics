import requests
import json

try:
    r = requests.get('https://api.brawlapi.com/v1/brawlers')
    if r.status_code == 200:
        data = r.json()
        brawlers = data.get('list', [])
        if brawlers:
            shelly = brawlers[0]
            print("Brawler Image:", shelly.get("imageUrl"))
            if shelly.get("gadgets"):
                print("Gadget Image:", shelly["gadgets"][0].get("imageUrl"))
            if shelly.get("starPowers"):
                print("StarPower Image:", shelly["starPowers"][0].get("imageUrl"))
except Exception as e:
    print(f"Error: {e}")
