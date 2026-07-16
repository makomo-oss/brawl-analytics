def get_weights(enemy_count: int, is_proxy_pick: bool):
    # (W_map, W_counter, W_syn, W_pers)
    if enemy_count == 0:
        base = (0.7, 0.0)
    elif enemy_count == 1:
        base = (0.5, 0.2)
    elif enemy_count == 2:
        base = (0.3, 0.4)
    else:
        base = (0.2, 0.5)
        
    if is_proxy_pick:
        return (*base, 0.3, 0.0)
    else:
        return (*base, 0.1, 0.2)

def calculate_score(char_id: str, f_own: float, s_map: float, s_counter: float, s_syn: float, s_pers: float, weights: tuple):
    w_map, w_counter, w_syn, w_pers = weights
    score = f_own * (w_map * s_map + w_counter * s_counter + w_syn * s_syn + w_pers * s_pers)
    return score

def recommend_picks(map_id: str, mode: str, allies: list[str], opponents: list[str], pick_turn: int, is_proxy_pick: bool):
    """
    リアルタイムBAN/Pick支援アルゴリズムの本格ロジック。
    仕様書に基づくフェーズ連動型のウェイト制御を行いスコアを計算します。
    """
    enemy_count = len(opponents)
    weights = get_weights(enemy_count, is_proxy_pick)
    
    # 本来はDBから全キャラのスタッツを取得するが、ベースロジックの動作検証のためダミーのキャラ群を使用
    all_characters = ["piper", "spike", "crow", "leon", "dynamike", "shelly", "colt", "rosa"]
    
    results = []
    for char in all_characters:
        if char in allies or char in opponents:
            continue
            
        # 本来はDB(player_map_stats, dynamic_counters)から取得する項目
        f_own = 1.0 # キャラ保有・レベル11または無料ブースター
        s_map = 50.0 + (len(char) * 1.5) 
        s_counter = 50.0 if enemy_count == 0 else 55.0 + (len(char) * 0.5)
        s_syn = 50.0
        s_pers = 55.0
        
        score = calculate_score(char, f_own, s_map, s_counter, s_syn, s_pers, weights)
        
        results.append({
            "character_id": char,
            "score": score,
            "reason": f"マップ適性:{s_map:.1f}, 相性:{s_counter:.1f}"
        })
        
    # スコア降順でソートしてTOP3を返す
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:3]
