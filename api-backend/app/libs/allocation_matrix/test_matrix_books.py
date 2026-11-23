"""Allocation matrix columns carry required books; cells carry one account per book.

Units stay a single pooled number. Open and confirmed views both read the
live model row and the current client_ib_accounts rows. The snapshot keeps
its stored ib_account and the cell does not display that string.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/allocation_matrix/test_matrix_books.py
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models.pm  # noqa: F401 — registers tables
import app.models.users  # noqa: F401
from app.core.database import Base
from app.libs import client_ib_accounts
from app.libs.allocation_matrix.schemas import AllocationViewOut
from app.libs.allocation_matrix.service import AllocationService
from app.models.pm import (
    AllocationModelSnapshot,
    ClientSubscription,
    Model,
    ModelStatus,
)
from app.models.users import ClientProfile, Portal, User


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _only_cell(payload: dict) -> dict:
    assert len(payload["cells"]) == 1
    return next(iter(payload["cells"].values()))


def test_three_book_model_returns_three_accounts_and_one_unit_count(db):
    user = User(id=uuid.uuid4(), firebase_uid=uuid.uuid4().hex, portal=Portal.CLIENT)
    model = Model(
        id=uuid.uuid4(),
        name="Diversified",
        status=ModelStatus.LIVE,
        model_size=Decimal("10"),
        master_ib_account="F1111111",
        required_books=["inb", "pt", "dt"],
    )
    db.add(user)
    db.add(ClientProfile(user_id=user.id, name="Ada"))
    db.add(model)
    db.add(
        ClientSubscription(
            user_id=user.id, model_id=model.id, multiplier=Decimal("4")
        )
    )
    db.commit()
    for book, account in (("inb", "U3333333"), ("pt", "U2222222"), ("dt", "U1111111")):
        client_ib_accounts.ensure(
            db, user_id=user.id, model_id=model.id, book=book, account=account
        )
    db.commit()

    service = AllocationService(db)
    opened = service.derive_open_matrix()
    column = opened["models"][0]
    cell = _only_cell(opened)

    assert column["required_books"] == ["dt", "pt", "inb"]
    assert column["master_ib"] == "F1111111"
    assert column["col_units"] == 4
    assert cell["units"] == 4
    assert cell["fund"] == 40
    assert cell["accounts"] == [
        {"book": "dt", "account": "U1111111"},
        {"book": "pt", "account": "U2222222"},
        {"book": "inb", "account": "U3333333"},
    ]
    assert "client_ib" not in cell
    assert opened["count"] == 1

    parsed = AllocationViewOut.from_dict(
        opened, etag="e", periods=[], open_period_id=None
    )
    assert parsed.models[0].required_books == ["dt", "pt", "inb"]
    assert [item.model_dump() for item in next(iter(parsed.cells.values())).accounts] == cell["accounts"]

    period = service.create_period("Nov 2026")
    service.confirm_period(period.id, actor="uid")
    snap = (
        db.query(AllocationModelSnapshot)
        .filter_by(period_id=period.id, user_id=user.id, model_id=model.id)
        .one()
    )
    assert snap.ib_account == "U1111111"

    client_ib_accounts.reassign(
        db, user_id=user.id, model_id=model.id, book="pt", account="U4444444"
    )
    db.commit()

    confirmed = service.derive_confirmed_matrix(period.id)
    confirmed_column = confirmed["models"][0]
    confirmed_cell = _only_cell(confirmed)
    assert confirmed_column["required_books"] == ["dt", "pt", "inb"]
    assert confirmed_column["master_ib"] == "F1111111"
    assert confirmed_cell["units"] == 4
    assert confirmed_cell["fund"] == 40
    assert confirmed_cell["accounts"] == [
        {"book": "dt", "account": "U1111111"},
        {"book": "pt", "account": "U4444444"},
        {"book": "inb", "account": "U3333333"},
    ]
    assert "client_ib" not in confirmed_cell
    db.refresh(snap)
    assert snap.ib_account == "U1111111"
