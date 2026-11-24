import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to ブロラボ API"}

def test_recommend(monkeypatch):
    monkeypatch.setattr("app.routers.match.recommend_picks", lambda *args: [])
    response = client.post("/match/recommend", json={
        "map_id": "map_1",
        "mode": "bounty",
        "allies": ["colt"],
        "opponents": ["rosa"],
        "pick_turn": 1,
        "is_proxy_pick": False
    })
    assert response.status_code == 200
    assert "recommendations" in response.json()

def test_tier_list(monkeypatch):
    monkeypatch.setattr("app.routers.meta.get_db", lambda: None)
    monkeypatch.setattr("app.routers.meta._get_cached_macro_data", lambda db: [])
    monkeypatch.setattr("app.routers.meta._get_cached_total_analyzed", lambda db: 0)
    response = client.get("/meta/tier-list")
    assert response.status_code == 200
    data = response.json()
    assert "tiers" in data
    assert "S+" in data["tiers"]
    assert "S" in data["tiers"]


def test_clear_cache_requires_cron_secret(monkeypatch):
    from unittest.mock import Mock

    cleared = Mock()
    monkeypatch.setattr("app.routers.meta.clear_meta_cache", cleared)
    monkeypatch.setattr("app.routers.cron.CRON_SECRET", "test-cron-secret")

    assert client.post("/meta/clear-cache").status_code == 401
    assert client.post("/meta/clear-cache", headers={"cron-secret": "wrong"}).status_code == 401

    monkeypatch.setattr("app.routers.cron.CRON_SECRET", "")
    assert client.post("/meta/clear-cache", headers={"cron-secret": ""}).status_code == 401
    assert cleared.call_count == 0

    monkeypatch.setattr("app.routers.cron.CRON_SECRET", "test-cron-secret")
    ok = client.post("/meta/clear-cache", headers={"cron-secret": "test-cron-secret"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "ok"
    cleared.assert_called_once_with()


def test_debug_db_requires_cron_secret(monkeypatch):
    from unittest.mock import Mock

    db = Mock()
    db.table.return_value.select.return_value.limit.return_value.execute.return_value.data = []
    monkeypatch.setattr("app.routers.meta.get_db", lambda: db)
    monkeypatch.setattr("app.routers.cron.CRON_SECRET", "test-cron-secret")

    assert client.get("/meta/debug/db").status_code == 401
    assert client.get("/meta/debug/db", headers={"cron-secret": "wrong"}).status_code == 401

    ok = client.get("/meta/debug/db", headers={"cron-secret": "test-cron-secret"})
    assert ok.status_code == 200
    assert ok.json() == {
        "match_raw_history_types": [],
        "macro_map_stats_types": [],
        "macro_map_stats_solo_maps": [],
    }


def test_my_ip_requires_cron_secret(monkeypatch):
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return b"1.2.3.4"

    monkeypatch.setattr("app.routers.cron.CRON_SECRET", "test-cron-secret")
    monkeypatch.setattr("urllib.request.urlopen", lambda url, timeout=5: FakeResponse())

    assert client.get("/my-ip").status_code == 401
    assert client.get("/my-ip", headers={"cron-secret": "wrong"}).status_code == 401

    ok = client.get("/my-ip", headers={"cron-secret": "test-cron-secret"})
    assert ok.status_code == 200
    assert ok.json() == {"render_ip": "1.2.3.4"}
