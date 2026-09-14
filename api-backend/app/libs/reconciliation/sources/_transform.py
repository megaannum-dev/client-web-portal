"""Shared transforms for the reconciliation sources (CRM, IB, PC).

The ONLY module in the codebase permitted to do timezone conversion — every
source's timestamp parsing exits through :func:`et_to_utc`, so both DST
offsets (EDT −4 / EST −5) are handled in exactly one place. Pure: no DB, no
I/O, no logging, no settings.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

_ET = ZoneInfo("America/New_York")
_EXCEL_EPOCH = datetime(1899, 12, 30)


def osi_strip(sym: str | None) -> str | None:
    """'SPY   260811C00774000' -> 'SPY260811C00774000'. IB and PC both pad OSI to 21 chars."""
    if not sym:
        return None
    return sym.replace(" ", "") or None


def parse_day(v: str | date | None) -> date | None:
    """date passthrough | 'YYYYMMDD' string -> date. None on empty/garbage."""
    if v is None:
        return None
    if isinstance(v, date):
        return v
    v = v.strip()
    if not v:
        return None
    try:
        return datetime.strptime(v, "%Y%m%d").date()
    except ValueError:
        return None


def et_to_utc(naive_et: datetime) -> datetime:
    """Eastern-naive -> tz-aware UTC. Never a fixed offset — DST-aware via ZoneInfo."""
    return naive_et.replace(tzinfo=_ET).astimezone(ZoneInfo("UTC"))


def et_date(aware_utc: datetime) -> date:
    """UTC instant -> ET session date."""
    return aware_utc.astimezone(_ET).date()


def _parse_one_ts(v: str) -> datetime | None:
    """Eastern-naive datetime from one non-empty raw value, or None if unparseable."""
    if ";" in v:
        # 'YYYYMMDD;HHMMSS'
        try:
            return datetime.strptime(v, "%Y%m%d;%H%M%S")
        except ValueError:
            return None
    try:
        # Excel serial float, e.g. '46261.47920138889'
        serial = float(v)
        return _EXCEL_EPOCH + timedelta(days=serial)
    except ValueError:
        pass
    # ISO-ish fallback
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


def parse_flex_ts(primary: str | None, fallback: str | None) -> datetime | None:
    """coalesce(nullif(primary,''), fallback) then parse -> tz-aware UTC.

    Branches, all Eastern-naive and all exiting through et_to_utc():
      'YYYYMMDD;HHMMSS'          (orders/trades tables and Flex XML)
      Excel serial float          datetime(1899,12,30) + timedelta(days=n)
      ISO-ish                     fallback
    """
    raw = primary if primary else fallback
    if not raw:
        return None
    naive_et = _parse_one_ts(raw)
    if naive_et is None:
        return None
    return et_to_utc(naive_et)


def asset_category(v: str | None) -> str | None:
    """'OPT' -> 'equity_option'. Pass through anything else unchanged."""
    if v == "OPT":
        return "equity_option"
    return v


def flip_fee(commission: Decimal | str | None) -> Decimal | None:
    """IB stores a NEGATIVE charge; the unified view wants a POSITIVE magnitude."""
    if commission is None:
        return None
    try:
        d = commission if isinstance(commission, Decimal) else Decimal(commission)
    except InvalidOperation:
        return None
    return -d


def demo() -> None:
    # 1. DST — the load-bearing one.
    assert et_to_utc(datetime(2026, 8, 11, 9, 30)) == datetime(
        2026, 8, 11, 13, 30, tzinfo=ZoneInfo("UTC")
    )
    assert et_to_utc(datetime(2026, 11, 11, 9, 30)) == datetime(
        2026, 11, 11, 14, 30, tzinfo=ZoneInfo("UTC")
    )

    # 2. OSI strip.
    assert (
        osi_strip("SPY   260828C00774000")
        == osi_strip("SPY 260828C00774000")
        == "SPY260828C00774000"
    )

    # 3. Excel serial, pinning epoch + et_to_utc exit.
    got = parse_flex_ts("46261.47920138889", None)
    expected_naive = _EXCEL_EPOCH + timedelta(days=46261.47920138889)
    assert got == et_to_utc(expected_naive)
    assert got is not None and got.tzinfo is not None

    # 4. Fee flip.
    flipped = flip_fee(Decimal("-1.0506"))
    assert flipped == Decimal("1.0506")
    assert flipped is not None and flipped >= 0

    # 5. parse_day.
    assert parse_day("20260828") == date(2026, 8, 28)
    assert parse_day(date(2026, 8, 28)) == date(2026, 8, 28)
    assert parse_day("") is None
    assert parse_day(None) is None

    # 6. 'YYYYMMDD;HHMMSS' + empty-primary fallback.
    expected = datetime(2026, 8, 11, 19, 45, 1, tzinfo=ZoneInfo("UTC"))
    assert parse_flex_ts("20260811;154501", None) == expected
    assert parse_flex_ts("", "20260811;154501") == expected

    print("app.libs.reconciliation.sources._transform: all checks passed")


if __name__ == "__main__":
    demo()
