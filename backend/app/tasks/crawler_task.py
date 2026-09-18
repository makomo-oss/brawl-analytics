import asyncio
import logging
import random
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Callable
from app.database import get_db
from app.services.player_profiles import profile_record
from app.services.battle_records import (deduplicate_battle_records, parse_battlelog,
                                         ranked_encountered_tags)
from app.services.brawl_api import get_player_battlelog, get_player, get_club_members, get_club

logger = logging.getLogger(__name__)
ANCHOR_LIMIT = 10
ELITE_REFRESH_LIMIT = 50
DISCOVERED_LIMIT = 100
PLAYER_WRITE_BATCH = 50
MATCH_WRITE_BATCH = 500

def select_anchor_tags(db) -> set[str]:
    """Seed Ranked discovery from verified Elite+ profiles across the whole DB."""
    profiles = {}
    offset = 0
    while True:
        rows = ((db.table("players")
                 .select("player_tag,rank:unlocked_characters->>ranked_rank")
                 .eq("unlocked_characters->>profile_status", "verified")
                 .order("player_tag").range(offset, offset + 999).execute()).data or [])
        for row in rows:
            tag = str(row.get("player_tag") or "").replace("#", "").upper()
            if tag:
                rank = str(row.get("rank") or "")
                profiles[tag] = int(rank) if rank.isdigit() else 0
        if len(rows) < 1000:
            break
        offset += 1000
    candidates = sorted(profiles)
    if not candidates:
        raise RuntimeError("Crawler has no verified player anchors")
    legendary = [tag for tag in candidates if profiles[tag] >= 16]
    elite = [tag for tag in candidates if profiles[tag] >= 13]
    anchors = random.sample(legendary, min(3, len(legendary)))
    elite_remaining = [tag for tag in elite if tag not in anchors]
    anchors.extend(random.sample(elite_remaining, min(6 - len(anchors), len(elite_remaining))))
    others = [tag for tag in candidates if tag not in anchors]
    anchors.extend(random.sample(others, min(ANCHOR_LIMIT - len(anchors), len(others))))
    return set(anchors)


def select_elite_refresh_tags(db, excluded: set[str]) -> list[str]:
    """Rotate older Elite+ profiles so their recent Ranked logs are not lost."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    selected = []
    offset = 0
    while len(selected) < ELITE_REFRESH_LIMIT:
        rows = ((db.table("players")
                 .select("player_tag,rank:unlocked_characters->>ranked_rank")
                 .eq("unlocked_characters->>profile_status", "verified")
                 .lt("updated_at", cutoff).order("updated_at")
                 .range(offset, offset + 999).execute()).data or [])
        for row in rows:
            tag = str(row.get("player_tag") or "").replace("#", "").upper()
            rank = str(row.get("rank") or "")
            if tag and tag not in excluded and rank.isdigit() and int(rank) >= 13:
                selected.append(tag)
                if len(selected) == ELITE_REFRESH_LIMIT:
                    break
        if len(rows) < 1000:
            break
        offset += 1000
    return selected


def raw_history_count(db) -> int | None:
    try:
        response = db.table("match_raw_history").select("match_id", count="exact", head=True).execute()
        return int(response.count)
    except Exception as exc:
        logger.warning("Could not count raw battles: %s", exc)
        return None


def select_encountered_tags(db, tags: set[str], limit: int = DISCOVERED_LIMIT,
                            ranked_tags: set[str] | None = None) -> list[str]:
    """Prioritize Elite+ and players encountered in Ranked, retaining exploration."""
    candidates = list(tags)
    random.shuffle(candidates)
    ranked_tags = ranked_tags or set()

    # Inspect a bounded random pool so large clubs do not create unbounded DB work.
    pool = ([tag for tag in candidates if tag in ranked_tags] +
            [tag for tag in candidates if tag not in ranked_tags])[:max(400, limit * 4)]
    known = {}
    try:
        for offset in range(0, len(pool), 100):
            response = (db.table("players")
                        .select("player_tag,rank:unlocked_characters->>ranked_rank,status:unlocked_characters->>profile_status")
                        .in_("player_tag", pool[offset:offset + 100]).execute())
            known.update({row["player_tag"]: row for row in (response.data or [])})
    except Exception as exc:
        logger.warning("Could not prioritize discovered players: %s", exc)
        return candidates[:limit]

    high_ranked = []
    ranked_unregistered = []
    unregistered = []
    remaining = []
    for tag in pool:
        profile = known.get(tag)
        if profile is None:
            (ranked_unregistered if tag in ranked_tags else unregistered).append(tag)
        elif profile.get("status") == "not_found":
            continue
        elif (profile.get("status") == "verified" and
              str(profile.get("rank") or "").isdigit() and int(profile["rank"]) >= 13):
            high_ranked.append(tag)
        else:
            remaining.append(tag)

    selected = (high_ranked[:limit // 3] + ranked_unregistered[:limit // 2] +
                unregistered[:limit // 3])
    selected.extend(tag for tag in high_ranked + ranked_unregistered + unregistered + remaining
                    if tag not in selected)
    selected.extend(tag for tag in candidates if tag not in selected and tag not in pool)
    return selected[:limit]

async def run_crawler_task(report_stage: Callable[[str], None] | None = None, aggregate: bool = True):
    """
    バックグラウンドで実行される高度なデータクローラータスク
    1. Supabaseから対象プレイヤーのタグ一覧を取得
    2. 並列でBrawl APIからプレイヤー情報とバトルログを取得
    3. 所属クラブから新メンバーを抽出（芋づる式クローリング）
    4. プレイヤー情報とバトル履歴をSupabaseへBulk Upsert
    """
    logger.info("Starting advanced background crawler task...")
    report = report_stage or (lambda stage: None)
    report("fetching_players")
    db = get_db()
    initial_raw_count = raw_history_count(db)
    
    # Rotate verified Elite+ players without sweeping every saved profile.
    base_player_tags = select_anchor_tags(db)
    elite_refresh_tags = select_elite_refresh_tags(db, base_player_tags)
    seed_tags = base_player_tags | set(elite_refresh_tags)
    logger.info("Crawler seeds: anchors=%s, Elite+ refresh=%s", len(base_player_tags),
                len(elite_refresh_tags))
    
    semaphore = asyncio.Semaphore(5)
    
    upsert_players = []
    upsert_matches = []
    found_clubs = set()

    async def fetch_player_and_matches(tag: str):
        clean_tag = tag.replace("#", "").upper()
        
        async with semaphore:
            try:
                # 1. プレイヤー情報の取得
                player_info = await get_player(clean_tag)
                
                player_data = profile_record(clean_tag, player_info)

                club_tag = (player_info.get("club") or {}).get("tag")
                
                # 2. バトルログの取得。ダッシュボード同期と同じ変換規則を使う。
                battle_log_data = []
                encountered_players = set()
                ranked_players = set()
                try:
                    logs = await get_player_battlelog(clean_tag)
                    items = logs.get("items") or []
                    battle_log_data, encountered_players = parse_battlelog(clean_tag, items)
                    ranked_players = ranked_encountered_tags(items)
                except Exception as e:
                    logger.warning(f"Failed to fetch battlelog for {clean_tag}: {e}")

                return player_data, battle_log_data, club_tag, encountered_players, ranked_players
            except Exception as e:
                logger.warning(f"Failed to fetch data for player {clean_tag}: {e}")
                return None, [], None, set(), set()

    # フェーズ1: 既存プレイヤーのデータと所属クラブを取得
    tasks = [fetch_player_and_matches(tag) for tag in seed_tags]
    results = await asyncio.gather(*tasks)
    
    encountered_in_battles = set()
    ranked_encounters = set()
    
    for p_data, m_data, c_tag, e_players, r_players in results:
        if p_data:
            upsert_players.append(p_data)
        if m_data:
            upsert_matches.extend(m_data)
        if c_tag:
            found_clubs.add(c_tag)
        if e_players:
            encountered_in_battles.update(e_players)
        ranked_encounters.update(r_players)
            
    # フェーズ2: クラブから新メンバーを抽出 & クラブ情報を保存 (芋づる式クローリング制限：最大10クラブ)
    new_player_tags = set()
    upsert_clubs = []
    clubs_to_crawl = list(found_clubs)[:10]
    
    async def fetch_club_details_task(ctag):
        async with semaphore:
            try:
                c_details = await get_club(ctag)
                clean_ctag = ctag.replace("#", "")
                club_record = {
                    "club_tag": clean_ctag,
                    "name": c_details.get("name", "Unknown"),
                    "description": c_details.get("description", ""),
                    "trophies": c_details.get("trophies", 0),
                    "required_trophies": c_details.get("requiredTrophies", 0),
                    "badge_id": c_details.get("badgeId", 0),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                c_data = await get_club_members(ctag)
                members = [m.get("tag") for m in c_data.get("items", []) if m.get("tag")]
                return club_record, members
            except Exception as e:
                logger.warning(f"Failed to fetch club {ctag}: {e}")
                return None, []
                
    if clubs_to_crawl:
        logger.info(f"Crawling {len(clubs_to_crawl)} clubs to find new players and store club details...")
        club_tasks = [fetch_club_details_task(ctag) for ctag in clubs_to_crawl]
        club_results = await asyncio.gather(*club_tasks)
        for club_rec, members in club_results:
            if club_rec:
                upsert_clubs.append(club_rec)
            for m in members:
                if m:
                    m_clean = m.replace("%23", "#").replace("#", "").upper()
                    if m_clean not in seed_tags:
                        new_player_tags.add(m_clean)
                        
    # バトルで遭遇したプレイヤーも新規取得リストに加える（クラブ抽出と並行）
    for m_clean in encountered_in_battles:
        if m_clean not in seed_tags:
            new_player_tags.add(m_clean)
                    
    # フェーズ3: 対戦相手・クラブメンバーを取得（登録済みの再取得も許可）
    if new_player_tags:
        logger.info(f"Found {len(new_player_tags)} encountered players (from clubs & battles). Fetching their data...")
        target_new_players = select_encountered_tags(
            db, new_player_tags, limit=DISCOVERED_LIMIT + ELITE_REFRESH_LIMIT - len(elite_refresh_tags),
            ranked_tags=ranked_encounters)
        new_tasks = [fetch_player_and_matches(tag) for tag in target_new_players]
        new_results = await asyncio.gather(*new_tasks)
        
        for p_data, m_data, _, _, _ in new_results:
            if p_data:
                upsert_players.append(p_data)
            if m_data:
                upsert_matches.extend(m_data)

    # Different discovery paths can return the same player's log. Postgres rejects
    # duplicate match_id values inside one ON CONFLICT upsert with SQLSTATE 21000.
    upsert_matches = deduplicate_battle_records(upsert_matches)

    if not upsert_players:
        raise RuntimeError("Crawler could not fetch any valid player profiles")
    if not upsert_matches:
        raise RuntimeError("Crawler could not fetch any supported battle records")

    report("saving_players")

    # 4. SupabaseへのBulk Upsert
    if upsert_players:
        try:
            logger.info(f"Bulk upserting {len(upsert_players)} players...")
            for offset in range(0, len(upsert_players), PLAYER_WRITE_BATCH):
                db.table("players").upsert(upsert_players[offset:offset + PLAYER_WRITE_BATCH]).execute()
        except Exception as e:
            logger.error(f"Failed to upsert players: {e}")
            raise

    if upsert_clubs:
        try:
            logger.info(f"Bulk upserting {len(upsert_clubs)} clubs...")
            db.table("clubs").upsert(upsert_clubs).execute()
        except Exception as e:
            logger.error(f"Failed to upsert clubs: {e}")
            
    if upsert_matches:
        try:
            report("saving_matches")
            logger.info(f"Bulk upserting {len(upsert_matches)} matches...")
            for offset in range(0, len(upsert_matches), MATCH_WRITE_BATCH):
                db.table("match_raw_history").upsert(upsert_matches[offset:offset + MATCH_WRITE_BATCH]).execute()
        except Exception:
            logger.exception("Failed to persist matches; aggregation cancelled")
            raise

    final_raw_count = raw_history_count(db)
    new_raw_matches = (max(0, final_raw_count - initial_raw_count)
                       if initial_raw_count is not None and final_raw_count is not None else None)
    logger.info("Raw battle observations: total=%s, added_since_start=%s", final_raw_count, new_raw_matches)

    # GitHub Actions runs aggregation on its larger runner after this phase.
    # Direct CLI callers can still request the complete pipeline.
    calc_result = None
    if aggregate:
        try:
            report("aggregating")
            logger.info("Triggering automatic macro statistics and counter calculation...")
            from app.scripts.daily_calc import run_daily_calculation
            calc_result = await asyncio.to_thread(run_daily_calculation, db)
            logger.info(f"Automatic calculation completed: {calc_result}")
        except Exception as calc_err:
            logger.error(f"Failed to run automatic macro calculations after crawl: {calc_err}")
            raise
            
    logger.info("Crawler task completed successfully.")
    fetched_types = Counter(record["match_type"] for record in upsert_matches)
    elite_tags = {profile["player_tag"] for profile in upsert_players
                  if int(profile["unlocked_characters"].get("ranked_rank") or 0) >= 13}
    elite_ranked = sum(record["player_tag"] in elite_tags and
                       record["match_type"] in ("soloRanked", "teamRanked")
                       for record in upsert_matches)
    return {"players_fetched": len(upsert_players), "battle_records_fetched": len(upsert_matches),
            "new_raw_matches": new_raw_matches, "raw_history_total": final_raw_count,
            "battle_records_by_type": dict(fetched_types),
            "elite_profiles_fetched": len(elite_tags),
            "elite_ranked_records_fetched": elite_ranked,
            "clubs_fetched": len(upsert_clubs), "aggregation": calc_result}

