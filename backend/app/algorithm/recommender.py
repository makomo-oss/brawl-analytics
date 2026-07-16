def recommend_picks(map_id: str, mode: str, allies: list[str], opponents: list[str], pick_turn: int, is_proxy_pick: bool):
    """
    リアルタイムBAN/Pick支援アルゴリズム
    マップ適性スコア、対面相性スコア、チームシナジースコア、個人熟練度ボーナスを加味して
    おすすめのキャラクターTOP3を返す
    """
    # 今はモックデータを返却
    return [
        {"character_id": "piper", "score": 85.5, "reason": "マップ適性高"},
        {"character_id": "spike", "score": 82.0, "reason": "対面相性有利"},
        {"character_id": "crow", "score": 79.5, "reason": "チームシナジー高"}
    ]
