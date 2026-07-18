import httpx
import json
import os
import asyncio
from dotenv import load_dotenv

load_dotenv("backend/.env")
BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN")
BRAWL_API_PROXY = os.getenv("BRAWL_API_PROXY")

async def main():
    tag = "V99J0CCV8"
    url = f"https://api.brawlstars.com/v1/players/%23{tag}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"}
    
    proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
    async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10.0) as client:
        try:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                print("\n--- Root Keys ---")
                print(list(data.keys()))
                
                print("\n--- Value search ---")
                # rank, score 関連のキーを探す
                for key, value in data.items():
                    if "rank" in key.lower() or "league" in key.lower() or "score" in key.lower() or "season" in key.lower():
                        print(f"{key}: {value}")
            else:
                print(f"Failed to fetch: {response.status_code} {response.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
