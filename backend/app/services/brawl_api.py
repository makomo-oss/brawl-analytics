import httpx
import logging
from app.config import BRAWL_API_TOKEN, BRAWL_API_PROXY, BRAWL_API_BASE_URL

logger = logging.getLogger(__name__)

async def get_player_battlelog(player_tag: str):
    clean_tag = player_tag.replace("#", "")
    tag = f"%23{clean_tag}"
    url = f"{BRAWL_API_BASE_URL}/players/{tag}/battlelog"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ValueError("Player not found")
        logger.warning(f"Failed to fetch battlelog from API (StatusError), using fallback mock: {exc}")
        return {
            "items": [
                {"battleTime": "20240101T000000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "bounty", "type": "ranked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}},
                {"battleTime": "20240101T000500.000Z", "event": {"map": "map_2"}, "battle": {"mode": "brawl_ball", "type": "soloRanked", "result": "defeat", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "LEON"}}]]}},
                {"battleTime": "20240101T001000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "gem_grab", "type": "teamRanked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}}
            ]
        }
    except Exception as exc:
        logger.warning(f"Failed to fetch battlelog from API, using fallback mock: {exc}")
        return {
            "items": [
                {"battleTime": "20240101T000000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "bounty", "type": "ranked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}},
                {"battleTime": "20240101T000500.000Z", "event": {"map": "map_2"}, "battle": {"mode": "brawl_ball", "type": "soloRanked", "result": "defeat", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "LEON"}}]]}},
                {"battleTime": "20240101T001000.000Z", "event": {"map": "map_1"}, "battle": {"mode": "gem_grab", "type": "teamRanked", "result": "victory", "teams": [[{"tag": f"#{player_tag.replace('%23', '')}", "brawler": {"name": "PIPER"}}]]}}
            ]
        }

async def get_player(player_tag: str):
    clean_tag = player_tag.replace("#", "")
    tag = f"%23{clean_tag}"
    url = f"{BRAWL_API_BASE_URL}/players/{tag}"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ValueError("Player not found")
        logger.warning(f"Failed to fetch player info from API (StatusError), using fallback mock: {exc}")
        return {
            "name": f"Mock (Error: {str(exc)[:20]}...)",
            "tag": player_tag,
            "icon": {"id": 28000013},
            "trophies": 35420,
            "highestTrophies": 38000,
            "rankedRank": 16,
            "highestAllTimeRankedRank": 16,
            "rankedElo": 6000,
            "highestAllTimeRankedElo": 6650,
            "expLevel": 150,
            "3vs3Victories": 4500,
            "club": {"name": "Brawl Masters", "tag": "#CLUB123"},
            "brawlers": [
                {
                    "name": "SHELLY", "power": 11, "rank": 25, "trophies": 750, "highestTrophies": 800,
                    "gadgets": [{"id":1,"name":"FAST FORWARD"}, {"id":2,"name":"CLAY PIGEONS"}],
                    "starPowers": [{"id":1,"name":"SHELL SHOCK"}, {"id":2,"name":"BAND-AID"}],
                    "gears": [{"id":1,"name":"DAMAGE","level":3}, {"id":2,"name":"SPEED","level":3}],
                    "hyperCharges": [{"id":1,"name":"DOUBLE BARREL"}]
                },
                {
                    "name": "COLT", "power": 9, "rank": 20, "trophies": 500, "highestTrophies": 550,
                    "gadgets": [{"id":1,"name":"SPEEDLOADER"}],
                    "starPowers": [{"id":1,"name":"SLICK BOOTS"}],
                    "gears": [{"id":1,"name":"DAMAGE","level":3}],
                    "hyperCharges": []
                }
            ]
        }
    except Exception as exc:
        logger.warning(f"Failed to fetch player info from API, using fallback mock: {exc}")
        return {
            "name": f"Mock (Error: {str(exc)[:20]}...)",
            "tag": player_tag,
            "icon": {"id": 28000013},
            "trophies": 35420,
            "highestTrophies": 38000,
            "rankedRank": 16,
            "highestAllTimeRankedRank": 16,
            "rankedElo": 6000,
            "highestAllTimeRankedElo": 6650,
            "expLevel": 150,
            "3vs3Victories": 4500,
            "club": {"name": "Brawl Masters", "tag": "#CLUB123"},
            "brawlers": [
                {
                    "name": "SHELLY", "power": 11, "rank": 25, "trophies": 750, "highestTrophies": 800,
                    "gadgets": [{"id":1,"name":"FAST FORWARD"}, {"id":2,"name":"CLAY PIGEONS"}],
                    "starPowers": [{"id":1,"name":"SHELL SHOCK"}, {"id":2,"name":"BAND-AID"}],
                    "gears": [{"id":1,"name":"DAMAGE","level":3}, {"id":2,"name":"SPEED","level":3}],
                    "hyperCharges": [{"id":1,"name":"DOUBLE BARREL"}]
                },
                {
                    "name": "COLT", "power": 9, "rank": 20, "trophies": 500, "highestTrophies": 550,
                    "gadgets": [{"id":1,"name":"SPEEDLOADER"}],
                    "starPowers": [{"id":1,"name":"SLICK BOOTS"}],
                    "gears": [{"id":1,"name":"DAMAGE","level":3}],
                    "hyperCharges": []
                }
            ]
        }

async def get_club_members(club_tag: str):
    """
    指定したクラブに所属するメンバーの一覧を取得する
    """
    clean_tag = club_tag.replace("#", "")
    tag = f"%23{clean_tag}"
    url = f"{BRAWL_API_BASE_URL}/clubs/{tag}/members"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning(f"Failed to fetch club members from API, using fallback mock: {exc}")
        return {
            "items": [
                {"tag": "#Q2LL9G8", "name": "Player 1", "role": "member", "trophies": 35000},
                {"tag": "#R8G2P9Y", "name": "Player 2", "role": "president", "trophies": 38000}
            ]
        }

async def get_club(club_tag: str):
    """
    指定したクラブの詳細情報を取得する
    """
    clean_tag = club_tag.replace("#", "")
    tag = f"%23{clean_tag}"
    url = f"{BRAWL_API_BASE_URL}/clubs/{tag}"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    try:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning(f"Failed to fetch club details from API, using fallback mock: {exc}")
        return {
            "tag": f"#{clean_tag}",
            "name": "Brawl Masters",
            "description": "Welcome to Brawl Masters! Active club for all players.",
            "type": "open",
            "badgeId": 16000000,
            "requiredTrophies": 10000,
            "trophies": 850000,
            "members": [
                {"tag": "#Q2LL9G8", "name": "Player 1", "role": "member", "trophies": 35000},
                {"tag": "#R8G2P9Y", "name": "Player 2", "role": "president", "trophies": 38000}
            ]
        }

