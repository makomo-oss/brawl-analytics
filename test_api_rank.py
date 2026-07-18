import httpx
import json
import os
import asyncio
from dotenv import load_dotenv

load_dotenv("backend/.env")
BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN")

async def main():
    tag = "V99J0CCV8"
    url = f"https://api.brawlstars.com/v1/players/%23{tag}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"}
    
    async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
        try:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                print("--- Player Profile Info ---")
                keys_of_interest = ["name", "rankedElo", "highestAllTimeRankedElo", "rankedRank", "highestAllTimeRankedRank"]
                for key in keys_of_interest:
                    print(f"{key}: {data.get(key)}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
