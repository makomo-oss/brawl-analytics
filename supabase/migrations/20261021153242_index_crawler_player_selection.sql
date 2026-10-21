-- Both crawler seed queries filter on a scalar inside a large JSONB profile.
-- Without these expression indexes, every page detoasts every saved profile:
-- the anchor query took ~14s and exceeded PostgREST's 8s statement timeout.
-- Match each query's filter and ordering, including pages beyond the first.
SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS idx_players_crawler_status_tag
    ON public.players ((unlocked_characters->>'profile_status'), player_tag);

CREATE INDEX IF NOT EXISTS idx_players_crawler_status_updated_tag
    ON public.players ((unlocked_characters->>'profile_status'), updated_at, player_tag);

-- Refresh expression statistics so the API immediately chooses the indexes.
ANALYZE public.players;
