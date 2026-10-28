"""A single retry for interrupted, idempotent database reads only."""
import time
import httpx


def execute_read(query):
    for attempt in range(2):
        try:
            return query.execute()
        except (httpx.RemoteProtocolError, httpx.ReadError):
            if attempt:
                raise
            # A terminated HTTP/2 connection is removed from httpx's pool.
            # Do not retry SQL errors/timeouts or any write operation here.
            time.sleep(.05)
