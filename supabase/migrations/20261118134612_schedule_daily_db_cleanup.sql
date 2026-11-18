-- Run 60-day battle history cleanup directly inside Postgres via pg_cron and bounded RPC batches.
CREATE OR REPLACE FUNCTION public.cleanup_expired_match_history(
    p_before timestamptz DEFAULT (now() - interval '60 days'),
    p_batch_size integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '30s'
AS $$
DECLARE
    v_cutoff timestamp without time zone;
    v_limit integer;
    v_deleted integer := 0;
BEGIN
    IF p_before IS NULL THEN
        RAISE EXCEPTION 'p_before must not be null';
    END IF;
    v_cutoff := (p_before AT TIME ZONE 'UTC');
    v_limit := greatest(1, least(coalesce(p_batch_size, 5000), 10000));

    WITH target AS (
        SELECT match_id
        FROM public.match_raw_history
        WHERE match_at < v_cutoff
        ORDER BY match_at ASC, match_id ASC
        LIMIT v_limit
    ),
    deleted AS (
        DELETE FROM public.match_raw_history m
        USING target t
        WHERE m.match_id = t.match_id
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_deleted FROM deleted;

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_match_history(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_match_history(timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.run_daily_db_cleanup(
    p_retention_days integer DEFAULT 60,
    p_batch_size integer DEFAULT 5000,
    p_max_batches integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
    v_cutoff timestamptz;
    v_batch integer := 0;
    v_deleted integer := 0;
    v_total integer := 0;
BEGIN
    IF p_retention_days IS NULL OR p_retention_days < 1 THEN
        RAISE EXCEPTION 'p_retention_days must be at least 1';
    END IF;
    v_cutoff := now() - make_interval(days => p_retention_days);

    WHILE v_batch < greatest(1, coalesce(p_max_batches, 50)) LOOP
        v_deleted := public.cleanup_expired_match_history(v_cutoff, p_batch_size);
        v_total := v_total + v_deleted;
        EXIT WHEN v_deleted = 0;
        v_batch := v_batch + 1;
    END LOOP;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.run_daily_db_cleanup(integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'brawl-daily-db-cleanup') THEN
        PERFORM cron.unschedule('brawl-daily-db-cleanup');
    END IF;
    PERFORM cron.schedule('brawl-daily-db-cleanup', '30 4 * * *', 'select public.run_daily_db_cleanup();');
END;
$$;

NOTIFY pgrst, 'reload schema';
