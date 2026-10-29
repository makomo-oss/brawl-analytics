-- Preserve exact pair identities, numeric decay, and current rank eligibility.
-- Bound transient memory per query and avoid disk spills for character details.
CREATE OR REPLACE FUNCTION public.character_pair_stats(p_character text, p_type text DEFAULT 'global'::text, p_mode text DEFAULT NULL::text, p_map text DEFAULT NULL::text, p_rank text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
 SET work_mem TO '16MB'
AS $function$
DECLARE pair_result jsonb;
BEGIN
    EXECUTE $pair_query$
WITH target AS (
    SELECT translate(lower(trim($1)), ' _-.&', '') AS id,
           CASE WHEN $5 IN ('mythic','legendary','masters') THEN $5 ELSE 'all' END AS cohort
), eligible_players AS MATERIALIZED (
    -- Each disjoint range has a small covering partial index. The inactive
    -- rank branches are skipped, without reading every profile's JSON.
    SELECT player_tag FROM public.players
    WHERE $2='gachi' AND name NOT LIKE 'Mock (Error:%' AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 13 AND 15
      AND (SELECT cohort FROM target) IN ('all','mythic')
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE $2='gachi' AND name NOT LIKE 'Mock (Error:%' AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 16 AND 18
      AND (SELECT cohort FROM target) IN ('all','legendary')
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE $2='gachi' AND name NOT LIKE 'Mock (Error:%' AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 19 AND 100
      AND (SELECT cohort FROM target) IN ('all','masters')
), base AS MATERIALIZED (
    SELECT coalesce(nullif(m.battle_uid,''),m.match_id) AS game,
           lower(trim(m.hero_used)) AS hero,m.allies,m.opponents,
           (m.result='victory')::int AS win,
           power(2.0,-least(age.days,30.0)/30.0-greatest(age.days-30.0,0.0)/7.0) AS weight
    FROM public.match_raw_history m
    LEFT JOIN eligible_players p ON p.player_tag=m.player_tag
    CROSS JOIN LATERAL (
        SELECT greatest(0.0,extract(epoch from ((now() at time zone 'UTC')-m.match_at))/86400.0) AS days
    ) age
    WHERE m.match_at >= (now() at time zone 'UTC')-interval '60 days'
      AND m.result IN ('victory','defeat')
      AND m.mode IN ('brawlBall','gemGrab','hotZone','heist','bounty','knockout')
      AND m.match_type IN ('ranked','soloRanked','teamRanked')
      AND public.match_participant_ids(m.hero_used,m.allies,m.opponents) @> ARRAY[translate(lower(trim($1)), ' _-.&', '')]
      AND ($3 IS NULL OR m.mode=$3) AND ($4 IS NULL OR m.map_id=$4)
      AND ($2='global' OR (
          $2='gachi' AND m.match_type IN ('soloRanked','teamRanked')
          AND p.player_tag IS NOT NULL
      ))
), pairs AS (
    SELECT game,'counter' AS kind,hero AS a,lower(trim(e)) AS b,win,weight
    FROM base CROSS JOIN target CROSS JOIN LATERAL unnest(opponents) e
    WHERE translate(hero,' _-.&','')=target.id
    UNION ALL
    SELECT game,'counter',lower(trim(e)),hero,1-win,weight
    FROM base CROSS JOIN target CROSS JOIN LATERAL unnest(opponents) e
    WHERE translate(lower(trim(e)),' _-.&','')=target.id
    UNION ALL
    SELECT game,'synergy',hero,lower(trim(e)),win,weight
    FROM base CROSS JOIN target CROSS JOIN LATERAL unnest(allies) e
    WHERE translate(hero,' _-.&','')=target.id
    UNION ALL
    SELECT game,'synergy',lower(trim(e)),hero,win,weight
    FROM base CROSS JOIN target CROSS JOIN LATERAL unnest(allies) e
    WHERE translate(lower(trim(e)),' _-.&','')=target.id
), unique_pairs AS (
    SELECT DISTINCT ON(game,kind,a,b,win) game,kind,a,b,win,weight
    FROM pairs
    WHERE a NOT IN ('','unknown','nan') AND b NOT IN ('','unknown','nan') AND a<>b
    ORDER BY game,kind,a,b,win,weight DESC
), grouped AS (
    SELECT kind,a AS char_a,b AS char_b,count(*) AS match_count,sum(win) AS win_count,
           sum(weight)::float8 AS weighted_matches,sum(weight*win)::float8 AS weighted_wins
    FROM unique_pairs GROUP BY kind,a,b
)
SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) FROM grouped;
    $pair_query$ INTO pair_result USING p_character,p_type,p_mode,p_map,p_rank;
    RETURN pair_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.character_pair_stats(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.character_pair_stats(text,text,text,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
