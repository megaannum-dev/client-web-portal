# 021 BE-5 — chat REST routes + /api/ws/chat push endpoint
from __future__ import annotations

import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

from app.core.database import Base, get_db
from app.libs.chat.realtime import manager, mint
from app.libs.chat.router import _chat_user, _service
from app.libs.chat.router import router as chat_router
from app.libs.chat.service import ChatService
from app.models.access import AccessLevel, PageAccess
from app.models.users import AdminRole
from tests.libs.onboarding.conftest import make_admin, make_client

# ponytail: scratch app + a monkeypatched SessionLocal, no conftest.py here --
# the WS route deliberately takes no Depends(get_db), so overriding get_db alone
# cannot reach it.


class FakeStorage:
    def __init__(self) -> None:
        self.saved: list[str] = []

    def save(self, stream, *, suggested_name, content_type=None, subdir=None) -> str:
        key = f"{subdir}/{len(self.saved)}_{suggested_name}"
        self.saved.append(key)
        return key

    def open(self, storage_key: str):
        return io.BytesIO(b"x")


@pytest.fixture
def world(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    db = Session()
    db.add(PageAccess(page_id="rm.client-info", role=AdminRole.RM, level=AccessLevel.EDIT))
    db.commit()

    rm = make_admin(db, AdminRole.RM, name="Rita RM")
    client_user = make_client(db, assigned_rm_uid=rm.firebase_uid)

    monkeypatch.setattr("app.libs.chat.service.get_storage", lambda bucket: FakeStorage())
    monkeypatch.setattr(
        "app.libs.chat.service.client_folder", lambda name, uid, *, bucket: "folder"
    )
    # The WS handler opens its own short-lived session -- point it at this engine.
    monkeypatch.setattr("app.libs.chat.router.SessionLocal", Session)

    app = FastAPI()
    app.include_router(chat_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[_chat_user] = lambda: rm
    app.dependency_overrides[_service] = lambda: ChatService(db)

    manager.connections.clear()
    with TestClient(app) as tc:
        yield tc, rm, client_user
    db.close()


def test_bogus_ticket_is_refused_with_1008(world):
    tc, _, _ = world
    with pytest.raises(WebSocketDisconnect) as e:
        with tc.websocket_connect("/api/ws/chat?ticket=bogus") as ws:
            ws.receive_json()
    assert e.value.code == 1008


def test_ticket_is_single_use(world):
    tc, rm, _ = world
    ticket = mint(rm.firebase_uid)
    with tc.websocket_connect(f"/api/ws/chat?ticket={ticket}"):
        pass  # connected and parked -- good enough
    with pytest.raises(WebSocketDisconnect) as e:
        with tc.websocket_connect(f"/api/ws/chat?ticket={ticket}") as ws:
            ws.receive_json()
    assert e.value.code == 1008


def test_ws_ticket_endpoint(world):
    tc, _, _ = world
    payload = tc.post("/api/chat/ws-ticket").json()
    assert payload["ticket"]
    assert payload["expires_in"] > 0


def test_push_payload_equals_the_201_body(world):
    """The one-serializer assertion, plus echo-to-own-devices: the SENDER's
    second socket gets the frame too."""
    tc, rm, client_user = world
    t1, t2 = mint(rm.firebase_uid), mint(rm.firebase_uid)
    with tc.websocket_connect(f"/api/ws/chat?ticket={t1}") as ws1:
        with tc.websocket_connect(f"/api/ws/chat?ticket={t2}") as ws2:
            resp = tc.post(
                "/api/chat/messages",
                data={"client_id": str(client_user.id), "body": "hello"},
            )
            assert resp.status_code == 201
            for ws in (ws1, ws2):
                frame = ws.receive_json()
                assert frame["type"] == "new_message"
                assert frame["client_id"] == str(client_user.id)
                assert frame["message"] == resp.json()


def test_attachment_download_is_forced_not_inline(world):
    tc, _, client_user = world
    resp = tc.post(
        "/api/chat/messages",
        data={"client_id": str(client_user.id)},
        files=[("files", ("spec.pdf", b"pdf-bytes", "application/pdf"))],
    )
    assert resp.status_code == 201
    att_id = resp.json()["attachments"][0]["id"]
    dl = tc.get(f"/api/chat/attachments/{att_id}")
    assert dl.status_code == 200
    assert dl.headers["content-disposition"] == 'attachment; filename="spec.pdf"'


def test_history_route(world):
    tc, _, client_user = world
    tc.post("/api/chat/messages", data={"client_id": str(client_user.id), "body": "hi"})
    rows = tc.get("/api/chat/messages", params={"client_id": str(client_user.id)}).json()
    assert [r["body"] for r in rows] == ["hi"]
