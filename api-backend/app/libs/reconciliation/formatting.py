from decimal import Decimal


def fmt_usd(v: Decimal) -> str:
    """Mirrors flow-types.ts fmtUsd: '$X.XXM' at/above 1e6, else '$X,XXX'."""
    abs_v = abs(v)
    if abs_v >= 1_000_000:
        return f"${v / Decimal(1_000_000):.2f}M"
    return f"${v:,.0f}"


def pct_of(part: Decimal, whole: Decimal) -> str:
    """Mirrors flow-types.ts pctOf: '0%' when whole is zero, else rounded integer percent."""
    if whole == 0:
        return "0%"
    return f"{round(part / whole * 100)}%"
