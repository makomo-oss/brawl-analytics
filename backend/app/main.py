import urllib.request
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.match import router as match_router
from app.routers.player import router as player_router
from app.routers.meta import router as meta_router
from app.routers.cron import router as cron_router, verify_cron_secret
from app.routers.club import router as club_router

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    アプリケーション起動時にバックグラウンドでメタデータ・カウンターキャッシュを事前ウォームアップ
    初弾リクエストのコールドスタート遅延（2.5秒）をゼロにする
    """
    async def warmup():
        try:
            from app.database import get_db
            from app.routers.meta import _get_cached_macro_data, _get_cached_counters_for_char
            db = get_db()
            await asyncio.to_thread(lambda: _get_cached_macro_data(db))
            await asyncio.to_thread(lambda: _get_cached_counters_for_char(db, "shelly"))
            logger.info("Startup cache warmup completed successfully.")
        except Exception as e:
            logger.warning(f"Startup cache warmup error: {e}")

    asyncio.create_task(warmup())
    try:
        yield
    finally:
        from app.services.brawl_api import close_http_client
        await close_http_client()

app = FastAPI(title="ブロラボ API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://brawl-lab.sozai-hub.com",
    ],
    allow_origin_regex=r"https://.*\.pages\.dev",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(match_router)
app.include_router(player_router)
app.include_router(meta_router)
app.include_router(cron_router)
app.include_router(club_router)

@app.get("/")
def read_root():
    return {"message": "Welcome to ブロラボ API"}

# RenderのIPアドレスを確認するための追加コード
@app.get("/my-ip")
def get_my_ip(_secret: str = Depends(verify_cron_secret)):
    with urllib.request.urlopen("https://api.ipify.org", timeout=5) as response:
        ip = response.read().decode("utf-8")
    return {"render_ip": ip}
