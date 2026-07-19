import asyncio
import logging
from app.tasks.crawler_task import run_crawler_task

logging.basicConfig(level=logging.INFO)

async def main():
    print("Starting manual crawler test...")
    await run_crawler_task()
    print("Finished manual crawler test.")

if __name__ == "__main__":
    asyncio.run(main())
