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
    
    # プロキシ設定。Royale APIのプロキシを利用する。
    proxies = {
        "http://": BRAWL_API_PROXY,
        "https://": BRAWL_API_PROXY
    } if BRAWL_API_PROXY else None

    try:
        # verify=False はプロキシ経由時のSSLエラー回避用（本番環境では証明書を正しく設定推奨）
        async with httpx.AsyncClient(proxies=proxies, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        logger.error(f"Error fetching battlelog for {player_tag}: {exc}")
        raise exc
    except Exception as exc:
        logger.error(f"Unexpected error: {exc}")
        raise exc

async def get_player(player_tag: str):
    tag = player_tag.replace("#", "%23")
    url = f"{BRAWL_API_BASE_URL}/players/{tag}"
    headers = {
        "Authorization": f"Bearer {BRAWL_API_TOKEN}",
        "Accept": "application/json"
    }
    proxies = {"http://": BRAWL_API_PROXY, "https://": BRAWL_API_PROXY} if BRAWL_API_PROXY else None

    try:
        async with httpx.AsyncClient(proxies=proxies, verify=False, timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        logger.error(f"Error fetching player info for {player_tag}: {exc}")
        raise exc
    except Exception as exc:
        logger.error(f"Unexpected error: {exc}")
        raise exc
