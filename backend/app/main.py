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
