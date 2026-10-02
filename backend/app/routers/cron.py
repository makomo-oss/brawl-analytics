import logging
import re
import hmac
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks
from app.config import CRON_SECRET, AUTO_SYNC_SECRET
from app.tasks.crawler_task import run_crawler_task
from app.tasks.cleanup_task import run_cleanup_task

router = APIRouter()
logger = logging.getLogger(__name__)
_batch_runs: dict[str, dict] = {}


async def _run_batch_with_status(run_id: str):
    run = _batch_runs[run_id]
    run["status"] = "running"
    try:
        result = await run_crawler_task(lambda stage: run.update(stage=stage), aggregate=False)
        run.update(status="completed", result=result)
    except Exception as exc:
        logger.exception("Crawler batch %s failed at %s", run_id, run["stage"])
        message = str(getattr(exc, "message", exc))
        column = re.search(r'null value in column "([a-z_]+)"', message)
        run.update(status="failed", error_type=type(exc).__name__,
                   error_code=str(getattr(exc, "code", "")),
                   error_column=column.group(1) if column else None)

def verify_cron_secret(cron_secret: str = Header(None)):
    """
    リクエストヘッダーの CRON_SECRET を検証する依存関係
    """
    if not cron_secret or cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return cron_secret

@router.get("/ping")
async def ping():
    """
    Wake-up Pingエンドポイント。Renderのスリープ解除用。
    """
    return {"status": "ok"}


def verify_auto_sync_secret(auto_sync_secret: str | None = Header(None)):
    if not AUTO_SYNC_SECRET or not auto_sync_secret or not hmac.compare_digest(auto_sync_secret, AUTO_SYNC_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/api/cron/auto-sync")
async def trigger_auto_sync(background_tasks: BackgroundTasks, secret: None = Depends(verify_auto_sync_secret)):
    from app.services.player_auto_sync import run_auto_sync_task
    background_tasks.add_task(run_auto_sync_task)
    return {"status": "accepted"}

@router.post("/api/cron/run-batch")
async def trigger_batch(background_tasks: BackgroundTasks, secret: str = Depends(verify_cron_secret)):
    """
    バッチ起動トリガー。認証成功時、クローラータスクをバックグラウンドに回し即座にレスポンスを返す。
    """
    run_id = uuid4().hex
    _batch_runs[run_id] = {"status": "accepted", "stage": "queued"}
    # Only a small recent window is needed while GitHub Actions polls completion.
    if len(_batch_runs) > 20:
        for old_id in list(_batch_runs)[:-20]:
            _batch_runs.pop(old_id, None)
    background_tasks.add_task(_run_batch_with_status, run_id)
    return {"status": "accepted", "run_id": run_id}


@router.get("/api/cron/batch-status/{run_id}")
async def batch_status(run_id: str, secret: str = Depends(verify_cron_secret)):
    run = _batch_runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Batch status unavailable")
    return run

@router.post("/api/cron/db-cleanup")
async def trigger_cleanup(secret: str = Depends(verify_cron_secret)):
    """
    60日超の戦績を削除し、完了結果をワークフローへ返す。
    """
    result = await run_cleanup_task()
    return {"status": "completed", **result}

@router.post("/api/cron/daily-calc")
async def trigger_daily_calc(background_tasks: BackgroundTasks, secret: str = Depends(verify_cron_secret)):
    """
    統計集計起動トリガー。認証成功時、マクロマップ統計および対面相性の集計タスクをバックグラウンドで実行。
    """
    from app.scripts.daily_calc import run_daily_calculation
    background_tasks.add_task(run_daily_calculation)
    return {"status": "accepted", "message": "Daily Calculation task is now running in the background."}
