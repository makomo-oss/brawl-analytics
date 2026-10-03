-- Reduce array expansion, numeric exponentiation and spilled intermediate data.
-- Read-only, bounded draft evidence. Every saved 3v3 log describes both full
-- teams; use all known participants, deduplicate games before aggregation, and
-- return only the six requested characters and their pairs.
CREATE OR REPLACE FUNCTION public.selected_draft_evidence_slice(
    p_characters text[], p_mode text, p_map text, p_scope text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; ids text[];
BEGIN
    IF cardinality(p_characters) <> 6 THEN
        RAISE EXCEPTION 'Exactly six characters are required';
    END IF;
    IF p_scope NOT IN ('global','mode','map') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
    SELECT array_agg(translate(lower(trim(name)), ' _-.&', '')) INTO ids
    FROM unnest(p_characters) name;
    EXECUTE $query$
WITH eligible_players AS MATERIALIZED (
    SELECT player_tag FROM public.players
    WHERE name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 13 AND 15
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 16 AND 18
    UNION ALL
    SELECT player_tag FROM public.players
    WHERE name NOT LIKE 'Mock (Error:%'
      AND substring((unlocked_characters->>'ranked_rank') from '^[0-9]+$')::int BETWEEN 19 AND 100
), base AS MATERIALIZED (
    -- Validate array sizes after this join: estimating two cardinality()
    -- equalities as independent rare events otherwise selects a huge loop.
    SELECT coalesce(nullif(m.battle_uid,''),m.match_id) AS game,
           m.mode,m.map_id,(m.result='victory')::int AS win,
           ARRAY(SELECT translate(lower(trim(c)), ' _-.&', '')
                 FROM unnest(array_prepend(m.hero_used,m.allies)) c
                 WHERE translate(lower(trim(c)), ' _-.&', '')=ANY($1::text[])) AS own,
           ARRAY(SELECT translate(lower(trim(c)), ' _-.&', '')
                 FROM unnest(m.opponents) c
                 WHERE translate(lower(trim(c)), ' _-.&', '')=ANY($1::text[])) AS enemy,
           (cardinality(m.allies)=2 AND cardinality(m.opponents)=3) AS complete,
           power(2.0::float8,-least(age.days,30.0)::float8/30.0-greatest(age.days-30.0,0.0)::float8/7.0) AS weight
    FROM public.match_raw_history m
    JOIN eligible_players p ON p.player_tag=m.player_tag
    CROSS JOIN LATERAL (
        SELECT greatest(0.0,extract(epoch from ((now() at time zone 'UTC')-m.match_at))/86400.0) AS days
    ) age
    WHERE m.match_at >= (now() at time zone 'UTC')-interval '60 days'
      AND m.result IN ('victory','defeat')
      AND m.mode IN ('brawlBall','gemGrab','hotZone','heist','bounty','knockout')
      AND m.match_type IN ('soloRanked','teamRanked')
      AND (($4='global' AND m.mode<>$2)
        OR ($4='mode' AND m.mode=$2 AND m.map_id<>$3)
        OR ($4='map' AND m.mode=$2 AND m.map_id=$3))
      AND public.match_participant_ids(m.hero_used,m.allies,m.opponents) && $1::text[]
), teams AS (
    SELECT game,mode,map_id,own AS members,enemy AS rivals,win,weight FROM base WHERE complete AND cardinality(own)>0
    UNION ALL
    SELECT game,mode,map_id,enemy,own,1-win,weight FROM base WHERE complete AND cardinality(enemy)>0
), observations AS (
    SELECT game,mode,map_id,'character'::text AS kind,a,''::text AS b,win,weight
    FROM teams CROSS JOIN LATERAL unnest(members) a
    UNION ALL
    SELECT game,mode,map_id,'counter',a,b,win,weight
    FROM teams CROSS JOIN LATERAL unnest(members) a CROSS JOIN LATERAL unnest(rivals) b
    WHERE a<>b
    UNION ALL
    SELECT game,mode,map_id,'synergy',a,b,win,weight
    FROM teams CROSS JOIN LATERAL unnest(members) a CROSS JOIN LATERAL unnest(members) b
    WHERE a<>b
), unique_observations AS (
    SELECT game,mode,map_id,kind,a,b,min(win) AS win,max(weight) AS weight
    FROM observations GROUP BY game,mode,map_id,kind,a,b
    HAVING min(win)=max(win) -- Contradictory logs must not supply evidence.
), scoped AS (
    -- Slices are disjoint, keeping every individual query below the Data API
    -- statement budget. The API reconstructs cumulative scopes for smoothing.
    SELECT kind,a,b,win,weight,$4::text AS scope FROM unique_observations
), grouped AS (
    SELECT scope,kind,a AS char_a,b AS char_b,count(*) AS match_count,
           sum(weight)::float8 AS weighted_matches,sum(weight*win)::float8 AS weighted_wins
    FROM scoped GROUP BY scope,kind,a,b
)
SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) FROM grouped;
    $query$ INTO result USING ids,p_mode,p_map,p_scope;
    RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.selected_draft_evidence_slice(text[],text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.selected_draft_evidence_slice(text[],text,text,text) TO service_role;
