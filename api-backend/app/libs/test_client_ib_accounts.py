"""client_ib_accounts is one permanent row per (client, model, book).

Run: .venv/Scripts/python.exe -m pytest -q app/libs/test_client_ib_accounts.py
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models.pm  # noqa: F401 — registers the table
import app.models.users  # noqa: F401
from app.core.database import Base
from app.libs import client_ib_accounts
from app.models.pm import ClientIbAccount


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def test_second_book_on_the_same_client_and_model(db):
    user_id, model_id = uuid.uuid4(), uuid.uuid4()
    client_ib_accounts.ensure(
        db, user_id=user_id, model_id=model_id, book="dt", account="U1111111"
    )
    client_ib_accounts.ensure(
        db, user_id=user_id, model_id=model_id, book="pt", account="U2222222"
    )
    db.commit()

    rows = (
        db.query(ClientIbAccount)
        .filter_by(user_id=user_id, model_id=model_id)
        .all()
    )
    assert {(row.book, row.ib_account) for row in rows} == {
        ("dt", "U1111111"),
        ("pt", "U2222222"),
    }
    # A resubscribe that repeats the stored account inherits it.
    again = client_ib_accounts.ensure(
        db, user_id=user_id, model_id=model_id, book="dt", account="u1111111"
    )
    assert again.ib_account == "U1111111"
    assert db.query(ClientIbAccount).filter_by(user_id=user_id, model_id=model_id).count() == 2


def test_global_uniqueness_clash(db):
    user_id, model_id = uuid.uuid4(), uuid.uuid4()
    client_ib_accounts.ensure(
        db, user_id=user_id, model_id=model_id, book="dt", account="U1111111"
    )
    db.flush()

    with pytest.raises(HTTPException) as other_client:
        client_ib_accounts.ensure(
            db,
            user_id=uuid.uuid4(),
            model_id=model_id,
            book="dt",
            account="U1111111",
        )
    assert other_client.value.status_code == 409

    with pytest.raises(HTTPException) as other_book:
        client_ib_accounts.ensure(
            db, user_id=user_id, model_id=model_id, book="pt", account="U1111111"
        )
    assert other_book.value.status_code == 409


def test_eight_digit_account_passes_and_other_lengths_do_not(db):
    user_id, model_id = uuid.uuid4(), uuid.uuid4()
    assert (
        client_ib_accounts.check(
            db, "u17828576", book="dt", user_id=user_id, model_id=model_id
        )
        == "U17828576"
    )
    for bad in ("U123456", "U123456789", "U17828576U18018569"):
        with pytest.raises(HTTPException) as exc:
            client_ib_accounts.check(db, bad, book="dt")
        assert exc.value.status_code == 422


def test_different_account_for_a_stored_book_is_rejected(db):
    user_id, model_id = uuid.uuid4(), uuid.uuid4()
    client_ib_accounts.ensure(
        db, user_id=user_id, model_id=model_id, book="dt", account="U1111111"
    )
    with pytest.raises(HTTPException) as exc:
        client_ib_accounts.ensure(
            db, user_id=user_id, model_id=model_id, book="dt", account="U2222222"
        )
    assert exc.value.status_code == 409
    assert (
        client_ib_accounts.assigned_for(db, user_id=user_id, model_id=model_id)
        == [{"book": "dt", "account": "U1111111"}]
    )
