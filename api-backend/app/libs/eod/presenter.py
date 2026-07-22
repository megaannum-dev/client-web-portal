from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.libs.reconciliation.dtos import ReconciliationResult
from app.libs.reconciliation.formatting import fmt_usd
from app.libs.reconciliation.presenter import (
    _build_alloc,
    _build_order,
    _build_port,
    _client_model_rows,
    _portfolio_rows,
)
from app.models.recon import ReconSession
from app.schemas.reconciliation import RcAllocOut, RcOrderOut, RcPortOut


def merge_day_view(
    db: Session, sessions: list[ReconSession], results: list[ReconciliationResult]
) -> tuple[list[RcOrderOut], list[RcAllocOut], list[RcPortOut], str, str, str]:
    """One (session, result) pair per model group traded that day (§B) — concatenate
    every session's rows rather than picking "the latest", since a day with N
    models produces N sessions that all belong in one EoD report."""
    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)
    crm = CRMAdapter(db)

    orders_out: list[RcOrderOut] = []
    allocs_out: list[RcAllocOut] = []
    ports_out: list[RcPortOut] = []
    algo_total = ib_total = crm_total = Decimal("0")

    for session, result in zip(sessions, results, strict=True):
        order_breaks_by_id = {b.order_id: b for b in result.order_breaks}
        client_model_breaks = {(b.client_id, b.model_id): b for b in result.client_model_breaks}
        crm_breaks_by_client = {b.client_id: b for b in result.crm_breaks}

        orders_out += [
            _build_order(db, algo, ib, o, order_breaks_by_id)
            for o in algo.orders_for_session(session.id)
        ]
        allocs_out += [
            _build_alloc(ib, session, row, client_model_breaks)
            for row in _client_model_rows(db, session)
        ]
        ports_out += [
            _build_port(crm, session, row, crm_breaks_by_client)
            for row in _portfolio_rows(db, session)
        ]
        algo_total += result.algo_total
        ib_total += result.ib_total
        crm_total += result.crm_total

    return (
        orders_out,
        allocs_out,
        ports_out,
        fmt_usd(algo_total),
        fmt_usd(ib_total),
        fmt_usd(crm_total),
    )
