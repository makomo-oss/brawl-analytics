from fastapi import APIRouter, HTTPException
import math
from app.database import get_db

router = APIRouter(prefix="/meta", tags=["Meta"])

def format_char_name(char_id: str) -> str:
    # 簡易的なキャラクター名フォーマット
    if not char_id: return "Unknown"
    return char_id.replace("_", " ").title()

def wilson_lower_bound(wins: int, total: int, z: float = 1.96) -> float:
    if total == 0:
        return 0.0
    p = wins / total
    denominator = 1 + z**2 / total
    center = p + z**2 / (2 * total)
    spread = z * math.sqrt((p * (1 - p) / total) + (z**2 / (4 * total**2)))
    return (center - spread) / denominator

@router.get("/tier-list")
def get_tier_list(type: str = "global", sub_type: str = None, id: str = None, include_details: bool = False):
    db = get_db()
    
    # マッチ数のカウント（分析試合数）
    total_analyzed = 0
    try:
        res = db.table("match_raw_history").select("match_id", count="exact").limit(1).execute()
        if res.count is not None:
            total_analyzed = res.count
    except:
        pass
        
    # macro_map_statsからデータを取得
    try:
        query = db.table("macro_map_stats").select("*")
        # query.eq などの事前絞り込みは行わず、Python側で柔軟にフィルタリングする
        # ※本来は上限があるためページネーションが必要ですが、キャラ数×マップ数なら数千件なので一括取得
        res = query.limit(10000).execute()
        data = res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
        
    if not data:
        # データがまだない場合は空を返す
        return {
            "updated_at": None,
            "tiers": {"S": [], "A": [], "B": [], "C": [], "D": []},
            "type": type,
            "metrics": {"analyzed_matches": total_analyzed},
            "characters": {} if include_details else None
        }
        
    # モード別のマップ一覧が必要な場合
    valid_map_ids = None
    if sub_type == "mode" and id:
        try:
            mode_res = db.table("match_raw_history").select("map_id").eq("mode", id).execute()
            valid_map_ids = set([r["map_id"] for r in mode_res.data])
        except:
            valid_map_ids = set()
            
    # フィルタリング
    filtered_data = []
    for row in data:
        map_id = str(row.get("map_id", ""))
        is_gachi_match = map_id.startswith("gachi_")
        
        # ガチバトル指定の場合
        if type == "gachi" and not is_gachi_match:
            continue
            
        real_map_id = map_id.replace("gachi_", "") if is_gachi_match else map_id
        
        # マップ別フィルタ
        if sub_type == "map" and id:
            if real_map_id != id:
                continue
                
        # モード別フィルタ
        if sub_type == "mode" and id and valid_map_ids is not None:
            # 通常版とガチ版のどちらかのmap_idでプレイされていればOK
            if real_map_id not in valid_map_ids and f"gachi_{real_map_id}" not in valid_map_ids:
                continue
                
        # フロントエンドの画像表示等が壊れないようにプレフィックスを削除
        row["map_id"] = real_map_id
        filtered_data.append(row)
        
    data = filtered_data

    # キャラクターごとに集計
    char_stats = {}
    for row in data:
        # 大文字と小文字のデータが混在している場合の重複を防ぐため小文字に統一
        cid = row.get("character_id", "").lower()
        if not cid or cid == "unknown":
            continue
            
        if cid not in char_stats:
            char_stats[cid] = {
                "total_wins": 0,
                "total_matches": 0,
                "sum_pick_dev": 0.0,
                "count": 0
            }
        char_stats[cid]["total_wins"] += row.get("total_wins", 0)
        char_stats[cid]["total_matches"] += row.get("total_matches", 0)
        char_stats[cid]["sum_pick_dev"] += row.get("pick_rate_deviation", 50.0)
        char_stats[cid]["count"] += 1
        
    # スコア計算と詳細データの作成
    scored_chars = []
    characters_detail = {}
    
    # 全体の総試合数 (使用率計算用)
    global_total_matches = sum(s["total_matches"] for s in char_stats.values())
    if global_total_matches == 0: global_total_matches = 1
    
    for cid, stats in char_stats.items():
        tm = stats["total_matches"]
        tw = stats["total_wins"]
        
        # 表示用の実勝率
        actual_wr = (tw / tm * 100) if tm > 0 else 50.0
        
        # ランク付け用の信頼勝率（ウィルソンスコア下限）
        ranking_wr = wilson_lower_bound(tw, tm) * 100
        
        avg_dev = stats["sum_pick_dev"] / stats["count"]
        
        # スコア計算: ウィルソン信頼勝率(70%) + ピック率偏差値(30%)
        # ※ ranking_wr は 0~100 程度の値、devも 30~70 程度
        score = (ranking_wr * 0.7) + (avg_dev * 0.3)
        
        # 0〜100の範囲に収める簡易正規化
        score = min(max(score, 0.0), 100.0)
        
        use_rate = (tm / global_total_matches) * 100
        
        scored_chars.append({"id": cid, "score": score})
        
        if include_details:
            characters_detail[cid] = {
                "score": round(score, 1),
                "win_rate": round(actual_wr, 1),
                "use_rate": round(use_rate, 2),
                "total_matches": tm
            }
            
    # スコアで降順ソート
    scored_chars.sort(key=lambda x: x["score"], reverse=True)
    
    # Tierの割り当て (S: 10%, A: 20%, B: 40%, C: 20%, D: 10%)
    total_chars = len(scored_chars)
    s_limit = max(1, int(total_chars * 0.10))
    a_limit = max(1, int(total_chars * 0.30))
    b_limit = max(1, int(total_chars * 0.70))
    c_limit = max(1, int(total_chars * 0.90))
    
    tiers = {"S": [], "A": [], "B": [], "C": [], "D": []}
    for i, sc in enumerate(scored_chars):
        cid = sc["id"]
        if i < s_limit:
            tiers["S"].append(cid)
        elif i < a_limit:
            tiers["A"].append(cid)
        elif i < b_limit:
            tiers["B"].append(cid)
        elif i < c_limit:
            tiers["C"].append(cid)
        else:
            tiers["D"].append(cid)
            
    response_data = {
        "updated_at": None,
        "tiers": tiers,
        "type": type,
        "metrics": {"analyzed_matches": total_analyzed}
    }
    
    if include_details:
        response_data["characters"] = characters_detail
        
    return response_data

@router.get("/categories")
def get_categories():
    db = get_db()
    # マップ一覧を動的取得
    try:
        res = db.table("macro_map_stats").select("map_id").execute()
        maps = list(set([row["map_id"] for row in res.data if row.get("map_id")]))
    except:
        maps = []
        
    # モードは現状DBに直接持っていないため仮のリストまたはフロントで吸収
    return {
        "modes": ["brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"],
        "maps": maps,
        "mode_to_maps": {}
    }

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str, type: str = "global", sub_type: str = None, id: str = None):
    db = get_db()
    char_id_lower = character_id.lower()
    
    # 1. 基本情報の取得 (Tier表ロジックと同じく集計)
    tier_data = get_tier_list(type=type, sub_type=sub_type, id=id, include_details=True)
    chars = tier_data.get("characters", {})
    
    if char_id_lower not in chars:
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
    
    # 所属Tierの検索
    my_tier = "Unknown"
    for t_name, char_list in tier_data.get("tiers", {}).items():
        if char_id_lower in char_list:
            my_tier = t_name
            break
            
    detail["tier"] = my_tier
    detail["character_id"] = char_id_lower
    
    # 2. カモ・天敵の取得 (dynamic_counters)
    kamo = []
    tenteki = []
    try:
        # 自分が char_a になっているデータを取得
        res = db.table("dynamic_counters").select("*").eq("char_a", char_id_lower).execute()
        counters = res.data
        
        # 相性係数でソート (高い順)
        counters.sort(key=lambda x: x.get("counter_coefficient", 0.0), reverse=True)
        
        # カモ (有利: 係数が高いトップ5)
        for c in counters:
            if len(kamo) >= 5: break
            enemy_id = c["char_b"]
            if enemy_id == "unknown":
                continue
            if c.get("counter_coefficient", 0.0) > 0:
                kamo.append({
                    "id": enemy_id,
                    "name": format_char_name(enemy_id),
                    "win_rate": round( (c["win_count"] / c["match_count"] * 100) if c["match_count"] > 0 else 50.0, 1 )
                })
                
        # 天敵 (不利: 係数が低いボトム5)
        for c in reversed(counters):
            if len(tenteki) >= 5: break
            enemy_id = c["char_b"]
            if enemy_id == "unknown":
                continue
            if c.get("counter_coefficient", 0.0) < 0:
                tenteki.append({
                    "id": enemy_id,
                    "name": format_char_name(enemy_id),
                    "win_rate": round( (c["win_count"] / c["match_count"] * 100) if c["match_count"] > 0 else 50.0, 1 )
                })
    except Exception as e:
        print(f"Failed to fetch counters: {e}")
        
    detail["kamo"] = kamo
    detail["tenteki"] = tenteki
    
    return detail
