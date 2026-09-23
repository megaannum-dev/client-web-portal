"""IB Flex data — two interchangeable fetch transports (mirrors ``storage_backend``).

The externally-populated SFTP drop directory is deprecated. Statements now
live in the app's own filesystem storage (``Bucket.IB_FLEX``), written there
by a scheduled ingest job — reconciliation just reads them back through the
same storage seam (``StoredFetcher``). ``LiveFetcher`` talks to the real Flex
Web Service via ``ib_async`` directly, bypassing storage, and is the explicit
opt-in transport.

Active implementation is chosen by ``settings.ib_flex_transport``
(``"stored"`` | ``"live"``).
"""

from __future__ import annotations

import contextlib
import os
import time
from datetime import date
from functools import lru_cache
from typing import Iterator, NamedTuple, Protocol

from app.core import flex_import
from app.core.config import get_settings
from app.core.storage import Bucket, get_storage

_DATE_LEN = len("YYYYMMDD")


class FlexRows(NamedTuple):
    orders: list[dict[str, str]]  # levelOfDetail == ORDER
    fills: list[dict[str, str]]  # levelOfDetail == EXECUTION


class FlexUnavailable(RuntimeError):
    """Flex could not be read: unconfigured, unreachable, or malformed."""


class FlexFetcher(Protocol):
    def days(self) -> list[date]: ...
    def fetch(self, day: date) -> FlexRows: ...


class StoredFetcher:
    """Reads statements from the app's own filesystem storage
    (``Bucket.IB_FLEX``), written there by a scheduled ingest job.
    Read-only, never writes."""

    def __init__(self) -> None:
        self._storage = get_storage(Bucket.IB_FLEX)

    def days(self) -> list[date]:
        found: set[date] = set()
        for stored in self._storage.list("trade-confirm"):
            stem = stored.filename.rsplit(".", 1)[0]  # "ib_trades_YYYYMMDD"
            digits = stem[-_DATE_LEN:]
            if digits.isdigit() and len(digits) == _DATE_LEN:
                found.add(date(int(digits[:4]), int(digits[4:6]), int(digits[6:8])))
        return sorted(found, reverse=True)

    def fetch(self, day: date) -> FlexRows:
        """A present file that parses to zero rows means "IB delivered a
        statement showing no trades" -- that case returns FlexRows([], []).
        A missing file means "IB never delivered a statement for this day
        at all" -- a completely different fact, which must not collapse
        into the same empty result. It raises FlexUnavailable instead, so
        callers (reconciliation) can tell "nothing happened" apart from
        "we don't know what happened"."""
        key = f"trade-confirm/{day:%Y-%m}/ib_trades_{day:%Y%m%d}.xml"
        try:
            handle = self._storage.open(key)
        except FileNotFoundError as exc:
            raise FlexUnavailable(f"no stored IB statement for {day:%Y-%m-%d}") from exc
        with handle:
            orders, trades, _summaries, _counts, _o, _t, _s = flex_import.parse(handle, "TCF")
        return FlexRows(orders=orders, fills=trades)  # type: ignore[arg-type]


class LiveFetcher:
    """Flex Web Service via ``ib_async``. Not exercisable without a token."""

    def __init__(self, token: str | None, query_id: str | None, cache_ttl_seconds: int) -> None:
        self._token = token
        self._query_id = query_id
        self._ttl = cache_ttl_seconds

    def _require_config(self) -> tuple[str, str]:
        if not self._token or not self._query_id:
            raise FlexUnavailable(
                "ib_flex_token/ib_flex_query_id are not configured — Flex Web Service unavailable"
            )
        return self._token, self._query_id

    def _statement_rows(self, topic: str, day: date | None = None) -> list[dict[str, str]]:
        """Rows for one topic. ``day`` asks the service for exactly that date;
        ``None`` leaves the range to the saved Flex query's own period."""
        token, query_id = self._require_config()
        try:
            from ib_async import FlexReport  # lazy: keep ib_async off the default stored path
        except ImportError as exc:
            raise FlexUnavailable(
                "ib_async is not installed — required for ib_flex_transport=live"
            ) from exc

        try:
            report = _cached_flex_report(FlexReport, token, query_id, self._ttl, day)
            # extract() yields ib_async DynamicObjects; the rest of the pipeline
            # (and StoredFetcher) speaks plain str dicts. parseNumbers=False keeps
            # every value a string, so vars() is the whole conversion.
            return [dict(vars(row)) for row in report.extract(topic, parseNumbers=False)]
        except FlexUnavailable:
            raise
        except Exception as exc:
            raise FlexUnavailable(f"Flex Web Service request failed: {exc}") from exc

    def days(self) -> list[date]:
        rows = self._statement_rows("Order")
        found = {row["tradeDate"] for row in rows if row.get("tradeDate")}
        return sorted((date.fromisoformat(d) for d in found), reverse=True)

    def fetch(self, day: date) -> FlexRows:
        day_str = f"{day:%Y%m%d}"
        # Filtered as well as date-ranged: the range is what makes an old day
        # reachable at all, the filter is what keeps a wider-than-asked
        # statement (a query whose own period overrides fd/td) honest.
        orders = [r for r in self._statement_rows("Order", day) if r.get("tradeDate") == day_str]
        fills = [
            r for r in self._statement_rows("TradeConfirm", day) if r.get("tradeDate") == day_str
        ]
        return FlexRows(orders=orders, fills=fills)


@contextlib.contextmanager
def _flex_date_range(day: date | None) -> Iterator[None]:
    """Ask the Flex Web Service for one specific date.

    ``FlexReport.download()`` only sends ``t=``/``q=``/``v=3`` — no from/to
    date. But it builds its URL as ``IB_FLEXREPORT_URL`` (env, default
    ``FLEXREPORT_URL``) + those params by plain string concatenation, so an
    ``fd=``/``td=``/``&`` prefix stuffed into that env var rides along.
    """
    if day is None:
        yield
        return

    key = "IB_FLEXREPORT_URL"
    previous = os.environ.get(key)
    if previous is None:
        from ib_async.flexreport import FLEXREPORT_URL

        base = FLEXREPORT_URL
    else:
        base = previous
    os.environ[key] = f"{base}fd={day:%Y%m%d}&td={day:%Y%m%d}&"
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


# ponytail: bucket-keyed lru_cache is the whole cache; upgrade to real TTL/LRU
# eviction if this ever grows past a handful of (token, query, day, bucket) keys.
@lru_cache(maxsize=32)
def _download_flex_report(  # type: ignore[no-untyped-def]
    flex_report_cls: type, token: str, query_id: str, day: date | None, _bucket: int
):
    with _flex_date_range(day):
        return flex_report_cls(token, query_id)


def _cached_flex_report(  # type: ignore[no-untyped-def]
    flex_report_cls: type,
    token: str,
    query_id: str,
    ttl_seconds: int,
    day: date | None = None,
):
    bucket = int(time.time() // ttl_seconds) if ttl_seconds > 0 else 0
    return _download_flex_report(flex_report_cls, token, query_id, day, bucket)


def download_day(day: date) -> object:  # -> ib_async.FlexReport, but ib_async is optional
    """Fetch the raw Flex report for exactly one day (`FlexReport.data` holds
    the raw response bytes). Used by the scheduled ingest job, which stores
    that raw payload verbatim -- see app.libs.ib_ingest.service.ingest_day.

    Bypasses the TTL cache entirely: `_cached_flex_report` collapses its
    bucket to a constant 0 when `ttl_seconds` is 0, which caches the report
    FOREVER for a given day rather than skipping the cache -- the opposite
    of what a retry needs. `lru_cache` never caches an exception (a hard
    failure already re-downloads on retry), but a successful-but-empty
    report (a real, valid response on a no-trade day) would otherwise be
    pinned for up to `ib_flex_cache_ttl_seconds`, making any retry inside
    that window a guaranteed no-op. So this calls the undecorated function
    directly -- reusing its body (and `_flex_date_range` inside it), just
    skipping the `lru_cache` wrapper -- to guarantee a fresh download.
    """
    settings = get_settings()
    token, query_id = settings.ib_flex_token, settings.ib_flex_query_id
    if not token or not query_id:
        raise FlexUnavailable(
            "ib_flex_token/ib_flex_query_id are not configured — Flex Web Service unavailable"
        )
    try:
        from ib_async import FlexReport  # lazy: keep ib_async off the default stored path
    except ImportError as exc:
        raise FlexUnavailable(
            "ib_async is not installed — required for ib_flex_transport=live"
        ) from exc

    try:
        return _download_flex_report.__wrapped__(FlexReport, token, query_id, day, 0)
    except FlexUnavailable:
        raise
    except Exception as exc:
        raise FlexUnavailable(f"Flex Web Service request failed: {exc}") from exc


def get_fetcher() -> FlexFetcher:
    """Selects the active transport by ``settings.ib_flex_transport``."""
    settings = get_settings()
    if settings.ib_flex_transport == "live":
        return LiveFetcher(
            settings.ib_flex_token, settings.ib_flex_query_id, settings.ib_flex_cache_ttl_seconds
        )
    return StoredFetcher()
