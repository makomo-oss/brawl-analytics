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
def get_tier_list(type: str = "global", sub_type: str = None, id: str = None):
    """
    環境分析ページ（メタレポート）のTier表を返す
    type: 'global', 'gachi'
    sub_type: 'mode', 'map' (typeがgachiの場合のみ有効)
    id: モード名やマップ名 (sub_typeがある場合必須)
    """
    meta = load_meta_data()
    if not meta:
        raise HTTPException(status_code=503, detail="Meta data not ready yet")
        
    if type == "global":
        target = meta.get("global", {})
    elif type == "gachi":
        if sub_type == "mode" and id:
            target = meta.get("gachi_modes", {}).get(id)
        elif sub_type == "map" and id:
            target = meta.get("gachi_maps", {}).get(id)
        else:
            target = meta.get("gachi", {})
    else:
        raise HTTPException(status_code=400, detail="Invalid type")
        
    if not target:
        raise HTTPException(status_code=404, detail=f"Data for {type} not found")
        
    return {
        "updated_at": meta.get("updated_at"),
        "tiers": target.get("tiers", {}),
        "type": type,
        "metrics": target.get("metrics", {})
    }

@router.get("/categories")
def get_categories():
    """
    選択可能なガチバトルのモードとマップのリストを返す
    """
    meta = load_meta_data()
    if not meta:
        return {"modes": [], "maps": []}
    return {
        "modes": list(meta.get("gachi_modes", {}).keys()),
        "maps": list(meta.get("gachi_maps", {}).keys())
    }

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str, type: str = "global", sub_type: str = None, id: str = None):
    """
    特定キャラクターの詳細ビュー（カモ・天敵など）を返す
    """
    meta = load_meta_data()
    if not meta:
        raise HTTPException(status_code=503, detail="Meta data not ready yet")
        
    if type == "global":
        target = meta.get("global", {})
    elif type == "gachi":
        if sub_type == "mode" and id:
            target = meta.get("gachi_modes", {}).get(id)
        elif sub_type == "map" and id:
            target = meta.get("gachi_maps", {}).get(id)
        else:
            target = meta.get("gachi", {})
    else:
        target = meta.get("global", {})
        
    chars = target.get("characters", {})
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

