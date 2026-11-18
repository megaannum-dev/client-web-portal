"""Master IB account membership, the live lock, and free-account counts.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/trade_models/test_service_ib_registry.py
"""

import json
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.database import Base
from app.libs.trade_models.service import ModelService
from app.models.pm import ClientIbAccount, ModelStatus

_LIVE = "Master IB account can't change once a model is live."


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def service(session):
    return ModelService(session, storage=None)


@pytest.fixture
def ib_accounts(monkeypatch):
    def _set(mapping: dict) -> None:
        get_settings.cache_clear()
        monkeypatch.setenv("IB_ACCOUNTS", json.dumps(mapping))
        get_settings.cache_clear()

    yield _set
    get_settings.cache_clear()


def _draft(service, **kwargs):
    return service.create_model(name="M", required_books=["dt"], actor="uid", **kwargs)


def test_live_model_cannot_fill_a_null_master(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"]})
    model = _draft(service)
    assert model.master_ib_account is None
    model.status = ModelStatus.LIVE
    service.db.commit()

    with pytest.raises(HTTPException) as exc:
        service.edit_model(model.id, actor="uid", master_ib_account="F1111111")

    assert exc.value.status_code == 422
    assert exc.value.detail == _LIVE
    assert service.get_model(model.id).master_ib_account is None


def test_live_model_cannot_swap_or_clear_master(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"], "F2222222": ["U2222222"]})
    model = _draft(service, master_ib_account="F1111111")
    model.status = ModelStatus.LIVE
    service.db.commit()

    with pytest.raises(HTTPException) as swapped:
        service.edit_model(model.id, actor="uid", master_ib_account="F2222222")
    assert swapped.value.detail == _LIVE

    with pytest.raises(HTTPException) as cleared:
        service.edit_model(model.id, actor="uid", master_ib_account=None)
    assert cleared.value.detail == _LIVE
    assert service.get_model(model.id).master_ib_account == "F1111111"


def test_live_identical_master_is_a_noop(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"]})
    model = _draft(service, master_ib_account="F1111111")
    model.status = ModelStatus.LIVE
    service.db.commit()

    updated = service.edit_model(model.id, actor="uid", master_ib_account="F1111111")
    assert updated.master_ib_account == "F1111111"


def test_draft_rejects_a_master_outside_the_registry(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"]})
    model = _draft(service)

    with pytest.raises(HTTPException) as exc:
        service.edit_model(model.id, actor="uid", master_ib_account="F9999999")

    assert exc.value.status_code == 422
    assert exc.value.detail == "Master IB account is not a configured account."
    assert service.get_model(model.id).master_ib_account is None

    with pytest.raises(HTTPException) as created:
        _draft(service, master_ib_account="F9999999")
    assert created.value.status_code == 422


def test_draft_can_set_and_clear_a_configured_master(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"]})
    model = _draft(service, master_ib_account="F1111111")
    assert model.master_ib_account == "F1111111"

    cleared = service.edit_model(model.id, actor="uid", master_ib_account=None)
    assert cleared.master_ib_account is None


def test_unchanged_master_outside_the_registry_is_left_alone(service, ib_accounts):
    ib_accounts({"F1111111": ["U1111111"]})
    model = _draft(service, master_ib_account="F1111111")
    ib_accounts({})

    updated = service.edit_model(
        model.id, actor="uid", master_ib_account="F1111111", name="Renamed"
    )
    assert updated.master_ib_account == "F1111111"
    assert updated.name == "Renamed"


def test_free_count_drops_an_assigned_u_account(service, ib_accounts):
    ib_accounts(
        {
            "F1111111": ["U1111111", "U1111111", "U2222222"],
            "F2222222": ["U2222222", "U3333333"],
        }
    )
    model = _draft(service)
    service.db.add(
        ClientIbAccount(
            user_id=uuid.uuid4(),
            model_id=model.id,
            book="dt",
            ib_account="U2222222",
        )
    )
    service.db.commit()

    first = {row["master"]: row["free_count"] for row in service.ib_account_registry()}
    second = {row["master"]: row["free_count"] for row in service.ib_account_registry()}
    # The count is global, so every model that shares an F sees the same number.
    assert first == second
    assert first["F1111111"] == 1
    assert first["F2222222"] == 1


def test_empty_ib_accounts_setting_has_no_masters(service, monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("IB_ACCOUNTS", "{}")
    get_settings.cache_clear()
    assert service.ib_account_registry() == []
