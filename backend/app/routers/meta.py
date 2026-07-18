from fastapi import APIRouter, HTTPException
import json
import os

router = APIRouter(prefix="/meta", tags=["Meta"])

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "meta_data.json")

def load_meta_data():
    if not os.path.exists(DATA_FILE):
        return None
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@router.get("/tier-list")
def get_tier_list(map_id: str = None, mode: str = None):
    """
    環境分析ページ（メタレポート）のTier表を返す
    """
    meta = load_meta_data()
    if not meta:
        raise HTTPException(status_code=503, detail="Meta data not ready yet")
        
    return {
        "updated_at": meta.get("updated_at"),
        "tiers": meta.get("tiers", {}),
        "map_id": map_id,
        "mode": mode,
        "metrics": meta.get("metrics", {})
    }

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str):
    """
    特定キャラクターの詳細ビュー（カモ・天敵など）を返す
    """
    meta = load_meta_data()
    if not meta:
        raise HTTPException(status_code=503, detail="Meta data not ready yet")
        
    chars = meta.get("characters", {})
    char_id_lower = character_id.lower()
    
    if char_id_lower not in chars:
        # 見つからない場合は最低限の空のデータを返す
        return {
            "character_id": char_id_lower,
            "tier": "Unknown",
            "score": 0,
            "win_rate": 50.0,
            "use_rate": 0,
            "total_matches": 0,
            "kamo": [],
            "tenteki": []
        }
        
    detail = chars[char_id_lower]
    return {
        "character_id": char_id_lower,
        **detail
    }

