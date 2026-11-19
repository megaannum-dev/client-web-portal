"""New subscription takes one account per required book.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/onboarding/test_subscription_accounts.py
"""

import json
import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models.onboarding  # noqa: F401
import app.models.pm  # noqa: F401
import app.models.users  # noqa: F401
from app.core.config import get_settings
from app.core.database import Base
from app.libs import client_ib_accounts
from app.libs.onboarding.schemas import SubmitAllotmentReq, SubmitRedemptionReq
from app.libs.onboarding.service import OnboardingService
from app.models.pm import ClientSubscription, Model
from app.models.users import AdminRole, ClientProfile, Portal, User


@pytest.fixture
def db(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv(
        "IB_ACCOUNTS",
        json.dumps({"F1111111": ["U1111111", "U2222222", "U3333333"]}),
    )
    get_settings.cache_clear()
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        get_settings.cache_clear()


def _client(db) -> User:
    user = User(id=uuid.uuid4(), firebase_uid=uuid.uuid4().hex, portal=Portal.CLIENT)
    db.add(user)
    db.add(ClientProfile(user_id=user.id, name="Ada"))
    db.commit()
    return user


def _model(db, books: list[str], master: str | None = "F1111111") -> Model:
    model = Model(
        id=uuid.uuid4(),
        name="Diversified",
        required_books=books,
        master_ib_account=master,
        model_size=Decimal("10"),
    )
    db.add(model)
    db.commit()
    return model


def _subscribe(db, client, model, accounts):
    return OnboardingService(db).submit_allotment(
        SubmitAllotmentReq(
            client_id=client.id,
            model_id=model.id,
            multiplier=Decimal("2"),
            accounts=accounts,
        )
    )


def test_new_subscription_accounts_come_back_in_book_order(db):
    client = _client(db)
    model = _model(db, ["pt", "dt"])
    dto = _subscribe(
        db, client, model, {"pt": "u2222222", "dt": "U1111111"}
    )
    assert [(row.book, row.account) for row in dto.accounts] == [
        ("dt", "U1111111"),
        ("pt", "U2222222"),
    ]

    listed = OnboardingService(db).list_subscriptions(role=AdminRole.ADMIN, rm_uid="rm")
    assert len(listed) == 1
    assert [(row.book, row.account) for row in listed[0].subscriptions[0].accounts] == [
        ("dt", "U1111111"),
        ("pt", "U2222222"),
    ]


def test_accounts_must_match_required_books(db):
    client = _client(db)
    model = _model(db, ["dt", "pt"])
    with pytest.raises(HTTPException) as missing:
        _subscribe(db, client, model, {"dt": "U1111111"})
    assert missing.value.status_code == 422

    with pytest.raises(HTTPException) as extra:
        _subscribe(
            db,
            client,
            model,
            {"dt": "U1111111", "pt": "U2222222", "inb": "U3333333"},
        )
    assert extra.value.status_code == 422
    assert db.get(ClientSubscription, (client.id, model.id)) is None


def test_duplicate_account_not_in_pool_and_missing_master_are_rejected(db):
    client = _client(db)
    model = _model(db, ["dt", "pt"])
    with pytest.raises(HTTPException) as duplicate:
        _subscribe(db, client, model, {"dt": "U1111111", "pt": "U1111111"})
    assert duplicate.value.status_code == 422

    with pytest.raises(HTTPException) as outside:
        _subscribe(db, client, model, {"dt": "U9999999", "pt": "U2222222"})
    assert outside.value.status_code == 422

    bare = _model(db, ["dt"], master=None)
    with pytest.raises(HTTPException) as no_master:
        _subscribe(db, client, bare, {"dt": "U1111111"})
    assert no_master.value.status_code == 422


def test_account_already_assigned_is_a_conflict(db):
    holder = _client(db)
    other = _client(db)
    model = _model(db, ["dt"])
    _subscribe(db, holder, model, {"dt": "U1111111"})

    second = _model(db, ["dt"])
    with pytest.raises(HTTPException) as exc:
        _subscribe(db, other, second, {"dt": "U1111111"})
    assert exc.value.status_code == 409


def test_add_allotment_and_redemption_keep_stored_accounts(db):
    client = _client(db)
    model = _model(db, ["dt", "inb"])
    svc = OnboardingService(db)
    _subscribe(db, client, model, {"dt": "U1111111", "inb": "U3333333"})

    with pytest.raises(HTTPException) as exc:
        svc.submit_allotment(
            SubmitAllotmentReq(
                client_id=client.id,
                model_id=model.id,
                multiplier=Decimal("1"),
                accounts={"dt": "U2222222", "inb": "U3333333"},
            )
        )
    assert exc.value.status_code == 422
    assert client_ib_accounts.assigned_for(
        db, user_id=client.id, model_id=model.id
    ) == [
        {"book": "dt", "account": "U1111111"},
        {"book": "inb", "account": "U3333333"},
    ]

    redeemed = svc.submit_redemption(
        SubmitRedemptionReq(
            client_id=client.id,
            model_id=model.id,
            multiplier=Decimal("1"),
        )
    )
    assert [(row.book, row.account) for row in redeemed.accounts] == [
        ("dt", "U1111111"),
        ("inb", "U3333333"),
    ]


def test_transaction_with_no_accounts_is_an_empty_list(db):
    client = _client(db)
    model = _model(db, ["dt"])
    db.add(
        ClientSubscription(
            user_id=client.id, model_id=model.id, multiplier=Decimal("1")
        )
    )
    db.commit()
    dto = OnboardingService(db).submit_allotment(
        SubmitAllotmentReq(
            client_id=client.id,
            model_id=model.id,
            multiplier=Decimal("1"),
        )
    )
    assert dto.accounts == []


def test_eight_digit_accounts_submit_for_every_required_book(db, monkeypatch):
    monkeypatch.setenv(
        "IB_ACCOUNTS",
        json.dumps({"F1234567": ["U17828576", "U18018569", "U17935787"]}),
    )
    get_settings.cache_clear()
    client = _client(db)
    model = _model(db, ["dt", "pt", "inb"], master="F1234567")
    dto = _subscribe(
        db,
        client,
        model,
        {"dt": "U17828576", "pt": "U18018569", "inb": "U17935787"},
    )
    assert [(row.book, row.account) for row in dto.accounts] == [
        ("dt", "U17828576"),
        ("pt", "U18018569"),
        ("inb", "U17935787"),
    ]


def test_free_accounts_are_the_unassigned_pool(db):
    client = _client(db)
    model = _model(db, ["dt"])
    svc = OnboardingService(db)
    assert svc.free_accounts(model.id) == ["U1111111", "U2222222", "U3333333"]
    _subscribe(db, client, model, {"dt": "U2222222"})
    assert svc.free_accounts(model.id) == ["U1111111", "U3333333"]

    bare = _model(db, ["dt"], master=None)
    assert svc.free_accounts(bare.id) == []
    with pytest.raises(HTTPException) as missing:
        svc.free_accounts(uuid.uuid4())
    assert missing.value.status_code == 404
