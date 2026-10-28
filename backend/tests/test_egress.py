"""Exercise real PostgREST requests without contacting or writing production."""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd
from postgrest import SyncPostgrestClient

from app.scripts import daily_calc


def database(handler):
    return SyncPostgrestClient(
        "https://example.test/rest/v1",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_rank_projection_keeps_all_brackets_and_pagination():
    requests = []
    players = [{"player_tag": f"LOW{i}", "ranked_rank": 12} for i in range(1000)]
    players += [{"player_tag": "#mythic", "ranked_rank": 13},
                {"player_tag": "LEGENDARY", "ranked_rank": 18},
                {"player_tag": "MASTERS", "ranked_rank": 19},
                {"player_tag": "PRO", "ranked_rank": 20},
                {"player_tag": "MISSING", "ranked_rank": None}]
    players.sort(key=lambda p: p['player_tag'])

    def handler(request):
        requests.append(request)
        after = request.url.params.get('player_tag')
        eligible = players if after is None else [p for p in players if p['player_tag'] > after[3:]]
        return httpx.Response(200, json=eligible[:1000])

    with database(handler) as db:
        segments = daily_calc.fetch_player_rank_segments(db)
    assert segments == {"mythic": {"MYTHIC"}, "legendary": {"LEGENDARY"},
                        "masters": {"MASTERS", "PRO"},
                        "all_elite": {"MYTHIC", "LEGENDARY", "MASTERS", "PRO"}}
    assert [r.url.params.get('player_tag') for r in requests] == [None, 'gt.' + players[999]['player_tag']]
    assert all('offset' not in r.url.params for r in requests)
    assert all(r.url.params["select"] ==
               "player_tag,ranked_rank:unlocked_characters->ranked_rank" for r in requests)
    assert all(r.url.params["name"] == "not.like.Mock (Error:%" for r in requests)
    assert all(r.url.params["order"] == "player_tag.asc" for r in requests)


def test_explicit_auto_refresh_keeps_legacy_profile_metadata(monkeypatch):
    now = datetime.now(timezone.utc)
    profiles = [
        {"player_tag": "FRESH", "updated_at": now.isoformat(),
         "unlocked_characters": {"ranked_rank": 16}},
        {"player_tag": "STALE", "updated_at": (now - timedelta(days=4)).isoformat(),
         "unlocked_characters": {"ranked_rank": 13}},
        # Presence of a null highest_ranked_name still means rank info exists.
        {"player_tag": "NULL_NAME", "updated_at": now.isoformat(),
         "unlocked_characters": {"ranked_rank": 0, "highest_ranked_name": None}},
        {"player_tag": "LEGACY", "updated_at": now.isoformat(),
         "unlocked_characters": json.dumps({"ranked_rank": 19})},
    ]
    requests = []
    refreshed = []

    async def refresh(tags, db):
        refreshed.extend(tags)

    def handler(request):
        requests.append(request)
        if "unlocked_characters" == request.url.params["select"].split(",")[-1]:
            return httpx.Response(200, json=profiles)
        return httpx.Response(200, json=[{"player_tag": "STALE", "ranked_rank": 16},
                                        {"player_tag": "LEGACY", "ranked_rank": 19}])

    monkeypatch.setenv("BRAWL_API_TOKEN", "test-token")
    monkeypatch.setattr(daily_calc, "auto_sync_missing_player_ranks", refresh)
    with database(handler) as db:
        result = daily_calc.fetch_player_rank_segments(
            db, pd.DataFrame({"player_tag": ["FRESH", "STALE", "NULL_NAME", "LEGACY", "NEW"]}))
    assert set(refreshed) == {"STALE", "NEW"}
    assert result["legendary"] == {"STALE"}
    assert result["masters"] == {"LEGACY"}
    assert requests[0].url.params["select"] == "player_tag,updated_at,unlocked_characters"
    assert requests[1].url.params["select"] == daily_calc.PLAYER_RANK_COLUMNS


def test_match_projection_preserves_all_three_calculations(monkeypatch):
    now = pd.Timestamp("2026-10-27T10:00:00Z")
    first = dict(match_id="one", battle_uid="shared", player_tag="ABC", mode="brawlBall",
                 map_id="map", result="victory", hero_used="COLT", allies=["SHELLY"],
                 opponents=["BULL"], match_type="soloRanked", match_at=now.isoformat(),
                 collected_at=now.isoformat())
    raw = [first, first.copy(),
           {**first, "match_id": "two", "player_tag": "DEF", "hero_used": "BULL",
            "allies": ["BROCK"], "opponents": ["COLT"], "result": "defeat"},
           {**first, "match_id": "three", "battle_uid": None, "result": "draw"},
           {**first, "match_id": "four", "battle_uid": "older", "result": "defeat",
            "match_at": (now - pd.Timedelta(days=37)).isoformat()},
           {**first, "match_id": "five", "battle_uid": "other-mode", "mode": "gemGrab"}]
    requests = []

    def handler(request):
        requests.append(request)
        fields = request.url.params["select"].split(",")
        return httpx.Response(200, json=[{field: row[field] for field in fields} for row in raw])

    # Both inputs are evaluated at exactly the same time using the same weights.
    def weights(frame):
        age = ((now - pd.to_datetime(frame["match_at"], utc=True)).dt.total_seconds() / 86400).clip(lower=0)
        return 2.0 ** (-age.clip(upper=30) / daily_calc.HALF_LIFE_DAYS
                       - (age - 30).clip(lower=0) / daily_calc.OLDER_HALF_LIFE_DAYS)

    monkeypatch.setattr(daily_calc, "observation_weights", weights)
    with database(handler) as db:
        projected = daily_calc.fetch_recent_matches(db)
    assert "collected_at" not in projected
    assert len(projected) == len(raw)
    assert requests[0].url.params["order"] == "match_id.asc"
    cutoff = pd.Timestamp(requests[0].url.params["match_at"].removeprefix("gte."))
    assert (pd.Timestamp.now(tz="UTC") - cutoff).days == 60
    segments = {"mythic": {"ABC"}, "legendary": {"DEF"}, "all_elite": {"ABC", "DEF"}}
    for calculate in (daily_calc.calc_macro_map_stats, daily_calc.calc_dynamic_counters,
                      daily_calc.calc_dynamic_synergies):
        args = (segments,) if calculate is daily_calc.calc_macro_map_stats else ()
        expected = calculate(pd.DataFrame(raw), *args)
        actual = calculate(projected, *args)
        for rows in (expected, actual):
            for row in rows:
                row.pop("updated_at", None)
        assert actual == expected


def test_match_pagination_keeps_the_last_page():
    requests = []

    def handler(request):
        requests.append(request)
        offset = int(request.url.params["offset"])
        size = 1000 if offset == 0 else 1
        return httpx.Response(200, json=[{"match_id": str(offset + i)} for i in range(size)])

    with database(handler) as db:
        result = daily_calc.fetch_recent_matches(db)
    assert len(result) == 1001
    assert result.iloc[-1]["match_id"] == "1000"
    assert [r.url.params["offset"] for r in requests] == ["0", "1000"]


def test_auto_heal_writes_no_returned_profiles(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(201, content=b"")

    async def get_player(tag):
        return {"tag": f"#{tag}", "name": "Test", "rankedRank": 16, "brawlers": []}

    monkeypatch.setattr(daily_calc, "get_player", get_player)
    with database(handler) as db:
        asyncio.run(daily_calc.auto_sync_missing_player_ranks(["ABC"], db))
    assert len(requests) == 1
    assert "return=minimal" in requests[0].headers["prefer"]
    saved = json.loads(requests[0].content)
    assert saved[0]["unlocked_characters"]["ranked_rank"] == 16
