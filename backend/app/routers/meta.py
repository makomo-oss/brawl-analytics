from fastapi import APIRouter, HTTPException, Response
import math
import time
import logging
from collections import OrderedDict
from concurrent.futures import Future
from threading import Lock
from app.database import get_db
from app.algorithm.statistics import blend_tier_score, normal_tier_boundaries, posterior_rate, supported_win_lift, wilson_interval, MIN_TIER_MATCHES, MIN_TIER_WEIGHT, TIER_EVIDENCE_MATCHES, TIER_WIN_WEIGHT, TIER_USAGE_WEIGHT, ANALYSIS_WINDOW_DAYS, RECENT_WINDOW_DAYS, HALF_LIFE_DAYS, OLDER_HALF_LIFE_DAYS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meta", tags=["Meta"])


@router.get("/brawlers")
async def brawler_catalog(response: Response):
    from app.services.brawler_catalog import get_brawler_catalog
    response.headers["Cache-Control"] = "public, max-age=300"
    return await get_brawler_catalog()


USAGE_ADJUSTMENT_CAP = 2.0
GACHI_TIER_THRESHOLDS = ((57, "S+"), (54, "S"), (52, "A+"), (50, "A"), (48, "B"), (46, "C"))
MIN_DISPLAY_MATCHUP_MATCHES = 5
MIN_DISPLAY_MATCHUP_WEIGHT = 3.0

# --- In-Memory Cache Layers (TTL = 3600 seconds / 1 hour) ---
# 日次バッチ実行時 (clear_meta_cache) または 1 時間経過で最新化
_MACRO_CACHE = {"data": None, "timestamp": 0, "ttl": 3600}
_TOTAL_MATCHES_CACHE = {"count": 0, "timestamp": 0, "ttl": 3600}
_CATEGORIES_CACHE = {"data": {}, "timestamp": 0, "ttl": 3600}
_COUNTERS_CACHE = {"data": None, "by_char": {}, "timestamp": 0, "ttl": 3600}
_SYNERGIES_CACHE = {"data": None, "by_char": {}, "timestamp": 0, "ttl": 3600}
_PAIR_CONTEXT_CACHE = OrderedDict()
_PAIR_CACHE_LOCK = Lock()
_PAIR_PENDING = {}
_PAIR_CACHE_GENERATION = 0
_PAIR_CACHE_TTL = 3600  # Match the aggregate snapshot; the daily batch clears both.
_PAIR_CACHE_LIMIT = 256
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
    global _PAIR_CACHE_GENERATION
    with _PAIR_CACHE_LOCK:
        _PAIR_CONTEXT_CACHE.clear()
        _PAIR_PENDING.clear()
        _PAIR_CACHE_GENERATION += 1
    from app.services.brawler_pages import clear_cache
    clear_cache()


@router.get("/brawler-pages")
def brawler_page_index(response: Response):
    from app.services.brawler_pages import snapshot
    response.headers["Cache-Control"] = "public, max-age=300"
    return snapshot()


@router.get("/brawler-pages/{character_id}")
def brawler_page_data(character_id: str, response: Response):
    from app.services.brawler_pages import snapshot
    response.headers["Cache-Control"] = "public, max-age=300"
    return snapshot(character_id)

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

        _SYNERGIES_CACHE["data"] = all_synergies
        _SYNERGIES_CACHE["by_char"] = by_char
        _SYNERGIES_CACHE["timestamp"] = now
        return by_char
    except Exception:
        logger.exception("Could not load validated synergy snapshot")
        return {}

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
            # The composite key gives every page a stable, unique order.
            res = (db.table("macro_map_stats").select("*")
                   .order("map_id").order("character_id").order("match_type").order("mode")
                   .range(offset, offset + PAGE_SIZE - 1).execute())
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

def _contextual_pairs(db, type, sub_type, selected_id, rank_tier, mode=None, character_id=None):
    key = (type, sub_type, selected_id, rank_tier, mode, _normalize_id(character_id))
    with _PAIR_CACHE_LOCK:
        cached = _PAIR_CONTEXT_CACHE.get(key)
        if cached and time.time() - cached[0] < _PAIR_CACHE_TTL:
            _PAIR_CONTEXT_CACHE.move_to_end(key)
            return cached[1]
        pending = _PAIR_PENDING.get(key)
        owner = pending is None
        if owner:
            pending = Future()
            _PAIR_PENDING[key] = pending
        generation = _PAIR_CACHE_GENERATION
    if not owner:
        return pending.result()
    params = {"p_type": type,
        "p_mode": selected_id if sub_type == "mode" else mode,
        "p_map": selected_id if sub_type == "map" else None,
        "p_rank": rank_tier}
    rpc_name = "contextual_pair_stats"
    if character_id:
        rpc_name = "character_pair_stats"
        params["p_character"] = character_id
    try:
        rows = db.rpc(rpc_name, params).execute().data or []
        by_char = {}
        for row in rows:
            by_char.setdefault(_normalize_id(row["char_a"]), []).append(row)
        with _PAIR_CACHE_LOCK:
            # A daily refresh must not be overwritten by a query started earlier.
            if generation == _PAIR_CACHE_GENERATION:
                _PAIR_CONTEXT_CACHE[key] = (time.time(), by_char)
                _PAIR_CONTEXT_CACHE.move_to_end(key)
                while len(_PAIR_CONTEXT_CACHE) > _PAIR_CACHE_LIMIT:
                    _PAIR_CONTEXT_CACHE.popitem(last=False)
        pending.set_result(by_char)
        return by_char
    except Exception as exc:
        logger.exception("Could not load contextual pair statistics")
        error = HTTPException(status_code=503, detail="相性データを取得できませんでした。時間をおいて再試行してください。")
        pending.set_exception(error)
        raise error from exc
    finally:
        with _PAIR_CACHE_LOCK:
            if _PAIR_PENDING.get(key) is pending:
                del _PAIR_PENDING[key]


def _display_matchups(pairs):
    """Rank observed counters with a conservative, recency-weighted estimate."""
    favorable, unfavorable = [], []
    for pair in pairs:
        if pair["kind"] != "counter":
            continue
        matches = pair["match_count"]
        weighted_matches = pair["weighted_matches"]
        if matches < MIN_DISPLAY_MATCHUP_MATCHES or weighted_matches < MIN_DISPLAY_MATCHUP_WEIGHT:
            continue
        rate = posterior_rate(pair["weighted_wins"], weighted_matches)
        entry = {"brawler": pair["char_b"], "name": format_char_name(pair["char_b"]),
                 "win_rate": round(rate * 100, 1), "matches": matches}
        if rate > 0.5:
            favorable.append(entry)
        elif rate < 0.5:
            unfavorable.append(entry)
    favorable.sort(key=lambda item: (-item["win_rate"], -item["matches"], item["brawler"]))
    unfavorable.sort(key=lambda item: (item["win_rate"], -item["matches"], item["brawler"]))
    return favorable[:5], unfavorable[:5]


@router.get("/tier-list")
def get_tier_list(type: str = "global", sub_type: str = None, id: str = None, rank_tier: str = "all", include_details: bool = False, mode: str = None, detail_character: str = None, include_matchup_fallback: bool = True):
    db = get_db()
    
    # Counts below come from the selected aggregate rows. A raw-history exact
    # count is unused here and delays every cold Tier/detail request.
    # macro_map_statsからデータをインメモリキャッシュから超高速取得
    data = _get_cached_macro_data(db)
        
    if not data:
        # データがまだない場合は空を返す
        return {
            "updated_at": None,
            "tiers": {"S+": [], "S": [], "A+": [], "A": [], "B": [], "C": [], "D": []},
            "type": type,
            "rank_tier": rank_tier,
            "metrics": {"analyzed_matches": 0},
            "characters": {}
        }
        
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
                
        if sub_type == "mode" and id and row.get("mode") != id:
            continue

        if mode and row.get("mode") != mode:
            continue
        filtered_data.append(row)
        
    data = filtered_data

    # Compare each character with the same map/mode/cohort population to reduce mix bias.
    contexts = {}
    for row in data:
        key = (row.get("match_type"), row.get("mode"), row.get("map_id"))
        wins = row.get("weighted_wins") if row.get("weighted_wins") is not None else (row.get("total_wins") or 0)
        matches = row.get("weighted_matches") if row.get("weighted_matches") is not None else (row.get("total_matches") or 0)
        aggregate = contexts.setdefault(key, [0.0, 0.0])
        aggregate[0] += wins
        aggregate[1] += matches
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
                "weighted_matches": 0.0,
                "weighted_wins": 0.0,
                "expected_wins": 0.0
            }
        char_stats[cid]["total_wins"] += (row.get("total_wins") or 0)
        char_stats[cid]["total_matches"] += (row.get("total_matches") or 0)
        context_w, context_n = contexts[(row.get("match_type"), row.get("mode"), row.get("map_id"))]
        row_n = row.get("weighted_matches") if row.get("weighted_matches") is not None else (row.get("total_matches") or 0)
        char_stats[cid]["expected_wins"] += row_n * (context_w / context_n if context_n else 0.5)
        char_stats[cid]["weighted_matches"] += row.get("weighted_matches") if row.get("weighted_matches") is not None else (row.get("total_matches") or 0)
        char_stats[cid]["weighted_wins"] += row.get("weighted_wins") if row.get("weighted_wins") is not None else (row.get("total_wins") or 0)
        
    # スコア計算と詳細データの作成
    scored_chars = []
    characters_detail = {}
    
    # 全体の総試合数 (使用率計算用)
    global_total_matches = sum(s["total_matches"] for s in char_stats.values())
    if global_total_matches == 0: global_total_matches = 1
    # Popularity contributes to the score, so it must use the same recency
    # weights as performance. Raw use_rate remains a factual 60-day share.
    weighted_total = sum(v["weighted_matches"] for v in char_stats.values())
    mean_picks = weighted_total / len(char_stats) if char_stats else 0.0
    pick_std = math.sqrt(sum((s["weighted_matches"] - mean_picks) ** 2 for s in char_stats.values()) / len(char_stats)) if char_stats else 0.0
    
    # Shrink the win component toward the selected population before blending
    # it with the usage deviation required by the Tier specification.
    weighted_wins = sum(v["weighted_wins"] for v in char_stats.values())
    baseline = weighted_wins / weighted_total if weighted_total else 0.5
    pair_data = (_contextual_pairs(db, type, sub_type, id, rank_tier, mode, detail_character)
                 if include_details else {})
    broad_pair_data = (_contextual_pairs(db, "gachi", None, None, "all", None, detail_character)
                       if include_details and include_matchup_fallback and type == "gachi" and (sub_type in ("map", "mode") or mode or rank_tier != "all") else {})

    for cid, stats in char_stats.items():
        tm = stats["total_matches"]
        tw = stats["total_wins"]
        
        # 表示用の実勝率
        actual_wr = (tw / tm * 100) if tm > 0 else 50.0
        
        weighted_n = stats["weighted_matches"]
        expected_rate = stats["expected_wins"] / weighted_n if weighted_n else baseline
        lift, supported_lift, sample_discount = supported_win_lift(stats["weighted_wins"], weighted_n, expected_rate)
        adjusted = expected_rate + lift
        performance_score = min(100.0, max(0.0, 50.0 + 100.0 * supported_lift))
        pick_deviation = min(100.0, max(0.0, 50.0 + 10.0 * (weighted_n - mean_picks) / pick_std)) if pick_std else 50.0
        # Blend deviations from neutral at the specified 70/30 weights.
        # Capping usage must not silently raise the win component from 70% to 100%.
        score, win_adjustment, usage_adjustment = blend_tier_score(performance_score, pick_deviation, USAGE_ADJUSTMENT_CAP)
        use_rate = tm / global_total_matches * 100
        eligible = tm >= MIN_TIER_MATCHES and weighted_n >= MIN_TIER_WEIGHT
        if eligible:
            scored_chars.append({"id": cid, "score": score})
        low, high = wilson_interval(tw, tm)

        # 基本情報（score, win_rate, use_rate, total_matches）は常時提供 (超軽量: 数KB)
        char_entry = {
            "score": round(score, 1),
            "performance_score": round(performance_score, 1),
            "win_adjustment": round(win_adjustment, 1),
            "pick_rate_deviation": round(pick_deviation, 1),
            "usage_adjustment": round(usage_adjustment, 1),
            "win_rate": round(actual_wr, 1),
            "use_rate": round(use_rate, 2),
            "total_matches": tm,
            "weighted_matches": round(weighted_n, 2),
            "weighted_win_rate": round(stats["weighted_wins"] / weighted_n * 100, 1) if weighted_n else None,
            "context_baseline_win_rate": round(expected_rate * 100, 1),
            "adjusted_win_rate": round(adjusted * 100, 1),
            "estimated_win_lift": round(lift * 100, 1),
            "supported_win_lift": round(supported_lift * 100, 1),
            "sample_discount": round(sample_discount * 100, 1),
            "confidence_interval": [round(low * 100, 1), round(high * 100, 1)],
            "sample_sufficient": eligible
        }
        
        # include_details=True の場合のみ、重い対面マトリクス(matchups/kamo/tenteki)と味方シナジー(synergies)を付与
        if include_details and (not detail_character or _normalize_id(cid) == _normalize_id(detail_character)):
            norm_cid = _normalize_id(cid)
            
            char_pairs = pair_data.get(norm_cid, [])
            matchups, synergies = {}, {}
            kamo, tenteki = _display_matchups(char_pairs)
            matchup_scope = "選択条件" if type == "gachi" else "全体Tierの3対3"
            kamo_scope = tenteki_scope = matchup_scope
            if broad_pair_data and (len(kamo) < 2 or len(tenteki) < 2):
                broad_kamo, broad_tenteki = _display_matchups(broad_pair_data.get(norm_cid, []))
                if len(kamo) < 2 and len(broad_kamo) > len(kamo):
                    kamo = broad_kamo
                    kamo_scope = "ガチバトル・エリート以上全体"
                if len(tenteki) < 2 and len(broad_tenteki) > len(tenteki):
                    tenteki = broad_tenteki
                    tenteki_scope = "ガチバトル・エリート以上全体"
            for pair in char_pairs:
                enemy = _normalize_id(pair["char_b"])
                m = pair["match_count"]
                weighted_m = pair["weighted_matches"]
                weighted_w = pair["weighted_wins"]
                # A single map often has only one or two observations per pair.
                # Keep those observations in the database, but do not present
                # their posterior as actionable matchup or synergy evidence.
                if m < MIN_TIER_MATCHES or weighted_m < MIN_TIER_WEIGHT:
                    continue
                rate = posterior_rate(weighted_w, weighted_m)
                if pair["kind"] == "counter":
                    matchups[enemy] = round(rate * 100, 1)
                else:
                    ally_stats = next((v for k, v in char_stats.items() if _normalize_id(k) == enemy), None)
                    ally_rate = posterior_rate(ally_stats["weighted_wins"], ally_stats["weighted_matches"], baseline) if ally_stats else baseline
                    expected = (adjusted + ally_rate) / 2
                    synergy_rate = posterior_rate(weighted_w, weighted_m, expected)
                    synergies[enemy] = {"win_rate": round(synergy_rate * 100, 1),
                                       "lift": round((synergy_rate - expected) * 100, 1), "matches": m}
            char_entry.update({"kamo": kamo, "tenteki": tenteki,
                               "kamo_scope": kamo_scope, "tenteki_scope": tenteki_scope,
                               "matchups": matchups, "synergies": synergies})

        characters_detail[cid] = char_entry
            
    # スコアで降順ソート
    scored_chars.sort(key=lambda x: (-x["score"], -characters_detail[x["id"]]["weighted_matches"], x["id"]))
    
    # The global view is a relative ranking: map score ranks to normal-curve
    # proportions while leaving numerical evidence scores untouched. Ranked-only
    # cohorts stay on fixed thresholds because most characters lack enough data.
    tiers = {key: [] for key in ["S+", "S", "A+", "A", "B", "C", "D", "N/A"]}
    for rank, sc in enumerate(scored_chars, 1):
        characters_detail[sc["id"]]["rank_position"] = rank
    if type == "global":
        boundaries = normal_tier_boundaries([sc["score"] for sc in scored_chars]) + [len(scored_chars)]
        start = 0
        for tier, end in zip(("S+", "S", "A+", "A", "B", "C", "D"), boundaries):
            tiers[tier] = [sc["id"] for sc in scored_chars[start:end]]
            start = end
    else:
        for sc in scored_chars:
            tier = next((name for threshold, name in GACHI_TIER_THRESHOLDS if sc["score"] >= threshold), "D")
            tiers[tier].append(sc["id"])
    tiers["N/A"] = [cid for cid, stats in characters_detail.items() if not stats["sample_sufficient"]]

    # Each source row describes one observed player's match, not all six players.
    display_matches = sum(s["total_matches"] for s in char_stats.values())

    response_data = {
        "updated_at": max((str(r.get("updated_at") or "") for r in data), default="") or None,
        "tiers": tiers,
        "type": type,
        "rank_tier": rank_tier,
        "metrics": {"analyzed_matches": display_matches, "count_unit": "player_observations", "baseline_win_rate": round(baseline * 100, 1), "minimum_matches": MIN_TIER_MATCHES, "analysis_window_days": ANALYSIS_WINDOW_DAYS, "recent_window_days": RECENT_WINDOW_DAYS, "half_life_days": HALF_LIFE_DAYS, "older_half_life_days": OLDER_HALF_LIFE_DAYS, "evidence_half_credit_matches": TIER_EVIDENCE_MATCHES, "win_weight": TIER_WIN_WEIGHT, "usage_weight": TIER_USAGE_WEIGHT, "usage_adjustment_cap": USAGE_ADJUSTMENT_CAP, "tier_method": "normal_rank_quantiles" if type == "global" else "fixed_score_thresholds", "tier_thresholds": None if type == "global" else {name: score for score, name in GACHI_TIER_THRESHOLDS}, "eligible_characters": len(scored_chars), "method": "context_smooth_sample_shrinkage_70_30_v8"},
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

    mode_to_maps = {}
    for row in _get_cached_macro_data(db):
        cohort = str(row.get("match_type", ""))
        if (type == "gachi" and cohort != "gachi") or (type != "gachi" and cohort.startswith("gachi")):
            continue
        mode, map_id = row.get("mode"), row.get("map_id")
        if mode and mode != "unknown" and map_id:
            mode_to_maps.setdefault(mode, set()).add(map_id)
    result = {"modes": sorted(mode_to_maps),
              "maps": sorted(set().union(*mode_to_maps.values())) if mode_to_maps else [],
              "mode_to_maps": {mode: sorted(maps) for mode, maps in mode_to_maps.items()}}
    _CATEGORIES_CACHE["data"][type] = result
    _CATEGORIES_CACHE["timestamp"] = now
    return result

@router.get("/characters/{character_id}")
def get_character_detail(character_id: str, type: str = "global", rank_tier: str = "all", sub_type: str = None, id: str = None, mode: str = None, response: Response = None):
    if response is not None:
        response.headers["Cache-Control"] = "public, max-age=300"
    db = get_db()
    char_id_raw = character_id.lower().strip()
    norm_target = _normalize_id(char_id_raw)
    
    # 1. 基本情報の取得 (Tier表ロジックと同じく集計)
    tier_data = get_tier_list(type=type, sub_type=sub_type, id=id, rank_tier=rank_tier,
                             mode=mode, include_details=True, detail_character=char_id_raw)
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
