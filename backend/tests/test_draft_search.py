from itertools import combinations
from datetime import datetime, timezone
import copy
import pytest
from app.algorithm.composition_model import center_pairs, pair_effect, score, predict, probability
from app.algorithm.draft_rules import DraftState
from app.algorithm.draft_search import DraftSearch
from app.algorithm.ranked_dataset import build_games


def fitted():
    names = list("abcdefghi")
    return {"version": "ranked_joint_v4", "weights": {
        **{f"c|global|{n}": (i - 4) / 10 for i, n in enumerate(names)},
        **{f"e|global|{a}:{b}": (ord(a) + ord(b)) / 1000 for a, b in combinations(names, 2)},
        **{f"s|global|{a}:{b}": (ord(a) - ord(b)) / 1000 for a, b in combinations(names, 2)}},
        "temperature": 1.2, "support": {}}


def test_centering_removes_main_effect_from_pairs_without_changing_3v3_odds():
    model = fitted()
    old = score(model, list("abc"), list("def"), "m", "map")
    center_pairs(model)
    names = list("abcdefghi")
    for name in names:
        assert sum(pair_effect(model, name, n, kind="e") for n in names) == pytest.approx(0, abs=1e-12)
        assert sum(pair_effect(model, name, n, kind="s") for n in names) == pytest.approx(0, abs=1e-12)
    state = DraftState("blue", tuple(zip(("blue", "red", "red", "blue", "blue", "red"), "adebcf")))
    evaluator = DraftSearch(model, names, "m", "map")
    assert evaluator.z(state, "blue") == pytest.approx(old)
    assert evaluator.z(state, "red") == pytest.approx(-old)


def test_final_two_turns_use_best_enemy_reply_and_roster_missing_is_distinct_from_empty():
    model = fitted()
    names = list("abcdefghi")
    state = DraftState("blue", tuple(zip(("blue", "red", "red", "blue"), "abcd")))
    search = DraftSearch(model, names, "m", "map")
    result = search.recommend(state)
    assert result["search"]["exact"]
    for row in result["suggestions"]:
        replies = search.legal(state.pick(row["name"]))
        worst = min(predict(model, state.team("blue") + (row["name"],), state.team("red") + (enemy,), "m", "map")["winRate"] for enemy in replies)
        assert round(row["score"]) == worst
    assert DraftSearch(model, names, "m", "map", {"blue": []}).recommend(state)["suggestions"] == []
    assert DraftSearch(model, names, "m", "map", {"blue": None}).recommend(state)["suggestions"]
    with pytest.raises(ValueError):
        DraftState("blue", (("red", "a"),)).validate(names)
    with pytest.raises(ValueError):
        DraftState("blue", (("blue", "a"),), ("a",)).validate(names)


def test_blind_ban_advice_does_not_use_hidden_opponent_bans():
    model, names = fitted(), list("abcdefghi")
    a = DraftSearch(model, names, "m", "map").bans(DraftState("red", (), ("a",), ("b",)), "blue")
    b = DraftSearch(model, names, "m", "map").bans(DraftState("red", (), ("a",), ("c",)), "blue")
    assert a == b


def test_future_profile_does_not_rewrite_historical_rank_or_player_ability():
    row = {"player_tag": "A", "match_at": "2026-10-02T00:00:00Z", "match_type": "soloRanked",
           "battle_uid": "game", "hero_used": "a", "allies": ["b", "c"], "opponents": ["d", "e", "f"],
           "result": "victory", "mode": "brawlBall", "map_id": "map"}
    now = datetime(2026, 10, 3, tzinfo=timezone.utc)
    snapshots = [{"player_tag": "A", "ranked_rank": 1, "observed_at": "2026-10-03T00:00:00Z"}]
    assert len(build_games([row], {"A"}, snapshots=snapshots, now=now)) == 1
    snapshots[0]["observed_at"] = "2026-10-01T00:00:00Z"
    assert build_games([row], {"A"}, snapshots=snapshots, now=now) == []


def test_draw_and_marginal_ability_preserve_direction_and_total_probability():
    model = fitted()
    model.update(draw_strength={"m": .1}, ability_variance=.5)
    own, enemy = list("abc"), list("def")
    a, b = predict(model, own, enemy, "m", "map"), predict(model, enemy, own, "m", "map")
    assert a["lossRate"] == pytest.approx(100 - a["drawRate"] - 100 * probability(model, own, enemy, "m", "map"))
    assert a["lossRate"] == pytest.approx(100 * probability(model, enemy, own, "m", "map"))
    assert a["drawRate"] == pytest.approx(b["drawRate"])
    assert sum(a["contributions"].values()) == pytest.approx(100 * probability(model, own, enemy, "m", "map") - a["neutralWinRate"])
