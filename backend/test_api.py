import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()
token = os.getenv('BRAWL_API_TOKEN')
url = 'https://api.brawlstars.com/v1/players/%23Q2LL9G8'
headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}

async def fetch():
    print("Testing direct connection without proxy...")
    try:
        async with httpx.AsyncClient(verify=False, timeout=5.0) as c:
            r = await c.get(url, headers=headers)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print("Player Name:", data.get('name'))
                print("Trophies:", data.get('trophies'))
            else:
                print("Error Response:", r.text)
    except Exception as e:
        print(f"Failed: {e}")

asyncio.run(fetch())
