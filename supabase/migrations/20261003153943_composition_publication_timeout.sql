-- Batch publication may replace tens of thousands of fitted cells atomically.
-- Keep ordinary API/role timeouts unchanged.
ALTER FUNCTION public.publish_composition_model(text,jsonb,jsonb,uuid) SET statement_timeout = '30s';
NOTIFY pgrst, 'reload schema';
