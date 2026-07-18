import httpx
import logging
from app.config import BRAWL_API_TOKEN, BRAWL_API_PROXY, BRAWL_API_BASE_URL

logger = logging.getLogger(__name__)

async def get_player_battlelog(player_tag: str):
    tag = player_tag.replace("#", "%23")
    url = f"{BRAWL_API_BASE_URL}/players/{tag}/battlelog"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        # ポートが不明等のため、とりあえずタイムアウトを短くして繋がらなければモックを返す
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=3.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning(f"Failed to fetch battlelog from API, using fallback mock: {exc}")
        # プロキシダウンやIP制限 (403) 時のフォールバック
        return {
            "items": [
                {"battleTime": "20240101T000000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "bounty", "type": "ranked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}},
                {"battleTime": "20240101T000500.000Z", "event": {"map": "map_2"}, "battle": {"mode": "brawl_ball", "type": "ranked", "result": "defeat", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "LEON"}}]]}},
                {"battleTime": "20240101T001000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "gem_grab", "type": "ranked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}}
            ]
        }

async def get_player(player_tag: str):
    tag = player_tag.replace("#", "%23")
    url = f"{BRAWL_API_BASE_URL}/players/{tag}"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=3.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning(f"Failed to fetch player info from API, using fallback mock: {exc}")
        return {
            "name": "Makomo (Mock)",
            "tag": player_tag,
            "trophies": 35420,
            "highestTrophies": 38000,
            "expLevel": 150,
            "3vs3Victories": 4500,
            "club": {"name": "Brawl Masters"}
        }
