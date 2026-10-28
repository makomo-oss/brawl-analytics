-- Day reads sort by match_id separately; the second index column adds no
-- useful ordering and retains unnecessarily large identifiers on disk.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE INDEX idx_match_history_analytics_at ON public.match_raw_history(match_at);
DROP INDEX public.idx_match_history_analytics_date;
