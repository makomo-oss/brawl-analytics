-- One compact snapshot, accessible only to the backend and batch runner.
CREATE TABLE public.draft_outcome_models (
    id text PRIMARY KEY CHECK (id = 'current'),
    model jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.draft_outcome_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.draft_outcome_models FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.draft_outcome_models TO service_role;
