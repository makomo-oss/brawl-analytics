from app.services.battle_records import parse_battlelog, save_battle_records
from unittest.mock import Mock


def test_canonical_outcome_is_observer_independent_and_conflicts_are_quarantined():
    def player(tag, name):
        return {'tag': tag, 'brawler': {'name': name, 'id': 1, 'power': 11}}
    item = {'battleTime': '20261003T010000.000Z', 'event': {'id': 12, 'mode': 'brawlBall'},
            'battle': {'type': 'soloRanked', 'result': 'victory',
                       'teams': [[player('#AAA', 'COLT')], [player('#ZZZ', 'BULL')]]}}
    a, _ = parse_battlelog('AAA', [item])
    item['battle']['result'] = 'defeat'
    b, _ = parse_battlelog('ZZZ', [item])
    assert a[0]['features']['outcome'] == b[0]['features']['outcome'] == 'victory'
    assert a[0]['battle_uid'] == b[0]['battle_uid']
    item['battle']['result'] = 'victory'
    contradictory, _ = parse_battlelog('ZZZ', [item])
    db = Mock()
    save_battle_records(db, a + contradictory)
    rows = db.rpc.call_args.args[1]['p_records']
    assert all(row['features']['quality_conflict'] for row in rows)
