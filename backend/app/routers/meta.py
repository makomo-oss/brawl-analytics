from fastapi import APIRouter, HTTPException
import math
import time
import logging
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meta", tags=["Meta"])

# --- In-Memory Cache Layers (TTL = 3600 seconds / 1 hour) ---
# 日次バッチ実行時 (clear_meta_cache) または 1 時間経過で最新化
_MACRO_CACHE = {"data": None, "timestamp": 0, "ttl": 3600}
_TOTAL_MATCHES_CACHE = {"count": 0, "timestamp": 0, "ttl": 3600}
_CATEGORIES_CACHE = {"data": {}, "timestamp": 0, "ttl": 3600}
_COUNTERS_CACHE = {"data": None, "by_char": {}, "timestamp": 0, "ttl": 3600}
_SYNERGIES_CACHE = {"data": None, "by_char": {}, "timestamp": 0, "ttl": 3600}
_MODE_MAPS_CACHE = {} # mode -> (set of map_ids, timestamp)

def clear_meta_cache():
    """日次バッチ完了時やデータ更新時にキャッシュを即座に破棄・最新化する"""
    _MACRO_CACHE["data"] = None
    _TOTAL_MATCHES_CACHE["count"] = 0
    _CATEGORIES_CACHE["data"] = {}
    _COUNTERS_CACHE["data"] = None
    _COUNTERS_CACHE["by_char"] = {}
    _SYNERGIES_CACHE["data"] = None
    _SYNERGIES_CACHE["by_char"] = {}
    _MODE_MAPS_CACHE.clear()

@router.post("/clear-cache")
def api_clear_cache():
    clear_meta_cache()
    return {"status": "ok", "message": "Meta cache cleared successfully"}

def _normalize_id(name: str) -> str:
    """表記ゆれ（スペース、アンダースコア、ハイフン、ドット、アンド記号）を除去した正規化キーを生成"""
    if not name: return ""
    return str(name).lower().replace(" ", "").replace("_", "").replace("-", "").replace(".", "").replace("&", "")

def _get_cached_synergies(db) -> dict[str, dict[str, dict]]:
    """dynamic_synergies テーブル（事前計算済みバッチデータ）からインメモリキャッシュへ超高速取得 (DB負荷99%削減)"""
    now = time.time()
    if _SYNERGIES_CACHE["data"] is not None and (now - _SYNERGIES_CACHE["timestamp"]) < _SYNERGIES_CACHE["ttl"]:
        return _SYNERGIES_CACHE["by_char"]

    # 1. dynamic_synergies テーブルから一括取得を試みる
    try:
        offset = 0
        PAGE_SIZE = 1000
        all_synergies = []
        by_char: dict[str, dict[str, dict]] = {}
        
        while True:
            res = db.table("dynamic_synergies").select("*").range(offset, offset + PAGE_SIZE - 1).execute()
            if not res.data:
                break
            all_synergies.extend(res.data)
            for row in res.data:
                ca = _normalize_id(row.get("char_a", ""))
                cb = _normalize_id(row.get("char_b", ""))
                if not ca or not cb or ca == cb:
                    continue
                if ca not in by_char:
                    by_char[ca] = {}
                by_char[ca][cb] = {
                    "win_rate": float(row["win_rate"] if row.get("win_rate") is not None else 50.0),
                    "lift": float(row.get("lift") or 0.0),
                    "matches": int(row.get("match_count") or 0)
                }
            if len(res.data) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

        if by_char:
            _SYNERGIES_CACHE["data"] = all_synergies
            _SYNERGIES_CACHE["by_char"] = by_char
            _SYNERGIES_CACHE["timestamp"] = now
            return by_char
    except Exception as e:
        logger.warning(f"Could not load dynamic_synergies table: {e}. Falling back to match_raw_history...")

    # 2. テーブル未作成時の自動フォールバック集計 (match_raw_history)
    try:
        res = db.table("match_raw_history").select("hero_used, allies, result").limit(5000).execute()
        raw_matches = res.data or []
        
        char_single_stats: dict[str, list[int]] = {}
        pair_stats: dict[tuple[str, str], list[int]] = {}
        
        for r in raw_matches:
            hero = str(r.get("hero_used", "") or "").strip()
            norm_hero = _normalize_id(hero)
            if not norm_hero or norm_hero == "unknown":
                continue
                
            allies = r.get("allies", [])
            if isinstance(allies, str):
                import ast
                try: allies = ast.literal_eval(allies)
                except: allies = []
                
            is_win = 1 if str(r.get("result", "")).lower() == "victory" else 0
            
            if norm_hero not in char_single_stats:
                char_single_stats[norm_hero] = [0, 0]
            char_single_stats[norm_hero][0] += is_win
            char_single_stats[norm_hero][1] += 1
            
            for ally in allies:
                ally_str = str(ally).strip()
                norm_ally = _normalize_id(ally_str)
                if not norm_ally or norm_ally == "unknown" or norm_ally == norm_hero:
                    continue
                    
                if norm_ally not in char_single_stats:
                    char_single_stats[norm_ally] = [0, 0]
                char_single_stats[norm_ally][0] += is_win
                char_single_stats[norm_ally][1] += 1
                
                pair_key = (min(norm_hero, norm_ally), max(norm_hero, norm_ally))
                if pair_key not in pair_stats:
                    pair_stats[pair_key] = [0, 0]
                pair_stats[pair_key][0] += is_win
                pair_stats[pair_key][1] += 1

        by_char: dict[str, dict[str, dict]] = {}
        for (c1, c2), (w, m) in pair_stats.items():
            if m < 2: continue
            pair_wr = (w / m) * 100.0
            
            wr1 = (char_single_stats[c1][0] / char_single_stats[c1][1] * 100.0) if (c1 in char_single_stats and char_single_stats[c1][1] > 0) else 50.0
            wr2 = (char_single_stats[c2][0] / char_single_stats[c2][1] * 100.0) if (c2 in char_single_stats and char_single_stats[c2][1] > 0) else 50.0
            expected_wr = (wr1 + wr2) / 2.0
            raw_lift = pair_wr - expected_wr
            
            shrinkage = m / (m + 5.0)
            regressed_lift = round(raw_lift * shrinkage, 1)
            
            entry = {
                "win_rate": round(pair_wr, 1),
                "lift": regressed_lift,
                "matches": m
            }
            if c1 not in by_char: by_char[c1] = {}
            if c2 not in by_char: by_char[c2] = {}
            by_char[c1][c2] = entry
            by_char[c2][c1] = entry

        _SYNERGIES_CACHE["data"] = pair_stats
        _SYNERGIES_CACHE["by_char"] = by_char
        _SYNERGIES_CACHE["timestamp"] = now
        return by_char
    except Exception as e:
        print(f"Failed to calculate synergies fallback: {e}")
        return _SYNERGIES_CACHE.get("by_char", {})

def _get_cached_counters_for_char(db, char_a: str) -> list[dict]:
    """dynamic_counters をインメモリキャッシュから超高速に取得 (DB通信をゼロに)"""
    now = time.time()
    if _COUNTERS_CACHE["data"] is not None and (now - _COUNTERS_CACHE["timestamp"]) < _COUNTERS_CACHE["ttl"]:
        return _COUNTERS_CACHE["by_char"].get(char_a.lower(), [])
        
    try:
        offset = 0
        PAGE_SIZE = 1000
        all_counters = []
        by_char = {}
        while True:
            res = db.table("dynamic_counters").select("*").range(offset, offset + PAGE_SIZE - 1).execute()
            if not res.data:
                break
            all_counters.extend(res.data)
            for row in res.data:
                ca = str(row.get("char_a", "")).lower()
                if ca not in by_char:
                    by_char[ca] = []
                by_char[ca].append(row)
            if len(res.data) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
            
        _COUNTERS_CACHE["data"] = all_counters
        _COUNTERS_CACHE["by_char"] = by_char
        _COUNTERS_CACHE["timestamp"] = now
        return by_char.get(char_a.lower(), [])
    except Exception as e:
        if _COUNTERS_CACHE["data"] is not None:
            return _COUNTERS_CACHE["by_char"].get(char_a.lower(), [])
        try:
            res = db.table("dynamic_counters").select("*").eq("char_a", char_a.lower()).execute()
            return res.data or []
        except:
            return []

def _get_cached_macro_data(db) -> list[dict]:
    """macro_map_stats をインメモリキャッシュから超高速に取得 (DB通信を99%削減)"""
    now = time.time()
    if _MACRO_CACHE["data"] is not None and (now - _MACRO_CACHE["timestamp"]) < _MACRO_CACHE["ttl"]:
        return _MACRO_CACHE["data"]
        
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
        _MACRO_CACHE["data"] = data
        _MACRO_CACHE["timestamp"] = now
        return data
    except Exception as e:
        if _MACRO_CACHE["data"] is not None:
            return _MACRO_CACHE["data"] # フォールバック
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def _get_cached_total_analyzed(db) -> int:
    """総試合数をインメモリキャッシュから取得"""
    now = time.time()
    if _TOTAL_MATCHES_CACHE["count"] > 0 and (now - _TOTAL_MATCHES_CACHE["timestamp"]) < _TOTAL_MATCHES_CACHE["ttl"]:
        return _TOTAL_MATCHES_CACHE["count"]
    try:
        res = db.table("match_raw_history").select("match_id", count="exact").limit(1).execute()
        if res.count is not None:
            _TOTAL_MATCHES_CACHE["count"] = res.count
            _TOTAL_MATCHES_CACHE["timestamp"] = now
            return res.count
    except:
        pass
    return _TOTAL_MATCHES_CACHE["count"]

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
    
    # マッチ数のカウント（キャッシュから高速取得）
    total_analyzed = _get_cached_total_analyzed(db)
        
    # macro_map_statsからデータをインメモリキャッシュから超高速取得
    data = _get_cached_macro_data(db)
        
    if not data:
        # データがまだない場合は空を返す
        return {
            "updated_at": None,
            "tiers": {"S+": [], "S": [], "A+": [], "A": [], "B": [], "C": [], "D": []},
            "type": type,
            "rank_tier": rank_tier,
            "metrics": {"analyzed_matches": total_analyzed},
            "characters": {}
        }
        
    # モード別のマップ一覧が必要な場合
    valid_map_ids = None
    if sub_type == "mode" and id:
        now = time.time()
        cached_mode = _MODE_MAPS_CACHE.get(id)
        if cached_mode and (now - cached_mode[1]) < 3600:
            valid_map_ids = cached_mode[0]
        else:
            try:
                mode_res = db.table("match_raw_history").select("map_id").eq("mode", id).limit(5000).execute()
                valid_map_ids = set()
                for r in (mode_res.data or []):
                    m = r.get("map_id")
                    if m:
                        valid_map_ids.add(str(m))
                        valid_map_ids.add(str(m).replace("gachi_", ""))
                _MODE_MAPS_CACHE[id] = (valid_map_ids, now)
            except Exception as e:
                logger.warning(f"Failed to fetch maps for mode {id}: {e}")
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
        
        # 基本情報（score, win_rate, use_rate, total_matches）は常時提供 (超軽量: 数KB)
        char_entry = {
            "score": round(score, 1),
            "win_rate": round(actual_wr, 1),
            "use_rate": round(use_rate, 2),
            "total_matches": tm
        }
        
        # include_details=True の場合のみ、重い対面マトリクス(matchups/kamo/tenteki)と味方シナジー(synergies)を付与
        if include_details:
            norm_cid = _normalize_id(cid)
            
            # 1. 味方シナジーマトリクス (match_raw_history から完全自動集計)
            all_synergies = _get_cached_synergies(db)
            char_synergies = all_synergies.get(norm_cid, {})
            
            # 2. 対面カウンターマトリクス (dynamic_counters)
            kamo = []
            tenteki = []
            matchups = {}
            try:
                raw_counters = _get_cached_counters_for_char(db, cid)
                merged_counters: dict[str, list[int]] = {}
                for r in raw_counters:
                    cb = str(r.get("char_b", "")).lower().strip()
                    mc = r.get("match_count", 0) or 0
                    wc = r.get("win_count", 0) or 0
                    if not cb or cb == "unknown" or cb == cid:
                        continue
                    if cb not in merged_counters:
                        merged_counters[cb] = [0, 0]
                    merged_counters[cb][0] += mc
                    merged_counters[cb][1] += wc

                ranked_counters = []
                for enemy_id, (m, w) in merged_counters.items():
                    losses = m - w
                    adv = wilson_lower_bound(w, m, z=1.28)
                    disadv = wilson_lower_bound(losses, m, z=1.28)
                    wr = round((w / m * 100) if m > 0 else 50.0, 1)
                    norm_enemy = _normalize_id(enemy_id)
                    matchups[norm_enemy] = wr
                    ranked_counters.append((enemy_id, m, w, adv, disadv, wr))

                # カモ (有利な対面)
                ranked_counters.sort(key=lambda x: x[3], reverse=True)
                for enemy_id, m, w, adv, disadv, wr in ranked_counters:
                    if len(kamo) >= 8: break
                    if m < 2 or adv <= 0.5: continue
                    kamo.append({
                        "brawler": enemy_id,
                        "name": format_char_name(enemy_id),
                        "win_rate": wr,
                        "matches": m
                    })

                # 天敵 (不利な対面)
                ranked_counters.sort(key=lambda x: x[4], reverse=True)
                for enemy_id, m, w, adv, disadv, wr in ranked_counters:
                    if len(tenteki) >= 8: break
                    if m < 2 or disadv <= 0.5: continue
                    tenteki.append({
                        "brawler": enemy_id,
                        "name": format_char_name(enemy_id),
                        "win_rate": wr,
                        "matches": m
                    })
            except Exception:
                pass

            char_entry["kamo"] = kamo
            char_entry["tenteki"] = tenteki
            char_entry["matchups"] = matchups
            char_entry["synergies"] = char_synergies

        characters_detail[cid] = char_entry
            
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
            
    # Each source row describes one observed player's match, not all six players.
    display_matches = sum(s["total_matches"] for s in char_stats.values())

    response_data = {
        "updated_at": max((str(r.get("updated_at") or "") for r in data), default="") or None,
        "tiers": tiers,
        "type": type,
        "rank_tier": rank_tier,
        "metrics": {"analyzed_matches": display_matches, "count_unit": "player_observations"},
        "characters": characters_detail
    }
    return response_data

@router.get("/categories")
def get_categories(type: str = "global"):
    """カテゴリ一覧（モード、マップ、モード→マップの対応）を返す。

    mode_to_maps は match_raw_history テーブルから動的に構築し、
    選択されたモードに対応するマップのみをフロントエンドで絞り込めるようにする。
    """
    db = get_db()
    # インメモリキャッシュの確認
    now = time.time()
    if type in _CATEGORIES_CACHE["data"] and (now - _CATEGORIES_CACHE["timestamp"]) < _CATEGORIES_CACHE["ttl"]:
        return _CATEGORIES_CACHE["data"][type]

    maps = []
    mode_to_maps: dict[str, list[str]] = {}

    try:
        # --- Step 1: macro_map_stats (キャッシュ済み) からマップ一覧と試合数を抽出 ---
        raw_data = _get_cached_macro_data(db)
        map_counts: dict[str, int] = {}
        for row in raw_data:
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
        
        # 10試合以上の十分なサンプルがあるマップのみを優先抽出し、少数サンプルマップを除外
        filtered_maps = [m for m, count in map_counts.items() if count >= 5]
        maps = filtered_maps if len(filtered_maps) > 0 else list(map_counts.keys())

        # --- Step 2: match_raw_history から mode → map_id の対応表を構築 ---
        try:
            temp_mode_map: dict[str, set[str]] = {}
            raw_res = (
                db.table("match_raw_history")
                .select("mode, map_id, match_type")
                .limit(5000)
                .execute()
            )
            for r in (raw_res.data or []):
                m_name = r.get("mode")
                m_id = r.get("map_id")
                m_type = r.get("match_type")
                if not m_name or not m_id:
                    continue
                if type == "gachi" and m_type not in ["ranked", "soloRanked", "teamRanked"]:
                    continue
                clean_m_id = str(m_id).replace("gachi_", "")
                if m_name not in temp_mode_map:
                    temp_mode_map[m_name] = set()
                temp_mode_map[m_name].add(clean_m_id)

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
        
    result = {
        "modes": ["brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"],
        "maps": maps,
        "mode_to_maps": mode_to_maps
    }
    
    _CATEGORIES_CACHE["data"][type] = result
    _CATEGORIES_CACHE["timestamp"] = now
    return result

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str, type: str = "global", rank_tier: str = "all", sub_type: str = None, id: str = None):
    db = get_db()
    char_id_raw = character_id.lower().strip()
    norm_target = _normalize_id(char_id_raw)
    
    # 1. 基本情報の取得 (Tier表ロジックと同じく集計)
    tier_data = get_tier_list(type=type, sub_type=sub_type, id=id, rank_tier=rank_tier, include_details=True)
    chars = tier_data.get("characters", {})
    tiers = tier_data.get("tiers", {})
    
    matched_key = None
    matched_detail = None
    
    if char_id_raw in chars:
        matched_key = char_id_raw
        matched_detail = chars[char_id_raw]
    else:
        for k, v in chars.items():
            if _normalize_id(k) == norm_target:
                matched_key = k
                matched_detail = v
                break
                
    # 所属Tierの検索
    my_tier = "Unknown"
    for t_name, char_list in tiers.items():
        if matched_key and matched_key in char_list:
            my_tier = t_name
            break
        for c in char_list:
            if _normalize_id(c) == norm_target:
                my_tier = t_name
                break
        if my_tier != "Unknown":
            break

    if not matched_detail:
        # 基本データにない場合のフォールバック
        detail = {
            "score": 50.0,
            "win_rate": 50.0,
            "use_rate": 0.0,
            "total_matches": 0,
            "kamo": [],
            "tenteki": []
        }
    else:
        detail = matched_detail

    detail["tier"] = my_tier
    detail["character_id"] = char_id_raw
    
    # 2. カモ・天敵の取得 (dynamic_counters)
    kamo = []
    tenteki = []
    try:
        # キャッシュから自分が char_a になっているデータを取得 (DB通信ゼロ)
        counters = [dict(c) for c in _get_cached_counters_for_char(db, char_id_raw)]
        
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
            if enemy_id == "unknown" or c.get("match_count", 0) < 3 or c["advantage_score"] <= 0.5:
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
            if enemy_id == "unknown" or c.get("match_count", 0) < 3 or c["disadvantage_score"] <= 0.5:
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
