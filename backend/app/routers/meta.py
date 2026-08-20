from fastapi import APIRouter, HTTPException
import math
from app.database import get_db

router = APIRouter(prefix="/meta", tags=["Meta"])

def format_char_name(char_id: str) -> str:
    # 簡易的なキャラクター名フォーマット
    if not char_id: return "Unknown"
    return char_id.replace("_", " ").title()

def wilson_lower_bound(wins: int, total: int, z: float = 1.645) -> float:
    """
    ウィルソン信頼区間の下限値を計算する。
    
    Why:
    z=1.96(95%信頼度)はランキングアルゴリズムとしては過度に保守的であり、
    小サンプル時に下限値が大きく低下する問題があったため、デフォルトを z=1.645(90%信頼度) に調整。
    これにより、実効的な実勝率を反映しつつノイズを防ぐバランスを取る。
    """
    if total <= 0 or wins < 0:
        return 0.0
    # 異常データ対策: 勝利数は最大でも試合数と同じにする
    wins = min(wins, total)
    p = wins / total
    denominator = 1 + z**2 / total
    center = p + z**2 / (2 * total)
    
    # 浮動小数点演算誤差による極微小な負の数を防ぐ
    inner_val = (p * (1 - p) / total) + (z**2 / (4 * total**2))
    if inner_val < 0:
        inner_val = 0.0
        
    spread = z * math.sqrt(inner_val)
    return (center - spread) / denominator

@router.get("/tier-list")
def get_tier_list(type: str = "global", sub_type: str = None, id: str = None, rank_tier: str = "all", include_details: bool = False):
    db = get_db()
    
    # マッチ数のカウント（分析試合数）
    total_analyzed = 0
    try:
        res = db.table("match_raw_history").select("match_id", count="exact").limit(1).execute()
        if res.count is not None:
            total_analyzed = res.count
    except:
        pass
        
    # macro_map_statsからデータを安全に全件取得 (Supabaseの1000件上限に対応した確実なページネーション)
    data = []
    try:
        offset = 0
        PAGE_SIZE = 1000
        while True:
            res = db.table("macro_map_stats").select("*").range(offset, offset + PAGE_SIZE - 1).execute()
            if not res.data:
                break
            data.extend(res.data)
            if len(res.data) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
        
    if not data:
        # データがまだない場合は空を返す
        return {
            "updated_at": None,
            "tiers": {"S+": [], "S": [], "A+": [], "A": [], "B": [], "C": [], "D": []},
            "type": type,
            "rank_tier": rank_tier,
            "metrics": {"analyzed_matches": total_analyzed},
            "characters": {} if include_details else None
        }
        
    # モード別のマップ一覧が必要な場合
    valid_map_ids = None
    if sub_type == "mode" and id:
        try:
            mode_res = db.table("match_raw_history").select("map_id").eq("mode", id).limit(5000).execute()
            valid_map_ids = set()
            for r in mode_res.data:
                m = r.get("map_id")
                if m:
                    valid_map_ids.add(str(m))
                    valid_map_ids.add(str(m).replace("gachi_", ""))
        except:
            valid_map_ids = set()
            
    # フィルタリング
    filtered_data = []
    for row in data:
        map_id = str(row.get("map_id", ""))
        clean_map_id = map_id.replace("gachi_", "")
        match_type = str(row.get("match_type", "unknown"))
        
        # ガチバトル指定の場合: ランク帯（all, mythic, legendary, masters）で分岐
        if type == "gachi":
            target_match_type = {
                "all": ["gachi"],
                "mythic": ["gachi_mythic"],
                "legendary": ["gachi_legendary"],
                "masters": ["gachi_masters"]
            }.get(rank_tier, ["gachi"])
            
            if match_type not in target_match_type:
                continue
        elif type == "global":
            # 全体Tierの場合: 二重カウント防止のためgachi専用タグ以外の基本データを抽出
            if match_type.startswith("gachi"):
                continue
            
        # マップ別フィルタ
        if sub_type == "map" and id:
            clean_id = id.replace("gachi_", "")
            if clean_map_id != clean_id and map_id != id:
                continue
                
        # モード別フィルタ
        if sub_type == "mode" and id and valid_map_ids is not None:
            if map_id not in valid_map_ids and clean_map_id not in valid_map_ids:
                continue
                
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
        char_stats[cid]["total_wins"] += (row.get("total_wins") or 0)
        char_stats[cid]["total_matches"] += (row.get("total_matches") or 0)
        char_stats[cid]["sum_pick_dev"] += (row.get("pick_rate_deviation") or 50.0)
        char_stats[cid]["count"] += 1
        
    # スコア計算と詳細データの作成
    scored_chars = []
    characters_detail = {}
    
    # 全体の総試合数 (使用率計算用)
    global_total_matches = sum(s["total_matches"] for s in char_stats.values())
    if global_total_matches == 0: global_total_matches = 1
    
    # 対象キャラ母集団の総数 K と、均等に使用された場合の理論使用割合 r_expected (1/K)
    K = len(char_stats)
    r_expected = 1.0 / K if K > 0 else 0.01

    for cid, stats in char_stats.items():
        tm = stats["total_matches"]
        tw = stats["total_wins"]
        
        # 表示用の実勝率
        actual_wr = (tw / tm * 100) if tm > 0 else 50.0
        
        # ランク付け用の信頼勝率（ウィルソンスコア下限 z=1.645）
        ranking_wr = wilson_lower_bound(tw, tm, z=1.645) * 100
        
        # 全体使用率 u_i と、均等使用率に対する相対比率 ratio
        # Why: 固定の試合数しきい値ではなく、母集団全体における割合（均等比率 1/K）を基準とすることで、
        # 全体集計・モード別・マップ別どんなデータ規模でもスケーラブルに適正な信頼度を算出できる。
        use_rate = (tm / global_total_matches) * 100
        u_i = tm / global_total_matches
        ratio = u_i / r_expected if r_expected > 0 else 1.0
        
        # 動的シグモイド信頼度関数 C(ratio)
        # 均等使用率の35%未満の極小サンプルキャラは信頼度が低下し、50%（中央値）へ回帰。
        # 均等使用率の70%以上のキャラは信頼度90%以上となり、実力勝率が正当に評価される。
        conf = 1.0 / (1.0 + math.exp(-7.0 * (ratio - 0.35)))
        
        # 汎用性と環境メタを反映する穏やかな対数ピックボーナス（上限4.0点）
        # 線形偏差値だとカジュアル人気キャラ（エドガー等）が過剰評価されるため、対数スケールを採用
        pick_bonus = min(math.log1p(ratio) * 2.5, 4.0)
        
        # 最終スコア: 回帰信頼勝率 (94%) + 穏やかな環境ピック補正 (6%)
        regressed_wr = (ranking_wr * conf) + (50.0 * (1.0 - conf))
        score = (regressed_wr * 0.94) + ((50.0 + pick_bonus) * 0.06)
        score = min(max(score, 0.0), 100.0)
        
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
    
    # 7段階Tierの割り当て (S+: 5%, S: 12%, A+: 25%, A: 45%, B: 70%, C: 88%, D: 100%)
    total_chars = len(scored_chars)
    sp_limit = max(1, int(total_chars * 0.05))
    s_limit  = max(1, int(total_chars * 0.12))
    ap_limit = max(1, int(total_chars * 0.25))
    a_limit  = max(1, int(total_chars * 0.45))
    b_limit  = max(1, int(total_chars * 0.70))
    c_limit  = max(1, int(total_chars * 0.88))
    
    tiers = {"S+": [], "S": [], "A+": [], "A": [], "B": [], "C": [], "D": []}
    for i, sc in enumerate(scored_chars):
        cid = sc["id"]
        if i < sp_limit:
            tiers["S+"].append(cid)
        elif i < s_limit:
            tiers["S"].append(cid)
        elif i < ap_limit:
            tiers["A+"].append(cid)
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
def get_categories(type: str = "global"):
    """カテゴリ一覧（モード、マップ、モード→マップの対応）を返す。

    mode_to_maps は match_raw_history テーブルから動的に構築し、
    選択されたモードに対応するマップのみをフロントエンドで絞り込めるようにする。
    """
    db = get_db()
    maps = []
    mode_to_maps: dict[str, list[str]] = {}

    try:
        # --- Step 1: macro_map_stats からマップ一覧と試合数を安全に全件取得 ---
        map_counts: dict[str, int] = {}
        offset = 0
        PAGE_SIZE = 1000
        while True:
            res = db.table("macro_map_stats").select("map_id, match_type, total_matches").range(offset, offset + PAGE_SIZE - 1).execute()
            if not res.data:
                break
            for row in res.data:
                m_id = row.get("map_id")
                if not m_id:
                    continue
                clean_m_id = str(m_id).replace("gachi_", "")
                matches = row.get("total_matches") or 0
                if type == "gachi":
                    mtype = str(row.get("match_type", ""))
                    if mtype.startswith("gachi") or mtype in ["soloRanked", "teamRanked"]:
                        map_counts[clean_m_id] = map_counts.get(clean_m_id, 0) + matches
                else:
                    map_counts[clean_m_id] = map_counts.get(clean_m_id, 0) + matches
            if len(res.data) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
        
        # 10試合以上の十分なサンプルがあるマップのみを優先抽出し、少数サンプルマップを除外
        filtered_maps = [m for m, count in map_counts.items() if count >= 10]
        maps = filtered_maps if len(filtered_maps) > 0 else list(map_counts.keys())

        # --- Step 2: match_raw_history から mode → map_id の対応表を構築 ---
        # ページネーションで全件走査し、正確なマッピングを構築
        try:
            temp_mode_map: dict[str, set[str]] = {}
            offset = 0
            page_size = 1000
            max_records = 10000  # 安全上限

            while offset < max_records:
                raw_res = (
                    db.table("match_raw_history")
                    .select("mode, map_id, match_type")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                if not raw_res.data:
                    break

                for r in raw_res.data:
                    m_name = r.get("mode")
                    m_id = r.get("map_id")
                    m_type = r.get("match_type")
                    if not m_name or not m_id:
                        continue
                    # ガチバトルモードの場合、ランク戦のみを対象
                    if type == "gachi" and m_type not in ["ranked", "soloRanked", "teamRanked"]:
                        continue
                    clean_m_id = str(m_id).replace("gachi_", "")
                    if m_name not in temp_mode_map:
                        temp_mode_map[m_name] = set()
                    temp_mode_map[m_name].add(clean_m_id)

                if len(raw_res.data) < page_size:
                    break
                offset += page_size

            # maps 一覧にあるマップのみに絞り込む（macro_map_stats に存在するもの）
            maps_set = set(maps)
            mode_to_maps = {
                k: sorted([m for m in v if m in maps_set]) 
                for k, v in temp_mode_map.items()
                if any(m in maps_set for m in v)
            }
        except Exception as e:
            print(f"Failed to build mode_to_maps: {e}")
            mode_to_maps = {}
    except Exception as e:
        print(f"Failed to fetch categories: {e}")
        maps = []
        mode_to_maps = {}
        
    return {
        "modes": ["brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"],
        "maps": maps,
        "mode_to_maps": mode_to_maps
    }

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str, type: str = "global", sub_type: str = None, id: str = None):
    db = get_db()
    char_id_lower = character_id.lower()
    
    # 1. 基本情報の取得 (Tier表ロジックと同じく集計)
    tier_data = get_tier_list(type=type, sub_type=sub_type, id=id, include_details=True)
    chars = tier_data.get("characters", {})
    
    if char_id_lower not in chars:
        # 基本データ(macro_map_stats)にない場合は、dynamic_countersから逆算して補完を試みる
        fallback_matches = 0
        fallback_wins = 0
        try:
            fallback_res = db.table("dynamic_counters").select("match_count,win_count").eq("char_a", char_id_lower).execute()
            for r in fallback_res.data:
                fallback_matches += r.get("match_count", 0)
                fallback_wins += r.get("win_count", 0)
        except:
            pass
            
        fallback_win_rate = round((fallback_wins / fallback_matches * 100), 1) if fallback_matches > 0 else 50.0
        
        detail = {
            "score": 0,
            "win_rate": fallback_win_rate,
            "use_rate": 0.0,
            "total_matches": fallback_matches
        }
        my_tier = "Unknown"
    else:
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
        
        # 各対面について、ウィルソン・スコア（有利スコアと不利スコア）を計算
        for c in counters:
            m = c.get("match_count") or 0
            w = c.get("win_count") or 0
            losses = m - w
            
            # Why: 対面相性はサンプル数が小さくなりやすいため、z=1.28(80%信頼度)を明示的に使用し、
            # 勝率が高い対面が過度なペナルティで埋もれるのを防止
            c["advantage_score"] = wilson_lower_bound(w, m, z=1.28)
            c["disadvantage_score"] = wilson_lower_bound(losses, m, z=1.28)

        # カモ (有利な対面: 有利スコアが高い順)
        counters.sort(key=lambda x: x.get("advantage_score", 0.0), reverse=True)
        for c in counters:
            if len(kamo) >= 5: break
            enemy_id = c["char_b"]
            # Why: 3試合未満の極小サンプルノイズを排除
            if enemy_id == "unknown" or c.get("match_count", 0) < 3 or c["advantage_score"] == 0:
                continue
            kamo.append({
                "brawler": enemy_id,
                "name": format_char_name(enemy_id),
                "win_rate": round( (c["win_count"] / c["match_count"] * 100) if c["match_count"] > 0 else 50.0, 1 ),
                "matches": c.get("match_count", 0)
            })
                
        # 天敵 (不利な対面: 不利スコアが高い順)
        counters.sort(key=lambda x: x.get("disadvantage_score", 0.0), reverse=True)
        for c in counters:
            if len(tenteki) >= 5: break
            enemy_id = c["char_b"]
            if enemy_id == "unknown" or c.get("match_count", 0) < 3 or c["disadvantage_score"] == 0:
                continue
            tenteki.append({
                "brawler": enemy_id,
                "name": format_char_name(enemy_id),
                "win_rate": round( (c["win_count"] / c["match_count"] * 100) if c["match_count"] > 0 else 50.0, 1 ),
                "matches": c.get("match_count", 0)
            })
    except Exception as e:
        print(f"Failed to fetch counters: {e}")
        
    detail["kamo"] = kamo
    detail["tenteki"] = tenteki
    
    return detail

@router.get("/debug/db")
def debug_db():
    db = get_db()
    try:
        # Check match_raw_history
        raw_res = db.table("match_raw_history").select("match_type").limit(1000).execute()
        raw_types = list(set([r.get("match_type") for r in raw_res.data]))
        
        # Check macro_map_stats
        macro_res = db.table("macro_map_stats").select("match_type, map_id").limit(1000).execute()
        macro_types = list(set([r.get("match_type") for r in macro_res.data]))
        macro_maps_solo = list(set([r.get("map_id") for r in macro_res.data if r.get("match_type") in ["ranked", "soloRanked", "teamRanked"]]))
        
        return {
            "match_raw_history_types": raw_types,
            "macro_map_stats_types": macro_types,
            "macro_map_stats_solo_maps": macro_maps_solo
        }
    except Exception as e:
        return {"error": str(e)}
