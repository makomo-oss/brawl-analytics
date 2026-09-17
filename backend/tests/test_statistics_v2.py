from datetime import datetime, timedelta, timezone
import pandas as pd
import pytest
from app.algorithm.statistics import battle_identity, posterior_rate, supported_win_lift
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


def test_supported_win_lift_requires_more_evidence_for_a_high_tier():
    # The same 75% recent win rate should not earn the same strength score
    # from 57 weighted observations as from 450.
    short = supported_win_lift(57 * .75, 57, .62)
    long = supported_win_lift(450 * .75, 450, .62)
    assert short[0] > 0
    assert short[1] < long[1]
    assert short[2] > long[2]
    assert 50 + 100 * short[1] < 57


def test_equal_to_baseline_win_difference_has_no_sample_discount():
    lift, supported, discount = supported_win_lift(12, 20, .6)
    assert lift == pytest.approx(0)
    assert supported == 0
    assert discount == 0


def test_uncertainty_does_not_reward_below_baseline_performance():
    lift, supported, discount = supported_win_lift(10, 20, .6)
    assert lift < 0
    assert supported == lift
    assert discount == 0


def test_positive_lift_is_shrunk_smoothly_without_a_cutoff():
    lift, supported, discount = supported_win_lift(13, 20, .6)
    assert 0 < supported < lift
    assert discount == pytest.approx(lift - supported)


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


def test_popularity_cannot_promote_below_average_win_performance_to_s_tier(monkeypatch):
    rows = [dict(character_id='edgar', map_id='map', mode='brawlBall', match_type='ranked',
                 total_matches=2000, total_wins=1120)]
    rows.extend(dict(character_id=f'other{i}', map_id='map', mode='brawlBall', match_type='ranked',
                     total_matches=200, total_wins=120) for i in range(9))
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 3800)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: rows)
    result = meta.get_tier_list()
    edgar = result['characters']['edgar']
    assert edgar['performance_score'] < 50
    assert edgar['pick_rate_deviation'] > 70
    assert edgar['usage_adjustment'] <= 2
    assert edgar['score'] < 57
    assert 'edgar' not in result['tiers']['S+']


def test_profile_sync_keeps_rank_and_inventory():
    record = profile_record('ABC', {'tag':'#ABC','name':'Real','rankedRank':13,'highestAllTimeRankedRank':16,'brawlers':[{'name':'COLT','power':11}]})
    assert record['unlocked_characters']['ranked_rank'] == 13
    assert record['unlocked_characters']['brawlers'][0]['power'] == 11
    with pytest.raises(ValueError):
        profile_record('ABC', {'tag':'#DEF','name':'Wrong'})
