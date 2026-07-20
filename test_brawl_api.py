import asyncio
from backend.app.services.brawl_api import get_player_battlelog

async def test():
    # known active player tag, e.g. #2P0U9282 (or let's use a popular one or mock)
    # let's try an arbitrary tag or just print something to see how we get it
    tag = "2P0U9282" # Random valid tag, hopefully
    try:
        log = await get_player_battlelog(tag)
        items = log.get("items", [])
        print(f"Found {len(items)} items")
        for i in items[:5]:
            battle = i.get("battle", {})
            print(f"Type: {battle.get('type')}, Mode: {battle.get('mode')}")
    except Exception as e:
        print(e)

asyncio.run(test())
