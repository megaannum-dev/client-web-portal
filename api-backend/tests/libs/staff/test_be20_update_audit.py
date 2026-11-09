"""D26 -- StaffService.update writes ONE audit row per call, describing only the
ACTUAL changes (before -> after); a no-op writes nothing; a book handover keeps
its single `staff.book_handover` row and carries the extras on it.

Exercised through `PATCH /api/admin/staff/{uid}` (be019_client roster)."""

from __future__ import annotations

from datetime import date

from app.models.access import AdminAuditEvent
from app.models.users import AdminProfile, User


def _staff_audit(client) -> list[AdminAuditEvent]:
    db = client.db()
    try:
        return db.query(AdminAuditEvent).filter(AdminAuditEvent.event.like("staff.%")).all()
    finally:
        db.close()


def _patch(client, user, **body):
    resp = client.http.patch(f"/api/admin/staff/{user.firebase_uid}", json=body)
    assert resp.status_code == 200, resp.text


def test_role_change_writes_one_updated_row(be019_client):
    target = be019_client.users["rm_empty"]
    _patch(be019_client, target, role="PM")
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.updated"
    assert row.detail == f"{target.firebase_uid}: role RM→PM"


def test_deactivate_with_reason(be019_client):
    target = be019_client.users["pm_active"]
    _patch(be019_client, target, status="DEACTIVATED", deactivate_reason="left the firm")
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.deactivated"
    assert row.detail == f"{target.firebase_uid}: deactivated (reason: left the firm)"


def test_deactivate_without_reason(be019_client):
    target = be019_client.users["pm_active"]
    _patch(be019_client, target, status="DEACTIVATED")
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.deactivated"
    assert row.detail == f"{target.firebase_uid}: deactivated"


def test_reactivate(be019_client):
    target = be019_client.users["rm_deactivated"]
    _patch(be019_client, target, status="ACTIVE")
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.reactivated"
    assert row.detail == f"{target.firebase_uid}: reactivated"


def test_name_and_phone_changes_are_all_listed(be019_client):
    target = be019_client.users["pm"]
    _patch(be019_client, target, name="Pat Renamed", phone_number="555-0100")
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.updated"
    assert row.detail == (
        f"{target.firebase_uid}: name {target.firebase_uid}→Pat Renamed; phone (none)→555-0100"
    )


def test_email_in_patch_is_ignored(be019_client):
    target = be019_client.users["pm"]
    old_email = target.email
    _patch(be019_client, target, email="pat.new@example.com")
    assert _staff_audit(be019_client) == []
    db = be019_client.db()
    try:
        stored = db.query(User).filter(User.id == target.id).one().email
    finally:
        db.close()
    assert stored == old_email


def _profile(client, user) -> AdminProfile:
    db = client.db()
    try:
        return db.query(AdminProfile).filter(AdminProfile.user_id == user.id).one()
    finally:
        db.close()


def test_department_change_persists_and_is_audited(be019_client):
    target = be019_client.users["pm"]
    _patch(be019_client, target, department="Operations")
    assert _profile(be019_client, target).department == "Operations"
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.updated"
    assert row.detail == f"{target.firebase_uid}: dept (none)→Operations"


def test_start_date_and_address_persist_and_are_audited(be019_client):
    target = be019_client.users["pm"]
    _patch(be019_client, target, start_date="2026-07-27", address="1 Main St")
    profile = _profile(be019_client, target)
    assert profile.start_date == date(2026, 7, 27)
    assert profile.address == "1 Main St"
    (row,) = _staff_audit(be019_client)
    assert row.detail == (
        f"{target.firebase_uid}: start date (none)→2026-07-27; address (none)→1 Main St"
    )


def test_noop_values_write_no_audit_row(be019_client):
    target = be019_client.users["pm_active"]
    profile = _profile(be019_client, target)
    # role, status, name and department all equal what is already stored
    _patch(
        be019_client,
        target,
        role="PM",
        status="ACTIVE",
        name=profile.name,
        department=profile.department,
    )
    assert _staff_audit(be019_client) == []


def test_handover_keeps_a_single_row_and_carries_the_reason(be019_client):
    booked = be019_client.users["rm_booked"]
    receiver = be019_client.users["rm_receiver"]
    _patch(
        be019_client,
        booked,
        status="DEACTIVATED",
        deactivate_reason="left the firm",
        reassign_book_to=receiver.firebase_uid,
    )
    (row,) = _staff_audit(be019_client)
    assert row.event == "staff.book_handover"
    assert row.detail.startswith(f"Deactivated {booked.firebase_uid} · book of 3 clients")
    assert row.detail.endswith(" · reason: left the firm")
