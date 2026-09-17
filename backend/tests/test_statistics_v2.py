from datetime import datetime, timedelta, timezone
import pandas as pd
import pytest
from app.algorithm.statistics import battle_identity, posterior_rate
from app.scripts.daily_calc import calc_macro_map_stats, calc_dynamic_counters
from app.routers import meta
from app.services.player_profiles import profile_record


def observation(**kw):
    return dict(match_id='one', player_tag='ABC', hero_used='colt', result='victory',
                mode='brawlBall', map_id='same-map', match_type='ranked', **kw)


def test_same_map_name_does_not_merge_modes():
    first = observation()
    second = {**first, 'match_id': 'two', 'mode': 'gemGrab', 'result': 'defeat'}
    rows = calc_macro_map_stats(pd.DataFrame([first, second]))
    assert {r['mode']: r['win_rate'] for r in rows} == {'brawlBall': 100, 'gemGrab': 0}


def test_two_week_old_win_has_half_the_weight():
    now = datetime.now(timezone.utc)
    first = observation(match_at=now.isoformat())
    second = {**first, 'match_id': 'two', 'match_at': (now-timedelta(days=14)).isoformat(), 'result': 'defeat'}
    row = calc_macro_map_stats(pd.DataFrame([first, second]))[0]
    assert row['weighted_matches'] == pytest.approx(1.5, abs=0.001)
    assert row['weighted_wins'] == pytest.approx(1.0, abs=0.001)
    assert row['total_matches'] == 2


def test_battle_identity_is_observer_independent():
    first = {'battleTime': '20260917T010000.000Z', 'event': {'map': 'map'},
             'battle': {'type': 'soloRanked', 'teams': [[{'tag': '#A', 'brawler': {'name': 'COLT'}}], [{'tag': '#B', 'brawler': {'name': 'BULL'}}]], 'result': 'victory'}}
    other = {**first, 'battle': {**first['battle'], 'teams': list(reversed(first['battle']['teams'])), 'result': 'defeat'}}
    assert battle_identity(first) == battle_identity(other)
    other['battle'] = {**other['battle'], 'teams': [[{'tag': '#C', 'brawler': {'name': 'BULL'}}]]}
    assert battle_identity(first) != battle_identity(other)


def test_shared_game_deduplicates_inverse_counter_observations():
    first = observation(battle_uid='shared', opponents=['bull'], allies=[])
    second = {**first, 'match_id': 'two', 'player_tag': 'DEF', 'hero_used': 'bull', 'opponents': ['colt'], 'result': 'defeat'}
    rows = calc_dynamic_counters(pd.DataFrame([first, second]))
    assert all(row['match_count'] == 1 for row in rows)


def test_single_win_is_shrunk_not_a_perfect_matchup():
    assert 0.5 < posterior_rate(1, 1) < 0.55


def test_small_sample_is_not_given_s_tier(monkeypatch):
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 1)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: [dict(character_id='colt', match_type='ranked', map_id='map', mode='brawlBall', total_matches=1, total_wins=1)])
    data = meta.get_tier_list()
    assert data['tiers']['N/A'] == ['colt']
    assert data['tiers']['S+'] == []
    assert data['characters']['colt']['sample_sufficient'] is False


def test_map_mix_does_not_reward_character_with_easier_schedule(monkeypatch):
    # Equal performance within both contexts, but very different raw overall win rates.
    rows = [dict(character_id=c, map_id=m, mode='brawlBall', match_type='ranked', total_matches=n, total_wins=w)
            for c,m,n,w in [('colt','easy',90,72),('colt','hard',10,2),('bull','easy',10,8),('bull','hard',90,18)]]
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 200)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: rows)
    data = meta.get_tier_list()['characters']
    assert data['colt']['win_rate'] > data['bull']['win_rate']
    assert data['colt']['score'] == data['bull']['score'] == 50


def test_equal_win_rates_use_sample_share_in_tier_score(monkeypatch):
    rows = [dict(character_id=name, map_id='map', mode='brawlBall', match_type='ranked',
                 total_matches=matches, total_wins=matches // 2)
            for name, matches in [('colt', 20), ('bull', 200)]]
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 220)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: rows)
    data = meta.get_tier_list()['characters']
    assert data['colt']['win_rate'] == data['bull']['win_rate'] == 50
    assert data['colt']['performance_score'] == data['bull']['performance_score'] == 50
    assert data['bull']['pick_rate_deviation'] > data['colt']['pick_rate_deviation']
    assert data['bull']['score'] > data['colt']['score']


def test_profile_sync_keeps_rank_and_inventory():
    record = profile_record('ABC', {'tag':'#ABC','name':'Real','rankedRank':13,'highestAllTimeRankedRank':16,'brawlers':[{'name':'COLT','power':11}]})
    assert record['unlocked_characters']['ranked_rank'] == 13
    assert record['unlocked_characters']['brawlers'][0]['power'] == 11
    with pytest.raises(ValueError):
        profile_record('ABC', {'tag':'#DEF','name':'Wrong'})
