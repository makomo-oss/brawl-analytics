import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Brawl Stars API Config
BRAWL_API_TOKEN = os.getenv("BRAWL_API_TOKEN", "mock_token_for_tests")
# Proxy configuration as specified in API_kye.txt
BRAWL_API_PROXY = os.getenv("BRAWL_API_PROXY", "http://45.79.218.79:80") # ポートは一般的に80または8080等ですが、環境により調整
BRAWL_API_BASE_URL = "https://api.brawlstars.com/v1"
