"""Emit a SELECT-only old/new pair-query comparison for Supabase SQL testing.

Run with --live to compare the same production snapshot; the default uses CTE
fixtures and never writes profiles or matches. A mismatch returns differences.
"""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"


def query(path):
    return path.read_text(encoding="utf-8").split("EXECUTE $pair_query$")[1].split("$pair_query$ INTO")[0].strip().removesuffix(";")


FIXTURES = """
players(player_tag,name,unlocked_characters) AS (VALUES
 ('m','Mythic','{"ranked_rank":13}'::jsonb),
 ('l','Legendary','{"ranked_rank":18}'::jsonb),
 ('s','Masters','{"ranked_rank":19}'::jsonb),
 ('low','Low','{"ranked_rank":12}'::jsonb),
 ('mock','Mock (Error: timeout)','{"ranked_rank":19}'::jsonb),
 ('bad','Invalid','{"ranked_rank":"bad"}'::jsonb)
), matches AS (
 SELECT 'match-'||n AS match_id,
        CASE WHEN n IN (1,2) THEN 'duplicate' ELSE 'battle-'||n END AS battle_uid,
        CASE WHEN n%3=0 THEN 'Mr. P' WHEN n%3=1 THEN ' COLT ' ELSE 'bull' END AS hero_used,
        ARRAY['Colt',' MR. P ','unknown','']::text[] AS allies,
        ARRAY['colt','bull','Mr. P','nan']::text[] AS opponents,
        CASE WHEN n=22 THEN 'draw' WHEN n%2=0 THEN 'victory' ELSE 'defeat' END AS result,
        (now() AT TIME ZONE 'UTC') - make_interval(days=>CASE WHEN n=23 THEN 61 ELSE n*2 END) AS match_at,
        CASE WHEN n=24 THEN 'soloShowdown' WHEN n%2=0 THEN 'brawlBall' ELSE 'gemGrab' END AS mode,
        CASE WHEN n%2=0 THEN 'map-a' ELSE 'map-b' END AS map_id,
        CASE WHEN n%3=0 THEN 'ranked' WHEN n%3=1 THEN 'soloRanked' ELSE 'teamRanked' END AS match_type,
        (ARRAY['m','l','s','low','mock','bad',NULL])[1+n%7] AS player_tag
 FROM generate_series(1,24) n
 UNION ALL
 SELECT 'duplicate-observer','duplicate',' COLT ',ARRAY['Colt',' MR. P ','unknown',''],
        ARRAY['colt','bull','Mr. P','nan'],'defeat',
        (now() AT TIME ZONE 'UTC')-interval '1 day','gemGrab','map-b','soloRanked','s'
),
"""


def comparison(live=False, character="colt", cohort="global", rank="all", mode=None, map_id=None):
    old = query(MIGRATIONS / "20261002133601_custom_plan_character_pairs.sql")
    new = query(next(MIGRATIONS.glob("*_optimize_character_pair_reads.sql")))
    inputs = [(character, cohort, mode, map_id, rank)] if live else [
        (char, kind, scope_mode, scope_map, tier)
        for char in ("colt", " Mr. P ", "does-not-exist")
        for kind in ("global", "gachi", "invalid")
        for tier in ("all", "mythic", "legendary", "masters", "invalid")
        for scope_mode, scope_map in ((None, None), ("brawlBall", None), (None, "map-b"))
    ]
    def literal(value):
        return "NULL::text" if value is None else "'" + value.replace("'", "''") + "'::text"
    values = ",\n".join("(" + ",".join(map(literal, row)) + ")" for row in inputs)
    def bind(sql):
        if not live:
            sql = sql.replace("public.players", "players").replace("public.match_raw_history", "matches")
        for i, field in enumerate(("character", "cohort", "mode", "map_id", "rank"), 1):
            sql = sql.replace(f"${i}", f"input.{field}")
        return sql
    # Sort JSON rows so hash aggregate output order cannot cause false failures.
    normalize = "SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM jsonb_array_elements(pair_rows) v"
    return f"""WITH {'' if live else FIXTURES}
inputs(character,cohort,mode,map_id,rank) AS (VALUES {values}),
compared AS (
 SELECT input.*, old_result.value AS old_value, new_result.value AS new_value
 FROM inputs input
 CROSS JOIN LATERAL (SELECT ({normalize}) AS value FROM ({bind(old)}) result(pair_rows)) old_result
 CROSS JOIN LATERAL (SELECT ({normalize}) AS value FROM ({bind(new)}) result(pair_rows)) new_result
)
SELECT count(*) AS cases, count(*) FILTER (WHERE old_value<>new_value) AS mismatches,
 coalesce(jsonb_agg(to_jsonb(compared)) FILTER (WHERE old_value<>new_value),'[]'::jsonb) AS differences
FROM compared;
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--character", default="colt")
    parser.add_argument("--cohort", default="global")
    parser.add_argument("--rank", default="all")
    parser.add_argument("--mode")
    parser.add_argument("--map", dest="map_id")
    args = vars(parser.parse_args())
    print(comparison(**args))
