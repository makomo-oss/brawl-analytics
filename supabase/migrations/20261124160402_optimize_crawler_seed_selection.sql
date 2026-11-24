-- Speed up crawler seed selection without scanning/detoasting all verified players over PostgREST.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS idx_players_crawler_verified_elite_updated
    ON public.players (updated_at, player_tag)
    WHERE (unlocked_characters->>'profile_status') = 'verified'
      AND substring((unlocked_characters->>'ranked_rank') FROM '^[0-9]+$')::int >= 13;

ANALYZE public.players;

CREATE OR REPLACE FUNCTION public.select_crawler_anchor_tags(
    p_limit integer DEFAULT 10
)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
    v_anchors text[];
    v_missing integer;
    v_fallback text[];
BEGIN
    -- Prefer recently updated verified Elite+ players (index-only / partial index).
    SELECT coalesce(array_agg(tag), '{}'::text[])
    INTO v_anchors
    FROM (
        SELECT upper(replace(trim(player_tag), '#', '')) AS tag
        FROM public.players
        WHERE (unlocked_characters->>'profile_status') = 'verified'
          AND substring((unlocked_characters->>'ranked_rank') FROM '^[0-9]+$')::int >= 13
          AND updated_at >= now() - interval '1 day'
          AND player_tag IS NOT NULL
          AND trim(player_tag) <> ''
        ORDER BY random()
        LIMIT v_limit
    ) fresh;

    v_missing := v_limit - coalesce(array_length(v_anchors, 1), 0);
    IF v_missing > 0 THEN
        SELECT coalesce(array_agg(tag), '{}'::text[])
        INTO v_fallback
        FROM (
            SELECT upper(replace(trim(player_tag), '#', '')) AS tag
            FROM public.players
            WHERE (unlocked_characters->>'profile_status') = 'verified'
              AND player_tag IS NOT NULL
              AND trim(player_tag) <> ''
              AND upper(replace(trim(player_tag), '#', '')) <> ALL(v_anchors)
            ORDER BY random()
            LIMIT v_missing
        ) others;

        v_anchors := v_anchors || v_fallback;
    END IF;

    RETURN coalesce(v_anchors, '{}'::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.select_crawler_anchor_tags(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_crawler_anchor_tags(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.select_crawler_elite_refresh_tags(
    p_excluded text[] DEFAULT '{}',
    p_limit integer DEFAULT 50
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
    v_excluded text[];
    v_tags text[];
BEGIN
    SELECT coalesce(array_agg(upper(replace(trim(t), '#', ''))), '{}'::text[])
    INTO v_excluded
    FROM unnest(coalesce(p_excluded, '{}'::text[])) AS t
    WHERE t IS NOT NULL AND trim(t) <> '';

    SELECT coalesce(array_agg(tag ORDER BY updated_at ASC, tag ASC), '{}'::text[])
    INTO v_tags
    FROM (
        SELECT updated_at, upper(replace(trim(player_tag), '#', '')) AS tag
        FROM public.players
        WHERE (unlocked_characters->>'profile_status') = 'verified'
          AND substring((unlocked_characters->>'ranked_rank') FROM '^[0-9]+$')::int >= 13
          AND updated_at < now() - interval '6 hours'
          AND player_tag IS NOT NULL
          AND trim(player_tag) <> ''
          AND upper(replace(trim(player_tag), '#', '')) <> ALL(v_excluded)
        ORDER BY updated_at ASC, player_tag ASC
        LIMIT v_limit
    ) candidates;

    RETURN coalesce(v_tags, '{}'::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.select_crawler_elite_refresh_tags(text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_crawler_elite_refresh_tags(text[], integer) TO service_role;

NOTIFY pgrst, 'reload schema';
