"""Daily IB Flex ingest: download -> validate in memory -> load DB -> archive raw XML.

Ordering is load-bearing (each step's comment says why): parse and verify
BEFORE writing anything, write the canonical storage key LAST. The Flex Web
Service answers HTTP 200 even for a bad token / unpermitted query --
`<FlexStatementResponse><Status>Fail</Status>...` -- and if that payload ever
reached the canonical key it would sit there forever and get served to
reconciliation (`app.core.flex_query.StoredFetcher`) every day after. A failed
ingest must leave the previous good file untouched.

Lives in app/core/ rather than app/libs/: it has no repository layer and
no HTTP surface of its own -- the scheduler calls ingest_day() directly, and
nothing else does. It imports only from app.core, which is what made the
feature-package wrapper it used to sit in pure overhead.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time
from io import BytesIO
from zoneinfo import ZoneInfo

from app.core import flex_import
from app.core.flex_query import download_day
from app.core.storage import Bucket, get_storage

logger = logging.getLogger(__name__)

_MARKET_TZ = ZoneInfo("America/New_York")

# ponytail: hardcoded US-market close, deliberately NOT a setting. The
# schedule that calls ingest_day is an operator preference and can move
# earlier; the market close is not, and the guard below must still hold at
# 18:00 regardless. Promote to a setting only if a non-US-market instance
# ever needs a different close.
_AFTER_MARKET = time(18, 0)  # ET


class MarketStillOpen(RuntimeError):
    """`day` is today (or later) and it isn't after market close yet."""


class IngestFailed(RuntimeError):
    """The Flex response was not a usable statement for `day`."""


def _is_fail_envelope(raw: bytes) -> bool:
    """Detect the Flex Web Service's HTTP-200 failure envelope.

    `flex_import.detect_type` only recognizes `<FlexQueryResponse type=...>` and
    raises a generic "not a Flex export" SystemExit on anything else --
    including a Fail envelope. Check for it explicitly first so a bad
    token/query id fails with a clear, catchable error instead of falling
    through to that generic message (or, worse, an empty-but-"successful"
    parse if the shape ever changes).
    """
    head = raw[:512]
    return b"<FlexStatementResponse" in head and b"<Status>Fail" in head


def ingest_day(day: date, *, now: datetime | None = None) -> tuple[int, int, int, int, int, int]:
    """Ingest one day's IB Flex statement. Returns flex_import.load's 6-tuple
    (orders_inserted, orders_skipped, trades_inserted, trades_skipped,
    summaries_inserted, summaries_skipped).

    Idempotent: flex_import.load's dedup (on orders.orderID / trades.execID,
    or the 7-column fallback key) makes a re-run of the same day a no-op
    insert-wise; save_at re-writing the same bytes at the same key is a
    no-op too.
    """
    now = now or datetime.now(_MARKET_TZ)
    # A past day is fetchable at any hour, so backfill and the caller's
    # multi-day catch-up window work; only the in-progress session is
    # refused, and only until the close. Guard lives here, not in each
    # caller (scheduler, route) -- one shared check instead of one per
    # caller that a sibling path can forget.
    #
    # A FUTURE day is refused outright, at any hour. It is not merely
    # pointless: storage keys are named after the requested day, and
    # reconciliation's build_view resolves an omitted `day` to the LATEST day
    # across sources -- so one future-dated file would hijack the default
    # reconciliation view until someone deleted it by hand.
    if day > now.date():
        raise MarketStillOpen(f"{day} is in the future — refusing to ingest")
    if day == now.date() and now.time() < _AFTER_MARKET:
        raise MarketStillOpen(
            f"{day} is still in progress — refusing to ingest before market close"
        )

    raw = download_day(day).data  # bytes

    # Parse (and validate) fully in memory BEFORE any write -- see module
    # docstring. `detect_type`/`parse` need a fresh stream each (iterparse is
    # forward-only), hence a new BytesIO per call over the same bytes.
    if _is_fail_envelope(raw):
        raise IngestFailed(f"Flex Web Service returned a Fail envelope for {day}")

    file_type = flex_import.detect_type(BytesIO(raw))
    orders, trades, summaries, _counts, *_ = flex_import.parse(BytesIO(raw), file_type)

    # Not paranoia: the saved query's own period ("Today") can override the
    # fd/td URL params download_day relies on to scope the request --
    # LiveFetcher.fetch already re-filters on tradeDate for exactly this
    # reason (evidence it has happened). Storing the raw response bypasses
    # that defence, so a wrong-range statement would be filed under today's
    # name unless verified here, before writing anything.
    day_str = f"{day:%Y%m%d}"
    for row in (*orders, *trades, *summaries):
        trade_date = row.get("tradeDate")
        if trade_date is not None and trade_date != day_str:
            raise IngestFailed(
                f"row tradeDate {trade_date!r} does not match requested day {day_str}"
            )

    counts = flex_import.load(orders, trades, summaries, mode="append", batch_size=1000)
    # ponytail: append-mode + execID/orderID dedup means an IB-amended or
    # busted confirm re-sent under the same execID is silently skipped and
    # the stale row stays -- no upsert path exists yet. Upgrade: upsert-on-
    # change for trades, or at minimum a WARNING when a non-key field
    # differs from what's already stored.

    # Store last, so a parse/load failure never publishes a bad file. The
    # reverse window -- rows loaded but save_at then fails -- self-heals: the
    # caller's multi-day re-ingest re-downloads, dedups to zero inserts, and
    # writes the file again.
    storage = get_storage(Bucket.IB_FLEX)
    storage.save_at(BytesIO(raw), f"trade-confirm/{day:%Y-%m}/ib_trades_{day:%Y%m%d}.xml")

    orders_ins, orders_skip, trades_ins, trades_skip, summaries_ins, summaries_skip = counts
    logger.info(
        "ib_ingest day=%s orders=%d/%d trades=%d/%d summaries=%d/%d",
        day, orders_ins, orders_skip, trades_ins, trades_skip, summaries_ins, summaries_skip,
    )
    # Keyed on what IB SENT, never on what was inserted: the caller re-ingests
    # a multi-day window, so a day fetched yesterday legitimately inserts 0
    # today (every row dedup-skipped) and an inserted-count test would warn
    # every weekday. A real no-trade weekday statement is small (~813 bytes,
    # an empty <TradeConfirms/>) but valid, and is still stored above so
    # `StoredFetcher.days()` lists the day. WARNING is what makes a dead
    # token distinguishable from a genuinely quiet market.
    if not orders and not trades and not summaries and day.weekday() < 5:
        logger.warning(
            "ib_ingest: %s is a weekday but the statement was empty — "
            "verify the token/query id are still valid", day
        )

    return counts
