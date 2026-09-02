# 021 BE-4 — chat service (live membership gate, send, history, attachments)
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.storage import Bucket, client_folder, get_storage
from app.libs.access.resolver import actions_for
from app.libs.auth.actions import Action
from app.libs.chat.repository import ChatRepository
from app.libs.chat.schemas import ChatMessageDTO
from app.libs.users.repository import UserRepository
from app.models.users import ClientProfile, Portal, User

# Feature-local tunables off bare os.getenv, not Settings fields -- same
# convention as CLIENT_UPLOAD_WINDOW_DAYS (client_portal/service.py:76).
CHAT_HISTORY_MAX_LIMIT = int(os.getenv("CHAT_HISTORY_MAX_LIMIT", "200"))
# One budget for the WHOLE message, however many files it carries -- not a
# per-file cap plus a count cap.
CHAT_MAX_UPLOAD_BYTES = int(os.getenv("CHAT_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))


class ChatService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ChatRepository(db)

    # ---------- The gate ----------
    def _require_member(self, client_id: uuid.UUID, user: User) -> ClientProfile:
        """Live membership. Nothing cached, nothing snapshotted (see the
        app/models/chat.py docstring): reassigning a client's RM instantly
        moves the whole thread.

        Security boundary -- the gate lives HERE, not the router, so any future
        caller inherits it. Verbatim precedent: client_portal/service.py:261-265.

        Returns the profile: callers need assigned_rm_uid / asst_rm_uid for the
        WebSocket fan-out list, so the row is not thrown away.

        ADMIN and COMPLIANCE get NO special visibility in v1. Two conflicting
        full-visibility role sets already exist (clients/repository.py:20 has
        {ADMIN, COMPLIANCE}, client_portal/service.py:58 has {ADMIN}); a third
        would be worse than none. v2 supervision should EXTEND
        client_portal/service.py:58's set rather than add another.
        """
        profile = self.repo.client_profile(client_id)
        if profile is None:
            raise HTTPException(404, "Unknown thread")
        if user.portal == Portal.CLIENT:
            allowed = user.id == client_id
        else:
            # ID asymmetry is deliberate: client_profiles.assigned_rm_uid /
            # asst_rm_uid hold users.firebase_uid strings, not users.id.
            allowed = self.repo.is_rm_or_arm(client_id, user.firebase_uid)
        if not allowed:
            # Scoped 404, never 403 -- a 403 would leak the thread's (and the
            # client's) existence to a caller who should not know it exists.
            # Same reasoning as client_portal/service.py:358-360.
            raise HTTPException(404, "Unknown thread")
        return profile

    def _require_action(self, user: User, action: Action) -> None:
        """ADMIN-portal callers additionally need CLIENT_VIEW to read and
        CLIENT_WRITE to send.

        Resolved via actions_for() -- the same source require_action uses -- but
        NOT via the require_action dependency itself, which hangs off
        get_current_admin_user and would 403 every client.

        403, not 404: the caller can already see this client, so a missing
        action is a genuine permission failure, not an existence question.

        No new Action is minted: CLIENT_VIEW/CLIENT_WRITE on the existing
        `rm.client-info` page (access/pages.py:111) already mean exactly this.
        Minting one would mean editing actions.py, pages.py (PAGE_META +
        PAGE_ACTIONS), admin-frontend/lib/pages-config.ts (mirrored, guarded by
        a registry test) and a page_access seed migration -- for zero gain.

        Clients have no action system at all: resolver.py:34 returns {} for
        Portal.CLIENT, so they are never checked here.
        """
        if user.portal != Portal.ADMIN:
            return
        if action not in actions_for(user, self.db):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized for this client")

    def resolve_client_id(self, user: User, client_id: uuid.UUID | None) -> uuid.UUID:
        """A CLIENT may omit client_id -- users.id is never serialised to the
        client wire, so a client literally cannot name its own thread id. An
        ADMIN must supply one. A client naming someone else's id falls through
        _require_member to a 404."""
        if client_id is not None:
            return client_id
        if user.portal == Portal.CLIENT:
            return user.id
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "client_id is required")

    # ---------- Read ----------
    def history(
        self,
        user: User,
        client_id: uuid.UUID | None,
        *,
        since: datetime | None,
        limit: int,
    ) -> list[ChatMessageDTO]:
        client_id = self.resolve_client_id(user, client_id)
        self._require_member(client_id, user)
        self._require_action(user, Action.CLIENT_VIEW)
        # A `limit` straight off the query string is a trust boundary too.
        capped = max(1, min(limit, CHAT_HISTORY_MAX_LIMIT))
        return [
            ChatMessageDTO.from_row(
                msg, sender_uid=uid, sender_name=name, sender_is_staff=is_staff
            )
            for msg, uid, name, is_staff in self.repo.history(client_id, since=since, limit=capped)
        ]

    # ---------- Write ----------
    def send(
        self,
        user: User,
        client_id: uuid.UUID | None,
        *,
        body: str | None,
        files: list[UploadFile],
    ) -> tuple[ChatMessageDTO, list[str]]:
        """Returns (dto, to_uids). Deliberately SYNC: the router awaits
        `manager.send(payload, to_uids=...)` after this returns."""
        client_id = self.resolve_client_id(user, client_id)
        profile = self._require_member(client_id, user)
        self._require_action(user, Action.CLIENT_WRITE)

        body = (body or "").strip() or None  # store None, never ""
        if body is None and not files:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "A message needs a body or an attachment"
            )

        # Size EVERY file before saving ANY of them: the message is one
        # transaction, so rejecting after file 1 of 5 was written would leave an
        # orphan on disk with no DB row. Sizing needs no I/O, so there is no
        # reason to interleave.
        # ponytail: Starlette has already spooled the whole body before this
        # check runs, so this bounds DB rows and disk retention, not peak RSS.
        # The real bound is a reverse-proxy client_max_body_size -- infra
        # ticket, not code.
        sizes = []
        for f in files:
            f.file.seek(0, 2)
            sizes.append(f.file.tell())
            f.file.seek(0)
        if sum(sizes) > CHAT_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Message exceeds the {CHAT_MAX_UPLOAD_BYTES} byte attachment budget",
            )

        client_user = UserRepository(self.db).get_by_id(client_id)
        assert client_user is not None  # FK-guaranteed: the profile row exists
        msg = self.repo.create(client_id=client_id, sender_id=user.id, body=body)
        if files:
            # Keyed off the CLIENT who owns the thread, not the sender, so a
            # thread's files all land in one folder.
            subdir = client_folder(
                profile.name or "client", client_user.firebase_uid, bucket=Bucket.CHAT
            )
            storage = get_storage(Bucket.CHAT)
            for f, size in zip(files, sizes):
                key = storage.save(
                    f.file,
                    suggested_name=f.filename or "attachment",
                    content_type=f.content_type,
                    subdir=subdir,
                )
                self.repo.add_attachment(
                    message_id=msg.id,
                    storage_key=key,
                    filename=f.filename or "attachment",
                    content_type=f.content_type,
                    size_bytes=size,
                )
        # ponytail: in-app notification deferred to the notification module;
        # chat is its first producer.
        self.db.commit()

        # The sender IS the caller, so this costs zero extra queries.
        dto = ChatMessageDTO.from_row(
            msg,
            sender_uid=user.firebase_uid,
            sender_name=user.name,
            sender_is_staff=user.portal == Portal.ADMIN,
        )
        # The sender is INCLUDED, deliberately. Excluding their uid excludes
        # EVERY socket they hold, so a message typed on desktop would never
        # reach their own phone. The sending tab already has the message from
        # the 201 and dedupes by id -- which consumers must do anyway, because a
        # push and a catch-up fetch legitimately overlap.
        to_uids = {client_user.firebase_uid, profile.assigned_rm_uid, profile.asst_rm_uid}
        return dto, [uid for uid in to_uids if uid is not None]

    # ---------- Attachments ----------
    def attachment_stream(
        self, user: User, attachment_id: uuid.UUID
    ) -> tuple[BinaryIO, str, str]:
        """(stream, filename, content_type) for the router's StreamingResponse.

        MANDATORY: a caller-supplied storage key must NEVER reach open(). The
        route addresses attachments by id; the key comes off the authorized DB
        row. Chat's equivalent of the "re-list, don't trust the key" rule at
        client_portal/service.py:296-305.

        The router MUST send `Content-Disposition: attachment`, never `inline`:
        any MIME type is accepted on upload, so a stored `text/html` served
        inline would be a stored-XSS primitive on the API origin. Already the
        house pattern at client_portal/router.py:144-155.
        """
        row = self.repo.attachment(attachment_id)
        if row is None:
            raise HTTPException(404, "Unknown attachment")
        att, owner_client_id = row
        self._require_member(owner_client_id, user)
        self._require_action(user, Action.CLIENT_VIEW)
        return (
            get_storage(Bucket.CHAT).open(att.storage_key),
            att.filename,
            att.content_type or "application/octet-stream",
        )
