-- Track changed input days, not computed statistics. The Python formulas stay intact.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE public.analytics_history_days (
    match_day date PRIMARY KEY,
    revision uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE public.analytics_history_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_history_days FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_history_days TO service_role;
CREATE POLICY analytics_history_service_role ON public.analytics_history_days
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- This lock also makes initial seeding and trigger installation one consistent cut.
LOCK TABLE public.match_raw_history IN SHARE ROW EXCLUSIVE MODE;
CREATE INDEX idx_match_history_analytics_date
    ON public.match_raw_history(match_at, match_id);
INSERT INTO public.analytics_history_days(match_day)
SELECT DISTINCT match_at::date FROM public.match_raw_history;

CREATE FUNCTION public.track_analytics_history_days()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.analytics_history_days(match_day)
        SELECT DISTINCT match_at::date FROM new_rows ORDER BY 1
        ON CONFLICT (match_day) DO UPDATE SET revision = gen_random_uuid();
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.analytics_history_days(match_day)
        SELECT DISTINCT match_at::date FROM old_rows ORDER BY 1
        ON CONFLICT (match_day) DO UPDATE SET revision = gen_random_uuid();
    ELSIF TG_OP = 'UPDATE' THEN
        -- Repeated crawler upserts of identical observations do not invalidate days.
        -- A changed primary key, date, participant, result or cohort invalidates both dates.
        INSERT INTO public.analytics_history_days(match_day)
        SELECT DISTINCT match_day FROM (
            SELECT o.match_at::date AS match_day
            FROM old_rows o FULL JOIN new_rows n USING (match_id)
            WHERE o.match_id IS NULL OR n.match_id IS NULL OR
              (to_jsonb(o) - 'collected_at') IS DISTINCT FROM (to_jsonb(n) - 'collected_at')
            UNION
            SELECT n.match_at::date
            FROM old_rows o FULL JOIN new_rows n USING (match_id)
            WHERE o.match_id IS NULL OR n.match_id IS NULL OR
              (to_jsonb(o) - 'collected_at') IS DISTINCT FROM (to_jsonb(n) - 'collected_at')
        ) changed WHERE match_day IS NOT NULL ORDER BY match_day
        ON CONFLICT (match_day) DO UPDATE SET revision = gen_random_uuid();
    ELSIF TG_OP = 'TRUNCATE' THEN
        UPDATE public.analytics_history_days SET revision = gen_random_uuid();
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.track_analytics_history_days() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_analytics_history_days() TO service_role;

CREATE TRIGGER analytics_history_insert AFTER INSERT ON public.match_raw_history
REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
EXECUTE FUNCTION public.track_analytics_history_days();
CREATE TRIGGER analytics_history_update AFTER UPDATE ON public.match_raw_history
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
EXECUTE FUNCTION public.track_analytics_history_days();
CREATE TRIGGER analytics_history_delete AFTER DELETE ON public.match_raw_history
REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
EXECUTE FUNCTION public.track_analytics_history_days();
CREATE TRIGGER analytics_history_truncate AFTER TRUNCATE ON public.match_raw_history
FOR EACH STATEMENT EXECUTE FUNCTION public.track_analytics_history_days();

CREATE FUNCTION public.analytics_history_manifest(p_first_day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT jsonb_build_object('version', 1, 'days', coalesce(
        jsonb_object_agg(match_day::text, revision::text), '{}'::jsonb))
    FROM public.analytics_history_days WHERE match_day >= p_first_day;
$$;
REVOKE ALL ON FUNCTION public.analytics_history_manifest(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_history_manifest(date) TO service_role;
