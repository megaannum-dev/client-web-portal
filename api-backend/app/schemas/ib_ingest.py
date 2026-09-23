from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class IbIngestRunOut(BaseModel):
    """Response for the manual `/mobo/ib-ingest` route -- flex_import.load's
    6-tuple (orders_inserted, orders_skipped, trades_inserted, trades_skipped,
    summaries_inserted, summaries_skipped), plus the day echoed back."""

    day: date
    orders_inserted: int
    orders_skipped: int
    trades_inserted: int
    trades_skipped: int
    summaries_inserted: int
    summaries_skipped: int
