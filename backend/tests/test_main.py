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

def test_recommend():
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

def test_tier_list():
    response = client.get("/meta/tier-list")
    assert response.status_code == 200
    data = response.json()
    assert "tiers" in data
    assert "S+" in data["tiers"]
    assert "S" in data["tiers"]
