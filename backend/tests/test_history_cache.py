"""Real PostgREST requests, encrypted files and all three unchanged calculators."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json

import httpx
import pandas as pd
from postgrest import SyncPostgrestClient
import pytest

from app.scripts import daily_calc
from app.services.history_cache import HistoryCache, HistoryChanged, _utc

NOW = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)
COLUMNS = daily_calc.MATCH_ANALYSIS_COLUMNS


def observation(number, days=1, **changes):
    row = dict(match_id=f'{number:05d}', player_tag='ABC',
                match_at=(NOW - timedelta(days=days)).isoformat(),
                mode='brawlBall', map_id='Map', result='victory', hero_used='colt',
                allies=['shelly'], opponents=['bull'], match_type='soloRanked',
                battle_uid=f'battle-{number}')
    return {**row, **changes}


class Source:
    def __init__(self, rows):
        self.rows = rows
        self.days = {r['match_at'][:10]: '1' for r in rows}
        self.requests = []
        self.bytes = 0
        self.after_read = None
        self.churn = False
        self.missing_manifest = False
        self.rank = 13
        self.snapshots = []

    def touch(self, *days):
        for day in days:
            self.days[day] = str(int(self.days.get(day, '0')) + 1)

    def handler(self, request):
        self.requests.append(request)
        if request.url.path.endswith('/players'):
            data = [{'player_tag': 'ABC', 'ranked_rank': self.rank}]
        elif request.url.path.endswith('/rpc/replace_analytics_snapshot'):
            self.snapshots.append(json.loads(request.content))
            data = None
        elif request.url.path.endswith('/rpc/analytics_history_manifest'):
            if self.missing_manifest:
                return httpx.Response(404, json={'code': 'PGRST202', 'message': 'missing function'})
            if self.churn:
                self.touch(*self.days)
            start = json.loads(request.content)['p_first_day']
            data = {'version': 1, 'days': {d: v for d, v in self.days.items() if d >= start}}
        else:
            rows = deepcopy(self.rows)
            for condition in request.url.params.get_list('match_at'):
                op, value = condition.split('.', 1)
                rows = [r for r in rows if (_utc(r['match_at']) >= _utc(value)
                                           if op == 'gte' else _utc(r['match_at']) < _utc(value))]
            after = request.url.params.get('match_id')
            if after:
                rows = [r for r in rows if r['match_id'] > after[3:]]
            rows.sort(key=lambda r: r['match_id'])
            offset = int(request.url.params.get('offset', '0'))
            limit = int(request.url.params.get('limit', '1000'))
            data = rows[offset:offset + limit]
            if self.after_read:
                callback, self.after_read = self.after_read, None
                callback()
        response = httpx.Response(200, json=data)
        self.bytes += len(response.content)
        return response

    def client(self):
        return SyncPostgrestClient('https://example.test/rest/v1',
                                  http_client=httpx.Client(transport=httpx.MockTransport(self.handler)))

    def expected(self, cutoff):
        return sorted([r for r in self.rows if _utc(r['match_at']) >= cutoff],
                      key=lambda r: r['match_id'])


def cache(tmp_path, **kwargs):
    return HistoryCache(tmp_path / 'history.bin', 'test-secret-never-persisted',
                        'https://example.test', COLUMNS, **kwargs)


def test_warm_cache_sends_only_manifests_and_is_encrypted(tmp_path):
    source = Source([observation(i, days=i % 20 + 1) for i in range(1600)])
    reader = cache(tmp_path)
    cutoff = NOW - timedelta(days=60)
    with source.client() as db:
        assert reader.fetch(db, cutoff) == source.expected(cutoff)
        initial_bytes = source.bytes
        encrypted = reader.path.read_bytes()
        assert b'match_id' not in encrypted and b'test-secret' not in encrypted
        source.requests.clear()
        source.bytes = 0
        assert cache(tmp_path).fetch(db, cutoff) == source.expected(cutoff)
    assert len(source.requests) == 2
    assert all('/rpc/' in r.url.path for r in source.requests)
    assert source.bytes < initial_bytes * .01


def test_late_arrivals_corrections_deletions_and_date_moves(tmp_path):
    source = Source([observation(i, days=i + 1) for i in range(8)])
    reader = cache(tmp_path)
    cutoff = NOW - timedelta(days=60)
    with source.client() as db:
        reader.fetch(db, cutoff)
        source.rows.append(observation(50, days=7))  # Newly ingested, old match_at.
        source.rows[0]['result'] = 'defeat'
        deleted = source.rows.pop(2)
        moved = source.rows[3]
        old_day = moved['match_at'][:10]
        moved['match_at'] = (NOW - timedelta(days=12)).isoformat()
        source.touch(source.rows[-1]['match_at'][:10], source.rows[0]['match_at'][:10],
                     deleted['match_at'][:10], old_day, moved['match_at'][:10])
        source.requests.clear()
        assert reader.fetch(db, cutoff) == source.expected(cutoff)
        fetched_days = {r.url.params.get_list('match_at')[0][4:14]
                        for r in source.requests if '/rpc/' not in r.url.path}
        assert fetched_days == {source.rows[-1]['match_at'][:10], source.rows[0]['match_at'][:10],
                                deleted['match_at'][:10], old_day, moved['match_at'][:10]}


def test_midday_cutoff_expires_cached_rows_without_redownload(tmp_path):
    cutoff = NOW - timedelta(days=60)
    rows = [observation(0, days=60), observation(1, days=60), observation(2)]
    rows[0]['match_at'] = (cutoff - timedelta(hours=1)).isoformat()
    rows[1]['match_at'] = (cutoff + timedelta(hours=1)).isoformat()
    source = Source(rows)
    with source.client() as db:
        assert cache(tmp_path).fetch(db, cutoff) == source.expected(cutoff)
        source.requests.clear()
        later = cutoff + timedelta(hours=2)
        assert cache(tmp_path).fetch(db, later) == source.expected(later)
        assert all('/rpc/' in r.url.path for r in source.requests)


def test_keyset_pagination_does_not_lose_last_page(tmp_path):
    source = Source([observation(i) for i in range(5)])
    with source.client() as db:
        actual = cache(tmp_path, page_size=2).fetch(db, NOW - timedelta(days=60))
    assert actual == source.rows
    requests = [r for r in source.requests if '/rpc/' not in r.url.path]
    assert [r.url.params.get('match_id') for r in requests] == [None, 'gt.00001', 'gt.00003']


@pytest.mark.parametrize('failure', ['corrupt', 'key', 'project', 'missing'])
def test_cache_loss_corruption_and_key_rotation_rebuild(tmp_path, failure):
    source = Source([observation(1)])
    reader = cache(tmp_path)
    cutoff = NOW - timedelta(days=60)
    with source.client() as db:
        reader.fetch(db, cutoff)
        if failure == 'corrupt':
            reader.path.write_bytes(reader.path.read_bytes()[:-1] + b'!')
        elif failure == 'missing':
            reader.path.unlink()
        elif failure == 'key':
            reader = HistoryCache(reader.path, 'new-secret', 'https://example.test', COLUMNS)
        else:
            reader = HistoryCache(reader.path, 'test-secret-never-persisted', 'other-project', COLUMNS)
        source.requests.clear()
        assert reader.fetch(db, cutoff) == source.rows
        assert any('/rpc/' not in r.url.path for r in source.requests)


def test_concurrent_change_retries_affected_partition(tmp_path):
    source = Source([observation(1)])
    def insert():
        source.rows.append(observation(2))
        source.touch(source.rows[0]['match_at'][:10])
    source.after_read = insert
    with source.client() as db:
        assert cache(tmp_path).fetch(db, NOW - timedelta(days=60)) == source.rows


def test_continuous_changes_fail_without_replacing_valid_cache(tmp_path):
    source = Source([observation(1)])
    reader = cache(tmp_path)
    with source.client() as db:
        reader.fetch(db, NOW - timedelta(days=60))
        before = reader.path.read_bytes()
        source.churn = True
        with pytest.raises(HistoryChanged):
            reader.fetch(db, NOW - timedelta(days=60))
        assert reader.path.read_bytes() == before


def test_missing_manifest_falls_back_to_existing_full_fetch(tmp_path, monkeypatch):
    monkeypatch.setenv('ANALYTICS_HISTORY_CACHE', str(tmp_path / 'cache.bin'))
    monkeypatch.setenv('SUPABASE_KEY', 'test-only')
    source = Source([observation(1)])
    source.missing_manifest = True
    with source.client() as db:
        assert daily_calc.fetch_recent_matches(db).to_dict('records') == source.rows


def test_all_three_statistics_match_full_reads_after_changes_and_new_ranks(tmp_path, monkeypatch):
    source = Source([observation(i, days=(i % 45) + 1) for i in range(40)])
    source.rows += [observation(41, result='draw')]
    cutoff = NOW - timedelta(days=60)
    def weights(frame):
        ages = ((pd.Timestamp(NOW) - pd.to_datetime(frame['match_at'], utc=True))
                .dt.total_seconds() / 86400).clip(lower=0)
        return 2.0 ** (-ages.clip(upper=30) / 30 - (ages - 30).clip(lower=0) / 7)
    monkeypatch.setattr(daily_calc, 'observation_weights', weights)
    with source.client() as db:
        cache(tmp_path).fetch(db, cutoff)
        source.rows[0]['result'] = 'defeat'
        source.rows.append(observation(42, days=32))
        source.touch(source.rows[0]['match_at'][:10], source.rows[-1]['match_at'][:10])
        incremental = pd.DataFrame(cache(tmp_path).fetch(db, cutoff))
    full = pd.DataFrame(source.expected(cutoff))
    for bracket in ('mythic', 'legendary', 'masters'):
        ranks = {bracket: {'ABC'}, 'all_elite': {'ABC'}}
        for fn in (daily_calc.calc_macro_map_stats, daily_calc.calc_dynamic_counters,
                   daily_calc.calc_dynamic_synergies):
            args = (ranks,) if fn == daily_calc.calc_macro_map_stats else ()
            actual, expected = fn(incremental, *args), fn(full, *args)
            for result in (actual, expected):
                for row in result:
                    row.pop('updated_at', None)
            assert actual == expected


def test_each_daily_run_refreshes_ranks_even_when_history_is_reused(tmp_path, monkeypatch):
    monkeypatch.setenv('ANALYTICS_HISTORY_CACHE', str(tmp_path / 'cache.bin'))
    monkeypatch.setenv('SUPABASE_KEY', 'test-only')
    source = Source([observation(1)])
    with source.client() as db:
        daily_calc.run_daily_calculation(db)
        first = {r['match_type'] for r in source.snapshots[-1]['macro_rows']}
        assert 'gachi_mythic' in first and 'gachi_masters' not in first
        source.rank = 19
        source.requests.clear()
        daily_calc.run_daily_calculation(db)
        second = {r['match_type'] for r in source.snapshots[-1]['macro_rows']}
        assert 'gachi_masters' in second and 'gachi_mythic' not in second
        assert any(r.url.path.endswith('/players') for r in source.requests)
        assert not any(r.url.path.endswith('/match_raw_history') for r in source.requests)


def test_interrupted_manifest_does_not_force_full_history_download(tmp_path):
    source = Source([observation(1)])
    cutoff = NOW - timedelta(days=60)
    with source.client() as db:
        cache(tmp_path).fetch(db, cutoff)
    source.requests.clear()
    attempts = []
    def handler(request):
        attempts.append(1)
        if len(attempts) == 1:
            raise httpx.RemoteProtocolError('connection terminated')
        return source.handler(request)
    with SyncPostgrestClient('https://example.test/rest/v1',
                            http_client=httpx.Client(transport=httpx.MockTransport(handler))) as db:
        assert cache(tmp_path).fetch(db, cutoff) == source.rows
    assert len(attempts) == 3  # One failed manifest and the two successful checks.
    assert all('/rpc/' in r.url.path for r in source.requests)
