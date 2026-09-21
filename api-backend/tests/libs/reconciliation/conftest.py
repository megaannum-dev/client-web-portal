"""Shared fixtures/factories for tests/libs/reconciliation tests.

Pruned to what the surviving tests need (test_be8_synth.py,
test_be4_delete_unconsumed_routes.py) after Stage-1 012/015 demolition.
test_be4_delete_unconsumed_routes.py builds its own in-memory engine locally
and pulls its factories from tests/conftest.py + tests/libs/auth/conftest.py;
the `engine`/`session` fixtures here are kept for other consumers.

Layer isolation: only imports from app/libs/reconciliation/, app/models/,
and stdlib/pytest -- no sibling -db/-fe code.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model, ModelStatus, PeriodStatus
from app.models.post_trade_allocation import PostTradeAllocationRun, RunStatus, RunTrigger
from app.models.reconciliation import Order
from app.models.users import Portal, User


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def session(engine):
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def make_user(session, *, email: str = "client@example.com", portal: Portal = Portal.CLIENT) -> User:
    user = User(
        id=uuid.uuid4(),
        firebase_uid=f"uid-{uuid.uuid4()}",
        email=email,
        portal=portal,
    )
    session.add(user)
    session.flush()
    return user


def make_model(session, *, name: str = "Zero", status: ModelStatus = ModelStatus.LIVE) -> Model:
    model = Model(id=uuid.uuid4(), name=name, status=status)
    session.add(model)
    session.flush()
    return model


def make_confirmed_period(
    session, *, label: str | None = None, confirmed_at: datetime | None = None
) -> AllocationPeriod:
    period = AllocationPeriod(
        id=uuid.uuid4(),
        label=label or f"P-CONFIRMED-{uuid.uuid4().hex[:8]}",
        status=PeriodStatus.CONFIRMED,
        confirmed_at=confirmed_at or datetime.now(timezone.utc),
    )
    session.add(period)
    session.flush()
    return period


def make_snapshot(
    session, *, period, model, user, multiplier, ib_account: str | None = "U-0001"
) -> AllocationModelSnapshot:
    snap = AllocationModelSnapshot(
        period_id=period.id,
        user_id=user.id,
        model_id=model.id,
        multiplier=Decimal(str(multiplier)),
        ib_account=ib_account,
    )
    session.add(snap)
    session.flush()
    return snap


def make_pta_run(
    session,
    *,
    period,
    trade_date: str = "20260603",
    status: RunStatus = RunStatus.COMPLETED,
    trigger: RunTrigger = RunTrigger.MANUAL,
    grand_total=Decimal("0"),
) -> PostTradeAllocationRun:
    run = PostTradeAllocationRun(
        id=uuid.uuid4(),
        trade_date=trade_date,
        period_id=period.id,
        status=status,
        trigger=trigger,
        grand_total=Decimal(str(grand_total)),
    )
    session.add(run)
    session.flush()
    return run


def make_ib_order(
    session,
    *,
    symbol: str = "MSFT",
    buy_sell: str = "BUY",
    trade_date: str = "20260603",
    model: str = "Zero",
    quantity=100,
    price=50,
    amount=5000,
    proceeds=None,
    currency: str = "USD",
    account_id: str = "U-1234567",
    order_id: str | None = None,
    multiplier=1,
) -> Order:
    order = Order(
        id=uuid.uuid4(),
        symbol=symbol,
        buySell=buy_sell,
        tradeDate=trade_date,
        model=model,
        quantity=Decimal(str(quantity)),
        price=Decimal(str(price)),
        amount=Decimal(str(amount)),
        proceeds=Decimal(str(proceeds if proceeds is not None else amount)),
        currency=currency,
        accountId=account_id,
        orderID=order_id or f"O-{uuid.uuid4()}",
        multiplier=Decimal(str(multiplier)),
    )
    session.add(order)
    session.flush()
    return order
