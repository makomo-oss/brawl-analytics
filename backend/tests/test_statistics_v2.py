from datetime import datetime, timedelta, timezone
import math
import pandas as pd
import pytest
from app.algorithm.statistics import (
    assign_tier,
    battle_identity,
    blend_tier_score,
    dynamic_tier_thresholds,
    posterior_rate,
    supported_win_lift,
)
from app.scripts.daily_calc import calc_macro_map_stats, calc_dynamic_counters
from app.services.battle_records import parse_battlelog
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


def test_previous_season_fades_faster_after_day_30():
    now = datetime.now(timezone.utc)
    first = observation(match_at=now.isoformat())
    second = {**first, 'match_id': 'two', 'match_at': (now-timedelta(days=30)).isoformat(), 'result': 'defeat'}
    third = {**first, 'match_id': 'three', 'match_at': (now-timedelta(days=37)).isoformat(), 'result': 'defeat'}
    row = calc_macro_map_stats(pd.DataFrame([first, second, third]))[0]
    assert row['weighted_matches'] == pytest.approx(1.75, abs=0.001)
    assert row['weighted_wins'] == pytest.approx(1.0, abs=0.001)
    assert row['total_matches'] == 3


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


def test_supported_win_lift_uses_single_prior_without_double_shrinkage():
    # At 50 weighted observations, positive lift earns exactly half of the raw lift.
    lift, supported, discount = supported_win_lift(50 * .70, 50, .50)
    assert lift == pytest.approx(.20 * 50 / 70)
    assert supported == pytest.approx(.20 * 50 / 100)
    assert discount == pytest.approx(lift - supported)
    assert supported_win_lift(0, 0, .5) == (0.0, 0.0, 0.0)
    assert supported_win_lift(5, -1, .5) == (0.0, 0.0, 0.0)
    assert posterior_rate(0, 0, .6) == pytest.approx(.6)


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


def test_usage_blend_keeps_win_at_70_percent_and_saturates_smoothly():
    mortis, win_m, usage_m = blend_tier_score(37.9, 71.4, 2.0)
    mandy, win_a, usage_a = blend_tier_score(45.4, 52.6, 2.0)
    _, _, usage_1s = blend_tier_score(50.0, 60.0, 2.0)
    _, _, usage_2s = blend_tier_score(50.0, 70.0, 2.0)
    _, _, usage_3s = blend_tier_score(50.0, 80.0, 2.0)
    _, _, usage_neg = blend_tier_score(50.0, 40.0, 2.0)
    _, _, usage_zero_cap = blend_tier_score(50.0, 80.0, 0.0)
    _, _, usage_neg_cap = blend_tier_score(50.0, 80.0, -1.0)
    assert win_m == pytest.approx(.7 * (37.9 - 50))
    assert win_a == pytest.approx(.7 * (45.4 - 50))
    assert 0 < usage_a < usage_1s < usage_2s < usage_3s < 2.0
    assert usage_m == pytest.approx(2.0 * math.tanh(0.3 * 4.0 * 2.14 / 2.0))
    assert usage_neg == pytest.approx(-usage_1s)
    assert usage_zero_cap == 0.0
    assert usage_neg_cap == 0.0
    assert mortis < mandy < 50.0


def test_dynamic_tier_thresholds_adapt_stabilize_and_match_displayed_scores():
    # Empty cohort falls back to the neutral prior (mean=50, std=2.5).
    empty = dynamic_tier_thresholds([])
    assert [name for _, name in empty] == ['S+', 'S', 'A+', 'A', 'B', 'C']
    assert [th for th, _ in empty] == [54.4, 52.5, 50.9, 49.1, 47.5, 45.6]

    # Tied cohort stays strictly descending via the std floor and maps all ties to A.
    tied = dynamic_tier_thresholds([50.0] * 100)
    assert all(tied[i][0] > tied[i + 1][0] for i in range(len(tied) - 1))
    assert assign_tier(50.0, tied) == 'A'

    # Multiple clear outliers all earn S+ instead of being capped by a fixed rank count.
    spread = [58.0, 57.5, 57.2, 57.0] + [50.0] * 90 + [43.0, 42.5]
    th = dynamic_tier_thresholds(spread)
    assert all(assign_tier(s, th) == 'S+' for s in (58.0, 57.5, 57.2, 57.0))
    assert assign_tier(50.0, th) == 'A'
    assert assign_tier(42.5, th) == 'D'

    # Displayed 1-decimal rounding governs Tier assignment (no 52.0 in A when A+>=52.0).
    exact = ((57.0, 'S+'), (54.0, 'S'), (52.0, 'A+'), (50.0, 'A'), (48.0, 'B'), (46.0, 'C'))
    assert assign_tier(51.96, exact) == 'A+'
    assert assign_tier(51.94, exact) == 'A'
    assert assign_tier(45.96, exact) == 'C'
    assert assign_tier(45.94, exact) == 'D'


def test_small_sample_is_not_given_s_tier(monkeypatch):
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 1)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: [dict(character_id='colt', match_type='ranked', map_id='map', mode='brawlBall', total_matches=1, total_wins=1)])
    data = meta.get_tier_list()
    assert data['tiers']['N/A'] == ['colt']
    assert data['tiers']['S+'] == []
    assert data['characters']['colt']['sample_sufficient'] is False


def test_pair_details_exclude_unsupported_map_evidence(monkeypatch):
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 50)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: [
        dict(character_id='colt', match_type='gachi', map_id='map', mode='brawlBall',
             total_matches=50, total_wins=25, weighted_matches=40, weighted_wins=20)
    ])
    pairs = [
        dict(kind=kind, char_b=char_b, match_count=n, win_count=n,
             weighted_matches=float(n), weighted_wins=float(n))
        for kind, char_b, n in [('counter', 'bull', 1), ('counter', 'shelly', 20),
                                 ('synergy', 'piper', 1), ('synergy', 'rico', 20)]
    ]
    monkeypatch.setattr(meta, '_contextual_pairs', lambda *args: {'colt': pairs})
    details = meta.get_tier_list(type='gachi', sub_type='map', id='map',
                                 include_details=True)['characters']['colt']
    assert set(details['matchups']) == {'shelly'}
    assert set(details['synergies']) == {'rico'}


def test_matchup_labels_follow_recency_weighted_results(monkeypatch):
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 100)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: [
        dict(character_id='colt', match_type='ranked', map_id='map', mode='brawlBall',
             total_matches=100, total_wins=50, weighted_matches=50, weighted_wins=25)
    ])
    monkeypatch.setattr(meta, '_contextual_pairs', lambda *args: {'colt': [
        dict(kind='counter', char_b='bull', match_count=100, win_count=80,
             weighted_matches=20.0, weighted_wins=10.0),
        dict(kind='counter', char_b='shelly', match_count=100, win_count=40,
             weighted_matches=40.0, weighted_wins=35.0),
    ]})
    detail = meta.get_tier_list(include_details=True)['characters']['colt']
    assert detail['kamo'] == [dict(brawler='shelly', name='Shelly', win_rate=75.0, matches=100)]
    assert detail['tenteki'] == []


def test_sparse_ranked_matchups_use_labeled_ranked_cohort(monkeypatch):
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_total_analyzed', lambda db: 20)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: [
        dict(character_id='colt', match_type='gachi', map_id='map', mode='brawlBall',
             total_matches=20, total_wins=10, weighted_matches=15, weighted_wins=7.5)
    ])
    calls = []
    def pairs(db, type, sub_type, selected_id, rank_tier, mode=None, character_id=None):
        calls.append((sub_type, rank_tier))
        if sub_type == 'map':
            return {'colt': [dict(kind='counter', char_b='bull', match_count=2, win_count=2,
                                  weighted_matches=2.0, weighted_wins=2.0)]}
        return {'colt': [
            dict(kind='counter', char_b='shelly', match_count=8, win_count=7,
                 weighted_matches=7.0, weighted_wins=6.0),
            dict(kind='counter', char_b='rico', match_count=8, win_count=1,
                 weighted_matches=7.0, weighted_wins=1.0),
        ]}
    monkeypatch.setattr(meta, '_contextual_pairs', pairs)
    detail = meta.get_tier_list(type='gachi', sub_type='map', id='map',
                                include_details=True)['characters']['colt']
    assert calls == [('map', 'all'), (None, 'all')]
    assert detail['kamo_scope'] == 'ガチバトル・エリート以上全体'
    assert detail['tenteki_scope'] == 'ガチバトル・エリート以上全体'
    assert detail['kamo'][0]['brawler'] == 'shelly'
    assert detail['tenteki'][0]['brawler'] == 'rico'
    assert detail['matchups'] == {}


def test_character_pair_rpc_and_cache_are_scoped_to_requested_character():
    calls = []
    class Database:
        def rpc(self, name, params):
            calls.append((name, params))
            self.data = [dict(char_a=params['p_character'])]
            return self
        def execute(self):
            return self
    meta._PAIR_CONTEXT_CACHE.clear()
    try:
        db = Database()
        meta._contextual_pairs(db, 'global', None, None, 'all', character_id='edgar')
        meta._contextual_pairs(db, 'global', None, None, 'all', character_id='colt')
        meta._contextual_pairs(db, 'global', None, None, 'all', character_id='EDGAR')
        assert [name for name, _ in calls] == ['character_pair_stats', 'character_pair_stats']
        assert [params['p_character'] for _, params in calls] == ['edgar', 'colt']
    finally:
        meta._PAIR_CONTEXT_CACHE.clear()


def test_character_detail_requests_only_target_pairs_and_preserves_filters(monkeypatch):
    calls = []
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    def tier(**kwargs):
        calls.append(kwargs)
        return dict(characters={'r-t': {'kamo': [], 'tenteki': []}}, tiers={'A': ['r-t']})
    monkeypatch.setattr(meta, 'get_tier_list', tier)
    detail = meta.get_character_detail('R-T', type='gachi', rank_tier='legendary',
                                       sub_type='map', id='map', mode='brawlBall')
    assert calls == [dict(type='gachi', rank_tier='legendary', sub_type='map', id='map',
                          mode='brawlBall', include_details=True, detail_character='r-t')]
    assert detail['tier'] == 'A'


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


def test_gachi_and_global_use_dynamic_thresholds_consistent_with_displayed_scores(monkeypatch):
    rows = [
        dict(character_id=f'b{i}', map_id='map', mode='brawlBall', match_type='gachi',
             total_matches=100 + i * 5, total_wins=40 + i * 3)
        for i in range(25)
    ]
    # Add an unknown row to verify it does not pollute context baseline.
    rows.append(dict(character_id='unknown', map_id='map', mode='brawlBall', match_type='gachi',
                     total_matches=5000, total_wins=5000))
    # Add sparse N/A rows to verify eligible pick distribution stays centered.
    rows.extend(dict(character_id=f'na{i}', map_id='map', mode='brawlBall', match_type='gachi',
                     total_matches=2, total_wins=1) for i in range(20))
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: rows)
    result = meta.get_tier_list(type='gachi')
    metrics = result['metrics']
    assert metrics['tier_method'] == 'dynamic_score_thresholds'
    th_map = metrics['tier_thresholds']
    thresholds = tuple((th_map[t], t) for t in ('S+', 'S', 'A+', 'A', 'B', 'C'))
    for tier_name, names in result['tiers'].items():
        if tier_name == 'N/A':
            continue
        for cid in names:
            displayed = result['characters'][cid]['score']
            assert assign_tier(displayed, thresholds) == tier_name
    # Context baseline must ignore the unknown 100%-win row (~52% instead of >90%).
    assert 45.0 < metrics['baseline_win_rate'] < 60.0
    # Mean usage adjustment across eligible characters should be centered near 0.
    eligible_usage = [result['characters'][f'b{i}']['usage_adjustment'] for i in range(25)]
    assert abs(sum(eligible_usage) / len(eligible_usage)) < 0.15


def test_solo_showdown_rank_uses_event_mode_when_battle_mode_missing():
    items = [
        {
            'battleTime': '20261127T010000.000Z',
            'event': {'mode': 'soloShowdown', 'map': 'Skull Creek'},
            'battle': {
                'type': 'ranked',
                'rank': 4,
                'players': [{'tag': '#ABC', 'brawler': {'name': 'COLT'}}],
            },
        },
        {
            'battleTime': '20261127T010500.000Z',
            'event': {'mode': 'soloShowdown', 'map': 'Skull Creek'},
            'battle': {
                'type': 'ranked',
                'rank': 5,
                'players': [{'tag': '#ABC', 'brawler': {'name': 'COLT'}}],
            },
        },
    ]
    records, _ = parse_battlelog('#ABC', items)
    assert [r['result'] for r in records] == ['victory', 'defeat']


def test_global_overview_excludes_showdown_and_special_modes_while_keeping_ranked(monkeypatch):
    rows = [
        # Core 3v3 modes across trophy ('ranked') and Ranked ('soloRanked', 'teamRanked')
        dict(character_id='colt', map_id='m1', mode='brawlBall', match_type='ranked', total_matches=40, total_wins=20),
        dict(character_id='colt', map_id='m2', mode='gemGrab', match_type='soloRanked', total_matches=30, total_wins=18),
        dict(character_id='colt', map_id='m3', mode='knockout', match_type='teamRanked', total_matches=30, total_wins=12),
        # Duplicate gachi cohort tag must remain excluded from global
        dict(character_id='colt', map_id='m2', mode='gemGrab', match_type='gachi', total_matches=30, total_wins=18),
        # Showdown & special event modes must be excluded from global overview
        dict(character_id='colt', map_id='Skull Creek', mode='soloShowdown', match_type='ranked', total_matches=200, total_wins=200),
        dict(character_id='colt', map_id='Skull Creek', mode='duoShowdown', match_type='ranked', total_matches=100, total_wins=100),
        dict(character_id='colt', map_id='Skull Creek', mode='trioShowdown', match_type='ranked', total_matches=100, total_wins=100),
        dict(character_id='colt', map_id='m4', mode='megaShowdown', match_type='ranked', total_matches=100, total_wins=0),
        dict(character_id='colt', map_id='m5', mode='hunterSurvivor', match_type='ranked', total_matches=100, total_wins=100),
        dict(character_id='colt', map_id='m6', mode='airHockey', match_type='ranked', total_matches=100, total_wins=100),
        # Another character only appearing in Showdown
        dict(character_id='shelly', map_id='Skull Creek', mode='soloShowdown', match_type='ranked', total_matches=50, total_wins=40),
    ]
    monkeypatch.setattr(meta, 'get_db', lambda: None)
    monkeypatch.setattr(meta, '_get_cached_macro_data', lambda db: rows)

    overview = meta.get_tier_list(type='global')
    assert set(overview['characters']) == {'colt'}
    assert overview['characters']['colt']['total_matches'] == 100
    assert overview['characters']['colt']['win_rate'] == 50.0
    assert overview['metrics']['analyzed_matches'] == 100

    # Explicit sub_type='all' still behaves as global overview
    overview_all = meta.get_tier_list(type='global', sub_type='all')
    assert overview_all['characters']['colt']['total_matches'] == 100

    # Explicit mode/map queries keep Showdown data available for mode/map pages
    sd_mode = meta.get_tier_list(type='global', sub_type='mode', id='soloShowdown')
    assert sd_mode['characters']['colt']['total_matches'] == 200
    assert sd_mode['characters']['shelly']['total_matches'] == 50

    sd_map = meta.get_tier_list(type='global', sub_type='map', id='Skull Creek')
    assert sd_map['characters']['colt']['total_matches'] == 400
    assert sd_map['characters']['shelly']['total_matches'] == 50


def test_profile_sync_keeps_rank_and_inventory():
    record = profile_record('ABC', {'tag':'#ABC','name':'Real','rankedRank':13,'highestAllTimeRankedRank':16,'brawlers':[{'name':'COLT','power':11}]})
    assert record['unlocked_characters']['ranked_rank'] == 13
    assert record['unlocked_characters']['brawlers'][0]['power'] == 11
    with pytest.raises(ValueError):
        profile_record('ABC', {'tag':'#DEF','name':'Wrong'})
