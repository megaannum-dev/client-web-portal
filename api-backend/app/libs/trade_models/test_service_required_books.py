"""Required books: a draft may change them; a live model may not.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/trade_models/test_service_required_books.py
"""

from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.libs.trade_models.service import ModelService
from app.models.pm import ModelStatus


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


def test_create_persists_required_books(service):
    model = service.create_model(name="M", required_books=["pt", "dt"], actor="uid")
    assert model.required_books == ["dt", "pt"]


def test_draft_book_change_is_saved(service):
    model = service.create_model(name="M", required_books=["dt"], actor="uid")
    updated = service.edit_model(model.id, actor="uid", required_books=["dt", "inb"])
    assert updated.status == ModelStatus.DRAFT
    assert updated.required_books == ["dt", "inb"]


def test_live_book_change_is_rejected(service):
    model = service.create_model(
        name="M", required_books=["dt"], model_size=Decimal("1"), actor="uid"
    )
    model.status = ModelStatus.LIVE
    service.db.commit()

    with pytest.raises(HTTPException) as exc:
        service.edit_model(model.id, actor="uid", required_books=["pt"])

    assert exc.value.status_code == 422
    assert exc.value.detail == "Books can't change once a model is live."
    assert service.get_model(model.id).required_books == ["dt"]


def test_live_identical_books_are_a_noop(service):
    model = service.create_model(name="M", required_books=["dt", "pt"], actor="uid")
    model.status = ModelStatus.LIVE
    service.db.commit()

    updated = service.edit_model(
        model.id, actor="uid", required_books=["pt", "dt"]
    )
    assert updated.required_books == ["dt", "pt"]
