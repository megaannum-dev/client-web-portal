"""IB Flex data — two interchangeable fetch transports (mirrors ``storage_backend``).

There is no Flex Web Service token yet, so the working transport is a
daily-populated drop directory (``DropFetcher``). ``LiveFetcher`` talks to the
real Flex Web Service via ``ib_async`` and is wired up ready for when
credentials arrive, but is not exercisable until then.

Active implementation is chosen by ``settings.ib_flex_transport``
(``"drop"`` | ``"live"``).
"""

from __future__ import annotations

import contextlib
import os
import time
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Iterator, NamedTuple, Protocol

from app.core import flex_xml
from app.core.config import get_settings

_DATE_LEN = len("YYYYMMDD")


class FlexRows(NamedTuple):
    orders: list[dict[str, str]]  # levelOfDetail == ORDER
    fills: list[dict[str, str]]  # levelOfDetail == EXECUTION


class FlexUnavailable(RuntimeError):
    """Flex could not be read: unconfigured, unreachable, or malformed."""


class FlexFetcher(Protocol):
    def days(self) -> list[date]: ...
    def fetch(self, day: date) -> FlexRows: ...


class DropFetcher:
    """Reads the daily-populated drop directory. Read-only, never writes."""

    def __init__(self, root: str | None) -> None:
        if not root:
            raise FlexUnavailable("ib_flex_drop_root is not configured")
        path = Path(root)
        if not path.is_dir():
            raise FlexUnavailable(f"ib_flex_drop_root does not exist: {path}")
        self._root = path

    def _trade_confirm_dir(self) -> Path:
        return self._root / "drop" / "trade-confirm"

    def days(self) -> list[date]:
        found: set[date] = set()
        for xml_path in self._trade_confirm_dir().glob("*/*/ib_trades_*.xml"):
            stem = xml_path.stem  # "ib_trades_YYYYMMDD"
            digits = stem[-_DATE_LEN:]
            if digits.isdigit() and len(digits) == _DATE_LEN:
                found.add(date(int(digits[:4]), int(digits[4:6]), int(digits[6:8])))
        return sorted(found, reverse=True)

    def fetch(self, day: date) -> FlexRows:
        xml_path = (
            self._trade_confirm_dir() / f"{day:%Y}" / f"{day:%m}" / f"ib_trades_{day:%Y%m%d}.xml"
        )
        if not xml_path.is_file():
            return FlexRows(orders=[], fills=[])  # nothing traded that day
        orders, trades, _summaries, _counts, _o, _t, _s = flex_xml.parse(str(xml_path), "TCF")
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
        print(f"token: {token}, query_id: {query_id}")
        try:
            from ib_async import FlexReport  # lazy: keep ib_async off the default drop path
        except ImportError as exc:
            raise FlexUnavailable(
                "ib_async is not installed — required for ib_flex_transport=live"
            ) from exc

        try:
            report = _cached_flex_report(FlexReport, token, query_id, self._ttl, day)
            # extract() yields ib_async DynamicObjects; the rest of the pipeline
            # (and DropFetcher) speaks plain str dicts. parseNumbers=False keeps
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


def get_fetcher() -> FlexFetcher:
    """Selects the active transport by ``settings.ib_flex_transport``."""
    settings = get_settings()
    if settings.ib_flex_transport == "live":
        return LiveFetcher(
            settings.ib_flex_token, settings.ib_flex_query_id, settings.ib_flex_cache_ttl_seconds
        )
    return DropFetcher(settings.ib_flex_drop_root)
