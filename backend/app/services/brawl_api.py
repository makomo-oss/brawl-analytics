import httpx
import logging
from app.config import BRAWL_API_TOKEN, BRAWL_API_PROXY, BRAWL_API_BASE_URL

logger = logging.getLogger(__name__)

# シングルトン HTTP クライアントの参照
_http_client: httpx.AsyncClient | None = None

def get_http_client() -> httpx.AsyncClient:
    """
    HTTPコネクションプールを持つシングルトン httpx.AsyncClient を取得する。
    
    Why: リクエスト毎に AsyncClient を生成・破棄すると毎回 TCP/TLS ハンドシェイク（50-200ms）
    が発生するため、永続的な接続プールを再利用してレイテンシを最小化する。
    """
    global _http_client
    if _http_client is None or _http_client.is_closed:
        proxy = BRAWL_API_PROXY if BRAWL_API_PROXY else None
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)
        timeout = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
        _http_client = httpx.AsyncClient(
            proxy=proxy,
            verify=True,
            timeout=timeout,
            limits=limits
        )
    return _http_client

async def close_http_client() -> None:
    """シャットダウン時に HTTP クライアントを安全にクローズする"""
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None

class BrawlAPIError(RuntimeError):
    """The upstream service failed; never substitute synthetic production data."""

async def _get_resource(path: str, tag: str, suffix: str = ""):
    clean_tag = tag.replace("%23", "").replace("#", "").strip().upper()
    from urllib.parse import quote
    url = f"{BRAWL_API_BASE_URL}/{path}/%23{quote(clean_tag, safe='')}{suffix}"
    try:
        response = await get_http_client().get(url, headers={
            "Authorization": f"Bearer {BRAWL_API_TOKEN}", "Accept": "application/json"
        })
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ValueError("Player not found" if path == "players" else "Club not found") from exc
        raise BrawlAPIError(f"Brawl API returned HTTP {exc.response.status_code}") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise BrawlAPIError("Brawl API is unavailable") from exc

async def get_player_battlelog(player_tag: str):
    return await _get_resource("players", player_tag, "/battlelog")

async def get_player(player_tag: str):
    return await _get_resource("players", player_tag)

async def get_club_members(club_tag: str):
    return await _get_resource("clubs", club_tag, "/members")

async def get_club(club_tag: str):
    return await _get_resource("clubs", club_tag)
