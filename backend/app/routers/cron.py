from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks
from app.config import CRON_SECRET
from app.tasks.crawler_task import run_crawler_task
from app.tasks.cleanup_task import run_cleanup_task

router = APIRouter()

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

@router.post("/api/cron/run-batch")
async def trigger_batch(background_tasks: BackgroundTasks, secret: str = Depends(verify_cron_secret)):
    """
    バッチ起動トリガー。認証成功時、クローラータスクをバックグラウンドに回し即座にレスポンスを返す。
    """
    background_tasks.add_task(run_crawler_task)
    return {"status": "accepted", "message": "Crawler task is now running in the background."}

@router.post("/api/cron/db-cleanup")
async def trigger_cleanup(background_tasks: BackgroundTasks, secret: str = Depends(verify_cron_secret)):
    """
    データクリーンアップ起動トリガー。認証成功時、クリーンアップタスクをバックグラウンドに回す。
    """
    background_tasks.add_task(run_cleanup_task)
    return {"status": "accepted", "message": "DB Cleanup task is now running in the background."}
