"""Client detail lists every assigned account per subscribed model.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/clients/test_list_subscriptions_accounts.py
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models.pm  # noqa: F401
import app.models.users  # noqa: F401
from app.core.database import Base
from app.libs import client_ib_accounts
from app.libs.clients.repository import ClientRepository
from app.models.pm import ClientSubscription, Model
from app.models.users import Portal, User


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _client(db) -> User:
    user = User(id=uuid.uuid4(), firebase_uid=uuid.uuid4().hex, portal=Portal.CLIENT)
    db.add(user)
    db.commit()
    return user


def _model(db, name: str) -> Model:
    model = Model(id=uuid.uuid4(), name=name, model_size=Decimal("10"))
    db.add(model)
    db.commit()
    return model


def test_list_subscriptions_returns_every_book_in_order(db):
    client = _client(db)
    diversified = _model(db, "Diversified")
    zero = _model(db, "Zero")
    db.add(
        ClientSubscription(
            user_id=client.id, model_id=diversified.id, multiplier=Decimal("1")
        )
    )
    db.add(
        ClientSubscription(
            user_id=client.id, model_id=zero.id, multiplier=Decimal("1")
        )
    )
    db.commit()
    client_ib_accounts.ensure(
        db, user_id=client.id, model_id=diversified.id, book="inb", account="U17935787"
    )
    client_ib_accounts.ensure(
        db, user_id=client.id, model_id=diversified.id, book="dt", account="U17828576"
    )
    client_ib_accounts.ensure(
        db, user_id=client.id, model_id=diversified.id, book="pt", account="U18018569"
    )
    client_ib_accounts.ensure(
        db, user_id=client.id, model_id=zero.id, book="dt", account="U1111111"
    )
    db.commit()

    rows = {row.model: row for row in ClientRepository(db).list_subscriptions(client.id)}
    assert rows["Diversified"].accounts == [
        {"book": "dt", "account": "U17828576"},
        {"book": "pt", "account": "U18018569"},
        {"book": "inb", "account": "U17935787"},
    ]
    assert rows["Zero"].accounts == [{"book": "dt", "account": "U1111111"}]
