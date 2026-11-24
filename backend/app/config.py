import os
import hashlib
import hmac
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Brawl Stars API Config
BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN", "mock_token_for_tests")
# Proxy configuration as specified in API_kye.txt (Optional)
BRAWL_API_PROXY = os.getenv("BRAWL_API_PROXY", "")
BRAWL_API_BASE_URL = "https://api.brawlstars.com/v1"

# Cron Secret for automated batch processes
CRON_SECRET = os.getenv("CRON_SECRET", "")
# Domain-separated scheduler key; it does not disclose the database credential.
# An explicit value can override this when configuring environments independently.
AUTO_SYNC_SECRET = os.getenv("AUTO_SYNC_SECRET") or (
    hmac.new(SUPABASE_KEY.encode(), b"brawl-analytics:auto-sync:v1", hashlib.sha256).hexdigest()
    if SUPABASE_KEY else ""
)
