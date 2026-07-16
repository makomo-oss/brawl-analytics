def simulate_if(map_id: str, result: str, hero_used: str, allies: list[str], opponents: list[str]):
    """
    IF（もしも）シミュレーター
    敗北試合において、もし別の特定キャラを選んでいたら想定勝率が何%向上していたかを計算する
    """
    # 今はモックデータを返却
    return [
        {"character_id": "leon", "expected_win_rate_increase": 15.2},
        {"character_id": "sandy", "expected_win_rate_increase": 12.0}
    ]
