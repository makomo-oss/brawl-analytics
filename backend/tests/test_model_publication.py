from unittest.mock import Mock
import pytest
from app.services import model_publication


def test_publication_activates_only_after_every_transfer_batch(monkeypatch):
    db = Mock()
    monkeypatch.setattr(model_publication, "effect_rows", lambda model: [{"kind": "c"}] * 1001)
    model_publication.publish_model(db, "current", {"accepted": True})
    calls = db.table.return_value.insert.call_args_list
    assert [len(c.args[0]) for c in calls] == [500, 500, 1]
    key = calls[0].args[0][0]["snapshot_id"]
    assert db.rpc.call_args.args[1]["p_effect_snapshot"] == key
    assert db.table.return_value.delete.call_count == 0


def test_failed_transfer_preserves_active_model_and_cleans_only_its_staging_rows(monkeypatch):
    db = Mock()
    monkeypatch.setattr(model_publication, "effect_rows", lambda model: [{"kind": "c"}] * 501)
    db.table.return_value.insert.return_value.execute.side_effect = [None, RuntimeError("failed")]
    with pytest.raises(RuntimeError):
        model_publication.publish_model(db, "current", {"accepted": True})
    db.rpc.assert_not_called()
    key = db.table.return_value.insert.call_args_list[0].args[0][0]["snapshot_id"]
    db.table.return_value.delete.return_value.eq.assert_called_once_with("snapshot_id", key)
