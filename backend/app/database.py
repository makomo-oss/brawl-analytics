import os
from dotenv import load_dotenv
from supabase import create_client, Client
import logging

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

_db_client: Client | None = None

def get_db() -> Client:
    """
    Supabase クライアントのシングルトンインスタンスを返却する。
    
    Why: 毎リクエストで create_client() を呼ぶとクライアント生成オーバーヘッド
    および不要なセッション再構築が発生するため、インスタンスをキャッシュして再利用する。
    """
    global _db_client
    if _db_client is not None:
        return _db_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("Supabase credentials not found in environment variables. Database features will fail.")
        # Returning a dummy client or raising an error depending on strictness
        # For development without credentials, we might mock this later.
    
    _db_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _db_client
