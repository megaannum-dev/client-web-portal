# Assembles ReconciliationFlowViewOut from a ReconciliationResult + the three
# adapters. Presentation-only lookups (client roster, portfolio pre/post)
# live here rather than as adapter methods, so a future real-AlgoTrade-API
# swap only ever touches the adapters, never this file's row-shaping.
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.libs.reconciliation.dtos import ReconciliationResult
from app.libs.reconciliation.formatting import fmt_usd, pct_of
from app.models.pc import AllocationModelSnapshot, Model
from app.models.post_trade_allocation import ClientPortfolio
from app.models.recon import ReconSession
from app.models.users import ClientProfile
from app.schemas.reconciliation import (
    RcAllocModelLineOut,
    RcAllocOut,
    RcBreakCountsOut,
    RcExecOut,
    RcOrderOut,
    RcPortOut,
    ReconciliationFlowViewOut,
)


def _q2(v: Decimal) -> Decimal:
    """Round a Decimal to 2dp for a diagnostic note -- division results
    (e.g. pro-rata splits) can otherwise repeat forever when interpolated."""
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_wire(
    db: Session, session: ReconSession, result: ReconciliationResult
) -> ReconciliationFlowViewOut:
    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)
    crm = CRMAdapter(db)

    order_breaks_by_id = {b.order_id: b for b in result.order_breaks}
    client_model_breaks = {(b.client_id, b.model_id): b for b in result.client_model_breaks}
    crm_breaks_by_client = {b.client_id: b for b in result.crm_breaks}

    orders_out = [
        _build_order(db, algo, ib, o, order_breaks_by_id)
        for o in algo.orders_for_session(session.id)
    ]
    allocs_out = [
        _build_alloc(ib, session, row, client_model_breaks)
        for row in _client_model_rows(db, session)
    ]
    ports_out = [
        _build_port(crm, session, row, crm_breaks_by_client)
        for row in _portfolio_rows(db, session)
    ]

    counts = RcBreakCountsOut(
        algIbBrk=len(result.order_breaks) + len(result.client_model_breaks),
        ibCrmBrk=len(result.crm_breaks),
        algCrmBrk=len(result.crm_algo_breaks),
        totalBrk=(
            len(result.order_breaks)
            + len(result.client_model_breaks)
            + len(result.crm_breaks)
            + len(result.crm_algo_breaks)
        ),
    )

    return ReconciliationFlowViewOut(
        settleDay=session.trade_date.strftime("%d %b %Y"),
        orders=orders_out,
        allocs=allocs_out,
        ports=ports_out,
        algoTotal=fmt_usd(result.algo_total),
        ibTotal=fmt_usd(result.ib_total),
        crmTotal=fmt_usd(result.crm_total),
        counts=counts,
    )


def _build_order(
    db: Session, algo: AlgoTradeAdapter, ib: IBAdapter, o, order_breaks_by_id: dict
) -> RcOrderOut:
    model = db.query(Model).filter(Model.id == o.model_id).one()
    ib_order = ib.matching_order(
        symbol=o.symbol,
        buy_sell=o.buy_sell,
        trade_date_yyyymmdd=o.trade_date.strftime("%Y%m%d"),
        model_name=model.name,
    )
    brk = order_breaks_by_id.get(o.id)
    execs = [
        RcExecOut(
            id=str(e.id),
            qty=str(e.qty_filled),
            px=str(e.fill_price),
            t=e.executed_at.isoformat(),
            st="ok",
        )
        for e in algo.executions_for_order(o.id)
    ]
    return RcOrderOut(  # type: ignore[call-arg]  # not_ is the alias-populated field; runtime-valid, mypy misreads the alias
        id=str(o.id),
        m=model.name,
        inst=o.symbol,
        cat=o.asset_class,
        side=o.buy_sell,
        qty=str(o.qty_ordered),
        px=str(o.price),
        not_=fmt_usd(o.notional),
        notVal=float(o.notional),
        multiplier=float(o.contract_multiplier),
        ref=o.ib_order_id if o.ib_order_id is not None else str(o.id),
        ib=(ib_order.orderID or "") if ib_order is not None else "",
        st="brk" if brk is not None else "ok",
        execs=execs,
        brk=(
            f"{brk.field}: expected {brk.expected} actual {brk.actual}" if brk is not None else None
        ),
    )


def _client_model_rows(db: Session, session: ReconSession):
    return (
        db.query(ClientProfile, AllocationModelSnapshot, Model)
        .join(AllocationModelSnapshot, AllocationModelSnapshot.model_id == Model.id)
        .join(ClientProfile, ClientProfile.user_id == AllocationModelSnapshot.user_id)
        .filter(
            Model.id == session.allocation_model_id,
            AllocationModelSnapshot.period_id == session.allocation_period_id,
        )
        .all()
    )


def _build_alloc(
    ib: IBAdapter, session: ReconSession, row, client_model_breaks: dict
) -> RcAllocOut:
    client, snapshot, model = row
    brk = client_model_breaks.get((client.id, model.id))
    amt = ib.allocated_for_client_model(session.ib_run_id, client.id, model.id)
    line = RcAllocModelLineOut(
        m=model.name,
        units=float(snapshot.multiplier),
        amt=fmt_usd(amt),
        amtVal=float(amt),
        st="brk" if brk is not None else "ok",
        note=(
            f"expected {_q2(brk.expected)} actual {_q2(brk.actual)}" if brk is not None else None
        ),
    )
    return RcAllocOut(
        cid=str(client.id),
        client=client.name or "",
        st=line.st,
        total=line.amt,
        totalVal=line.amtVal,
        models=[line],
    )


def _portfolio_rows(db: Session, session: ReconSession):
    return (
        db.query(ClientProfile, ClientPortfolio)
        .join(ClientPortfolio, ClientPortfolio.user_id == ClientProfile.user_id)
        .join(
            AllocationModelSnapshot,
            AllocationModelSnapshot.user_id == ClientProfile.user_id,
        )
        .filter(
            AllocationModelSnapshot.period_id == session.allocation_period_id,
            AllocationModelSnapshot.model_id == session.allocation_model_id,
        )
        .all()
    )


def _build_port(
    crm: CRMAdapter, session: ReconSession, row, crm_breaks_by_client: dict
) -> RcPortOut:
    client, portfolio = row
    brk = crm_breaks_by_client.get(client.id)
    chg = crm.portfolio_delta_for_run(session.ib_run_id, client.user_id)
    post = portfolio.amount_in_trade
    pre = post - chg
    return RcPortOut(
        cid=str(client.id),
        client=client.name or "",
        st="brk" if brk is not None else "ok",
        pre=fmt_usd(pre),
        post=fmt_usd(post),
        chg=fmt_usd(chg),
        pct=pct_of(chg, pre),
        inTrade=float(portfolio.amount_in_trade),
        cash=float(portfolio.cash_deposit),
        total=float(portfolio.amount_in_trade + portfolio.cash_deposit),
    )
