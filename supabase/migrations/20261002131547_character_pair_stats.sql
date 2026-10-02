-- Detail panels need only one character's direct and reverse observations.
-- Filter before expanding/deduplicating pairs; retain the existing cohort,
-- observer-independent battle identity and 60-day decay policies.
CREATE OR REPLACE FUNCTION public.match_participant_ids(p_hero text,p_allies text[],p_opponents text[])
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
    SELECT ARRAY(
        SELECT translate(lower(trim(character)),' _-.&','')
        FROM unnest(ARRAY[p_hero] || coalesce(p_allies,'{}'::text[])
                    || coalesce(p_opponents,'{}'::text[])) character
    );
$$;
REVOKE ALL ON FUNCTION public.match_participant_ids(text,text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_participant_ids(text,text[],text[]) TO service_role;

CREATE INDEX IF NOT EXISTS idx_match_history_pair_participants
ON public.match_raw_history USING gin (public.match_participant_ids(hero_used,allies,opponents))
WHERE result IN ('victory','defeat')
  AND mode IN ('brawlBall','gemGrab','hotZone','heist','bounty','knockout')
  AND match_type IN ('ranked','soloRanked','teamRanked');

CREATE OR REPLACE FUNCTION public.character_pair_stats(
    p_character text, p_type text DEFAULT 'global', p_mode text DEFAULT NULL,
    p_map text DEFAULT NULL, p_rank text DEFAULT 'all'
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH target AS (
    SELECT translate(lower(trim(p_character)), ' _-.&', '') AS id
), base AS (
    SELECT coalesce(nullif(m.battle_uid,''),m.match_id) AS game,
           lower(trim(m.hero_used)) AS hero,m.allies,m.opponents,
           (m.result='victory')::int AS win,
           power(2.0,-least(age.days,30.0)/30.0-greatest(age.days-30.0,0.0)/7.0) AS weight
    FROM public.match_raw_history m
    LEFT JOIN public.players p ON p.player_tag=m.player_tag
    CROSS JOIN LATERAL (
        SELECT greatest(0.0,extract(epoch from ((now() at time zone 'UTC')-m.match_at))/86400.0) AS days
    ) age
    WHERE m.match_at >= (now() at time zone 'UTC')-interval '60 days'
      AND m.result IN ('victory','defeat')
      AND m.mode IN ('brawlBall','gemGrab','hotZone','heist','bounty','knockout')
      AND m.match_type IN ('ranked','soloRanked','teamRanked')
      AND public.match_participant_ids(m.hero_used,m.allies,m.opponents) @> ARRAY[(SELECT id FROM target)]
      AND (p_mode IS NULL OR m.mode=p_mode) AND (p_map IS NULL OR m.map_id=p_map)
      AND (p_type='global' OR (
          p_type='gachi' AND m.match_type IN ('soloRanked','teamRanked')
          AND p.name NOT LIKE 'Mock (Error:%'
          AND CASE WHEN (p.unlocked_characters->>'ranked_rank') ~ '^[0-9]+$'
              THEN (p.unlocked_characters->>'ranked_rank')::int ELSE 0 END
              BETWEEN CASE p_rank WHEN 'masters' THEN 19 WHEN 'legendary' THEN 16 ELSE 13 END
                  AND CASE p_rank WHEN 'mythic' THEN 15 WHEN 'legendary' THEN 18 ELSE 100 END
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
$$;
REVOKE ALL ON FUNCTION public.character_pair_stats(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.character_pair_stats(text,text,text,text,text) TO service_role;
