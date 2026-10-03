-- Reuse the existing covering rank indexes rather than decoding every
-- player's full profile JSON for each map. Bound EXECUTE parameters also
-- let Postgres plan for the requested mode/map instead of a generic scan.
CREATE OR REPLACE FUNCTION public.contextual_pair_stats(
    p_type text DEFAULT 'global', p_mode text DEFAULT NULL,
    p_map text DEFAULT NULL, p_rank text DEFAULT 'all'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE pair_result jsonb;
BEGIN
    EXECUTE $pair_query$
WITH cohort AS (
    SELECT CASE WHEN $4 IN ('mythic','legendary','masters') THEN $4 ELSE 'all' END AS rank
), eligible_players AS MATERIALIZED (
    SELECT player_tag FROM public.players
    WHERE $1='gachi' AND name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 13 AND 15
      AND (SELECT rank FROM cohort) IN ('all','mythic')
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE $1='gachi' AND name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 16 AND 18
      AND (SELECT rank FROM cohort) IN ('all','legendary')
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE $1='gachi' AND name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 19 AND 100
      AND (SELECT rank FROM cohort) IN ('all','masters')
), base AS (
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
      AND ($2 IS NULL OR m.mode=$2) AND ($3 IS NULL OR m.map_id=$3)
      AND ($1='global' OR (
          $1='gachi' AND m.match_type IN ('soloRanked','teamRanked')
          AND p.player_tag IS NOT NULL
      ))
), direct AS (
    SELECT game,'counter' AS kind,hero AS a,lower(trim(e)) AS b,win,weight
    FROM base CROSS JOIN LATERAL unnest(opponents) e
    UNION ALL
    SELECT game,'synergy',hero,lower(trim(e)),win,weight
    FROM base CROSS JOIN LATERAL unnest(allies) e
), pairs AS (
    SELECT * FROM direct
    UNION ALL
    SELECT game,kind,b,a,CASE WHEN kind='counter' THEN 1-win ELSE win END,weight FROM direct
), unique_pairs AS (
    SELECT DISTINCT ON(game,kind,a,b,win) game,kind,a,b,win,weight FROM pairs
    WHERE a NOT IN ('','unknown','nan') AND b NOT IN ('','unknown','nan') AND a<>b
    ORDER BY game,kind,a,b,win,weight DESC
), grouped AS (
    SELECT kind,a AS char_a,b AS char_b,count(*) AS match_count,sum(win) AS win_count,
           sum(weight)::float8 AS weighted_matches,sum(weight*win)::float8 AS weighted_wins
    FROM unique_pairs GROUP BY kind,a,b
)
SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) FROM grouped;
    $pair_query$ INTO pair_result USING p_type,p_mode,p_map,p_rank;
    RETURN pair_result;
END;
$$;
REVOKE ALL ON FUNCTION public.contextual_pair_stats(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contextual_pair_stats(text,text,text,text) TO service_role;
