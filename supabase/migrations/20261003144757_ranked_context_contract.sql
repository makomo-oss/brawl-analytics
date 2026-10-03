-- Preserve the first time each observation was actually available. Old rows
-- remain NULL; migration time is not a historical collection timestamp.
ALTER TABLE public.match_raw_history ADD COLUMN collected_at timestamptz;
ALTER TABLE public.match_raw_history ALTER COLUMN collected_at SET DEFAULT now();
ALTER TABLE public.battle_features
  ADD COLUMN match_type text,
  ADD COLUMN mode text,
  ADD COLUMN map_id text,
  ADD COLUMN event_id bigint,
  ADD COLUMN outcome text CHECK (outcome IN ('victory','defeat','draw')),
  ADD COLUMN target_unit text NOT NULL DEFAULT 'api_record',
  ADD COLUMN quality_state text NOT NULL DEFAULT 'legacy'
    CHECK (quality_state IN ('legacy','complete','incomplete','conflict')),
  ADD COLUMN observers text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.profile_rank_snapshots (
  player_tag text NOT NULL,
  observed_at timestamptz NOT NULL,
  ranked_rank integer NOT NULL CHECK (ranked_rank BETWEEN 0 AND 100),
  PRIMARY KEY(player_tag,observed_at)
);
CREATE INDEX profile_rank_snapshots_expiry ON public.profile_rank_snapshots(observed_at);
ALTER TABLE public.profile_rank_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_rank_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.profile_rank_snapshots TO service_role;

CREATE FUNCTION public.record_profile_rank_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rank_value integer;
BEGIN
  IF NEW.unlocked_characters->>'profile_status' IS DISTINCT FROM 'verified'
     OR NEW.updated_at IS NULL THEN RETURN NEW; END IF;
  rank_value := substring(NEW.unlocked_characters->>'ranked_rank' from '^[0-9]+$')::integer;
  IF rank_value BETWEEN 1 AND 100 THEN
    INSERT INTO public.profile_rank_snapshots(player_tag,observed_at,ranked_rank)
      VALUES(NEW.player_tag,NEW.updated_at,rank_value) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.record_profile_rank_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_profile_rank_snapshot() TO service_role;
CREATE TRIGGER preserve_profile_rank AFTER INSERT OR UPDATE OF unlocked_characters,updated_at
  ON public.players FOR EACH ROW EXECUTE FUNCTION public.record_profile_rank_snapshot();
-- Existing verified values have a real profile timestamp; do not invent older snapshots.
INSERT INTO public.profile_rank_snapshots(player_tag,observed_at,ranked_rank)
SELECT player_tag,updated_at,substring(unlocked_characters->>'ranked_rank' from '^[0-9]+$')::integer
FROM public.players WHERE unlocked_characters->>'profile_status'='verified'
  AND updated_at >= now()-interval '60 days'
  AND substring(unlocked_characters->>'ranked_rank' from '^[0-9]+$')::integer BETWEEN 1 AND 100
ON CONFLICT DO NOTHING;

CREATE TABLE public.composition_effects (
  population text NOT NULL CHECK(population IN ('current','overall')),
  model_version text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('c','e','s')),
  context text NOT NULL,
  char_a text NOT NULL,
  char_b text NOT NULL DEFAULT '',
  effect_log_odds double precision NOT NULL,
  weighted_matches double precision NOT NULL,
  effective_matches double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(population,kind,context,char_a,char_b)
);
ALTER TABLE public.composition_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.composition_effects FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.composition_effects TO service_role;

CREATE OR REPLACE FUNCTION public.save_battle_observations(p_records jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Battle observations must be an array';
  END IF;
  INSERT INTO public.match_raw_history(match_id,battle_uid,player_tag,match_at,match_type,mode,map_id,result,hero_used,allies,opponents,collected_at)
  SELECT DISTINCT ON(r.match_id) r.match_id,r.battle_uid,r.player_tag,r.match_at,r.match_type,r.mode,r.map_id,r.result,r.hero_used,r.allies,r.opponents,
    coalesce((r.features->>'collected_at')::timestamptz,now())
  FROM jsonb_to_recordset(p_records) AS r(match_id text,battle_uid text,player_tag text,match_at timestamp,
    match_type text,mode text,map_id text,result text,hero_used text,allies text[],opponents text[],features jsonb)
  WHERE r.match_at >= (now() AT TIME ZONE 'UTC')-interval '60 days' AND r.match_at <= (now() AT TIME ZONE 'UTC')
  ORDER BY r.match_id
  ON CONFLICT(match_id) DO UPDATE SET battle_uid=excluded.battle_uid,match_type=excluded.match_type,
    mode=excluded.mode,map_id=excluded.map_id,result=excluded.result,hero_used=excluded.hero_used,
    allies=excluded.allies,opponents=excluded.opponents;

  INSERT INTO public.battle_features(battle_uid,match_at,collected_at,teams,match_type,mode,map_id,event_id,outcome,quality_state,observers)
  SELECT DISTINCT ON(r.battle_uid) r.battle_uid,r.match_at,(r.features->>'collected_at')::timestamptz,r.features->'teams',
    r.match_type,r.mode,r.map_id,(r.features->>'event_id')::bigint,
    CASE WHEN r.features->>'outcome' IN ('victory','defeat','draw') THEN r.features->>'outcome' END,
    CASE WHEN (r.features->>'quality_conflict')::boolean IS TRUE THEN 'conflict'
      WHEN jsonb_array_length(r.features->'teams'->0)=3 AND jsonb_array_length(r.features->'teams'->1)=3
      AND r.features->>'outcome' IN ('victory','defeat','draw') THEN 'complete' ELSE 'incomplete' END,
    ARRAY[r.player_tag]
  FROM jsonb_to_recordset(p_records) AS r(battle_uid text,match_at timestamptz,match_type text,mode text,map_id text,player_tag text,features jsonb)
  WHERE r.battle_uid IS NOT NULL AND r.features->>'collected_at' IS NOT NULL
    AND jsonb_typeof(r.features->'teams')='array' AND jsonb_array_length(r.features->'teams')=2
    AND r.match_at >= now()-interval '60 days' AND r.match_at<=now()
  ORDER BY r.battle_uid,(r.features->>'collected_at')::timestamptz
  ON CONFLICT(battle_uid) DO UPDATE SET
    quality_state=CASE WHEN battle_features.quality_state='conflict' OR excluded.quality_state='conflict'
      OR battle_features.teams IS DISTINCT FROM excluded.teams
      OR (battle_features.outcome IS NOT NULL AND excluded.outcome IS NOT NULL AND battle_features.outcome<>excluded.outcome)
      THEN 'conflict' ELSE excluded.quality_state END,
    match_type=coalesce(battle_features.match_type,excluded.match_type),
    mode=coalesce(battle_features.mode,excluded.mode),map_id=coalesce(battle_features.map_id,excluded.map_id),
    event_id=coalesce(battle_features.event_id,excluded.event_id),outcome=coalesce(battle_features.outcome,excluded.outcome),
    observers=ARRAY(SELECT DISTINCT unnest(battle_features.observers||excluded.observers));
END; $$;

-- Publish a coherent model and its supported contextual effects atomically.
DROP FUNCTION public.publish_composition_model(text,jsonb);
CREATE FUNCTION public.publish_composition_model(p_id text,p_model jsonb,p_effects jsonb DEFAULT '[]')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_id NOT IN ('current','overall') OR p_model->>'version' NOT IN ('composition_set_v3','ranked_joint_v4') THEN
    RAISE EXCEPTION 'Invalid model snapshot'; END IF;
  PERFORM pg_advisory_xact_lock(748193);
  INSERT INTO public.draft_outcome_models(id,model,updated_at)
    VALUES(CASE p_id WHEN 'current' THEN 'candidate' ELSE 'overall_candidate' END,p_model,now())
    ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
  IF (p_model->>'accepted')::boolean IS TRUE THEN
    INSERT INTO public.draft_outcome_models(id,model,updated_at)
      SELECT CASE p_id WHEN 'current' THEN 'previous' ELSE 'overall_previous' END,model,updated_at
      FROM public.draft_outcome_models WHERE id=p_id
      ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
    INSERT INTO public.draft_outcome_models(id,model,updated_at) VALUES(p_id,p_model,now())
      ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
    DELETE FROM public.composition_effects WHERE population=p_id;
    INSERT INTO public.composition_effects(population,model_version,kind,context,char_a,char_b,effect_log_odds,weighted_matches,effective_matches)
      SELECT p_id,p_model->>'version',r.kind,r.context,r.char_a,coalesce(r.char_b,''),r.effect_log_odds,r.weighted_matches,r.effective_matches
      FROM jsonb_to_recordset(p_effects) AS r(kind text,context text,char_a text,char_b text,effect_log_odds double precision,weighted_matches double precision,effective_matches double precision);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.publish_composition_model(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_composition_model(text,jsonb,jsonb) TO service_role;
