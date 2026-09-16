from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.algorithm.recommender import recommend_picks
from app.algorithm.simulator import simulate_if

router = APIRouter(prefix="/match", tags=["Match"])

class PickRequest(BaseModel):
    map_id: str
    mode: str
    allies: list[str]
    opponents: list[str]
    bans: list[str] = Field(default_factory=list)
    pick_turn: int = Field(ge=1, le=6)
    is_proxy_pick: bool

@router.post("/recommend")
def get_recommendations(req: PickRequest):
    recs = recommend_picks(
        req.map_id, req.mode, req.allies, req.opponents, req.pick_turn, req.is_proxy_pick, req.bans
    )
    return {"recommendations": recs}

@router.get("/{match_id}/simulate")
def get_simulation(match_id: str):
    from app.database import get_db
    result = get_db().table("match_raw_history").select("*").eq("match_id", match_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Match not found")
    raise HTTPException(status_code=501, detail="勝率改善シミュレーションは未検証のため提供していません")
