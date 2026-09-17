-- The unfiltered competitive Tier includes every competitive observation.
-- Current player rank is used only when a rank bracket is selected.
CREATE OR REPLACE FUNCTION public.contextual_pair_stats(p_type text DEFAULT 'global',p_mode text DEFAULT NULL,p_map text DEFAULT NULL,p_rank text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH base AS (
 SELECT coalesce(nullif(m.battle_uid,''),m.match_id) AS game,
 lower(trim(m.hero_used)) AS hero,m.allies,m.opponents,
 (m.result='victory')::int AS win,
 power(2.0,-greatest(0,extract(epoch from ((now() at time zone 'UTC')-m.match_at))/86400)/14) AS weight
 FROM public.match_raw_history m
 LEFT JOIN public.players p ON p.player_tag=m.player_tag
 WHERE m.match_at >= (now() at time zone 'UTC')-interval '30 days'
 AND m.result IN ('victory','defeat')
 AND m.mode IN ('brawlBall','gemGrab','hotZone','heist','bounty','knockout')
 AND m.match_type IN ('ranked','soloRanked','teamRanked')
 AND (p_mode IS NULL OR m.mode=p_mode) AND (p_map IS NULL OR m.map_id=p_map)
 AND (p_type='global' OR (
  p_type='gachi' AND m.match_type IN ('soloRanked','teamRanked')
  AND (p_rank='all' OR (
   p.name NOT LIKE 'Mock (Error:%'
   AND CASE WHEN (p.unlocked_characters->>'ranked_rank') ~ '^[0-9]+$'
     THEN (p.unlocked_characters->>'ranked_rank')::int ELSE 0 END
    BETWEEN CASE p_rank WHEN 'masters' THEN 19 WHEN 'legendary' THEN 16 ELSE 13 END
        AND CASE p_rank WHEN 'mythic' THEN 15 WHEN 'legendary' THEN 18 ELSE 100 END
  ))
 ))
), direct AS (
 SELECT game,'counter' AS kind,hero AS a,lower(trim(e)) AS b,win,weight FROM base CROSS JOIN LATERAL unnest(opponents) e
 UNION ALL
 SELECT game,'synergy',hero,lower(trim(e)),win,weight FROM base CROSS JOIN LATERAL unnest(allies) e
), pairs AS (
 SELECT * FROM direct
 UNION ALL SELECT game,kind,b,a,CASE WHEN kind='counter' THEN 1-win ELSE win END,weight FROM direct
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
$$;
REVOKE ALL ON FUNCTION public.contextual_pair_stats(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contextual_pair_stats(text,text,text,text) TO service_role;
