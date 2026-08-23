import os
import json
import asyncio
import httpx
from datetime import datetime
import math
import argparse
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=env_path)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
META_FILE = os.path.join(DATA_DIR, "meta_data.json")
RAW_STATS_FILE = os.path.join(DATA_DIR, "raw_stats.json")
PROCESSED_BATTLES_FILE = os.path.join(DATA_DIR, "processed_battles.json")

BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN")

FALLBACK_TOP_PLAYERS = [
    "#2CG0RCGL92", "#V99J0CCV8", "#2UQQVCC2Q", "#2QJRR090VU", "#2GQVVRLV28",
    "#2Y02L28", "#8L8VV2J2", "#Q2LL9G8", "#2J88CV8"
]

async def get_top_players(client: httpx.AsyncClient, limit=200):
    url = f"https://api.brawlstars.com/v1/rankings/global/players?limit={limit}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    if not BRAWL_API_TOKEN:
        return FALLBACK_TOP_PLAYERS
    try:
        response = await client.get(url, headers=headers, timeout=10.0)
        if response.status_code == 200:
            return [p.get("tag") for p in response.json().get("items", [])]
    except Exception as e:
        print(f"Failed to get top players: {e}")
    return FALLBACK_TOP_PLAYERS

async def get_player_profile(client: httpx.AsyncClient, tag: str):
    tag_fmt = f"%23{tag.replace('#', '')}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    try:
        if BRAWL_API_TOKEN:
            res = await client.get(f"https://api.brawlstars.com/v1/players/{tag_fmt}", headers=headers, timeout=5.0)
            if res.status_code == 200:
                return res.json()
    except: pass
    return None

async def get_club_members(client: httpx.AsyncClient, club_tag: str):
    tag_fmt = f"%23{club_tag.replace('#', '')}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    try:
        if BRAWL_API_TOKEN:
            res = await client.get(f"https://api.brawlstars.com/v1/clubs/{tag_fmt}/members", headers=headers, timeout=5.0)
            if res.status_code == 200:
                return [m.get("tag") for m in res.json().get("items", [])]
    except: pass
    return []

async def get_player_battles(client: httpx.AsyncClient, tag: str):
    tag_fmt = f"%23{tag.replace('#', '')}"
    headers = {"Authorization": f"Bearer {BRAWL_API_TOKEN}"} if BRAWL_API_TOKEN else {}
    try:
        if BRAWL_API_TOKEN:
            res = await client.get(f"https://api.brawlstars.com/v1/players/{tag_fmt}/battlelog", headers=headers, timeout=5.0)
            if res.status_code == 200:
                return res.json().get("items", [])
    except: pass
    return []

async def fetch_all_brawlers(client: httpx.AsyncClient):
    try:
        res = await client.get("https://api.brawlapi.com/v1/brawlers", headers={"User-Agent": "Burolabo/1.0"}, timeout=10.0)
        if res.status_code == 200:
            return [b.get("name").lower() for b in res.json().get("list", [])]
    except: pass
    return ["piper", "fang", "spike", "crow", "colt", "shelly", "dynamike", "leon", "edgar"]

def init_stats(all_brawlers):
    brawlers = {}
    matchups = {}
    for b in all_brawlers:
        brawlers[b] = {"matches": 0, "wins": 0}
        matchups[b] = {}
    return {"brawlers": brawlers, "matchups": matchups, "total_picks": 0}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Reset all accumulated stats before gathering")
    args = parser.parse_args()

    if args.reset:
        print("Resetting accumulated data...")
        if os.path.exists(RAW_STATS_FILE): os.remove(RAW_STATS_FILE)
        if os.path.exists(PROCESSED_BATTLES_FILE): os.remove(PROCESSED_BATTLES_FILE)

    async with httpx.AsyncClient() as client:
        print("Fetching all brawlers...")
        all_brawlers = await fetch_all_brawlers(client)
        
        # ロードまたは初期化
        raw_stats = {}
        processed_battles = set()
        
        if os.path.exists(RAW_STATS_FILE):
            with open(RAW_STATS_FILE, "r", encoding="utf-8") as f:
                raw_stats = json.load(f)
        else:
            raw_stats = {
                "stats_global": init_stats(all_brawlers),
                "stats_gachi": init_stats(all_brawlers),
                "stats_gachi_modes": {},
                "stats_gachi_maps": {},
                "mode_to_maps": {},
                "analyzed_players_count": 0
            }
            
        if os.path.exists(PROCESSED_BATTLES_FILE):
            with open(PROCESSED_BATTLES_FILE, "r", encoding="utf-8") as f:
                processed_battles = set(json.load(f))
                
        stats_global = raw_stats["stats_global"]
        stats_gachi = raw_stats["stats_gachi"]
        stats_gachi_modes = raw_stats["stats_gachi_modes"]
        stats_gachi_maps = raw_stats["stats_gachi_maps"]
        mode_to_maps = raw_stats.get("mode_to_maps", {})

        print("Fetching top players to extract clubs...")
        top_tags = await get_top_players(client, limit=100) # 100人から芋づる式に抽出
        
        semaphore = asyncio.Semaphore(10)
        async def fetch_profile_safe(t):
            async with semaphore:
                await asyncio.sleep(0.1)
                return await get_player_profile(client, t)
                
        profile_tasks = [fetch_profile_safe(tag) for tag in top_tags]
        profiles = await asyncio.gather(*profile_tasks)
        
        clubs = set()
        for p in profiles:
            if p and p.get("club") and p["club"].get("tag"):
                clubs.add(p["club"]["tag"])
                
        print(f"Extracted {len(clubs)} clubs. Fetching members...")
        
        async def fetch_club_members_safe(c):
            async with semaphore:
                await asyncio.sleep(0.1)
                return await get_club_members(client, c)
                
        club_tasks = [fetch_club_members_safe(c) for c in clubs]
        members_lists = await asyncio.gather(*club_tasks)
        
        target_tags = set(top_tags)
        for ml in members_lists:
            target_tags.update(ml)
            
        # 安全のため最大2000人に絞る（1回のバッチの実行時間を制限）
        target_tags = list(target_tags)[:2000]
        
        print(f"Crawling battles for {len(target_tags)} players...")
        
        async def fetch_battles_safe(t):
            async with semaphore:
                await asyncio.sleep(0.05)
                return t, await get_player_battles(client, t)
                
        battle_tasks = [fetch_battles_safe(tag) for tag in target_tags]
        battle_results = await asyncio.gather(*battle_tasks)
        
        new_battles_count = 0
        
        for tag, battles in battle_results:
            if not battles: continue
            raw_stats["analyzed_players_count"] += 1
            
            for item in battles:
                battle = item.get("battle", {})
                event = item.get("event", {})
                battle_time = item.get("battleTime", "")
                
                # 重複排除: プレイヤーごとの試合
                battle_id = f"{tag}_{battle_time}"
                if battle_id in processed_battles:
                    continue
                processed_battles.add(battle_id)
                new_battles_count += 1
                
                if not battle or battle.get("type") not in ["ranked", "soloRanked", "teamRanked"]:
                    continue 
                
                teams = battle.get("teams", [])
                if len(teams) < 2: continue
                
                result = battle.get("result")
                if not result or result == "draw": continue
                
                my_team_index = -1
                for i, team in enumerate(teams):
                    for p in team:
                        if p.get("tag", "").replace("#", "") == tag.replace("#", ""):
                            my_team_index = i
                            break
                    if my_team_index != -1: break
                        
                if my_team_index == -1: continue
                    
                my_team = teams[my_team_index]
                opp_team = teams[1 if my_team_index == 0 else 0]
                
                my_brawlers = [p.get("brawler", {}).get("name", "unknown").lower() for p in my_team]
                opp_brawlers = [p.get("brawler", {}).get("name", "unknown").lower() for p in opp_team]
                
                is_win = (result == "victory")
                mode = event.get("mode")
                map_name = event.get("map")
                
                if mode and map_name:
                    if mode not in mode_to_maps:
                        mode_to_maps[mode] = []
                    if map_name not in mode_to_maps[mode]:
                        mode_to_maps[mode].append(map_name)
                
                targets = [stats_global]
                if battle.get("type") in ["soloRanked", "teamRanked"]:
                    targets.append(stats_gachi)
                    if mode:
                        if mode not in stats_gachi_modes: stats_gachi_modes[mode] = init_stats(all_brawlers)
                        targets.append(stats_gachi_modes[mode])
                    if map_name:
                        if map_name not in stats_gachi_maps: stats_gachi_maps[map_name] = init_stats(all_brawlers)
                        targets.append(stats_gachi_maps[map_name])
                
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

        print(f"Gathered {new_battles_count} new battles.")

        # Save raw stats and processed battles
        with open(RAW_STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(raw_stats, f, ensure_ascii=False)
            
        with open(PROCESSED_BATTLES_FILE, "w", encoding="utf-8") as f:
            # 肥大化を防ぐため直近20万件程度に制限（今回は簡易的にすべて保存）
            json.dump(list(processed_battles)[-200000:], f, ensure_ascii=False)

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
                
                characters_detail[b] = {
                    "tier": tier,
                    "score": round(score, 2),
                    "win_rate": round(raw_wr * 100, 1),
                    "adjusted_win_rate": round(bayesian_wr * 100, 1),
                    "use_rate": round(ur * 100, 2),
                    "total_matches": s["matches"],
                    "kamo": matchups[:5],
                    "tenteki": [x for x in reversed(matchups[-5:])]
                }
                
            return {
                "tiers": tiers,
                "characters": characters_detail,
                "metrics": {
                    "analyzed_matches": real_analyzed_matches,
                    "mean_win_rate": round(mean_wr * 100, 1)
                }
            }

        print("Calculating Global Tiers...")
        global_meta = calculate_tiers(stats_global)
        print("Calculating Gachi Tiers...")
        gachi_meta = calculate_tiers(stats_gachi)
        
        gachi_modes_meta = {}
        for m, st in stats_gachi_modes.items():
            if st["total_picks"] > 0: gachi_modes_meta[m] = calculate_tiers(st)
                
        gachi_maps_meta = {}
        for m, st in stats_gachi_maps.items():
            if st["total_picks"] > 0: gachi_maps_meta[m] = calculate_tiers(st)
            
        dummy_players = [{"name": "Cumulative Data"} for _ in range(min(100, raw_stats["analyzed_players_count"]))]
            
        meta_data = {
            "updated_at": datetime.now().isoformat(),
            "global": global_meta,
            "gachi": gachi_meta,
            "gachi_modes": gachi_modes_meta,
            "gachi_maps": gachi_maps_meta,
            "mode_to_maps": mode_to_maps,
            "analyzed_players": dummy_players,
            "cumulative_players_count": raw_stats["analyzed_players_count"]
        }
        
        with open(META_FILE, "w", encoding="utf-8") as f:
            json.dump(meta_data, f, ensure_ascii=False, indent=2)
            
        print(f"Meta data updated successfully with {new_battles_count} new battles!")

if __name__ == "__main__":
    asyncio.run(main())
