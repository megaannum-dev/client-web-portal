# api-backend/app/libs/client_ib_accounts.py
"""The one home of the client_ib_accounts invariant.

Named for the CLIENT side deliberately: this module handles only a client's
per-model account. A model's own account (models.master_ib_account) has no
invariant to enforce and never passes through here.

An IB account, once assigned, permanently belongs to that client for that
model and book. It is never transferred to another client, never moved to
another model or book, and never deleted on redemption. There is no real
unsubscription: absence of a client_subscriptions row simply means the client
holds 0 units of that model and may resubscribe at any time. Account strings
are globally unique -- no two rows may share one, even two books of the same
client and model.

Every write to client_ib_accounts goes through `ensure` so the invariant
cannot drift between the onboarding path, the allotment path, and the RM
repair route. `(user_id, model_id, book)` is the table's composite PRIMARY
KEY (app/models/pm.py). `owner_of` stays a global lookup by account string:
an account has one owner in the whole table, not one owner per book.
"""

from __future__ import annotations

import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.pm import ClientIbAccount

_IB_FORMAT = re.compile(r"^U[A-Z0-9]{7}$")
BOOKS = ("dt", "pt", "inb")


def _book(book: str) -> str:
    normalized = book.strip().lower()
    if normalized not in BOOKS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Book must be dt, pt, or inb",
        )
    return normalized


def owner_of(
    db: Session, account: str
) -> tuple[uuid.UUID, uuid.UUID, str] | None:
    """The (user_id, model_id, book) currently holding `account`, or None if
    free. Global: the lookup is not filtered by book. Backs the friendly 409
    that callers raise instead of surfacing a raw IntegrityError from the
    UNIQUE(ib_account) constraint."""
    row = (
        db.query(ClientIbAccount.user_id, ClientIbAccount.model_id, ClientIbAccount.book)
        .filter(ClientIbAccount.ib_account == account)
        .first()
    )
    return (row.user_id, row.model_id, row.book) if row else None


def check(
    db: Session,
    account: str,
    *,
    book: str,
    user_id: uuid.UUID | None = None,
    model_id: uuid.UUID | None = None,
) -> str:
    """The one gate on an inbound account string: normalize, enforce shape,
    reject a string another row already holds. Returns the normalized value
    to store.

    Every write path calls this -- `ensure`, `reassign`, and the onboarding
    pre-flight (OnboardingService.start, which must fail BEFORE
    ClientService.onboard commits a client row). Pass user_id/model_id/book
    when the triple is already known so a row re-asserting its OWN account
    isn't treated as a conflict. A different book, even of the same client
    and model, is a conflict: the account string is unique across the table.
    """
    book = _book(book)
    account = account.strip().upper()
    if not _IB_FORMAT.match(account):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "IB account must be the letter U followed by 7 letters or digits, e.g. U1234567",
        )
    held_by = owner_of(db, account)
    if held_by is not None and held_by != (user_id, model_id, book):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"IB account {account} is already assigned",
        )
    return account


def ensure(
    db: Session,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    book: str,
    account: str | None,
) -> ClientIbAccount:
    """Create-if-absent for one (client, model, book). Never transfers an
    account and never overwrites a non-null one -- if that book already holds
    an account, it is returned untouched PROVIDED `account` either isn't
    given or matches what's already there (a resubscribe after full
    redemption legitimately finds its own account and inherits it). Supplying
    a DIFFERENT account for a book that already has one is rejected with 409
    rather than silently discarded.

    Filling a NULL is allowed: that completes an incomplete record rather
    than reassigning a real one.

    Raises 422 if `account` or `book` is malformed, 409 if the account is
    held by a different row or conflicts with this book's existing value. No
    commit -- the caller owns the transaction boundary.
    """
    book = _book(book)
    if account is not None:
        account = check(db, account, book=book, user_id=user_id, model_id=model_id)

    row = db.get(ClientIbAccount, (user_id, model_id, book))
    if row is not None and row.ib_account is not None:
        if account is not None and account != row.ib_account:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"This client already holds IB account {row.ib_account} for this model's {book} book.",
            )
        return row  # permanent

    if row is None:
        row = ClientIbAccount(
            user_id=user_id, model_id=model_id, book=book, ib_account=account
        )
        db.add(row)
    else:
        row.ib_account = account  # NULL -> value
    return row


def reassign(
    db: Session,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    book: str,
    account: str,
) -> ClientIbAccount:
    """The ONLY way to change a non-null account for one book. Exists solely
    to correct a wrong value -- chiefly migration 0032's documented-lossy
    backfill. Correcting an error is not a transfer, so this is deliberately
    separate from `ensure` and reachable only from the RM repair route.

    No commit -- the caller owns the transaction boundary.
    """
    book = _book(book)
    account = check(db, account, book=book, user_id=user_id, model_id=model_id)

    row = db.get(ClientIbAccount, (user_id, model_id, book))
    if row is None:
        row = ClientIbAccount(
            user_id=user_id, model_id=model_id, book=book, ib_account=account
        )
        db.add(row)
    else:
        row.ib_account = account
    return row


def assigned_for(
    db: Session, *, user_id: uuid.UUID, model_id: uuid.UUID
) -> list[dict[str, str]]:
    """Stored accounts for one client and model, ordered dt, pt, inb.
    Rows with no account string are omitted. Empty when nothing is assigned."""
    rows = (
        db.query(ClientIbAccount.book, ClientIbAccount.ib_account)
        .filter(
            ClientIbAccount.user_id == user_id,
            ClientIbAccount.model_id == model_id,
            ClientIbAccount.ib_account.isnot(None),
        )
        .all()
    )
    return _ordered({book: account for book, account in rows if account})


def assigned_by_pair(db: Session) -> dict[tuple[uuid.UUID, uuid.UUID], list[dict[str, str]]]:
    """Every stored account, grouped by (user_id, model_id) and ordered dt, pt, inb."""
    rows = (
        db.query(
            ClientIbAccount.user_id,
            ClientIbAccount.model_id,
            ClientIbAccount.book,
            ClientIbAccount.ib_account,
        )
        .filter(ClientIbAccount.ib_account.isnot(None))
        .all()
    )
    grouped: dict[tuple[uuid.UUID, uuid.UUID], dict[str, str]] = {}
    for user_id, model_id, book, account in rows:
        if account:
            grouped.setdefault((user_id, model_id), {})[book] = account
    return {key: _ordered(books) for key, books in grouped.items()}


def _ordered(by_book: dict[str, str]) -> list[dict[str, str]]:
    return [
        {"book": book, "account": by_book[book]}
        for book in BOOKS
        if book in by_book
    ]
