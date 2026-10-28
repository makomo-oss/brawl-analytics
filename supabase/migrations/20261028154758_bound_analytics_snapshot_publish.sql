-- Publishing ~40k derived rows is a background-only atomic write, not an
-- interactive analytics query. PostgREST hoists this function-scoped setting.
-- Keep the role/database and the draft/character read limits unchanged.
ALTER FUNCTION public.replace_analytics_snapshot(jsonb, jsonb, jsonb)
    SET statement_timeout TO '30s';
NOTIFY pgrst, 'reload schema';
