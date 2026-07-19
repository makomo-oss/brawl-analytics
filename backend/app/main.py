import urllib.request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.match import router as match_router
from app.routers.player import router as player_router
from app.routers.meta import router as meta_router

app = FastAPI(title="BrawlAnalytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"https://.*\.pages\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(match_router)
app.include_router(player_router)
app.include_router(meta_router)

@app.get("/")
def read_root():
    return {"message": "Welcome to BrawlAnalytics API"}

# RenderのIPアドレスを確認するための追加コード
@app.get("/my-ip")
def get_my_ip():
    ip = urllib.request.urlopen("https://api.ipify.org").read().decode("utf-8")
    return {"render_ip": ip}
