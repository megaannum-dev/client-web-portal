# app/libs/access/resolver.py
from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from app.libs.access.pages import PAGE_ACTIONS, PAGE_IDS, PAGELESS_ACTIONS
from app.libs.access.repository import AccessRepository, to_wire
from app.libs.auth.actions import Action
from app.models.users import Portal, User

GrantLevel = Literal["VIEW", "EDIT"]


def levels_for(user: User, db: Session) -> dict[str, GrantLevel]:
    """Effective level per page_id for ONE user.

    Precedence (the ONLY place this rule lives):
        unexpired override for (user, page)   ->  that level, EVEN IF it is NONE
        else                                  ->  the standing level of the user's role
        else                                  ->  NONE
    A resolved NONE -- whether from a NONE override or from an absent page_access
    row -- is OMITTED from the returned mapping (absent key === NONE, § 7.1).
    page_ids not in PAGE_IDS are dropped: the DB has no FK to a pages table (D-8),
    so a stale row from a deleted page must not resolve to anything.

    NO CACHING, deliberately (proposal § Layer 2 B): 2 indexed reads per call so a
    published change bites on the caller's very next request.

    Clients (Portal.CLIENT), and any admin with no admin_profile row, resolve to
    {} without touching the DB -- they have no page matrix at all (§ 3 Non-Goals).
    """
    if user.portal != Portal.ADMIN or user.admin_profile is None:
        return {}

    repo = AccessRepository(db)
    role_levels = repo.levels_for_role(user.admin_profile.role)
    overrides = repo.overrides_for_user(user.id)

    result: dict[str, GrantLevel] = {}
    for page_id in PAGE_IDS:
        if page_id in overrides:
            level = to_wire(overrides[page_id])
        elif page_id in role_levels:
            level = to_wire(role_levels[page_id])
        else:
            continue
        if level != "NONE":
            result[page_id] = level  # type: ignore[assignment]
    return result


def grants_for(user: User, db: Session) -> dict[str, GrantLevel]:
    """UserOut.grants (§ 7.1): identical to levels_for; named separately because it
    is the wire surface and levels_for is the internal one."""
    return levels_for(user, db)


def actions_for(user: User, db: Session) -> set[Action]:
    """The union over the user's effective levels:
        VIEW  -> PAGE_ACTIONS[page][0]
        EDIT  -> PAGE_ACTIONS[page][0] | PAGE_ACTIONS[page][1]
    plus PAGELESS_ACTIONS.get(role, frozenset()).

    Returns an EMPTY set for a user with no admin_profile, for a client, and --
    by design -- for any admin when page_access is empty because the migration
    has not been applied: fail closed (C-2 / D-9), never fall back. Fail-closed
    means PAGELESS_ACTIONS is withheld too in that case -- it is added only when
    the user holds at least one real page grant, never unconditionally by role.
    """
    if user.portal != Portal.ADMIN or user.admin_profile is None:
        return set()

    levels = levels_for(user, db)
    if not levels:
        return set()

    actions: set[Action] = set()
    for page_id, level in levels.items():
        view_bucket, edit_bucket = PAGE_ACTIONS[page_id]
        actions |= view_bucket
        if level == "EDIT":
            actions |= edit_bucket
    actions |= PAGELESS_ACTIONS.get(user.admin_profile.role, frozenset())
    return actions
