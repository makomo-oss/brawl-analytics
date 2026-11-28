-- Store mirror-excluded win totals alongside full pick counts so Tier win
-- rates remove mirror-match compression toward 50% without reducing pick share.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.macro_map_stats
    ADD COLUMN IF NOT EXISTS non_mirror_matches integer,
    ADD COLUMN IF NOT EXISTS non_mirror_wins integer,
    ADD COLUMN IF NOT EXISTS non_mirror_weighted_matches double precision,
    ADD COLUMN IF NOT EXISTS non_mirror_weighted_wins double precision;

CREATE OR REPLACE FUNCTION public.replace_analytics_snapshot(
    macro_rows jsonb,
    counter_rows jsonb,
    synergy_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '30s'
AS $$
BEGIN
    IF jsonb_typeof(macro_rows) IS DISTINCT FROM 'array'
       OR jsonb_typeof(counter_rows) IS DISTINCT FROM 'array'
       OR jsonb_typeof(synergy_rows) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'All snapshot inputs must be arrays';
    END IF;
    PERFORM pg_advisory_xact_lock(748192);
    DELETE FROM public.macro_map_stats WHERE map_id IS NOT NULL;
    DELETE FROM public.dynamic_counters WHERE char_a IS NOT NULL;
    DELETE FROM public.dynamic_synergies WHERE char_a IS NOT NULL;
    INSERT INTO public.macro_map_stats (
        map_id, character_id, match_type, mode,
        total_wins, total_matches, win_rate, pick_rate_deviation, updated_at,
        weighted_matches, weighted_wins,
        non_mirror_matches, non_mirror_wins,
        non_mirror_weighted_matches, non_mirror_weighted_wins
    )
    SELECT
        r.map_id, r.character_id, r.match_type, coalesce(r.mode, 'unknown'),
        r.total_wins, r.total_matches, r.win_rate, r.pick_rate_deviation, r.updated_at,
        coalesce(r.weighted_matches, r.total_matches),
        coalesce(r.weighted_wins, r.total_wins),
        coalesce(r.non_mirror_matches, r.total_matches),
        coalesce(r.non_mirror_wins, r.total_wins),
        coalesce(r.non_mirror_weighted_matches, coalesce(r.weighted_matches, r.total_matches)),
        coalesce(r.non_mirror_weighted_wins, coalesce(r.weighted_wins, r.total_wins))
    FROM jsonb_populate_recordset(NULL::public.macro_map_stats, macro_rows) r;
    INSERT INTO public.dynamic_counters
    SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_counters, counter_rows);
    INSERT INTO public.dynamic_synergies
    SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_synergies, synergy_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_analytics_snapshot(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_analytics_snapshot(jsonb, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
