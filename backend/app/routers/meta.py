from fastapi import APIRouter, Depends, HTTPException, Response
import math
import time
import logging
from collections import OrderedDict
from concurrent.futures import Future
from threading import BoundedSemaphore, Lock
from app.database import get_db
from app.routers.cron import verify_cron_secret
from app.services.db_reads import execute_read
from app.algorithm.statistics import assign_tier, blend_tier_score, dynamic_tier_thresholds, pick_share_reliability, posterior_rate, supported_win_lift, wilson_interval, MIN_TIER_MATCHES, MIN_TIER_WEIGHT, PRIOR_MATCHES, TIER_EVIDENCE_MATCHES, TIER_VERSATILITY_HALF_SHARE, TIER_WIN_WEIGHT, TIER_USAGE_WEIGHT, ANALYSIS_WINDOW_DAYS, RECENT_WINDOW_DAYS, HALF_LIFE_DAYS, OLDER_HALF_LIFE_DAYS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meta", tags=["Meta"])


@router.get("/brawlers")
async def brawler_catalog(response: Response):
    from app.services.brawler_catalog import get_brawler_catalog
    response.headers["Cache-Control"] = "public, max-age=300"
    return await get_brawler_catalog()


@router.get("/maps")
async def map_catalog(response: Response):
    from app.services.map_catalog import get_map_catalog
    response.headers["Cache-Control"] = "public, max-age=300"
    return await get_map_catalog()


USAGE_ADJUSTMENT_CAP = 2.0
CORE_3V3_MODES = frozenset({"brawlBall", "gemGrab", "hotZone", "heist", "bounty", "knockout"})
# Rank-stratified weights for overall Ranked ("gachi", rank_tier="all").
GACHI_RANK_BRACKETS = (("gachi_mythic", 0.20), ("gachi_legendary", 0.40), ("gachi_masters", 0.40))
MIN_DISPLAY_MATCHUP_MATCHES = 5
MIN_DISPLAY_MATCHUP_WEIGHT = 3.0

# --- In-Memory Cache Layers (TTL = 3600 seconds / 1 hour) ---
# 日次バッチ実行時 (clear_meta_cache) または 1 時間経過で最新化
_MACRO_CACHE = {"data": None, "timestamp": 0, "ttl": 3600}
_MACRO_CACHE_LOCK = Lock()
_MACRO_CACHE_GENERATION = 0
_MACRO_PENDING = None
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
# Different cold character pages share the same small database. Cache hits and
# same-key followers bypass this gate; only the owners of new RPCs use slots.
_PAIR_READ_SLOTS = BoundedSemaphore(2)
_MODE_MAPS_CACHE = {} # mode -> (set of map_ids, timestamp)

def clear_meta_cache():
    """日次バッチ完了時やデータ更新時にキャッシュを即座に破棄・最新化する"""
    global _MACRO_CACHE_GENERATION, _MACRO_PENDING
    with _MACRO_CACHE_LOCK:
        _MACRO_CACHE["data"] = None
        _MACRO_CACHE_GENERATION += 1
        _MACRO_PENDING = None
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
    from app.services.brawler_catalog import clear_catalog_cache
    from app.services.map_catalog import clear_map_catalog_cache
    clear_cache()
    clear_catalog_cache()
    clear_map_catalog_cache()


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
def api_clear_cache(_secret: str = Depends(verify_cron_secret)):
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
    global _MACRO_PENDING
    with _MACRO_CACHE_LOCK:
        now = time.time()
        if _MACRO_CACHE["data"] is not None and now - _MACRO_CACHE["timestamp"] < _MACRO_CACHE["ttl"]:
            return _MACRO_CACHE["data"]
        owner = _MACRO_PENDING is None
        if owner:
            _MACRO_PENDING = Future()
        pending = _MACRO_PENDING
        generation = _MACRO_CACHE_GENERATION
    if not owner:
        return pending.result()
        
    data = []
    try:
        offset = 0
        PAGE_SIZE = 1000
        while True:
            # The composite key gives every page a stable, unique order.
            res = execute_read(db.table("macro_map_stats").select("*")
                   .order("map_id").order("character_id").order("match_type").order("mode")
                   .range(offset, offset + PAGE_SIZE - 1))
            if not res.data:
                break
            data.extend(res.data)
            if len(res.data) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
        with _MACRO_CACHE_LOCK:
            if generation == _MACRO_CACHE_GENERATION:
                _MACRO_CACHE["data"] = data
                _MACRO_CACHE["timestamp"] = now
        pending.set_result(data)
        return data
    except Exception as e:
        with _MACRO_CACHE_LOCK:
            fallback = _MACRO_CACHE["data"]
        if fallback is not None:
            pending.set_result(fallback)
            return fallback
        error = HTTPException(status_code=500, detail=f"Database error: {e}")
        pending.set_exception(error)
        raise error from e
    finally:
        with _MACRO_CACHE_LOCK:
            if _MACRO_PENDING is pending:
                _MACRO_PENDING = None

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
        with _PAIR_READ_SLOTS:
            rows = execute_read(db.rpc(rpc_name, params)).data or []
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


def _row_non_mirror_values(row: dict) -> tuple[int, int, float, float, float, float]:
    """Extract (nm_matches, nm_wins, nm_weighted_matches, nm_weighted_wins, pick_weighted_matches, pick_weighted_wins)."""
    tm = int(row.get("total_matches") or 0)
    tw = int(row.get("total_wins") or 0)
    pick_wn = float(row["weighted_matches"]) if row.get("weighted_matches") is not None else float(tm)
    pick_ww = float(row["weighted_wins"]) if row.get("weighted_wins") is not None else float(tw)
    nm_tm = int(row["non_mirror_matches"]) if row.get("non_mirror_matches") is not None else tm
    nm_tw = int(row["non_mirror_wins"]) if row.get("non_mirror_wins") is not None else tw
    nm_wn = float(row["non_mirror_weighted_matches"]) if row.get("non_mirror_weighted_matches") is not None else pick_wn
    nm_ww = float(row["non_mirror_weighted_wins"]) if row.get("non_mirror_weighted_wins") is not None else pick_ww
    return nm_tm, nm_tw, nm_wn, nm_ww, pick_wn, pick_ww


def _aggregate_cohort_rows(rows: list[dict]) -> dict:
    """Standardize win lift (mirror-excluded) and log pick share within one cohort/bracket."""
    contexts: dict[tuple, list[float]] = {}
    valid_rows = []
    for row in rows:
        cid = str(row.get("character_id") or "").lower().strip()
        if not cid or cid == "unknown":
            continue
        vals = _row_non_mirror_values(row)
        valid_rows.append((cid, row, vals))
        key = (row.get("match_type"), row.get("mode"), row.get("map_id"))
        aggregate = contexts.setdefault(key, [0.0, 0.0])
        aggregate[0] += vals[3]  # non_mirror_weighted_wins
        aggregate[1] += vals[2]  # non_mirror_weighted_matches

    char_stats: dict[str, dict] = {}
    for cid, row, (nm_tm, nm_tw, nm_wn, nm_ww, pick_wn, pick_ww) in valid_rows:
        entry = char_stats.setdefault(cid, {
            "total_wins": 0,
            "total_matches": 0,
            "weighted_matches": 0.0,
            "weighted_wins": 0.0,
            "nm_matches": 0,
            "nm_wins": 0,
            "nm_weighted_matches": 0.0,
            "nm_weighted_wins": 0.0,
            "expected_wins": 0.0,
        })
        entry["total_wins"] += int(row.get("total_wins") or 0)
        entry["total_matches"] += int(row.get("total_matches") or 0)
        entry["weighted_matches"] += pick_wn
        entry["weighted_wins"] += pick_ww
        entry["nm_matches"] += nm_tm
        entry["nm_wins"] += nm_tw
        entry["nm_weighted_matches"] += nm_wn
        entry["nm_weighted_wins"] += nm_ww
        context_w, context_n = contexts[(row.get("match_type"), row.get("mode"), row.get("map_id"))]
        entry["expected_wins"] += nm_wn * (context_w / context_n if context_n else 0.5)

    nm_total = sum(v["nm_weighted_matches"] for v in char_stats.values())
    nm_wins_total = sum(v["nm_weighted_wins"] for v in char_stats.values())
    baseline = nm_wins_total / nm_total if nm_total else 0.5

    eligible_stats = [
        s for s in char_stats.values()
        if s["total_matches"] >= MIN_TIER_MATCHES and s["weighted_matches"] >= MIN_TIER_WEIGHT
    ]
    pick_population = eligible_stats if len(eligible_stats) >= 2 else list(char_stats.values())
    mean_pick_wn = (
        sum(s["weighted_matches"] for s in pick_population) / len(pick_population)
        if pick_population else 0.0
    )
    log_picks = [math.log1p(max(0.0, s["weighted_matches"])) for s in pick_population]
    mean_log_picks = sum(log_picks) / len(log_picks) if log_picks else 0.0
    pick_log_std = (
        math.sqrt(sum((lp - mean_log_picks) ** 2 for lp in log_picks) / len(log_picks))
        if log_picks else 0.0
    )

    standardized = {}
    for cid, stats in char_stats.items():
        nm_wn = stats["nm_weighted_matches"]
        pick_wn = stats["weighted_matches"]
        expected_rate = stats["expected_wins"] / nm_wn if nm_wn else baseline
        lift, supported_lift, _ = supported_win_lift(stats["nm_weighted_wins"], nm_wn, expected_rate)
        rel_pick = (pick_wn / mean_pick_wn) if mean_pick_wn > 0 else 1.0
        effective_lift = (
            supported_lift * pick_share_reliability(rel_pick)
            if supported_lift > 0 else supported_lift
        )
        pick_z = (
            (math.log1p(max(0.0, pick_wn)) - mean_log_picks) / pick_log_std
            if pick_log_std else 0.0
        )
        standardized[cid] = {
            "expected_rate": expected_rate,
            "lift": lift,
            "supported_lift": effective_lift,
            "sample_discount": lift - effective_lift,
            "pick_z": pick_z,
            "rel_pick": rel_pick,
        }

    return {
        "char_stats": char_stats,
        "standardized": standardized,
        "baseline": baseline,
        "mean_log_picks": mean_log_picks,
        "pick_log_std": pick_log_std,
    }


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
        
    # マップ・モードの共通フィルタを先に適用
    restrict_global_modes = type == "global" and not (sub_type in ("mode", "map") and id) and not mode
    scoped_rows = []
    for row in data:
        map_id = str(row.get("map_id", ""))
        clean_map_id = map_id.replace("gachi_", "")
        if sub_type == "map" and id:
            clean_id = id.replace("gachi_", "")
            if clean_map_id != clean_id and map_id != id:
                continue
        if sub_type == "mode" and id and row.get("mode") != id:
            continue
        if mode and row.get("mode") != mode:
            continue
        scoped_rows.append(row)

    # コホート抽出 (ガチバトル総合はランク帯別データがあればランク帯ごとに標準化して合算)
    bracket_names = {name for name, _ in GACHI_RANK_BRACKETS}
    stratified_gachi = False
    if type == "gachi" and rank_tier == "all":
        bracket_rows = [r for r in scoped_rows if str(r.get("match_type", "")) in bracket_names]
        if bracket_rows:
            stratified_gachi = True
            data = bracket_rows
        else:
            data = [r for r in scoped_rows if str(r.get("match_type", "")) == "gachi"]
    elif type == "gachi":
        target_match_type = {
            "mythic": "gachi_mythic",
            "legendary": "gachi_legendary",
            "masters": "gachi_masters",
        }.get(rank_tier, "gachi")
        data = [r for r in scoped_rows if str(r.get("match_type", "")) == target_match_type]
    elif type == "global":
        # 全体Tierの場合: 二重カウント防止のためgachi専用タグ以外の基本データを抽出
        data = [
            r for r in scoped_rows
            if not str(r.get("match_type", "unknown")).startswith("gachi")
            and (not restrict_global_modes or r.get("mode") in CORE_3V3_MODES)
        ]
    else:
        data = scoped_rows

    char_stats: dict[str, dict] = {}
    standardized_by_char: dict[str, dict] = {}
    if stratified_gachi:
        active_brackets = []
        for b_type, b_weight in GACHI_RANK_BRACKETS:
            b_rows = [r for r in data if str(r.get("match_type", "")) == b_type]
            if not b_rows:
                continue
            summary = _aggregate_cohort_rows(b_rows)
            if summary["char_stats"]:
                active_brackets.append((b_weight, summary))
        total_b_weight = sum(w for w, _ in active_brackets) or 1.0
        baseline = sum(w * s["baseline"] for w, s in active_brackets) / total_b_weight

        # Merge raw factual counts across brackets for display and eligibility.
        for _, summary in active_brackets:
            for cid, s in summary["char_stats"].items():
                agg = char_stats.setdefault(cid, {
                    "total_wins": 0,
                    "total_matches": 0,
                    "weighted_matches": 0.0,
                    "weighted_wins": 0.0,
                    "nm_matches": 0,
                    "nm_wins": 0,
                    "nm_weighted_matches": 0.0,
                    "nm_weighted_wins": 0.0,
                })
                for field in agg:
                    agg[field] += s[field]

        # Combine bracket-standardized lifts (weighted by bracket importance * evidence)
        # and log-pick Z-scores (across all active brackets so absence in high ranks counts).
        for cid in char_stats:
            ev_weight_sum = 0.0
            lift_num = 0.0
            eff_lift_num = 0.0
            exp_rate_num = 0.0
            pick_z_num = 0.0
            for b_weight, summary in active_brackets:
                norm_bw = b_weight / total_b_weight
                b_char = summary["char_stats"].get(cid)
                b_std = summary["standardized"].get(cid)
                if b_char and b_std:
                    nm_wn_b = b_char["nm_weighted_matches"]
                    ev_b = nm_wn_b / (nm_wn_b + PRIOR_MATCHES) if nm_wn_b > 0 else 0.0
                    comb_w = norm_bw * ev_b
                    lift_num += comb_w * b_std["lift"]
                    eff_lift_num += comb_w * b_std["supported_lift"]
                    exp_rate_num += comb_w * b_std["expected_rate"]
                    ev_weight_sum += comb_w
                    z_b = max(-3.0, min(3.0, b_std["pick_z"]))
                else:
                    # Character did not appear in this bracket -> log1p(0) = 0.
                    z_b = (
                        max(-3.0, min(3.0, (0.0 - summary["mean_log_picks"]) / summary["pick_log_std"]))
                        if summary["pick_log_std"] else 0.0
                    )
                pick_z_num += norm_bw * z_b
            if ev_weight_sum > 0:
                lift_c = lift_num / ev_weight_sum
                eff_lift_c = eff_lift_num / ev_weight_sum
                exp_rate_c = exp_rate_num / ev_weight_sum
            else:
                lift_c = 0.0
                eff_lift_c = 0.0
                exp_rate_c = baseline
            standardized_by_char[cid] = {
                "expected_rate": exp_rate_c,
                "lift": lift_c,
                "supported_lift": eff_lift_c,
                "sample_discount": lift_c - eff_lift_c,
                "pick_z": pick_z_num,
            }
    else:
        summary = _aggregate_cohort_rows(data)
        char_stats = summary["char_stats"]
        standardized_by_char = summary["standardized"]
        baseline = summary["baseline"]

    # スコア計算と詳細データの作成
    scored_chars = []
    characters_detail = {}
    
    # 全体の総試合数 (使用率計算用: ミラー含む全試合ベース)
    global_total_matches = sum(s["total_matches"] for s in char_stats.values())
    if global_total_matches == 0:
        global_total_matches = 1
    pair_data = (_contextual_pairs(db, type, sub_type, id, rank_tier, mode, detail_character)
                 if include_details else {})
    broad_pair_data = (_contextual_pairs(db, "gachi", None, None, "all", None, detail_character)
                       if include_details and include_matchup_fallback and type == "gachi" and (sub_type in ("map", "mode") or mode or rank_tier != "all") else {})

    for cid, stats in char_stats.items():
        tm = stats["total_matches"]
        tw = stats["total_wins"]
        nm_tm = stats["nm_matches"]
        nm_tw = stats["nm_wins"]
        weighted_n = stats["weighted_matches"]
        nm_wn = stats["nm_weighted_matches"]
        nm_ww = stats["nm_weighted_wins"]

        # 表示用の実勝率 (ミラーマッチ除外ベース; 非ミラー0件時のみ全試合へフォールバック)
        actual_wr = (nm_tw / nm_tm * 100) if nm_tm > 0 else ((tw / tm * 100) if tm > 0 else 50.0)

        std = standardized_by_char[cid]
        expected_rate = std["expected_rate"]
        lift = std["lift"]
        supported_lift = std["supported_lift"]
        sample_discount = std["sample_discount"]
        adjusted = expected_rate + lift
        performance_score = min(100.0, max(0.0, 50.0 + 100.0 * supported_lift))
        pick_deviation = min(100.0, max(0.0, 50.0 + 10.0 * std["pick_z"]))
        # Blend deviations from neutral at the specified 70/30 weights.
        score, win_adjustment, usage_adjustment = blend_tier_score(performance_score, pick_deviation, USAGE_ADJUSTMENT_CAP)
        use_rate = tm / global_total_matches * 100
        eligible = tm >= MIN_TIER_MATCHES and weighted_n >= MIN_TIER_WEIGHT
        if eligible:
            scored_chars.append({"id": cid, "score": score})
        low, high = wilson_interval(nm_tw, nm_tm) if nm_tm > 0 else wilson_interval(tw, tm)

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
            "weighted_win_rate": round(nm_ww / nm_wn * 100, 1) if nm_wn else None,
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
                    if ally_stats:
                        ally_wn = ally_stats["nm_weighted_matches"] or ally_stats["weighted_matches"]
                        ally_ww = ally_stats["nm_weighted_wins"] if ally_stats["nm_weighted_matches"] else ally_stats["weighted_wins"]
                        ally_rate = posterior_rate(ally_ww, ally_wn, baseline)
                    else:
                        ally_rate = baseline
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
    
    # Classify both global and ranked cohorts with Empirical-Bayes dynamic
    # thresholds derived from each cohort's score distribution, evaluated
    # against the 1-decimal displayed score so UI scores and Tiers never conflict.
    tiers = {key: [] for key in ["S+", "S", "A+", "A", "B", "C", "D", "N/A"]}
    for rank, sc in enumerate(scored_chars, 1):
        characters_detail[sc["id"]]["rank_position"] = rank
    thresholds = dynamic_tier_thresholds([sc["score"] for sc in scored_chars])
    for sc in scored_chars:
        tier = assign_tier(characters_detail[sc["id"]]["score"], thresholds)
        tiers[tier].append(sc["id"])
    tiers["N/A"] = [cid for cid, stats in characters_detail.items() if not stats["sample_sufficient"]]

    # Each source row describes one observed player's match, not all six players.
    display_matches = sum(s["total_matches"] for s in char_stats.values())

    response_data = {
        "updated_at": max((str(r.get("updated_at") or "") for r in data), default="") or None,
        "tiers": tiers,
        "type": type,
        "rank_tier": rank_tier,
        "metrics": {"analyzed_matches": display_matches, "count_unit": "player_observations", "baseline_win_rate": round(baseline * 100, 1), "minimum_matches": MIN_TIER_MATCHES, "analysis_window_days": ANALYSIS_WINDOW_DAYS, "recent_window_days": RECENT_WINDOW_DAYS, "half_life_days": HALF_LIFE_DAYS, "older_half_life_days": OLDER_HALF_LIFE_DAYS, "evidence_half_credit_matches": TIER_EVIDENCE_MATCHES, "pick_share_half_credit": TIER_VERSATILITY_HALF_SHARE, "win_weight": TIER_WIN_WEIGHT, "usage_weight": TIER_USAGE_WEIGHT, "usage_adjustment_cap": USAGE_ADJUSTMENT_CAP, "rank_stratified": stratified_gachi, "tier_method": "dynamic_score_thresholds", "tier_thresholds": {name: score for score, name in thresholds}, "eligible_characters": len(scored_chars), "method": "context_non_mirror_stratified_v10"},
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
def debug_db(_secret: str = Depends(verify_cron_secret)):
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
