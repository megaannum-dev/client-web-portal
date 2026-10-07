# GET /api/chat/documents + /documents/senders
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.libs.auth.deps import get_current_admin_user
from app.libs.chat.repository import ChatRepository
from app.libs.chat.router import _service
from app.libs.chat.router import router as chat_router
from app.libs.chat.service import ChatService
from app.models.access import AccessLevel, PageAccess
from app.models.users import AdminRole
from tests.libs.onboarding.conftest import make_admin, make_client


@pytest.fixture
def world():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    for role in (AdminRole.RM, AdminRole.ADMIN):
        db.add(PageAccess(page_id="rm.client-info", role=role, level=AccessLevel.EDIT))
    db.commit()
    rm1 = make_admin(db, AdminRole.RM, name="Rita RM")
    rm2 = make_admin(db, AdminRole.RM, name="Ron RM")
    admin = make_admin(db, AdminRole.ADMIN, name="Boss")
    nobody = make_admin(db, AdminRole.COMPLIANCE, name="Cam Compliance")
    a = make_client(db, assigned_rm_uid=rm1.firebase_uid, name="Alpha Fund")
    b = make_client(db, assigned_rm_uid=rm2.firebase_uid, name="Beta Fund")
    repo = ChatRepository(db)
    for i in range(3):
        msg = repo.create(client_id=a.id, sender_id=rm1.id, body=None)
        repo.add_attachment(
            message_id=msg.id, storage_key=f"a{i}", filename=f"a{i}.pdf",
            content_type=None, size_bytes=1,
        )  # fmt: skip
    msg = repo.create(client_id=b.id, sender_id=b.id, body=None)
    repo.add_attachment(
        message_id=msg.id, storage_key="b", filename="b.pdf", content_type=None, size_bytes=1
    )
    db.commit()

    app = FastAPI()
    app.include_router(chat_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[_service] = lambda: ChatService(db)
    who = {"u": rm1}
    app.dependency_overrides[get_current_admin_user] = lambda: who["u"]
    with TestClient(app) as tc:
        yield tc, who, dict(rm1=rm1, rm2=rm2, admin=admin, nobody=nobody, a=a, b=b)
    db.close()


def test_requires_client_view(world):
    tc, who, u = world
    who["u"] = u["nobody"]
    assert tc.get("/api/chat/documents").status_code == 403
    assert tc.get("/api/chat/documents/senders").status_code == 403


def test_rm_sees_own_rooms_admin_sees_all(world):
    tc, who, u = world
    body = tc.get("/api/chat/documents").json()
    assert body["total"] == 3 and {d["client_name"] for d in body["items"]} == {"Alpha Fund"}
    assert body["items"][0]["sender_role"] == "rm" and body["items"][0]["rm_name"] == "Rita RM"
    who["u"] = u["admin"]
    assert tc.get("/api/chat/documents").json()["total"] == 4
    names = {s["name"] for s in tc.get("/api/chat/documents/senders").json()}
    assert names == {"Rita RM", "Beta Fund"}


def test_query_params_and_paging(world):
    tc, who, u = world
    who["u"] = u["admin"]
    r = tc.get("/api/chat/documents", params={"limit": 2, "sort": "asc"}).json()
    assert len(r["items"]) == 2
    assert r["next_cursor"] and r["total"] == 4
    r2 = tc.get(
        "/api/chat/documents", params={"limit": 2, "sort": "asc", "cursor": r["next_cursor"]}
    )
    assert {d["id"] for d in r["items"]}.isdisjoint(d["id"] for d in r2.json()["items"])
    assert r2.json()["next_cursor"] is None and r2.json()["total"] == 4

    rows = tc.get(
        "/api/chat/documents",
        params={"sender": [u["rm1"].firebase_uid, u["b"].firebase_uid], "view": "out", "q": "A0"},
    ).json()
    assert [d["filename"] for d in rows["items"]] == ["a0.pdf"]
    assert tc.get("/api/chat/documents", params={"view": "in"}).json()["total"] == 1
    assert tc.get("/api/chat/documents", params={"date_from": "2999-01-01"}).json()["total"] == 0


def test_bad_inputs_are_422(world):
    tc, *_ = world
    assert tc.get("/api/chat/documents", params={"cursor": "garbage"}).status_code == 422
    assert tc.get("/api/chat/documents", params={"limit": 51}).status_code == 422
    assert tc.get("/api/chat/documents", params={"limit": 0}).status_code == 422
    assert tc.get("/api/chat/documents", params={"view": "bogus"}).status_code == 422
