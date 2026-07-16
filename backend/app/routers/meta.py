from fastapi import APIRouter

router = APIRouter(prefix="/meta", tags=["Meta"])

@router.get("/tier-list")
def get_tier_list(map_id: str = None, mode: str = None):
    """
    環境分析ページ（メタレポート）のTier表を返す
    """
    return {
        "tier_S": ["piper", "fang"],
        "tier_A": ["spike", "crow"],
        "map_id": map_id,
        "mode": mode
    }

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str):
    """
    特定キャラクターの詳細ビュー（カモ・天敵など）を返す
    """
    return {
        "character_id": character_id,
        "best_maps": ["map_1", "map_2"],
        "counters": ["leon", "edgar"]
    }
