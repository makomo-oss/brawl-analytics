from fastapi import APIRouter, HTTPException, Query
import logging
from app.database import get_db
from app.services.brawl_api import get_club, get_club_members

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/club",
    tags=["club"]
)

@router.get("/search")
async def search_clubs(q: str = Query(..., min_length=1)):
    """
    クラブ名でデータベース(Supabase)を前方一致・部分一致検索する
    """
    db = get_db()
    try:
        res = db.table("clubs").select("club_tag, name, trophies, required_trophies, description, badge_id").ilike("name", f"%{q}%").order("trophies", desc=True).limit(10).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error searching clubs: {e}")
        raise HTTPException(status_code=503, detail="クラブ検索を利用できません")

import asyncio

@router.get("/{club_tag}")
async def get_club_details(club_tag: str):
    """
    指定したクラブタグの詳細情報およびメンバー一覧を取得する
    
    Why: クラブ情報とメンバー一覧の外部APIリクエストを asyncio.gather で並列化し、
    レイテンシを半減（500ms -> 250ms）させる。
    """
    clean_tag = club_tag.replace("#", "")
    try:
        club_info, members_info = await asyncio.gather(
            get_club(clean_tag),
            get_club_members(clean_tag),
            return_exceptions=True
        )
        
        if isinstance(club_info, ValueError):
            raise HTTPException(status_code=404, detail="Club not found")
        if isinstance(club_info, Exception) or isinstance(members_info, Exception) or not club_info:
            logger.error(f"Error fetching club for {club_tag}: {club_info}")
            raise HTTPException(status_code=502, detail="クラブ情報を取得できませんでした")
            
        members = members_info.get("items", []) if isinstance(members_info, dict) else []
        
        return {
            "club_tag": clean_tag,
            "name": club_info.get("name", "Unknown"),
            "description": club_info.get("description", ""),
            "type": club_info.get("type", "open"),
            "badge_id": club_info.get("badgeId", 0),
            "trophies": club_info.get("trophies", 0),
            "required_trophies": club_info.get("requiredTrophies", 0),
            "members": members
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching club details for {club_tag}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
