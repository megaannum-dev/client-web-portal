"""Starting onboarding stores one account per required book.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/onboarding/test_start_accounts.py
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
from app.libs.clients.service import ClientService
from app.libs.onboarding.schemas import StartOnboardingReq
from app.libs.onboarding.service import OnboardingService
from app.models.pm import Model
from app.models.users import ClientProfile, Portal, User


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


def _model(db, books: list[str]) -> Model:
    model = Model(
        id=uuid.uuid4(),
        name="Diversified",
        required_books=books,
        master_ib_account="F1111111",
        model_size=Decimal("10"),
    )
    db.add(model)
    db.commit()
    return model


def _req(model: Model, accounts: dict[str, str]) -> StartOnboardingReq:
    return StartOnboardingReq(
        client_name="Ada",
        email="ada@example.com",
        primary_phone="85200000000",
        address="1 Road",
        country_of_residence="HK",
        id_type="Passport",
        id_number="P1",
        accounts=accounts,
        sw_account="SW-1",
        model_id=model.id,
        units=Decimal("1"),
        mgmt_fee=Decimal("0.01"),
        incentive_fee=Decimal("0.10"),
        initial_cash_deposit=Decimal("100"),
    )


def _fake_onboard(monkeypatch):
    def onboard(
        self,
        *,
        caller_uid,
        email,
        name,
        assigned_rm_uid,
        identity,
        settings,
        asst_rm_uid=None,
        **profile_fields,
    ):
        user = User(
            id=uuid.uuid4(),
            firebase_uid=uuid.uuid4().hex,
            email=email,
            portal=Portal.CLIENT,
        )
        self.db.add(user)
        self.db.add(
            ClientProfile(
                user_id=user.id,
                name=name,
                assigned_rm_uid=assigned_rm_uid,
                primary_phone=profile_fields.get("primary_phone"),
                address=profile_fields.get("address"),
                country_of_residence=profile_fields.get("country_of_residence"),
            )
        )
        self.db.flush()
        return user, "invite"

    monkeypatch.setattr(ClientService, "onboard", onboard)


def _forbid_onboard(monkeypatch):
    def onboard(self, **_kwargs):
        raise RuntimeError("client was created")

    monkeypatch.setattr(ClientService, "onboard", onboard)


def _start(db, req: StartOnboardingReq):
    return OnboardingService(db).start(
        req, caller_uid="rm-1", identity=None, settings=None
    )


def test_start_stores_one_account_per_required_book(db, monkeypatch):
    _fake_onboard(monkeypatch)
    model = _model(db, ["inb", "dt", "pt"])
    dto = _start(
        db,
        _req(model, {"pt": "U2222222", "inb": "u3333333", "dt": "U1111111"}),
    )
    assert [(row.book, row.account) for row in dto.accounts] == [
        ("dt", "U1111111"),
        ("pt", "U2222222"),
        ("inb", "U3333333"),
    ]
    assert dto.client_ib == "U1111111"
    assert client_ib_accounts.assigned_for(
        db, user_id=dto.user_id, model_id=model.id
    ) == [
        {"book": "dt", "account": "U1111111"},
        {"book": "pt", "account": "U2222222"},
        {"book": "inb", "account": "U3333333"},
    ]


def test_start_rejects_a_missing_book_before_creating_a_client(db, monkeypatch):
    _forbid_onboard(monkeypatch)
    model = _model(db, ["dt", "pt"])
    with pytest.raises(HTTPException) as raised:
        _start(db, _req(model, {"dt": "U1111111"}))
    assert raised.value.status_code == 422
    assert db.query(User).count() == 0


def test_start_rejects_a_duplicate_account_across_books(db, monkeypatch):
    _forbid_onboard(monkeypatch)
    model = _model(db, ["dt", "pt"])
    with pytest.raises(HTTPException) as raised:
        _start(db, _req(model, {"dt": "U1111111", "pt": "U1111111"}))
    assert raised.value.status_code == 422


def test_start_rejects_an_account_outside_the_master(db, monkeypatch):
    _forbid_onboard(monkeypatch)
    model = _model(db, ["dt"])
    with pytest.raises(HTTPException) as raised:
        _start(db, _req(model, {"dt": "U9999999"}))
    assert raised.value.status_code == 422


def test_start_rejects_an_account_already_assigned(db, monkeypatch):
    _forbid_onboard(monkeypatch)
    model = _model(db, ["dt", "inb"])
    other = User(id=uuid.uuid4(), firebase_uid=uuid.uuid4().hex, portal=Portal.CLIENT)
    db.add(other)
    db.commit()
    client_ib_accounts.ensure(
        db, user_id=other.id, model_id=model.id, book="dt", account="U1111111"
    )
    db.commit()
    with pytest.raises(HTTPException) as raised:
        _start(db, _req(model, {"dt": "U1111111", "inb": "U2222222"}))
    assert raised.value.status_code == 409
