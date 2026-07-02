"""BE-6 — In-process TTL cache for allocation matrices.

No third-party cache library; implemented with threading.Lock + expiry timestamps.

Key schema:
    ("open",      etag)       → derived AllocationViewOut dict  (TTL 300 s)
    ("confirmed", period_id)  → derived AllocationViewOut dict  (TTL long)

ETag formula (open matrix):
    sha1(f"{subs.max_updated_at}:{subs.count}|"
         f"{models.max_updated_at}:{models.live_count}|"
         f"{clients.max_updated_at}:{clients.count}")[:16]
"""

from __future__ import annotations

import hashlib
import threading
import time
from typing import Any

_OPEN_TTL = 300  # seconds — safety net; correctness comes from ETag checks
_CONFIRMED_TTL = 86_400 * 7  # 7 days — confirmed periods are immutable


class AllocationCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: dict[tuple, tuple[Any, float]] = {}

    def _get(self, key: tuple) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expiry = entry
            if time.monotonic() > expiry:
                del self._store[key]
                return None
            return value

    def _put(self, key: tuple, value: Any, ttl: float) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl)

    def get_open(self, etag: str) -> Any | None:
        return self._get(("open", etag))

    def put_open(self, etag: str, value: Any) -> None:
        self._put(("open", etag), value, _OPEN_TTL)

    def get_confirmed(self, period_id: str) -> Any | None:
        return self._get(("confirmed", period_id))

    def put_confirmed(self, period_id: str, value: Any) -> None:
        self._put(("confirmed", period_id), value, _CONFIRMED_TTL)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @staticmethod
    def compute_open_etag(subs: Any, models: Any, clients: Any) -> str:
        """Derive ETag from the three watermark probes."""
        raw = (
            f"{subs.max_updated_at}:{subs.count}|"
            f"{models.max_updated_at}:{models.count}|"
            f"{clients.max_updated_at}:{clients.count}"
        )
        return hashlib.sha1(raw.encode()).hexdigest()[:16]


# Module-level singleton — thin wrappers keep callers unchanged.
_cache = AllocationCache()


def get_open(etag: str) -> Any | None:
    return _cache.get_open(etag)


def put_open(etag: str, value: Any) -> None:
    _cache.put_open(etag, value)


def get_confirmed(period_id: str) -> Any | None:
    return _cache.get_confirmed(period_id)


def put_confirmed(period_id: str, value: Any) -> None:
    _cache.put_confirmed(period_id, value)


def compute_open_etag(subs: Any, models: Any, clients: Any) -> str:
    return _cache.compute_open_etag(subs, models, clients)
