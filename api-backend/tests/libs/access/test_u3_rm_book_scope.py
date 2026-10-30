# D03: the /rm client routes (events, allotments, submit allotment/redemption,
# transaction-detail, ticket linking) are limited to the caller's own book
# (client_profiles.assigned_rm_uid; ADMIN sees all). Another RM's client answers
# the same 404 as an unknown one. Uses this directory's `world` (seeded
# page_access, rm_primary owns clients[0..2], rm_empty owns none).
#
# Run: .venv/Scripts/python.exe -m pytest -q tests/libs/access/test_u3_rm_book_scope.py

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.onboarding import AllotRdmpStatus, ClientTicket
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
