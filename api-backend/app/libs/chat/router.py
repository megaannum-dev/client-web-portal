# 021 BE-5 — chat REST routes + /api/ws/chat push endpoint
"""Audience-neutral paths, deliberately -- NOT duplicated under `/client/` and
`/rm/` the way client_portal/router.py does.

client_portal splits because its two audiences get *different DTOs*
(ClientRequestDTO vs RmTicketDTO). Chat's request body, response DTO and handler
body are byte-identical for all three participants (client, RM, ARM); the only
difference is whether `client_id` defaults to self, which ChatService.
resolve_client_id already handles. Duplicating six routes under two prefixes
would double the surface for zero behavioural difference.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal, get_db
from app.libs.auth.deps import get_current_user
from app.libs.auth.status import assert_can_authenticate
from app.libs.chat.realtime import (
    MAX_LIFETIME,
    TICKET_TTL_SECONDS,
    manager,
    mint,
    park,
    pop_ticket,
)
from app.libs.chat.schemas import ChatMessageDTO
from app.libs.chat.service import ChatService
from app.libs.users.repository import UserRepository
from app.models.users import User

router = APIRouter(tags=["chat"])


def _chat_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Every chat route serves BOTH portals, so neither get_current_client_user
    nor get_current_admin_user works -- each 403s the other portal.
    get_current_user is portal-agnostic but skips the status gate."""
    assert_can_authenticate(user, None)  # deps.py:51/60 do this; get_current_user does not
    return user


def _service(db: Annotated[Session, Depends(get_db)]) -> ChatService:
    return ChatService(db)


@router.post("/chat/ws-ticket")
def ws_ticket(user: Annotated[User, Depends(_chat_user)]) -> dict:  # type: ignore[type-arg]
    return {"ticket": mint(user.firebase_uid), "expires_in": TICKET_TTL_SECONDS}


@router.get("/chat/messages", response_model=list[ChatMessageDTO])
def get_messages(
    svc: Annotated[ChatService, Depends(_service)],
    user: Annotated[User, Depends(_chat_user)],
    client_id: uuid.UUID | None = None,
    since: datetime | None = None,
    limit: int = 50,
) -> list[ChatMessageDTO]:
    return svc.history(user, client_id, since=since, limit=limit)


@router.post("/chat/messages", response_model=ChatMessageDTO, status_code=201)
async def post_message(
    svc: Annotated[ChatService, Depends(_service)],
    user: Annotated[User, Depends(_chat_user)],
    client_id: uuid.UUID | None = Form(default=None),
    body: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
) -> ChatMessageDTO:
    # `async def` is forced by UploadFile -- precedent client_portal/router.py:127.
    # The service is sync and has already committed when it returns, so the
    # fan-out below never races the transaction. The push carries the FULL
    # message, serialized by the same ChatMessageDTO this 201 returns: the
    # recipient renders with no follow-up fetch, and there is exactly one
    # row->wire path.
    dto, to_uids = svc.send(user, client_id, body=body, files=files)
    await manager.send(
        {"type": "new_message", "client_id": str(dto.client_id), "message": jsonable_encoder(dto)},
        to_uids=to_uids,
    )
    return dto


@router.get("/chat/attachments/{attachment_id}")
def download_attachment(
    attachment_id: uuid.UUID,
    svc: Annotated[ChatService, Depends(_service)],
    user: Annotated[User, Depends(_chat_user)],
) -> StreamingResponse:
    stream, filename, content_type = svc.attachment_stream(user, attachment_id)
    # `attachment`, never `inline`: any MIME type is accepted on upload, so a
    # stored text/html served inline would be a stored-XSS primitive on the API
    # origin. Same as client_portal/router.py:144-155.
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket, ticket: str | None = None) -> None:
    """Push-only socket. Three things do not work on a WS route and this handler
    compensates: main.py's exception handlers don't apply, HTTPException doesn't
    close a socket, and Depends(get_db) would pin a pooled connection for the
    socket's whole lifetime (database.py caps at ~50) -- so this takes NO
    Depends(get_db) and opens one short-lived session for the uid lookup only.
    After registration the socket does zero DB work: push payloads are built by
    the sender's request.
    """
    await websocket.accept()  # must precede reading the ticket: it arrives in the handshake
    # CORSMiddleware does not cover the WS handshake and browsers apply no CORS
    # to WebSockets at all, so cross-origin WS is allowed by default.
    origin = websocket.headers.get("origin")
    allowed = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
    # A missing Origin is allowed: non-browser clients (wscat, TestClient) send none.
    if origin is not None and origin not in allowed:
        await websocket.close(code=1008)
        return

    uid = pop_ticket(ticket)
    if uid is None:
        await websocket.close(code=1008)
        return
    try:
        with SessionLocal() as db:
            user = UserRepository(db).get_by_firebase_uid(uid)
            if user is None:
                raise HTTPException(401, "No account staged for you")
            assert_can_authenticate(user, None)
    except HTTPException:
        await websocket.close(code=1008)
        return

    manager.add(uid, websocket)
    try:
        await asyncio.wait_for(park(websocket), MAX_LIFETIME)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        # `finally`, not just the except branch, so an unexpected error never
        # leaves a dead socket in the registry.
        manager.disconnect(uid, websocket)
