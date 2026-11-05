# D03: the /rm client and onboarding routes (board, cycle detail/upload/submit/
# downloads, events, allotments, submit allotment/redemption, transaction-detail,
# ticket linking) are limited to the caller's own book (clients they serve as
# main or assistant RM; ADMIN sees all). Another RM's client answers
# the same 404 as an unknown one. Uses this directory's `world` (seeded
# page_access, rm_primary owns clients[0..2], rm_empty owns none).
#
# Run: .venv/Scripts/python.exe -m pytest -q tests/libs/access/test_u3_rm_book_scope.py

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.onboarding import AllotRdmpStatus, ClientOnboarding, ClientTicket
from app.models.users import ClientProfile
from tests.libs.onboarding.conftest import make_allotment, make_model

_TXN_BODY = {
    "bank_account": "654321",
    "settlement_amount": "500",
    "transaction_date": "2026-01-06",
    "transaction_time": "10:00:00",
    "currency": "USD",
}


@pytest.fixture
def book(world):
    session = world.SessionLocal()
    model = make_model(session, model_size=Decimal("100000"))
    client = world.clients[0]
    allotment = make_allotment(session, client, model, status=AllotRdmpStatus.ACKNOWLEDGED)
    return {
        "client_id": str(client.id),
        "model_id": str(model.id),
        "allotment_id": allotment.id,
    }


@pytest.fixture
def cycles(world):
    """One onboarding cycle each for clients[0] (rm_primary only) and clients[1]
    (rm_primary main, rm_empty ASSISTANT)."""
    session = world.SessionLocal()
    model = make_model(session, model_size=Decimal("100000"))
    ids = []
    for client in world.clients[:2]:
        row = ClientOnboarding(
            id=uuid.uuid4(), user_id=client.id, model_id=model.id,
            multiplier=Decimal("1"), id_type="Passport", id_number="P1",
        )
        session.add(row)
        ids.append(str(row.id))
    profile = session.query(ClientProfile).filter_by(user_id=world.clients[1].id).one()
    profile.asst_rm_uid = world.rm_empty.firebase_uid
    session.commit()
    return {"own": ids[0], "assisted": ids[1], "assisted_client": str(world.clients[1].id)}


def _board_ids(http) -> set[str]:
    resp = http.get("/api/rm/onboardings")
    assert resp.status_code == 200, resp.text
    return {o["id"] for bucket in resp.json().values() for o in bucket}


def test_board_shows_only_the_callers_book_main_or_assistant(world, api_client, cycles):
    http, set_actor = api_client
    both = {cycles["own"], cycles["assisted"]}

    set_actor(world.rm_empty)  # assistant RM of clients[1] only
    assert _board_ids(http) == {cycles["assisted"]}
    set_actor(world.rm_receiver)  # serves nobody
    assert _board_ids(http) == set()
    set_actor(world.rm_primary)
    assert _board_ids(http) == both
    set_actor(world.admin)
    assert _board_ids(http) == both


def test_onboarding_detail_is_book_scoped(world, api_client, cycles):
    http, set_actor = api_client

    set_actor(world.rm_empty)
    resp = http.get(f"/api/rm/onboardings/{cycles['own']}")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Client not found"
    assert http.get(f"/api/rm/onboardings/{cycles['assisted']}").status_code == 200
    assert http.post(f"/api/rm/onboardings/{cycles['own']}/submit").status_code == 404

    resp = http.get(f"/api/rm/onboardings/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Unknown onboarding cycle"


def test_assistant_rm_reaches_the_client_routes(world, api_client, cycles):
    http, set_actor = api_client
    set_actor(world.rm_empty)
    assert http.get(f"/api/rm/clients/{cycles['assisted_client']}/events").status_code == 200


def _alloc_body(book, **extra):
    return {"client_id": book["client_id"], "model_id": book["model_id"], "multiplier": "1", **extra}


def test_get_events_another_rms_client_404_owner_and_admin_200(world, api_client, book):
    http, set_actor = api_client
    url = f"/api/rm/clients/{book['client_id']}/events"

    set_actor(world.rm_empty)
    resp = http.get(url)
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Client not found"

    set_actor(world.rm_primary)
    assert http.get(url).status_code == 200
    set_actor(world.admin)
    assert http.get(url).status_code == 200


def test_post_allotment_another_rms_client_404_owner_and_admin_201(world, api_client, book):
    http, set_actor = api_client

    set_actor(world.rm_empty)
    resp = http.post("/api/rm/allotment", json=_alloc_body(book))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Client not found"

    set_actor(world.rm_primary)
    assert http.post("/api/rm/allotment", json=_alloc_body(book)).status_code == 201
    set_actor(world.admin)
    assert http.post("/api/rm/allotment", json=_alloc_body(book)).status_code == 201


def test_transaction_detail_another_rms_client_404_owner_and_admin_pass(world, api_client, book):
    http, set_actor = api_client
    url = f"/api/rm/allotments/{book['allotment_id']}/transaction-detail"

    set_actor(world.rm_empty)
    assert http.post(url, json=_TXN_BODY).status_code == 404
    assert http.get(url).status_code == 404

    set_actor(world.rm_primary)
    assert http.post(url, json=_TXN_BODY).status_code == 201
    assert http.get(url).status_code == 200
    set_actor(world.admin)
    assert http.get(url).status_code == 200

    # still 404 for the other RM now that a detail exists (no existence leak)
    set_actor(world.rm_empty)
    assert http.get(url).status_code == 404


def test_transaction_detail_unknown_allotment_keeps_its_404(world, api_client):
    http, set_actor = api_client
    set_actor(world.rm_primary)
    resp = http.get(f"/api/rm/allotments/{uuid.uuid4()}/transaction-detail")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Unknown allotment/redemption"


def test_source_ticket_ref_of_another_client_is_rejected(world, api_client, book):
    http, set_actor = api_client
    set_actor(world.rm_primary)
    # ticket_open_progress belongs to clients[1], the request is for clients[0]
    foreign = world.ticket_open_progress.reference
    resp = http.post("/api/rm/allotment", json=_alloc_body(book, source_ticket_ref=foreign))
    assert resp.status_code == 404

    session = world.SessionLocal()
    ticket = session.query(ClientTicket).filter_by(reference=foreign).one()
    assert ticket.linked_allotment_id is None

    own = world.ticket_open_new.reference  # clients[0]'s own ticket still links
    resp = http.post("/api/rm/allotment", json=_alloc_body(book, source_ticket_ref=own))
    assert resp.status_code == 201


# ---- D05: tickets and chat use the same RM-or-ARM visibility as the client lists ----


@pytest.fixture
def arm_of_client1(world):
    """rm_empty becomes the ASSISTANT RM of clients[1] (ticket_open_progress)."""
    session = world.SessionLocal()
    profile = session.query(ClientProfile).filter_by(user_id=world.clients[1].id).one()
    profile.asst_rm_uid = world.rm_empty.firebase_uid
    session.commit()
    return world.ticket_open_progress.reference


def test_arm_sees_the_clients_ticket_in_list_and_detail(world, api_client, arm_of_client1):
    http, set_actor = api_client

    set_actor(world.rm_empty)
    resp = http.get("/api/rm/tickets")
    assert resp.status_code == 200, resp.text
    assert {t["ref"] for t in resp.json()} == {arm_of_client1}
    assert http.get(f"/api/rm/tickets/{arm_of_client1}").status_code == 200
    # only that client's ticket -- clients[0]'s stays invisible
    resp = http.get(f"/api/rm/tickets/{world.ticket_open_new.reference}")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Unknown ticket"


def test_unrelated_rm_gets_no_tickets_and_404(world, api_client, arm_of_client1):
    http, set_actor = api_client

    set_actor(world.rm_receiver)  # neither RM nor ARM of anyone
    assert http.get("/api/rm/tickets").json() == []
    resp = http.get(f"/api/rm/tickets/{arm_of_client1}")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Unknown ticket"


def test_chat_history_member_gate_covers_the_arm(world, arm_of_client1):
    from fastapi import HTTPException

    from app.libs.chat.service import ChatService
    from app.models.users import User

    session = world.SessionLocal()
    svc = ChatService(session)
    client_id = world.clients[1].id

    arm = session.get(User, world.rm_empty.id)
    assert svc.history(arm, client_id, since=None, limit=10) == []

    stranger = session.get(User, world.rm_receiver.id)  # non-member staff
    with pytest.raises(HTTPException) as exc:
        svc.history(stranger, client_id, since=None, limit=10)
    assert exc.value.status_code == 404
