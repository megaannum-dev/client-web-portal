# 021 BE-1 — ChatMessageDTO + the single row-to-wire serializer
"""Wire DTOs for the RM/ARM <-> Client chatroom.

`ChatMessageDTO.from_row` is the ONLY row->wire path: it is called from the
`201` response of `POST /chat/messages` and from the WebSocket push, so a
message rendered live and the same message fetched on reload are byte-identical
by construction.
"""

from __future__ import annotations

import base64
import uuid
from datetime import datetime
from typing import Literal

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.models.chat import ChatAttachment, ChatMessage
from app.models.users import ClientProfile

# Who a message is FROM, as the chat UI needs to know it: the fill of the
# sender's avatar, which side of the thread the bubble sits on, and the role
# caption under the name. Three values because the room has three seats.
SenderRole = Literal["client", "rm", "assistant"]

# (attachment, room profile, sender uid, sender name, sender is staff, rm name, arm name)
DocumentRow = tuple[ChatAttachment, ClientProfile, str, str | None, bool, str | None, str | None]


def sender_role(*, is_staff: bool, sender_uid: str, profile: ClientProfile) -> SenderRole:
    """Which seat the sender occupies, resolved against the CLIENT'S CURRENT
    assignment. The single derivation, shared by the history and send paths.

    Costs nothing: `is_staff` already comes off the join the history query does
    for `sender_name`, and `profile` is the row the membership gate just read.

    Two consequences worth knowing, both flowing from the deliberate decision
    in `app/models/chat.py` to store no role snapshot:

    - A staff sender who is no longer assigned to this client -- a previous RM
      or ARM -- matches neither uid and falls through to "rm". Their old
      messages therefore render in the RM seat rather than vanishing or
      claiming a seat someone else now holds. Distinguishing a former ARM from
      a former RM is impossible without the snapshot the schema rejects, and
      "some relationship manager wrote this" stays true either way.
    - Reassignment re-colours history, exactly as it re-grants access. That is
      the same property, not a separate one: the thread follows the
      relationship.
    """
    if not is_staff:
        return "client"
    if sender_uid == profile.asst_rm_uid:
        return "assistant"
    return "rm"


class ChatAttachmentDTO(BaseModel):
    id: uuid.UUID  # chat_attachments.id -- also the download route's key
    filename: str  # chat_attachments.filename
    content_type: str | None  # chat_attachments.content_type (untrusted)
    size_bytes: int | None  # chat_attachments.size_bytes
    # NO storage_key: opaque internal path, never on the wire.
    # NO download_url: the FE derives /api/chat/attachments/{id} from `id`.


class ChatMessageDTO(BaseModel):
    id: uuid.UUID  # chat_messages.id
    client_id: uuid.UUID  # chat_messages.client_id (users.id)
    sender_uid: str  # users.firebase_uid -- NOT chat_messages.sender_id
    sender_name: str | None  # client_profiles.name / admin_profiles.name
    # DERIVED LIVE, never stored -- chat_messages has no role column, on
    # purpose (app/models/chat.py). Resolved against the client's CURRENT
    # assignment by `sender_role`, below, so a reassignment re-colours the
    # whole history exactly as it re-grants access.
    sender_role: SenderRole
    body: str | None  # chat_messages.body
    attachments: list[ChatAttachmentDTO]  # [] when none, never None
    created_at: datetime  # chat_messages.created_at

    @classmethod
    def from_row(
        cls,
        msg: ChatMessage,
        *,
        sender_uid: str,
        sender_name: str | None,
        sender_role: SenderRole,
    ) -> "ChatMessageDTO":
        """Serialize one row, with the sender's identity passed in explicitly.

        The row stores `sender_id` (a `users.id` UUID), but the transport
        boundary speaks `firebase_uid` (see the docstring in
        `app/models/chat.py`), and `users.id` is never serialised anywhere in
        this codebase. So the uid has to come from `users` -- and this method
        must NEVER touch `msg.sender` to get it:

        - the history query already joins `users` for the display name, so it
          passes both values off that join for free; lazy-loading here would
          N+1 the whole history page;
        - the send path passes them straight off the caller's `User` object,
          which the router already holds, and where a lazy load could hit a
          detached-instance error.
        """
        return cls(
            id=msg.id,
            client_id=msg.client_id,
            sender_uid=sender_uid,
            sender_name=sender_name,
            sender_role=sender_role,
            body=msg.body,
            # Order comes from the relationship's order_by; just map it.
            attachments=[
                ChatAttachmentDTO(
                    id=a.id,
                    filename=a.filename,
                    content_type=a.content_type,
                    size_bytes=a.size_bytes,
                )
                for a in msg.attachments
            ],
            created_at=msg.created_at,
        )


class ChatDocumentDTO(BaseModel):
    """One attachment, flattened with its room and sender -- the RM
    "Client Correspondents" row. Download via `GET /chat/attachments/{id}`."""

    id: uuid.UUID  # chat_attachments.id
    filename: str
    content_type: str | None
    size_bytes: int | None
    created_at: datetime  # chat_attachments.created_at
    message_id: uuid.UUID
    client_id: uuid.UUID  # the room key
    client_name: str
    sender_uid: str
    sender_name: str | None
    sender_role: SenderRole
    rm_name: str | None
    arm_name: str | None

    @classmethod
    def from_row(cls, row: "DocumentRow") -> "ChatDocumentDTO":
        att, room, sender_uid, sender_name, is_staff, rm_name, arm_name = row
        return cls(
            id=att.id,
            filename=att.filename,
            content_type=att.content_type,
            size_bytes=att.size_bytes,
            created_at=att.created_at,
            message_id=att.message_id,
            client_id=room.user_id,
            client_name=room.name,
            sender_uid=sender_uid,
            sender_name=sender_name,
            sender_role=sender_role(is_staff=bool(is_staff), sender_uid=sender_uid, profile=room),
            rm_name=rm_name,
            arm_name=arm_name,
        )


class ChatDocumentPage(BaseModel):
    items: list[ChatDocumentDTO]
    next_cursor: str | None
    total: int  # same filters, no cursor


class ChatDocumentSenderDTO(BaseModel):
    uid: str
    name: str | None
    role: SenderRole
    client_name: str | None  # a client's own room; None for staff (they span rooms)


def encode_cursor(created_at: datetime, att_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{att_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    """Opaque `<created_at iso>|<attachment uuid>`; anything else is a 422."""
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        ts, _, att_id = raw.partition("|")
        return datetime.fromisoformat(ts), uuid.UUID(att_id)
    except (ValueError, UnicodeError) as exc:  # binascii.Error is a ValueError
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Malformed cursor") from exc
