-- Draft requests know the mode and map before expanding enemy/teammate pairs.
-- Keep the same 60-day predicates and ranking semantics while avoiding a scan
-- of every observation for a small selected-map cohort.
SET LOCAL lock_timeout = '2s';
CREATE INDEX IF NOT EXISTS idx_match_history_pair_context
ON public.match_raw_history (mode, map_id, match_at DESC)
WHERE result IN ('victory', 'defeat')
  AND mode IN ('brawlBall', 'gemGrab', 'hotZone', 'heist', 'bounty', 'knockout')
  AND match_type IN ('ranked', 'soloRanked', 'teamRanked');
