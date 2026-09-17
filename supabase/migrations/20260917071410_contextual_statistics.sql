ALTER TABLE public.match_raw_history ADD COLUMN IF NOT EXISTS battle_uid text;
ALTER TABLE public.macro_map_stats ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.macro_map_stats ADD COLUMN IF NOT EXISTS weighted_matches double precision;
ALTER TABLE public.macro_map_stats ADD COLUMN IF NOT EXISTS weighted_wins double precision;
ALTER TABLE public.macro_map_stats DROP CONSTRAINT macro_map_stats_pkey;
ALTER TABLE public.macro_map_stats ADD PRIMARY KEY (map_id, character_id, match_type, mode);

CREATE OR REPLACE FUNCTION public.replace_analytics_snapshot(macro_rows jsonb, counter_rows jsonb, synergy_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(macro_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(counter_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(synergy_rows) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'All snapshot inputs must be arrays';
 END IF;
 PERFORM pg_advisory_xact_lock(748192);
 DELETE FROM public.macro_map_stats WHERE map_id IS NOT NULL;
 DELETE FROM public.dynamic_counters WHERE char_a IS NOT NULL;
 DELETE FROM public.dynamic_synergies WHERE char_a IS NOT NULL;
 INSERT INTO public.macro_map_stats (map_id,character_id,match_type,mode,total_wins,total_matches,win_rate,pick_rate_deviation,updated_at,weighted_matches,weighted_wins)
 SELECT r.map_id,r.character_id,r.match_type,coalesce(r.mode,'unknown'),r.total_wins,r.total_matches,r.win_rate,r.pick_rate_deviation,r.updated_at,coalesce(r.weighted_matches,r.total_matches),coalesce(r.weighted_wins,r.total_wins)
 FROM jsonb_populate_recordset(NULL::public.macro_map_stats,macro_rows) r;
 INSERT INTO public.dynamic_counters SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_counters,counter_rows);
 INSERT INTO public.dynamic_synergies SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_synergies,synergy_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_analytics_snapshot(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_analytics_snapshot(jsonb,jsonb,jsonb) TO service_role;

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
  AND p.name NOT LIKE 'Mock (Error:%'
  AND CASE WHEN (p.unlocked_characters->>'ranked_rank') ~ '^[0-9]+$'
    THEN (p.unlocked_characters->>'ranked_rank')::int ELSE 0 END
   BETWEEN CASE p_rank WHEN 'masters' THEN 19 WHEN 'legendary' THEN 16 ELSE 13 END
       AND CASE p_rank WHEN 'mythic' THEN 15 WHEN 'legendary' THEN 18 ELSE 100 END
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
