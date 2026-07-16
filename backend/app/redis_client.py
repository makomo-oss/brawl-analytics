import os
import redis
import logging

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

def get_redis() -> redis.Redis:
    try:
        client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise e
