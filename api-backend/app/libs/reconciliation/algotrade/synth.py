"""BE-8 — synthesize the AlgoTrade side of a reconciliation session directly
from a PostTradeAllocationRun's IB orders.

Called from PostTradeAllocationService.run(), inside its existing
`with self.db.begin_nested(): ...` transaction (same commit boundary — no
separate transaction here). One ReconSession per (trade_date, model) group,
matching the PTA run() loop's own granularity.

Strips IB-only fields (commissions, TCF metadata) — only
symbol/buySell/quantity/price/proceeds/tradeDate/currency/orderID/multiplier
cross into algotrade_orders. Uses `proceeds`, not `amount`, for notional — proceeds
is IB's signed trade value; the post_trade_allocation pipeline is built
on that same signed convention (see service.py's `traded` aggregation),
so recon's re-derived notional must match it or every buy-side allocation
compares against the wrong sign.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model
from app.models.post_trade_allocation import PostTradeAllocationRun
from app.models.recon import AlgoTradeExecution, AlgoTradeOrder, ReconSession, SourceKind
from app.models.reconciliation import Order


def synthesize_from_run(
    db: Session,
    *,
    run: PostTradeAllocationRun,
    period: AllocationPeriod,
    snapshot: AllocationModelSnapshot,
    orders: list[Order],
) -> ReconSession:
    """Called from PostTradeAllocationService.run(), inside its existing
    `with self.db.begin_nested(): ...` transaction (same commit boundary —
    no separate transaction here)."""
    session = ReconSession(
        id=uuid.uuid4(),
        trade_date=_parse_yyyymmdd(orders[0].tradeDate) if orders else run.created_at.date(),
        ib_run_id=run.id,
        allocation_period_id=snapshot.period_id,
        allocation_user_id=snapshot.user_id,
        allocation_model_id=snapshot.model_id,
    )
    db.add(session)
    db.flush()

    model = db.query(Model).filter(Model.id == snapshot.model_id).one()
    for o in orders:
        algo_order = AlgoTradeOrder(
            id=uuid.uuid4(),
            session_id=session.id,
            model_id=model.id,
            symbol=o.symbol or "",
            buy_sell=o.buySell or "",
            qty_ordered=Decimal(o.quantity or 0),
            price=Decimal(o.price or 0),
            notional=Decimal(o.proceeds or 0),
            trade_date=_parse_yyyymmdd(o.tradeDate),
            currency=o.currency or "USD",
            ib_order_id=o.orderID,
            contract_multiplier=Decimal(o.multiplier) if o.multiplier is not None else Decimal("1"),
            source_kind=SourceKind.SYNTHESIZED,
            derived_from_ib_run_id=run.id,
        )
        db.add(algo_order)
        db.flush()
        db.add(
            AlgoTradeExecution(
                id=uuid.uuid4(),
                order_id=algo_order.id,
                qty_filled=Decimal(o.quantity or 0),
                fill_price=Decimal(o.price or 0),
                fill_notional=Decimal(o.proceeds or 0),
                executed_at=run.created_at,
            )
        )
    db.flush()
    return session


def _parse_yyyymmdd(v: str | None) -> date:
    if not v:
        raise ValueError("order has no tradeDate; cannot synthesize a session")
    return date(int(v[0:4]), int(v[4:6]), int(v[6:8]))
