"""Encrypted, day-partitioned input cache; all statistics still run in Python."""
import gzip
import json
import logging
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

logger = logging.getLogger(__name__)
FORMAT = b'brawl-history-v1\0'


def _utc(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


class HistoryChanged(RuntimeError):
    """Never publish input that changed while its partitions were being read."""


class HistoryCache:
    def __init__(self, path, secret, project, columns, page_size=1000):
        self.path = Path(path)
        self.columns = columns
        self.page_size = page_size
        self.aad = FORMAT + project.encode() + b'\0' + columns.encode()
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                   info=self.aad).derive(secret.encode())
        self.cipher = AESGCM(key)

    def _load(self):
        try:
            raw = self.path.read_bytes()
            if not raw.startswith(FORMAT):
                raise ValueError('Unknown cache format')
            raw = raw[len(FORMAT):]
            payload = self.cipher.decrypt(raw[:12], raw[12:], self.aad)
            saved = json.loads(gzip.decompress(payload))
            if saved['version'] != 1 or not isinstance(saved['days'], dict):
                raise ValueError('Invalid cache payload')
            # JSON only; never deserialize executable objects from Actions caches.
            for day, entry in saved['days'].items():
                date.fromisoformat(day)
                if not isinstance(entry['revision'], str) or not isinstance(entry['rows'], list):
                    raise ValueError('Invalid day partition')
                if any(not isinstance(row, dict) or set(row) != set(self.columns.split(','))
                       or str(row['match_at'])[:10] != day for row in entry['rows']):
                    raise ValueError('Invalid cached rows')
            return saved['days']
        except FileNotFoundError:
            return {}
        except (InvalidTag, ValueError, KeyError, TypeError, OSError, EOFError):
            logger.warning('History cache unavailable or invalid; rebuilding from the database')
            return {}

    def _save(self, days):
        data = gzip.compress(json.dumps({'version': 1, 'days': days},
                                       separators=(',', ':')).encode(), mtime=0)
        nonce = os.urandom(12)
        encrypted = FORMAT + nonce + self.cipher.encrypt(nonce, data, self.aad)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with NamedTemporaryFile(dir=self.path.parent, delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(encrypted)
            temporary.replace(self.path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @staticmethod
    def _manifest(client, first_day):
        result = client.rpc('analytics_history_manifest', {
            'p_first_day': first_day.isoformat(),
        }).execute().data
        if not isinstance(result, dict) or result.get('version') != 1:
            raise ValueError('History manifest is unavailable')
        days = result['days']
        if not isinstance(days, dict):
            raise ValueError('Invalid history manifest')
        for day, revision in days.items():
            date.fromisoformat(day)
            if not isinstance(revision, str):
                raise ValueError('Invalid history revision')
        return days

    def _read_day(self, client, day):
        start = datetime.combine(date.fromisoformat(day), time(), timezone.utc)
        end = start + timedelta(days=1)
        rows, last_id = [], None
        while True:
            query = (client.table('match_raw_history').select(self.columns)
                     .gte('match_at', start.isoformat()).lt('match_at', end.isoformat())
                     .order('match_id').limit(self.page_size))
            if last_id is not None:
                query = query.gt('match_id', last_id)
            page = query.execute().data
            rows.extend(page)
            if len(page) < self.page_size:
                return rows
            next_id = page[-1]['match_id']
            if last_id is not None and next_id <= last_id:
                raise ValueError('History pagination did not advance')
            last_id = next_id

    def fetch(self, client, threshold):
        """Refresh changed days, verify revisions, then apply the exact 60-day cutoff."""
        saved = self._load()
        first_day = threshold.date()
        # Verify before any raw reads. A missing migration is handled by the caller.
        manifest = self._manifest(client, first_day)
        for _ in range(3):
            candidate = {}
            fetched = 0
            for day, revision in sorted(manifest.items()):
                entry = saved.get(day)
                if entry is None or entry['revision'] != revision:
                    entry = {'revision': revision, 'rows': self._read_day(client, day)}
                    fetched += len(entry['rows'])
                candidate[day] = entry
            after = self._manifest(client, first_day)
            if after == manifest:
                self._save(candidate)
                rows = [row for entry in candidate.values() for row in entry['rows']
                        if _utc(row['match_at']) >= threshold]
                rows.sort(key=lambda row: row['match_id'])
                logger.info('History input: %s rows, %s downloaded, %s day partitions',
                            len(rows), fetched, len(candidate))
                return rows
            # Validated partitions are reusable on retry; changed revisions are not.
            saved, manifest = candidate, after
        raise HistoryChanged('History changed during all three reads; keeping the previous analytics snapshot')
