# Crawler timeout and memory failure

The `Data Crawler and Bulk Aggregation` run on 2026-10-21 at 11:57 UTC
failed at `fetching_players`, before crawling or aggregation. The batch was
accepted, but Supabase returned SQLSTATE `57014`.

The matching PostgreSQL log at 11:58:01.546 UTC reports
`canceling statement due to statement timeout` for the anchor query against
`players`, filtering `unlocked_characters->>'profile_status' = 'verified'`
and ordering by `player_tag`.

`EXPLAIN (ANALYZE, BUFFERS)` reproduced a sequential scan and sort:
36,375 profiles examined, 6,813 verified profiles, and 14,025 ms to return
the first 1,000 rows. The API's `authenticator` role has an 8-second
statement timeout. The old-profile refresh query also lacked an index for
its filter and `updated_at` ordering.

The `index_crawler_player_selection` migration adds expression indexes for
both query shapes, then refreshes table statistics. It applies to the
existing backend without a deployment and keeps the current selection
rules. It does not require raising the API timeout.

For regression verification, check the first and a later anchor page, the
refresh query, and the same parameterized JSON aggregation used by
PostgREST. They must use an index and finish within the API's existing
8-second limit. Finally, rerun the failed workflow and verify that both
the crawler and the downstream aggregation finish successfully.

Production verification after applying the migration:

| Query | Execution time | Plan |
| --- | ---: | --- |
| First anchor page (1,000 rows) | 172 ms | `idx_players_crawler_status_tag` |
| Anchor page at offset 6,000 | 1,067 ms | `idx_players_crawler_status_tag` |
| Refresh candidates (1,000 rows) | 89 ms | `idx_players_crawler_status_updated_tag` |
| Parameterized PostgREST-style JSON aggregation at offset 6,000 | 5,306 ms | `idx_players_crawler_status_tag` |

All queries were tested with `statement_timeout = '8s'`. The performance
advisor reported no findings on either new index (one unrelated unused
index remains in an archive schema).

## Memory failure exposed by the first retry

Attempt 2 passed player selection, but Render killed the server at
15:35:32 UTC. The service event explicitly records `oomKilled` and a
`512Mi` memory limit. The process restarted, losing its in-memory batch
status; Actions saw HTTP 503 followed by HTTP 404. There were no database
statement timeouts during this retry.

The crawler now requests `returning="minimal"` on all bulk writes instead
of decoding full copies of saved profiles and battles. Profile batches
are limited to 10 (previously 50), and battle batches to 100 (previously
500). Completed discovery result containers are released before the
next phase. Regression tests check that writes preserve every record,
respect the batch limits, omit returned records, and stop after a failed
batch so that an incomplete crawl cannot be treated as successful.

Local backend validation: 108 tests passed, including the three new bulk
write cases. One existing test,
`test_crawler_saves_battles_with_missing_map_or_brawler_name`, fails because
it expects an observation with an unknown brawler to be saved while the
current parser deliberately skips it. Running that test with the unchanged
`HEAD` crawler reproduced the same failure.

## Write transport failure during production verification

Commit `d5c5551` was deployed as `dep-dbcdtf0n74is7387oa90` and became live
at 15:49:30 UTC. Automatic deployment did not start after the push, so a
manual deployment was used after confirming no deployment was queued.

Attempt 3 reached `saving_matches` without a server restart, then stopped
on `httpx.ReadError: [Errno 11] Resource temporarily unavailable`. Bulk
writes now retry transport errors up to three attempts with 0.5s and 1s
backoff. Only the interrupted batch is repeated; stable primary keys make
the upsert safe even if the original request committed before the read
failed. Validation/SQL errors still fail immediately, and an exhausted
transport retry is propagated to the workflow.
