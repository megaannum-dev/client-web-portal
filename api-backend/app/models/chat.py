# api-backend/app/models/chat.py
"""021 DB-1 — RM/ARM <-> Client chatroom: chat_messages + chat_attachments.

ID-space rule for this module (a deliberate departure from the house
actor-column convention): **persisted rows use `users.id`; the
Firebase/transport boundary uses `firebase_uid`.**

The house convention splits the two spaces by column role -- subject columns
are `FK users.id` (`ClientProfile.user_id`, `ClientEvent.user_id`) while actor
columns are `FK users.firebase_uid` (`app/models/access.py:127-131`,
`ClientContactLog.logged_by_uid`, `ClientTicket.assigned_rm_uid`). Here both
`client_id` and `sender_id` are `users.id`, actor column included. The split
buys nothing on this table: the history query already joins `users` for the
sender's display name, so reading `firebase_uid` off that same join is free,
and no authorization path reads `sender_id` at all.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # The thread key: the client the thread belongs to, never the sender.
    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False
    )
    # Client, RM or ARM. Deliberately NO RM snapshot column on this row, and no
    # role snapshot -- membership is resolved live from `client_profiles` on
    # every request. This INVERTS the ticket convention at
    # `app/models/onboarding.py:409-416` (proposal 018, B-1), which denormalises
    # `assigned_rm_uid` at write time so reassignment never migrates a
    # historical ticket between inboxes. Do not "fix" this to match:
    #   - A ticket is a WORK ITEM owned by whoever was on the hook when it was
    #     raised; moving it would rewrite accountability.
    #   - A chat thread is a RELATIONSHIP CHANNEL, and the requirement is that
    #     reassignment transfers the whole conversation: the new RM sees full
    #     history, the old RM loses access instantly.
    # Snapshotting would produce the exact opposite on both counts.
    sender_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False
    )
    # NULL iff the message carries at least one attachment. Enforced in the
    # service as a 422, not as a CHECK constraint (no CHECK exists anywhere in
    # this schema; see access.py:122-124 for the same convention).
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ponytail: second-resolution created_at on MariaDB; history orders by
    # (created_at, id) and the catch-up cursor is INCLUSIVE, consumers dedupe by
    # id. Upgrade path is mysql.DATETIME(fsp=6).with_variant(...) if ordering
    # ever needs to be exact.
    #
    # No updated_at: the row is immutable, and onupdate=func.now() on an
    # append-only message is actively wrong. ClientEvent / ClientContactLog are
    # the created_at-only precedent.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    attachments: Mapped[list["ChatAttachment"]] = relationship(
        "ChatAttachment",
        cascade="all, delete-orphan",
        order_by="ChatAttachment.created_at, ChatAttachment.id",
        back_populates="message",
    )

    # One composite index only. Its leftmost prefix (client_id) already backs
    # the client_id FK on MariaDB, so a separate single-column index would be
    # redundant; sender_id is never queried on its own.
    __table_args__ = (Index("ix_chat_messages_client_id_created_at", "client_id", "created_at"),)


class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    # Also the download route's addressing key.
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("chat_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Bucket-relative, opaque, never on the wire. Column names/types follow
    # OnboardingDocument.storage_key/filename/content_type/size_bytes.
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)  # untrusted
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    message: Mapped["ChatMessage"] = relationship("ChatMessage", back_populates="attachments")
