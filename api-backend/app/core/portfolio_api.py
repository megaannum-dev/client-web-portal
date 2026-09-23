"""IBKR portfolio balance API — the incoming replacement for the
``client_portfolios_*`` tables (which have readers but no writer).

Thin HTTP client over http://<host>:8000: ``/health``, ``/portfolio/accounts``,
``/portfolio/balance``, ``/portfolio/balance/history``. Responses are returned
as plain dicts matching that service's schemas; every failure (unreachable,
timeout, non-2xx) surfaces as ``PortfolioApiUnavailable``.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Any

import httpx

from app.core.config import get_settings


class PortfolioApiUnavailable(RuntimeError):
    """The balance API could not be reached, or answered with an error."""


@lru_cache
def _client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        base_url=settings.portfolio_api_url.rstrip("/"),
        timeout=settings.portfolio_api_timeout_seconds,
    )


def _get(path: str, **params: Any) -> dict[str, Any]:
    try:
        response = _client().get(path, params={k: v for k, v in params.items() if v is not None})
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]
    except httpx.HTTPError as exc:
        raise PortfolioApiUnavailable(f"{path}: {exc}") from exc


def health() -> dict[str, Any]:
    """Whether the data is readable, and how old the newest figure is."""
    return _get("/health")


def list_accounts() -> list[dict[str, Any]]:
    """Accounts with recorded history, each with its freshness."""
    return _get("/portfolio/accounts")["accounts"]  # type: ignore[no-any-return]


def current_balance(account: str | None = None) -> dict[str, Any]:
    """Latest figures for an account. Check ``stale_seconds`` before trusting
    it as live. ``account`` is optional only while one account is recorded."""
    return _get("/portfolio/balance", account=account)


def balance_history(
    start: date, end: date, account: str | None = None
) -> dict[str, Any]:
    """Balance at each US market close (16:00 New York) in ``[start, end]``,
    one entry per trading day, oldest first."""
    return _get(
        "/portfolio/balance/history",
        **{"from": start.isoformat(), "to": end.isoformat(), "account": account},
    )
