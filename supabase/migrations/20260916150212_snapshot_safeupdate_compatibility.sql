CREATE OR REPLACE FUNCTION public.replace_analytics_snapshot(
 macro_rows jsonb, counter_rows jsonb, synergy_rows jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
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
 INSERT INTO public.macro_map_stats
 SELECT * FROM jsonb_populate_recordset(NULL::public.macro_map_stats, macro_rows);
 INSERT INTO public.dynamic_counters
 SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_counters, counter_rows);
 INSERT INTO public.dynamic_synergies
 SELECT * FROM jsonb_populate_recordset(NULL::public.dynamic_synergies, synergy_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_analytics_snapshot(jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_analytics_snapshot(jsonb,jsonb,jsonb) TO service_role;
