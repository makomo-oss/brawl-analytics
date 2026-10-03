import numpy as np
import pytest
from app.algorithm.composition_model import features, pair_points, probability, recommendations, VERSION
from app.algorithm.draft_training import _fit
from app.services.battle_records import parse_battlelog


def test_joint_fit_removes_another_characters_confounding_effect():
    # Pair presence is associated with a strong teammate: its naive rate exceeds
    # 50%, although its own conditional effect is negative. Expected outcomes
    # remove random test failures while retaining the confounding structure.
    pairs = np.array([0., 0., 1., 1.])
    strong = np.array([0., 1., 0., 1.])
    weights = np.array([90., 10., 10., 90.]) * 100
    true_z = 2 * strong - pairs
    y = 1 / (1 + np.exp(-true_z))
    assert np.average(y[pairs == 1], weights=weights[pairs == 1]) > .5
    indices = np.tile([1, 2], (4, 1))
    beta = _fit(indices, np.column_stack([strong, pairs]), y, weights, np.array([1., 1., 1.]))
    assert beta[1] > 1.9
    assert beta[2] < -.9


def test_map_pair_effect_and_set_residual_preserve_symmetries():
    own, enemy = ['a', 'b', 'c'], ['d', 'e', 'f']
    model = {'version': VERSION, 'weights': {'e|global|a:d': -.3, 'e|mode:m|a:d': -.1,
              'e|map:m:map|a:d': -.2}, 'temperature': 1.2,
             'vectors': {c: [i / 10] for i, c in enumerate(own + enemy)}, 'vector_size': 1,
             'set_modes': ['m'], 'network': {'w1': [[.1], [.2], [.3], [.4], [.5]], 'bias': [.2], 'w2': [.4]}}
    p = probability(model, own, enemy, 'm', 'map')
    assert p == pytest.approx(probability(model, list(reversed(own)), enemy, 'm', 'map'))
    assert p + probability(model, enemy, own, 'm', 'map') == pytest.approx(1)
    assert pair_points(model, 'a', 'd', 'm', 'map') < pair_points(model, 'a', 'd', 'm') < 0
    assert features(own, enemy, 'm', 'map') == {k: -v for k, v in features(enemy, own, 'm', 'map').items()}


def test_partial_draft_only_evaluates_legal_completed_teams(monkeypatch):
    from app.algorithm import composition_model
    calls = []
    def predict(model, own, enemy, mode, map_id):
        assert len(own) == len(enemy) == 3 and len(set(own + enemy)) == 6
        assert 'ban' not in own + enemy
        calls.append((own, enemy))
        return .6 if 'good' in own else .4
    monkeypatch.setattr(composition_model, 'probability', predict)
    candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'good', 'ban']
    result = recommendations({'weights': {}, 'completion_teams': {}}, ['a', 'b'], ['c', 'd', 'e'], candidates, {'ban'}, 'm', 'map')
    assert calls and result[0]['name'] == 'good'
    assert all(r['name'] not in ['a', 'b', 'c', 'd', 'e', 'ban'] for r in result)


def test_ingestion_keeps_only_real_official_participant_fields():
    records, _ = parse_battlelog('ABC', [{'battleTime': '20261003T000000.000Z', 'event': {'mode': 'brawlBall'},
       'battle': {'type': 'soloRanked', 'result': 'victory', 'teams': [[{'tag': '#ABC', 'brawler': {'id': 16000001, 'name': 'COLT', 'power': 11}}],
                 [{'tag': '#DEF', 'brawler': {'id': 16000002, 'name': 'BULL'}}]]}}])
    teams = records[0]['features']['teams']
    assert teams[0][0]['brawler_id'] == 16000001 and teams[0][0]['power'] == 11
    assert teams[1][0]['power'] is None
    assert 'health' not in teams[0][0]


def test_tier_details_use_adjusted_effect_instead_of_raw_pair_win_rate():
    from app.routers.meta import _adjusted_pair_details
    fitted = {'version': VERSION, 'weights': {'e|global|a:b': -.4, 's|global|a:c': .2},
              'support': {'e|global|a:b': 100, 's|global|a:c': 100}}
    # A naive 90% observed team win rate must not invert the fitted disadvantage.
    pairs = [{'char_b': 'b', 'kind': 'counter', 'match_count': 100, 'weighted_matches': 100, 'weighted_wins': 90},
             {'char_b': 'c', 'kind': 'synergy', 'match_count': 100, 'weighted_matches': 100, 'weighted_wins': 10}]
    detail = _adjusted_pair_details(fitted, 'a', pairs)
    assert detail['kamo'] == []
    assert detail['tenteki'][0]['effect_points'] < 0
    assert 'win_rate' not in detail['tenteki'][0]
    assert detail['synergies']['c']['lift'] > 0
