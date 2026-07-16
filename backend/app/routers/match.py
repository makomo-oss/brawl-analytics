from fastapi import APIRouter
from pydantic import BaseModel
from app.algorithm.recommender import recommend_picks
from app.algorithm.simulator import simulate_if

router = APIRouter(prefix="/match", tags=["Match"])

class PickRequest(BaseModel):
    map_id: str
    mode: str
    allies: list[str]
    opponents: list[str]
    pick_turn: int
    is_proxy_pick: bool

@router.post("/recommend")
def get_recommendations(req: PickRequest):
    recs = recommend_picks(
        req.map_id, req.mode, req.allies, req.opponents, req.pick_turn, req.is_proxy_pick
    )
    return {"recommendations": recs}

@router.get("/{match_id}/simulate")
def get_simulation(match_id: str):
    # TODO: DBから match_id の情報を取得
    sim = simulate_if("dummy_map", "defeat", "shelly", ["colt"], ["primo", "bull", "rosa"])
    return {"simulation": sim}
