"""Shared transforms for the reconciliation sources (CRM, IB, PC).

The ONLY module in the codebase permitted to do timezone conversion — every
source's timestamp parsing exits through :func:`et_to_utc`, so both DST
offsets (EDT −4 / EST −5) are handled in exactly one place. Pure: no DB, no
I/O, no logging, no settings.

`asset_class` is source-agnostic and is moving to serve the reconciliation
layer directly (rather than each source) in a later commit.
"""

from __future__ import annotations

from collections.abc import Callable
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


def _descrpt_option(
    underlying: str, expiry: date, right: str, strike: Decimal, contract: str | None
) -> str | None:
    """'SPY' + 2026-08-20 + 'C' + Decimal('766.0000') -> 'SPY 20AUG26 766 C'.

    Verified byte-identical against IB's native `description` column on
    771/771 option rows. Do NOT simplify the strike formatting: `normalize()`
    alone emits exponent notation for round numbers (e.g. '7.66E+2'), and the
    trailing `quantize(Decimal(1))` is what forces plain-integer output.
    """
    n = strike.normalize()
    if n == n.to_integral():
        n = n.quantize(Decimal(1))
    return f"{underlying} {expiry.strftime('%d%b%y').upper()} {n} {right.upper()}"


# ponytail: category -> formatter registry. Only one category (options) has a
# bespoke format today. The day a SECOND category needs its own formatter,
# swap the shape-based inference in descrpt() below for an explicit
# `security_type` argument instead of guessing from which fields are present.
_DESCRPT: dict[str, Callable[..., str | None]] = {"OPT": _descrpt_option}


def descrpt(
    underlying: str | None,
    expiry: date | None,
    right: str | None,
    strike: Decimal | None,
    contract: str | None,
    rules: dict[str, Callable[..., str | None]] = _DESCRPT,
) -> str | None:
    """'SPY' + 2026-08-20 + 'C' + Decimal('766.0000') -> 'SPY 20AUG26 766 C'.

    Any of underlying/expiry/right/strike missing (a non-option row) falls
    back to osi_strip(contract), then underlying, then None. Never raises.
    """
    # ponytail: category inferred from row shape (identical condition to the
    # old inline `if`, so output stays byte-for-byte unchanged); swap for an
    # explicit security_type arg once a second category needs its own rule.
    if underlying and expiry and right and strike is not None:
        fmt = rules.get("OPT")
        if fmt is not None:
            return fmt(underlying, expiry, right, strike, contract)
    return osi_strip(contract) or underlying or None


# ponytail: known ceiling — IB's native `description` for a STOCK is a company
# long name ('TESLA INC', 'SS SPDR S&P 500 ETF TRUST-US'), which no formatting
# rule can derive from the ticker ('TSLA'): 0/6 match. This is COSMETIC ONLY
# once the trade-grouping key moves to `symbol` (a later commit). Upgrade path:
# read IB/CRM's native `description` column (100% populated) instead of
# synthesizing one on PC/IB.
_ASSET_RULES = {
    # IB's Flex export says 'OPT'/'STK'; PC's engine says 'equity_option'.
    # Keys are UPPER-CASED for matching. A new dialect adds a LINE, not a branch.
    "cat": {"OPT": "OPT", "EQUITY_OPTION": "OPT"},
    # IB/CRM carry `subCategory` ('C'/'P' on options, 'COMMON'/'ETF' on stock);
    # PC carries `option_right`. Unlisted values pass through upper-cased, same
    # as "cat" -- dropping them would discard real sub-classification and hide a
    # genuine cross-system disagreement behind a pair of Nones.
    "sub": {"C": "CALL", "P": "PUT"},
}


def asset_class(
    security_type: str | None, right: str | None, rules: dict[str, dict[str, str]] = _ASSET_RULES
) -> tuple[str | None, str | None]:
    """Fold of the old asset_category(): {'OPT','equity_option'} -> 'OPT',
    then a normalized sub-category ('CALL'/'PUT', or a stock's 'COMMON'/'ETF')
    from right. Unknown values pass through upper-cased on BOTH halves;
    only a missing value yields None. Case-insensitive. Returns (cat, sub) now, not a joined
    string -- the fold into one display string moved to the reconciliation
    layer (unified.py), the only caller left.
    """
    if security_type is None:
        return None, None
    cat = rules["cat"].get(security_type.upper(), security_type.upper())
    if not right:
        return cat, None
    return cat, rules["sub"].get(right.upper(), right.upper())


def venue(exchange: str | None, listing: str | None) -> str | None:
    """'exchange or listingExchange'. Mirrors records.py:82 _market() -- a
    2-line copy here rather than importing the legacy records module into
    sources/ (wrong dependency direction).
    """
    return exchange or listing or None


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

    # 7. descrpt -- canonical, fractional strike, non-option fallback.
    assert descrpt("SPY", date(2026, 8, 20), "C", Decimal("766.0000"), None) == "SPY 20AUG26 766 C"
    assert descrpt("SPY", date(2026, 8, 20), "P", Decimal("767.50"), None) == "SPY 20AUG26 767.5 P"
    assert descrpt(None, None, None, None, "SPY   260828C00774000") == "SPY260828C00774000"
    assert descrpt(None, None, None, None, None) is None

    # 8. asset_class.
    assert asset_class("equity_option", "C") == ("OPT", "CALL")
    assert asset_class("OPT", "P") == ("OPT", "PUT")
    assert asset_class("STK", None) == ("STK", None)
    assert asset_class(None, "C") == (None, None)

    # 9. venue.
    assert venue("CBOE", None) == "CBOE"
    assert venue(None, "CBOE2") == "CBOE2"
    assert venue(None, None) is None

    # 10. Cross-source parity -- the invariant the whole matcher rests on.
    # PC and IB describe the same option contract with different types/padding
    # (Decimal("774.0000") vs Decimal("774"), OSI padded vs unpadded). If these
    # ever disagree, _tree buckets them as two different trades and _reconcile
    # reports both sides as missing when they're really the same trade.
    pc_args = ("SPY", date(2026, 8, 28), "C", Decimal("774.0000"), "SPY   260828C00774000")
    ib_args = ("SPY", date(2026, 8, 28), "C", Decimal("774"), "SPY 260828C00774000")
    assert descrpt(*pc_args) == descrpt(*ib_args) == "SPY 28AUG26 774 C"
    assert asset_class("equity_option", "C") == asset_class("OPT", "C") == ("OPT", "CALL")
    assert osi_strip(pc_args[4]) == osi_strip(ib_args[4]) == "SPY260828C00774000"
    assert descrpt(None, None, None, None, "TSLA") == "TSLA"  # pinned STK ceiling

    print("app.libs.reconciliation.sources._transform: all checks passed")


if __name__ == "__main__":
    demo()
