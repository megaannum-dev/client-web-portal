# D08: the ADMIN role holds EDIT on every page in PAGE_IDS, fixed -- no matrix row,
# per-user override, publish or grant can change it. Exception: ADMIN may read every
# chat thread but must never send a chat message.
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.libs.access.pages import PAGE_IDS, PAGE_META
from app.libs.access.resolver import actions_for, levels_for
from app.libs.access.schemas import AccessLevel, MatrixChangeIn, MatrixPublishIn, OverrideIn
from app.libs.access.service import AccessService
from app.libs.chat.service import ChatService
from app.models.access import (
    AdminAuditEvent,
    OverrideLevel,
    PageAccess,
    PageAccessOverride,
    PageAccessPublication,
)
from app.models.users import AdminRole, ClientProfile

from .conftest import make_admin_user, make_client_user, make_override, seed_page_access


def _publish(session, actor, changes):
    body = MatrixPublishIn(
        changes=[MatrixChangeIn(page_id=p, role=r, level=AccessLevel(lv)) for p, r, lv in changes],
        base_published_at=None,
    )
    return AccessService(session).publish(body, actor=actor)


# ---------- resolver ----------
def test_admin_levels_ignore_missing_rows_and_none_override(session):
    admin = make_admin_user(session, AdminRole.ADMIN)
    # No page_access rows at all, plus a NONE override on one page.
    make_override(session, admin, "admin.system-config", OverrideLevel.NONE)
    assert levels_for(admin, session) == {page_id: "EDIT" for page_id in PAGE_IDS}
    assert actions_for(admin, session)  # no longer fails closed


def test_non_admin_role_still_fails_closed_without_rows(session):
    rm = make_admin_user(session, AdminRole.RM)
    assert levels_for(rm, session) == {}
    assert actions_for(rm, session) == set()


# ---------- publish ----------
@pytest.mark.parametrize("level", ["EDIT", "VIEW", "NONE"])
def test_publish_with_any_admin_cell_is_422_and_writes_nothing(world, session, level):
    before = session.query(PageAccess).count()
    with pytest.raises(HTTPException) as e:
        _publish(
            session,
            world.admin,
            [
                ("admin.enroll-user", AdminRole.RM, "VIEW"),  # valid cell alongside
                ("admin.system-config", AdminRole.ADMIN, level),
            ],
        )
    assert e.value.status_code == 422
    assert session.query(PageAccess).count() == before
    assert session.query(PageAccessPublication).count() == 0
    assert session.query(AdminAuditEvent).filter_by(event="access.published").count() == 0


def test_publish_without_admin_cell_still_works(world, session):
    out = _publish(session, world.admin, [("admin.enroll-user", AdminRole.RM, "VIEW")])
    assert out.published is not None


# ---------- overrides ----------
def test_grant_override_on_admin_user_is_422(world, session):
    body = OverrideIn(
        firebase_uid=world.admin.firebase_uid,
        page_id="admin.enroll-user",
        level=AccessLevel("NONE"),
        reason="nope",
    )
    with pytest.raises(HTTPException) as e:
        AccessService(session).grant_override(body, actor=world.admin)
    assert e.value.status_code == 422
    assert (
        session.query(PageAccessOverride)
        .filter_by(user_id=world.admin.id, page_id="admin.enroll-user")
        .count()
        == 0
    )


# ---------- matrix read ----------
def test_read_matrix_shows_admin_all_edit_even_with_rows_deleted(session):
    seed_page_access(session)
    session.query(PageAccess).filter(PageAccess.role == AdminRole.ADMIN).delete()
    session.commit()
    out = AccessService(session).read_matrix()
    admin_cells = {c.page_id: c.level for c in out.levels if c.role == AdminRole.ADMIN}
    assert admin_cells == {page_id: "EDIT" for page_id in PAGE_META}


# ---------- chat: ADMIN reads everything, sends nothing ----------
def _chat_world(session):
    seed_page_access(session)
    rm = make_admin_user(session, AdminRole.RM)
    admin = make_admin_user(session, AdminRole.ADMIN)
    client = make_client_user(session, assigned_rm_uid=rm.firebase_uid)
    return ChatService(session), rm, admin, client


def test_admin_cannot_send_but_can_read_history(session):
    svc, rm, admin, client = _chat_world(session)
    dto, _ = svc.send(rm, client.id, body="hello", files=[])

    with pytest.raises(HTTPException) as e:
        svc.send(admin, client.id, body="x", files=[])
    assert e.value.status_code == 403

    assert [m.id for m in svc.history(admin, client.id, since=None, limit=50)] == [dto.id]


def test_admin_seated_as_asst_rm_still_cannot_send(session):
    svc, rm, admin, client = _chat_world(session)
    row = session.query(ClientProfile).filter_by(user_id=client.id).one()
    row.asst_rm_uid = admin.firebase_uid
    session.commit()
    with pytest.raises(HTTPException) as e:
        svc.send(admin, client.id, body="x", files=[])
    assert e.value.status_code == 403
