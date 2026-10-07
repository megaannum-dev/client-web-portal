# 021 BE-2 — chat repository (live RM/ARM membership predicate)
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Literal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query, Session, aliased, selectinload

from app.models.chat import ChatAttachment, ChatMessage
from app.models.users import AdminProfile, ClientProfile, Portal, User


@dataclass
class DocumentFilters:
    view: Literal["all", "in", "out"] = "all"  # in = sender is not staff
    senders: list[str] = field(default_factory=list)  # sender firebase uids
    date_from: date | None = None  # inclusive
    date_to: date | None = None  # inclusive
    q: str | None = None


class ChatRepository:
    """One query shape per method. NEVER commits or rolls back -- ChatService
    owns the transaction boundary (same contract as
    app/libs/access/repository.py:41)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def is_rm_or_arm(self, client_id: uuid.UUID, uid: str) -> bool:
        """Live membership predicate: is `uid` this client's RM *or* ARM, right now?

        `uid` is a `users.firebase_uid`, because `client_profiles.assigned_rm_uid`
        and `asst_rm_uid` are String(128) FKs to `users.firebase_uid`
        (app/models/users.py:155-160) -- not `users.id`. The asymmetry with
        `chat_messages.sender_id` (a `users.id`) is deliberate; see the
        app/models/chat.py module docstring.

        Nothing is cached or snapshotted. Reassigning a client's RM instantly
        moves access: the old RM is out, the new RM is in with full history.
        That is the product requirement, and it is why this is a live read on
        every call rather than a column on the message row.

        KNOWN INCONSISTENCY (deliberate, out of scope here): chat is the first
        feature that treats the ARM as the RM's equal. `ClientRepository._scoped`
        (app/libs/clients/repository.py:129-134) and
        app/libs/client_portal/service.py:358 both filter on `assigned_rm_uid`
        alone, so an ARM sees zero clients and zero tickets today. Net effect: an
        ARM can chat about a client they cannot see in any list. Fixing those two
        scoping helpers is its own change, not this one.
        """
        return (
            self.db.query(ClientProfile.user_id)
            .filter(
                ClientProfile.user_id == client_id,
                or_(ClientProfile.assigned_rm_uid == uid, ClientProfile.asst_rm_uid == uid),
            )
            .first()
            is not None
        )

    def client_profile(self, client_id: uuid.UUID) -> ClientProfile | None:
        """PK lookup -- `ClientProfile.user_id` *is* the PK (users.py:146-148;
        the comment at client_portal/service.py:119-122 saying otherwise is stale,
        migration 0031 promoted it). Returns the row, not a bool: the service
        needs `assigned_rm_uid`/`asst_rm_uid` for the WebSocket fan-out targets."""
        return self.db.get(ClientProfile, client_id)

    def history(
        self, client_id: uuid.UUID, *, since: datetime | None, limit: int
    ) -> list[tuple[ChatMessage, str, str | None, bool]]:
        """One statement: (message, sender_firebase_uid, sender_display_name,
        sender_is_staff) per message, oldest first.

        ORDER BY (created_at, id) -- DateTime(timezone=True) is second-resolution
        on MariaDB, so `id` is the tie-break.

        The `since` cursor is INCLUSIVE (`created_at >= since`). An exclusive
        cursor would silently drop a message sharing its second with the cursor.
        Consumers MUST dedupe by `id` -- which they need anyway, since a
        WebSocket push and a catch-up fetch legitimately overlap.

        The sender's identity is returned alongside the row precisely so the
        serializer never touches `msg.sender` (which would be an N+1);
        attachments are eager-loaded, so this is 2 statements regardless of page
        size.
        """
        name = func.coalesce(AdminProfile.name, ClientProfile.name, User.email, User.firebase_uid)
        query = (
            self.db.query(
                ChatMessage,
                User.firebase_uid,
                name.label("sender_name"),
                (User.portal == Portal.ADMIN).label("sender_is_staff"),
            )
            .options(selectinload(ChatMessage.attachments))
            .join(User, User.id == ChatMessage.sender_id)
            .outerjoin(AdminProfile, AdminProfile.user_id == User.id)
            .outerjoin(ClientProfile, ClientProfile.user_id == User.id)
            .filter(ChatMessage.client_id == client_id)
        )
        if since is not None:
            query = query.filter(ChatMessage.created_at >= since)
        rows = query.order_by(ChatMessage.created_at, ChatMessage.id).limit(limit).all()
        return [(msg, uid, sender_name, bool(is_staff)) for msg, uid, sender_name, is_staff in rows]

    def create(
        self, *, client_id: uuid.UUID, sender_id: uuid.UUID, body: str | None
    ) -> ChatMessage:
        """No commit -- flush only, so the PK is available for attachment rows."""
        msg = ChatMessage(id=uuid.uuid4(), client_id=client_id, sender_id=sender_id, body=body)
        self.db.add(msg)
        self.db.flush()
        return msg

    def add_attachment(
        self,
        *,
        message_id: uuid.UUID,
        storage_key: str,
        filename: str,
        content_type: str | None,
        size_bytes: int | None,
    ) -> ChatAttachment:
        row = ChatAttachment(
            id=uuid.uuid4(),
            message_id=message_id,
            storage_key=storage_key,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def attachment(self, attachment_id: uuid.UUID) -> tuple[ChatAttachment, uuid.UUID] | None:
        """The attachment plus its thread's `client_id`, in one query. The
        download route addresses attachments by id but the service must gate the
        *thread* before opening the file -- returning client_id here saves a
        second query and stops the service lazy-loading `att.message`."""
        row = (
            self.db.query(ChatAttachment, ChatMessage.client_id)
            .join(ChatMessage, ChatMessage.id == ChatAttachment.message_id)
            .filter(ChatAttachment.id == attachment_id)
            .one_or_none()
        )
        return (row[0], row[1]) if row is not None else None

    # ---------- Cross-room documents ----------
    def _documents_base(self, uid: str | None, f: DocumentFilters) -> Query:
        """Attachments x room x sender x RM x ARM, one statement. `uid=None` is
        view-all (ADMIN); otherwise only rooms where `uid` is the RM or ARM --
        the same predicate as `is_rm_or_arm`. Callers add ordering/paging, so
        this stays countable and re-selectable (`senders`)."""
        room = aliased(ClientProfile)
        sender_cp = aliased(ClientProfile)
        rm_user, arm_user = aliased(User), aliased(User)
        rm_ap, arm_ap = aliased(AdminProfile), aliased(AdminProfile)
        sender_name = func.coalesce(
            AdminProfile.name, sender_cp.name, User.email, User.firebase_uid
        )
        query = (
            self.db.query(
                ChatAttachment,
                room,
                User.firebase_uid,
                sender_name.label("sender_name"),
                (User.portal == Portal.ADMIN).label("sender_is_staff"),
                func.coalesce(rm_ap.name, rm_user.email).label("rm_name"),
                func.coalesce(arm_ap.name, arm_user.email).label("arm_name"),
            )
            .select_from(ChatAttachment)
            .join(ChatMessage, ChatMessage.id == ChatAttachment.message_id)
            .join(room, room.user_id == ChatMessage.client_id)
            .join(User, User.id == ChatMessage.sender_id)
            .outerjoin(AdminProfile, AdminProfile.user_id == User.id)
            .outerjoin(sender_cp, sender_cp.user_id == User.id)
            .outerjoin(rm_user, rm_user.firebase_uid == room.assigned_rm_uid)
            .outerjoin(rm_ap, rm_ap.user_id == rm_user.id)
            .outerjoin(arm_user, arm_user.firebase_uid == room.asst_rm_uid)
            .outerjoin(arm_ap, arm_ap.user_id == arm_user.id)
        )
        if uid is not None:
            query = query.filter(or_(room.assigned_rm_uid == uid, room.asst_rm_uid == uid))
        if f.view == "in":
            query = query.filter(User.portal != Portal.ADMIN)
        elif f.view == "out":
            query = query.filter(User.portal == Portal.ADMIN)
        if f.senders:
            query = query.filter(User.firebase_uid.in_(f.senders))
        if f.date_from is not None:
            query = query.filter(
                ChatAttachment.created_at >= datetime.combine(f.date_from, time.min)
            )
        if f.date_to is not None:
            # exclusive next-midnight bound == inclusive `date_to`
            end = datetime.combine(f.date_to + timedelta(days=1), time.min)
            query = query.filter(ChatAttachment.created_at < end)
        if f.q:
            query = query.filter(
                or_(
                    ChatAttachment.filename.icontains(f.q, autoescape=True),
                    room.name.icontains(f.q, autoescape=True),
                    sender_name.icontains(f.q, autoescape=True),
                )
            )
        return query

    def documents(
        self,
        uid: str | None,
        f: DocumentFilters,
        *,
        sort: Literal["asc", "desc"] = "desc",
        cursor: tuple[datetime, uuid.UUID] | None = None,
        limit: int = 50,
    ) -> tuple[list, bool, int]:
        """(rows, has_more, total). Keyset on (created_at, id); `total` counts
        the same filters WITHOUT the cursor. Fetches limit+1 to learn `has_more`.

        ponytail: no index on chat_attachments.created_at; add one if this query
        shows up slow."""
        base = self._documents_base(uid, f)
        total = base.with_entities(func.count()).scalar() or 0
        cols = (ChatAttachment.created_at, ChatAttachment.id)
        if cursor is not None:
            ts, att_id = cursor
            cmp = (lambda c, v: c < v) if sort == "desc" else (lambda c, v: c > v)
            base = base.filter(
                or_(
                    cmp(ChatAttachment.created_at, ts),
                    and_(ChatAttachment.created_at == ts, cmp(ChatAttachment.id, att_id)),
                )
            )
        order = [c.desc() for c in cols] if sort == "desc" else [c.asc() for c in cols]
        rows = base.order_by(*order).limit(limit + 1).all()
        return rows[:limit], len(rows) > limit, total

    def senders(self, uid: str | None) -> list[tuple[str, str | None, bool, bool, str]]:
        """Distinct (sender uid, name, is_staff, is_arm_here, room name) in scope."""
        base = self._documents_base(uid, DocumentFilters())
        room = base.column_descriptions[1]["entity"]
        return (
            base.with_entities(
                User.firebase_uid,
                base.column_descriptions[3]["expr"],
                User.portal == Portal.ADMIN,
                User.firebase_uid == room.asst_rm_uid,
                room.name,
            )
            .distinct()
            .all()
        )
