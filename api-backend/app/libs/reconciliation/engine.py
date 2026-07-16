from __future__ import annotations

import uuid
from collections.abc import Iterator
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.libs.reconciliation.dtos import (
    ClientModelBreak,
    CrmAlgoBreak,
    CrmBreak,
    OrderBreak,
    ReconciliationResult,
)
from app.models.pc import AllocationModelSnapshot, Model
from app.models.recon import AlgoTradeOrder, ReconSession
from app.models.reconciliation import Order
from app.models.users import ClientProfile


def _epsilon() -> Decimal:
    return Decimal(str(get_settings().recon_notional_epsilon))


def _client_user_pairs(db: Session) -> list[tuple[int, uuid.UUID]]:
    """Every (client_id, user_id) pair, for the IB<->CRM per-client step."""
    rows = db.query(ClientProfile.id, ClientProfile.user_id).all()
    return [(client_id, user_id) for client_id, user_id in rows]


def _model_name(db: Session, model_id: uuid.UUID) -> str:
    model = db.get(Model, model_id)
    return model.name if model is not None else ""


def _client_model_expected_actual(
    db: Session, session: ReconSession, algo: AlgoTradeAdapter, ib: IBAdapter
) -> Iterator[tuple[int, uuid.UUID, Decimal, Decimal]]:
    """For every client with a frozen allocation snapshot for the recon
    session's period+model, yield (client_id, model_id, expected, actual)
    where expected is IB's allocation for that (run, client, model) and
    actual is the client's pro-rata share of the session's algo notional
    total (multiplier / sum of multipliers -- mirrors
    PostTradeAllocationService._split, which reads AllocationModelSnapshot
    -- the FROZEN copy taken at confirm-time -- not live ClientSubscription;
    a subscription edited after confirm must not change what this compares
    against)."""
    model_id = session.allocation_model_id
    snapshots = (
        db.query(AllocationModelSnapshot)
        .filter(
            AllocationModelSnapshot.period_id == session.allocation_period_id,
            AllocationModelSnapshot.model_id == model_id,
        )
        .all()
    )
    total_multiplier = sum((s.multiplier for s in snapshots), Decimal("0"))
    if total_multiplier == 0:
        return  # ponytail: no subscribers to split against, nothing to compare
    algo_total = algo.total_notional(session.id)

    for snapshot in snapshots:
        client = (
            db.query(ClientProfile).filter(ClientProfile.user_id == snapshot.user_id).one_or_none()
        )
        if client is None:
            continue
        expected = ib.allocated_for_client_model(session.ib_run_id, client.id, model_id)
        actual = (snapshot.multiplier / total_multiplier) * algo_total
        yield client.id, model_id, expected, actual


def _order_field_comparisons(
    order: AlgoTradeOrder, ib_order: Order | None
) -> Iterator[tuple[str, Decimal, Decimal]]:
    """qty/price comparisons for one algo order against its matched IB order.
    ponytail: no IB match, or the matched IB row is missing that field (all
    IB source columns are nullable) -> nothing to compare for that field,
    skip silently rather than manufacturing a break out of missing data."""
    if ib_order is None:
        return
    if ib_order.quantity is not None:
        yield "qty", order.qty_ordered, ib_order.quantity
    if ib_order.price is not None:
        yield "price", order.price, ib_order.price


def reconcile(db: Session, session_id: uuid.UUID) -> ReconciliationResult:
    session = db.get(ReconSession, session_id)
    if session is None:
        raise ValueError(f"unknown recon session {session_id}")

    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)
    crm = CRMAdapter(db)
    eps = _epsilon()

    # --- Stage 1: coarse (row-level aggregate) ---------------------------
    algo_total = algo.total_notional(session_id)
    ib_total = ib.total_allocated(session.ib_run_id)
    crm_total = crm.total_amount_in_trade()

    coarse_ok = (
        abs(algo_total - ib_total) <= eps
        and abs(ib_total - crm_total) <= eps
        and abs(algo_total - crm_total) <= eps
    )

    result = ReconciliationResult(
        coarse_ok=coarse_ok, algo_total=algo_total, ib_total=ib_total, crm_total=crm_total
    )
    if coarse_ok:
        return result  # zero fine-grained queries run

    # --- Stage 2: fine-grained, fixed sequence ---------------------------
    # Step 1 -- IB <-> CRM, per client.
    crm_ok_by_client: dict[int, bool] = {}
    for client_id, user_id in _client_user_pairs(db):
        expected = ib.allocated_for_client_model_total(session.ib_run_id, client_id)
        actual = crm.portfolio_delta_for_run(session.ib_run_id, user_id)
        ok = abs(expected - actual) <= eps
        crm_ok_by_client[client_id] = ok
        if not ok:
            result.crm_breaks.append(
                CrmBreak(
                    client_id=client_id, expected=expected, actual=actual, delta=actual - expected
                )
            )

    # Step 2 -- IB <-> AlgoTrade, per (client, model).
    algo_ok_by_client_model: dict[tuple[int, uuid.UUID], bool] = {}
    client_model_rows = _client_model_expected_actual(db, session, algo, ib)
    for client_id, model_id, expected, actual in client_model_rows:
        ok = abs(expected - actual) <= eps
        algo_ok_by_client_model[(client_id, model_id)] = ok
        if not ok:
            result.client_model_breaks.append(
                ClientModelBreak(
                    client_id=client_id,
                    model_id=model_id,
                    expected=expected,
                    actual=actual,
                    delta=actual - expected,
                )
            )

    # Step 3 -- AlgoTrade <-> IB, per order.
    for order in algo.orders_for_session(session_id):
        ib_order = ib.matching_order(
            symbol=order.symbol,
            buy_sell=order.buy_sell,
            trade_date_yyyymmdd=order.trade_date.strftime("%Y%m%d"),
            model_name=_model_name(db, order.model_id),
        )
        for field_name, expected, actual in _order_field_comparisons(order, ib_order):
            if abs(expected - actual) > eps:
                result.order_breaks.append(
                    OrderBreak(
                        order_id=order.id,
                        field=field_name,
                        expected=expected,
                        actual=actual,
                        delta=actual - expected,
                    )
                )

    # Step 4 -- CRM <-> AlgoTrade, DERIVED (not independently computed).
    for (client_id, model_id), algo_ok in algo_ok_by_client_model.items():
        crm_ok = crm_ok_by_client.get(client_id, True)
        if not (crm_ok and algo_ok):
            if not crm_ok and not algo_ok:
                reason = "both"
            else:
                reason = "ib_crm" if not crm_ok else "ib_algo"
            result.crm_algo_breaks.append(
                CrmAlgoBreak(client_id=client_id, model_id=model_id, reason=reason)
            )

    return result
