# api-backend/app/libs/ib_accounts.py
"""The one home of the client_ib_accounts invariant.

An IB account, once assigned, permanently belongs to that client for that
model. It is never transferred to another client, never moved to another
model, and never deleted on redemption. There is no real unsubscription:
absence of a client_subscriptions row simply means the client holds 0 units
of that model and may resubscribe at any time. Account strings are globally
unique -- no two (client, model) pairs may share one.

Every write to client_ib_accounts goes through `ensure` so the invariant
cannot drift between the onboarding path, the allotment path, and the RM
repair route. `(user_id, model_id)` is the table's composite PRIMARY KEY
(app/models/pc.py), so a duplicate row is already physically impossible --
the failure this module actually prevents is a bare INSERT colliding with a
surviving row (an IntegrityError 500) when a client who fully redeemed
resubscribes to the same model.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.pc import ClientIbAccount


def owner_of(
    db: Session, account: str
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """The (user_id, model_id) currently holding `account`, or None if free.
    Backs the friendly 422 that callers raise instead of surfacing a raw
    IntegrityError from the UNIQUE(ib_account) constraint."""
    row = (
        db.query(ClientIbAccount.user_id, ClientIbAccount.model_id)
        .filter(ClientIbAccount.ib_account == account)
        .first()
    )
    return (row.user_id, row.model_id) if row else None


def ensure(
    db: Session,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    account: str | None,
) -> ClientIbAccount:
    """Create-if-absent. Never transfers an account and never overwrites a
    non-null one -- if a row already holds an account, it is returned
    untouched and `account` is ignored (a resubscribe after full redemption
    legitimately finds one and inherits it).

    Filling a NULL is allowed: that completes an incomplete record rather
    than reassigning a real one, and it is how the rows nulled by migration
    0034's dedupe get repaired.

    Raises 422 if `account` is already held by a DIFFERENT (client, model)
    pair. No commit -- the caller owns the transaction boundary.
    """
    row = db.get(ClientIbAccount, (user_id, model_id))
    if row is not None and row.ib_account is not None:
        return row  # permanent; `account` is deliberately ignored

    if account is not None:
        held_by = owner_of(db, account)
        if held_by is not None and held_by != (user_id, model_id):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"IB account {account!r} is already assigned to another client/model",
            )

    if row is None:
        row = ClientIbAccount(user_id=user_id, model_id=model_id, ib_account=account)
        db.add(row)
    else:
        row.ib_account = account  # NULL -> value
    return row


def reassign(
    db: Session,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    account: str,
) -> ClientIbAccount:
    """The ONLY way to change a non-null account. Exists solely to correct a
    wrong value -- chiefly migration 0032's documented-lossy backfill, which
    copied one account onto every model a client subscribed to. Correcting an
    error is not a transfer, so this is deliberately separate from `ensure`
    and reachable only from the RM repair route.

    No commit -- the caller owns the transaction boundary.
    """
    account = account.strip()
    if not account:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "IB account must not be blank"
        )

    held_by = owner_of(db, account)
    if held_by is not None and held_by != (user_id, model_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"IB account {account!r} is already assigned to another client/model",
        )

    row = db.get(ClientIbAccount, (user_id, model_id))
    if row is None:
        row = ClientIbAccount(user_id=user_id, model_id=model_id, ib_account=account)
        db.add(row)
    else:
        row.ib_account = account
    return row
