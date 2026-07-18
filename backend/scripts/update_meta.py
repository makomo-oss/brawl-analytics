import os
import json
import asyncio
import httpx
from datetime import datetime
import math
from dotenv import load_dotenv

# .env ファイルを読み込む
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=env_path)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
META_FILE = os.path.join(DATA_DIR, "meta_data.json")

BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN")

# APIからランキングを取れなかった場合の確実なトッププレイヤー(プロ等)のタグ
FALLBACK_TOP_PLAYERS = [
    "#2CG0RCGL92", "#V99J0CCV8", "#2UQQVCC2Q", "#2QJRR090VU", "#2GQVVRLV28",
    "#2Y02L28", "#8L8VV2J2", "#Q2LL9G8", "#2J88CV8"
]

async def get_top_players(client: httpx.AsyncClient, limit=10):
    url = f"https://api.brawlstars.com/v1/rankings/global/players?limit={limit}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    if not BRAWL_API_TOKEN:
        print("WARN: No BRAWL_API_TOKEN found. Using real fallback pro player tags.")
        return FALLBACK_TOP_PLAYERS
    
    try:
        response = await client.get(url, headers=headers, timeout=10.0)
        if response.status_code == 200:
            data = response.json()
            return [p.get("tag") for p in data.get("items", [])]
        else:
            return FALLBACK_TOP_PLAYERS
    except Exception as e:
        print(f"Failed to get top players: {e}")
        return FALLBACK_TOP_PLAYERS

async def get_player_profile_and_battles(client: httpx.AsyncClient, tag: str):
    tag_clean = tag.replace("#", "")
    tag_fmt = f"%23{tag_clean}"
    
    profile = None
    battles = []
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    brawlapi_headers = {"User-Agent": "BrawlAnalytics/1.0"}
    
    # 1. Profile
    try:
        if BRAWL_API_TOKEN:
            res = await client.get(f"https://api.brawlstars.com/v1/players/{tag_fmt}", headers=headers, timeout=5.0)
            if res.status_code == 200:
                profile = res.json()
    except: pass
    
    if not profile:
        try:
            res = await client.get(f"https://api.brawlapi.com/v1/player/{tag_clean}", headers=brawlapi_headers, timeout=5.0)
            if res.status_code == 200:
                profile = res.json()
        except: pass

    # 2. Battlelog
    try:
        if BRAWL_API_TOKEN:
            res = await client.get(f"https://api.brawlstars.com/v1/players/{tag_fmt}/battlelog", headers=headers, timeout=5.0)
            if res.status_code == 200:
                battles = res.json().get("items", [])
    except: pass
    
    if not battles:
        try:
            res = await client.get(f"https://api.brawlapi.com/v1/player/{tag_clean}/battlelog", headers=brawlapi_headers, timeout=5.0)
            if res.status_code == 200:
                battles = res.json().get("items", [])
        except: pass
        
    return profile, battles, tag

async def fetch_all_brawlers(client: httpx.AsyncClient):
    try:
        res = await client.get("https://api.brawlapi.com/v1/brawlers", headers={"User-Agent": "BrawlAnalytics/1.0"}, timeout=10.0)
        if res.status_code == 200:
            return [b.get("name").lower() for b in res.json().get("list", [])]
    except:
        pass
    return ["piper", "fang", "spike", "crow", "colt", "shelly", "dynamike", "leon", "edgar"]

async def main():
    async with httpx.AsyncClient() as client:
        print("Fetching all brawlers...")
        all_brawlers = await fetch_all_brawlers(client)
        
        print("Fetching top players...")
        top_tags = await get_top_players(client, limit=1000)
        
        stats_global = {"brawlers": {}, "matchups": {}, "total_picks": 0}
        stats_modes = {}
        stats_maps = {}
        
        analyzed_players = []
        
        def init_stats(all_brawlers):
            brawlers = {}
            matchups = {}
            for b in all_brawlers:
                brawlers[b] = {"matches": 0, "wins": 0}
                matchups[b] = {}
            return {"brawlers": brawlers, "matchups": matchups, "total_picks": 0}

        stats_global = init_stats(all_brawlers)
            
        print(f"Gathering real battlelogs from {len(top_tags)} players (this may take a minute)...")
        
        # セマフォを使って同時リクエスト数を制限し、APIのレートリミットを回避しつつ高速化
        semaphore = asyncio.Semaphore(15)
        
        async def fetch_with_semaphore(t_tag):
            async with semaphore:
                # わずかなスリープを入れてバーストを防ぐ
                await asyncio.sleep(0.05)
                return await get_player_profile_and_battles(client, t_tag)

        tasks = [fetch_with_semaphore(tag) for tag in top_tags]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for idx, res in enumerate(results):
            if isinstance(res, Exception) or not res:
                continue
            
            profile, battles, tag = res
            
            if profile:
                analyzed_players.append({
                    "tag": tag,
                    "name": profile.get("name", "Unknown"),
                    "icon_id": profile.get("icon", {}).get("id", 28000000),
                    "trophies": profile.get("trophies", 0),
                    "matches_analyzed": len(battles)
                })
            
            for item in battles:
                battle = item.get("battle", {})
                event = item.get("event", {})
                if not battle or battle.get("type") not in ["ranked", "soloRanked", "teamRanked"]:
                    continue # ランクマッチを中心に集計
                
                teams = battle.get("teams", [])
                if len(teams) < 2:
                    continue
                
                result = battle.get("result")
                if not result or result == "draw":
                    continue
                
                my_team_index = -1
                for i, team in enumerate(teams):
                    for p in team:
                        if p.get("tag", "").replace("#", "") == tag.replace("#", ""):
                            my_team_index = i
                            break
                    if my_team_index != -1:
                        break
                        
                if my_team_index == -1:
                    continue
                    
                my_team = teams[my_team_index]
                opp_team = teams[1 if my_team_index == 0 else 0]
                
                my_brawlers = [p.get("brawler", {}).get("name", "unknown").lower() for p in my_team]
                opp_brawlers = [p.get("brawler", {}).get("name", "unknown").lower() for p in opp_team]
                
                is_win = (result == "victory")
                
                mode = event.get("mode")
                map_name = event.get("map")
                
                # モード・マップの初期化
                if mode and mode not in stats_modes:
                    stats_modes[mode] = init_stats(all_brawlers)
                if map_name and map_name not in stats_maps:
                    stats_maps[map_name] = init_stats(all_brawlers)
                
                # 集計対象リスト
                targets = [stats_global]
                if mode: targets.append(stats_modes[mode])
                if map_name: targets.append(stats_maps[map_name])
                
                for target in targets:
                    for mb in my_brawlers:
                        if mb == "unknown": continue
                        if mb not in target["brawlers"]: target["brawlers"][mb] = {"matches": 0, "wins": 0}
                        target["brawlers"][mb]["matches"] += 1
                        if is_win: target["brawlers"][mb]["wins"] += 1
                        target["total_picks"] += 1
                        
                        for ob in opp_brawlers:
                            if ob == "unknown": continue
                            if mb not in target["matchups"]: target["matchups"][mb] = {}
                            if ob not in target["matchups"][mb]: target["matchups"][mb][ob] = {"matches": 0, "wins": 0}
                            
                            target["matchups"][mb][ob]["matches"] += 1
                            if is_win: target["matchups"][mb][ob]["wins"] += 1

        # Tier算出用関数
        def calculate_tiers(stats):
            brawler_stats = stats["brawlers"]
            matchup_matrix = stats["matchups"]
            total_picks = stats["total_picks"]
            real_analyzed_matches = total_picks // 6
            
            raw_win_rates = []
            use_rates = []
            for b, s in brawler_stats.items():
                if s["matches"] > 0:
                    raw_win_rates.append(s["wins"] / s["matches"])
                    use_rates.append(s["matches"] / (total_picks or 1))
                    
            mean_wr = sum(raw_win_rates) / len(raw_win_rates) if raw_win_rates else 0.5
            mean_ur = sum(use_rates) / len(use_rates) if use_rates else 1.0/len(all_brawlers)
            
            SMOOTHING_FACTOR = 10
            smoothed_win_rates = []
            for b, s in brawler_stats.items():
                if s["matches"] > 0:
                    bayesian_wr = (s["wins"] + (mean_wr * SMOOTHING_FACTOR)) / (s["matches"] + SMOOTHING_FACTOR)
                    smoothed_win_rates.append(bayesian_wr)
                    
            std_wr = math.sqrt(sum((x - mean_wr)**2 for x in smoothed_win_rates) / len(smoothed_win_rates)) if len(smoothed_win_rates) > 1 else 0.01
            std_ur = math.sqrt(sum((x - mean_ur)**2 for x in use_rates) / len(use_rates)) if len(use_rates) > 1 else 0.001
            
            if std_wr == 0: std_wr = 0.01
            if std_ur == 0: std_ur = 0.001

            tiers = {"S": [], "A": [], "B": [], "C": [], "D": []}
            characters_detail = {}
            
            for b, s in brawler_stats.items():
                if s["matches"] == 0:
                    tiers["D"].append(b)
                    continue
                    
                raw_wr = s["wins"] / s["matches"]
                ur = s["matches"] / (total_picks or 1)
                
                bayesian_wr = (s["wins"] + (mean_wr * SMOOTHING_FACTOR)) / (s["matches"] + SMOOTHING_FACTOR)
                z_wr = (bayesian_wr - mean_wr) / std_wr
                z_ur = (ur - mean_ur) / std_ur
                
                score = (z_wr * 0.7) + (z_ur * 0.3)
                
                if score >= 1.0: tier = "S"
                elif score >= 0.3: tier = "A"
                elif score >= -0.5: tier = "B"
                elif score >= -1.2: tier = "C"
                else: tier = "D"
                
                tiers[tier].append(b)
                
                matchups = []
                if b in matchup_matrix:
                    for ob, m_stats in matchup_matrix[b].items():
                        if m_stats["matches"] >= 1:
                            m_wr = m_stats["wins"] / m_stats["matches"]
                            matchups.append({"brawler": ob, "win_rate": round(m_wr * 100, 1), "matches": m_stats["matches"]})
                
                matchups.sort(key=lambda x: x["win_rate"], reverse=True)
                kamo = matchups[:5]
                tenteki = [x for x in reversed(matchups[-5:])]
                
                characters_detail[b] = {
                    "tier": tier,
                    "score": round(score, 2),
                    "win_rate": round(raw_wr * 100, 1),
                    "adjusted_win_rate": round(bayesian_wr * 100, 1),
                    "use_rate": round(ur * 100, 2),
                    "total_matches": s["matches"],
                    "kamo": kamo,
                    "tenteki": tenteki
                }
                
            return {
                "tiers": tiers,
                "characters": characters_detail,
                "metrics": {
                    "analyzed_matches": real_analyzed_matches,
                    "mean_win_rate": round(mean_wr * 100, 1)
                }
            }

        # グローバルと各カテゴリのTier表を算出
        print("Calculating Global Tiers...")
        global_meta = calculate_tiers(stats_global)
        
        print("Calculating Mode Tiers...")
        modes_meta = {}
        for m, st in stats_modes.items():
            if st["total_picks"] > 0:
                modes_meta[m] = calculate_tiers(st)
                
        print("Calculating Map Tiers...")
        maps_meta = {}
        for m, st in stats_maps.items():
            if st["total_picks"] > 0:
                maps_meta[m] = calculate_tiers(st)
            
        meta_data = {
            "updated_at": datetime.now().isoformat(),
            "global": global_meta,
            "modes": modes_meta,
            "maps": maps_meta,
            "analyzed_players": analyzed_players
        }
        
        with open(META_FILE, "w", encoding="utf-8") as f:
            json.dump(meta_data, f, ensure_ascii=False, indent=2)
            
        print(f"Meta data updated successfully using PURE REAL DATA! Saved to {META_FILE}")

if __name__ == "__main__":
    asyncio.run(main())
