"""Seed-row factory helpers for the test suite.

These build ``users`` rows joined to the matching ``client_profiles`` /
``admin_profiles`` row, mirroring what ``UserRepository.create_client`` /
``create_admin`` do, but without going through the service/repository layer so
tests can seed arbitrary fixtures cheaply.

Built against the CURRENT schema only. B1 will later add ``ClientProfile.status``,
``AdminProfile.is_active`` and ``User.authorized_by`` — those columns do NOT exist
yet, so they are deliberately not referenced here. The ``**extra`` passthrough on
each factory keeps them trivial to extend once those columns land.
"""

from __future__ import annotations

import itertools

from sqlalchemy.orm import Session

from app.models.users import AdminProfile, AdminRole, ClientProfile, Portal, User

# Monotonic counter so each factory call gets a unique uid/email without the
# caller having to supply one.
_seq = itertools.count(1)


def _next(prefix: str) -> int:
    return next(_seq)


def make_client(
    db: Session,
    *,
    firebase_uid: str | None = None,
    email: str | None = None,
    name: str | None = None,
    assigned_rm_uid: str | None = None,
    commit: bool = True,
    **extra: object,
) -> User:
    """Seed a CLIENT-portal user with an attached ``client_profiles`` row."""
    n = _next("client")
    user = User(
        firebase_uid=firebase_uid or f"client-uid-{n}",
        email=email if email is not None else f"client{n}@example.test",
        portal=Portal.CLIENT,
    )
    db.add(user)
    db.flush()  # populate user.id before building the profile FK
    profile = ClientProfile(
        user_id=user.id,
        name=name,
        assigned_rm_uid=assigned_rm_uid,
        **extra,
    )
    db.add(profile)
    if commit:
        db.commit()
        db.refresh(user)
    else:
        db.flush()
    return user


def _make_admin(
    db: Session,
    role: AdminRole,
    *,
    firebase_uid: str | None,
    email: str | None,
    name: str | None,
    commit: bool,
    **extra: object,
) -> User:
    n = _next("admin")
    user = User(
        firebase_uid=firebase_uid or f"admin-uid-{n}",
        email=email if email is not None else f"admin{n}@example.test",
        portal=Portal.ADMIN,
    )
    db.add(user)
    db.flush()
    profile = AdminProfile(user_id=user.id, role=role, name=name, **extra)
    db.add(profile)
    if commit:
        db.commit()
        db.refresh(user)
    else:
        db.flush()
    return user


def make_admin(
    db: Session,
    *,
    role: AdminRole | str = AdminRole.ADMIN,
    firebase_uid: str | None = None,
    email: str | None = None,
    name: str | None = None,
    commit: bool = True,
    **extra: object,
) -> User:
    """Seed an ADMIN-portal user with an attached ``admin_profiles`` row.

    ``role`` defaults to ``ADMIN``; pass ``AdminRole.RM`` for a relationship
    manager. Accepts a str role (coerced) for convenience.
    """
    return _make_admin(
        db,
        AdminRole(role),
        firebase_uid=firebase_uid,
        email=email,
        name=name,
        commit=commit,
        **extra,
    )


def make_rm(
    db: Session,
    *,
    firebase_uid: str | None = None,
    email: str | None = None,
    name: str | None = None,
    commit: bool = True,
    **extra: object,
) -> User:
    """Seed an ADMIN-portal user whose role is RM (relationship manager)."""
    return make_admin(
        db,
        role=AdminRole.RM,
        firebase_uid=firebase_uid,
        email=email,
        name=name,
        commit=commit,
        **extra,
    )
