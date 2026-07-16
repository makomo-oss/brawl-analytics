from fastapi import APIRouter

router = APIRouter(prefix="/player", tags=["Player"])

@router.get("/{player_tag}/sync")
def sync_player(player_tag: str):
    """
    プレイヤータグから戦績や保有キャラを同期する
    """
    return {"player_tag": player_tag, "status": "synced"}

@router.get("/{player_tag}/dashboard")
def get_dashboard(player_tag: str):
    """
    メタ・ギャップ分析など、ダッシュボード用のデータを返す
    """
    return {"player_tag": player_tag, "metrics": {"win_rate": 55.0}}
