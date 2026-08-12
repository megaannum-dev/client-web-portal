# api-backend/app/libs/client_ib_accounts.py
"""The one home of the client_ib_accounts invariant.

Named for the CLIENT side deliberately: this module handles only a client's
per-model account. A model's own account (models.master_ib_account) has no
invariant to enforce and never passes through here.

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

import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.pc import ClientIbAccount

_IB_FORMAT = re.compile(r"^U[A-Z0-9]{7}$")


def owner_of(
    db: Session, account: str
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """The (user_id, model_id) currently holding `account`, or None if free.
    Backs the friendly 409 that callers raise instead of surfacing a raw
    IntegrityError from the UNIQUE(ib_account) constraint."""
    row = (
        db.query(ClientIbAccount.user_id, ClientIbAccount.model_id)
        .filter(ClientIbAccount.ib_account == account)
        .first()
    )
    return (row.user_id, row.model_id) if row else None


def check(
    db: Session,
    account: str,
    *,
    user_id: uuid.UUID | None = None,
    model_id: uuid.UUID | None = None,
) -> str:
    """The one gate on an inbound account string: normalize, enforce shape,
    reject a string another (client, model) already holds. Returns the
    normalized value to store.

    Every write path calls this -- `ensure`, `reassign`, and the onboarding
    pre-flight (OnboardingService.start, which must fail BEFORE
    ClientService.onboard commits a client row). Pass user_id/model_id when
    the pair is already known so a row re-asserting its OWN account isn't
    treated as a conflict.
    """
    account = account.strip().upper()
    if not _IB_FORMAT.match(account):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "IB account must be the letter U followed by 7 letters or digits, e.g. U1234567",
        )
    held_by = owner_of(db, account)
    if held_by is not None and held_by != (user_id, model_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"IB account {account} is already assigned to another client",
        )
    return account


def ensure(
    db: Session,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    account: str | None,
) -> ClientIbAccount:
    """Create-if-absent. Never transfers an account and never overwrites a
    non-null one -- if a row already holds an account, it is returned
    untouched PROVIDED `account` either isn't given or matches what's already
    there (a resubscribe after full redemption legitimately finds its own
    account and inherits it). Supplying a DIFFERENT account for an existing
    row is rejected with 409 rather than silently discarded, since callers
    now require this field and a silent no-op would look like success.

    Filling a NULL is allowed: that completes an incomplete record rather
    than reassigning a real one, and it is how the rows nulled by migration
    0034's dedupe get repaired.

    Raises 422 if `account` is malformed, 409 if it's held by a DIFFERENT
    (client, model) pair or conflicts with this row's existing value. No
    commit -- the caller owns the transaction boundary.
    """
    if account is not None:
        account = check(db, account, user_id=user_id, model_id=model_id)

    row = db.get(ClientIbAccount, (user_id, model_id))
    if row is not None and row.ib_account is not None:
        if account is not None and account != row.ib_account:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"This client already holds IB account {row.ib_account} for this model.",
            )
        return row  # permanent

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
    account = check(db, account, user_id=user_id, model_id=model_id)

    row = db.get(ClientIbAccount, (user_id, model_id))
    if row is None:
        row = ClientIbAccount(user_id=user_id, model_id=model_id, ib_account=account)
        db.add(row)
    else:
        row.ib_account = account
    return row
