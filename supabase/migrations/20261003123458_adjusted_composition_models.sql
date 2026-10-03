-- Thin official battle fields are stored once per observer-independent game.
CREATE TABLE public.battle_features (
  battle_uid text PRIMARY KEY,
  match_at timestamptz NOT NULL,
  collected_at timestamptz NOT NULL,
  teams jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1
);
CREATE INDEX battle_features_match_at ON public.battle_features(match_at);
ALTER TABLE public.battle_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_features FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.battle_features TO service_role;

ALTER TABLE public.draft_outcome_models DROP CONSTRAINT draft_outcome_models_id_check;
ALTER TABLE public.draft_outcome_models ADD CONSTRAINT draft_outcome_models_id_check
  CHECK (id IN ('current','previous','overall','overall_previous','candidate','overall_candidate'));

CREATE FUNCTION public.save_battle_observations(p_records jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Battle observations must be an array';
  END IF;
  INSERT INTO public.match_raw_history(match_id,battle_uid,player_tag,match_at,match_type,mode,map_id,result,hero_used,allies,opponents)
  SELECT DISTINCT ON (r.match_id) r.match_id,r.battle_uid,r.player_tag,r.match_at,r.match_type,r.mode,r.map_id,r.result,r.hero_used,r.allies,r.opponents
  FROM jsonb_to_recordset(p_records) AS r(match_id text,battle_uid text,player_tag text,match_at timestamp,
    match_type text,mode text,map_id text,result text,hero_used text,allies text[],opponents text[])
  WHERE r.match_at >= (now() AT TIME ZONE 'UTC')-interval '60 days' AND r.match_at <= (now() AT TIME ZONE 'UTC')
  ORDER BY r.match_id
  ON CONFLICT (match_id) DO UPDATE SET battle_uid=excluded.battle_uid,match_type=excluded.match_type,
    mode=excluded.mode,map_id=excluded.map_id,result=excluded.result,hero_used=excluded.hero_used,
    allies=excluded.allies,opponents=excluded.opponents;
  INSERT INTO public.battle_features(battle_uid,match_at,collected_at,teams)
  SELECT DISTINCT ON (r.battle_uid) r.battle_uid,r.match_at,(r.features->>'collected_at')::timestamptz,r.features->'teams'
  FROM jsonb_to_recordset(p_records) AS r(battle_uid text,match_at timestamptz,features jsonb)
  WHERE r.battle_uid IS NOT NULL AND r.features->>'collected_at' IS NOT NULL
    AND jsonb_typeof(r.features->'teams')='array' AND jsonb_array_length(r.features->'teams')=2
    AND r.match_at >= now()-interval '60 days' AND r.match_at<=now()
  ORDER BY r.battle_uid,(r.features->>'collected_at')::timestamptz
  ON CONFLICT (battle_uid) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.save_battle_observations(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_battle_observations(jsonb) TO service_role;

-- Preserve opt-in and lease checks before any observation or feature write.
CREATE OR REPLACE FUNCTION public.finish_player_auto_sync(p_tag text,p_lease uuid,p_records jsonb,p_state jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.player_auto_sync_queue WHERE player_tag=p_tag AND lease_token=p_lease FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.player_auto_sync_subscriptions WHERE player_tag=p_tag AND enabled) THEN
    RETURN false;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_records) r WHERE r->>'player_tag' IS DISTINCT FROM p_tag) THEN
    RAISE EXCEPTION 'Observation player does not match lease';
  END IF;
  PERFORM public.save_battle_observations(p_records);
  UPDATE public.player_auto_sync_queue SET
    next_sync_at=(p_state->>'next_sync_at')::timestamptz,
    interval_minutes=(p_state->>'interval_minutes')::integer,
    idle_runs=coalesce((p_state->>'idle_runs')::integer,idle_runs),
    error_runs=(p_state->>'error_runs')::integer,
    last_sync_at=coalesce((p_state->>'last_sync_at')::timestamptz,last_sync_at),
    last_observed_at=coalesce((p_state->>'last_observed_at')::timestamptz,last_observed_at),
    last_new_matches=coalesce((p_state->>'last_new_matches')::integer,last_new_matches),
    gap_detected_at=coalesce((p_state->>'gap_detected_at')::timestamptz,gap_detected_at),
    last_error=p_state->>'last_error',lease_token=null,lease_until=null
  WHERE player_tag=p_tag;
  RETURN true;
END;
$$;

-- Publication preserves the previous known model and switches one row atomically.
CREATE FUNCTION public.publish_composition_model(p_id text,p_model jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_id NOT IN ('current','overall') OR p_model->>'version'<>'composition_set_v3' THEN
    RAISE EXCEPTION 'Invalid model snapshot';
  END IF;
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
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_composition_model(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_composition_model(text,jsonb) TO service_role;
