import math

def sigmoid(x: float) -> float:
    """ ロジスティック関数（シグモイド） """
    return 1.0 / (1.0 + math.exp(-4.0 * x))

def simulate_if(map_id: str, result: str, hero_used: str, allies: list[str], opponents: list[str]):
    """
    IF（もしも）シミュレーターの本格ロジック。
    敗北試合において、別のキャラを選んでいた場合の想定勝率向上幅を計算します。
    """
    # ここでは元の実際の勝率を30%と仮定
    actual_win_prob = 0.3
    
    all_characters = ["leon", "sandy", "crow", "spike", "piper", "amber", "colt", "dynamike"]
    
    simulations = []
    for char in all_characters:
        if char in allies or char in opponents or char == hero_used:
            continue
            
        # X = delta_map + delta_counter + delta_syn
        # 本来はDBの各スタッツ差分を取るが、アルゴリズム検証用に長さをベースにしたダミー値を設定
        delta_x = (len(char) - len(hero_used)) * 0.05
        
        # 新しい想定勝率
        new_prob = sigmoid(delta_x)
        expected_increase = (new_prob - actual_win_prob) * 100
        
        # 10%以上向上するキャラのみ「正解キャラ」として提示
        if expected_increase > 10.0:
            simulations.append({
                "character_id": char,
                "expected_win_rate_increase": round(expected_increase, 1)
            })
            
    simulations.sort(key=lambda x: x["expected_win_rate_increase"], reverse=True)
    return simulations
