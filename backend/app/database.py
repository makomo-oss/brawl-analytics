import os
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

def get_db() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("Supabase credentials not found in environment variables. Database features will fail.")
        # Returning a dummy client or raising an error depending on strictness
        # For development without credentials, we might mock this later.
    
    return create_client(SUPABASE_URL, SUPABASE_KEY)
