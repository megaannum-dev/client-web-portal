# 021 BE-1 — ChatMessageDTO + the single row-to-wire serializer
"""Wire DTOs for the RM/ARM <-> Client chatroom.

`ChatMessageDTO.from_row` is the ONLY row->wire path: it is called from the
`201` response of `POST /chat/messages` and from the WebSocket push, so a
message rendered live and the same message fetched on reload are byte-identical
by construction.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.chat import ChatMessage


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
    sender_is_staff: bool  # users.portal == Portal.ADMIN
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
        sender_is_staff: bool,
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
            sender_is_staff=sender_is_staff,
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
