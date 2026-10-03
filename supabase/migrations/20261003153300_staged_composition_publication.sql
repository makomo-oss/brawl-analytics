-- Transfer large fitted matrices in bounded batches; activate them atomically.
CREATE TABLE public.composition_effect_staging (
  snapshot_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('c','e','s')),
  context text NOT NULL,
  char_a text NOT NULL,
  char_b text NOT NULL DEFAULT '',
  effect_log_odds double precision NOT NULL,
  weighted_matches double precision NOT NULL,
  effective_matches double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(snapshot_id,kind,context,char_a,char_b)
);
CREATE INDEX composition_effect_staging_expiry ON public.composition_effect_staging(created_at);
ALTER TABLE public.composition_effect_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.composition_effect_staging FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.composition_effect_staging TO service_role;

DROP FUNCTION public.publish_composition_model(text,jsonb,jsonb);
CREATE FUNCTION public.publish_composition_model(p_id text,p_model jsonb,p_effects jsonb DEFAULT '[]',p_effect_snapshot uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_id NOT IN ('current','overall') OR p_model->>'version' NOT IN ('composition_set_v3','ranked_joint_v4') THEN
    RAISE EXCEPTION 'Invalid model snapshot'; END IF;
  PERFORM pg_advisory_xact_lock(748193);
  INSERT INTO public.draft_outcome_models(id,model,updated_at)
    VALUES(CASE p_id WHEN 'current' THEN 'candidate' ELSE 'overall_candidate' END,p_model,now())
    ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
  IF (p_model->>'accepted')::boolean IS TRUE THEN
    IF p_effect_snapshot IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.composition_effect_staging WHERE snapshot_id=p_effect_snapshot
    ) THEN RAISE EXCEPTION 'Missing staged effects'; END IF;
    INSERT INTO public.draft_outcome_models(id,model,updated_at)
      SELECT CASE p_id WHEN 'current' THEN 'previous' ELSE 'overall_previous' END,model,updated_at
      FROM public.draft_outcome_models WHERE id=p_id
      ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
    INSERT INTO public.draft_outcome_models(id,model,updated_at) VALUES(p_id,p_model,now())
      ON CONFLICT(id) DO UPDATE SET model=excluded.model,updated_at=excluded.updated_at;
    DELETE FROM public.composition_effects WHERE population=p_id;
    IF p_effect_snapshot IS NOT NULL THEN
      INSERT INTO public.composition_effects(population,model_version,kind,context,char_a,char_b,effect_log_odds,weighted_matches,effective_matches)
        SELECT p_id,p_model->>'version',kind,context,char_a,char_b,effect_log_odds,weighted_matches,effective_matches
        FROM public.composition_effect_staging WHERE snapshot_id=p_effect_snapshot;
      DELETE FROM public.composition_effect_staging WHERE snapshot_id=p_effect_snapshot;
    ELSE
      INSERT INTO public.composition_effects(population,model_version,kind,context,char_a,char_b,effect_log_odds,weighted_matches,effective_matches)
        SELECT p_id,p_model->>'version',r.kind,r.context,r.char_a,coalesce(r.char_b,''),r.effect_log_odds,r.weighted_matches,r.effective_matches
        FROM jsonb_to_recordset(p_effects) AS r(kind text,context text,char_a text,char_b text,effect_log_odds double precision,weighted_matches double precision,effective_matches double precision);
    END IF;
  END IF;
  DELETE FROM public.composition_effect_staging WHERE created_at < now()-interval '1 day';
END; $$;
REVOKE ALL ON FUNCTION public.publish_composition_model(text,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_composition_model(text,jsonb,jsonb,uuid) TO service_role;
