import os
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
CRON_SECRET = os.getenv("CRON_SECRET", "default_secret_for_local_dev")
