"""Bounded upload, atomic activation, no partially visible fitted matrices."""
from uuid import uuid4
from app.algorithm.composition_model import effect_rows


def publish_model(db, identifier, model):
    params = {"p_id": identifier, "p_model": model}
    if model.get("accepted"):
        snapshot = str(uuid4())
        rows = [{**row, "snapshot_id": snapshot} for row in effect_rows(model)]
        if rows:
            try:
                for offset in range(0, len(rows), 500):
                    db.table("composition_effect_staging").insert(rows[offset:offset + 500]).execute()
                params["p_effect_snapshot"] = snapshot
                db.rpc("publish_composition_model", params).execute()
            except Exception:
                db.table("composition_effect_staging").delete().eq("snapshot_id", snapshot).execute()
                raise
            return
    db.rpc("publish_composition_model", params).execute()
