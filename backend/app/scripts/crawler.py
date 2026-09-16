"""Compatibility entry point for the production crawler."""
import asyncio
from app.tasks.crawler_task import run_crawler_task

crawl_and_aggregate = run_crawler_task

if __name__ == "__main__":
    asyncio.run(crawl_and_aggregate())
