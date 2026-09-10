# 021 BE-1 — ChatMessageDTO + the single row-to-wire serializer
import json
import uuid
from datetime import datetime, timezone

from app.libs.chat.schemas import ChatMessageDTO
from app.models.chat import ChatAttachment, ChatMessage

# ponytail: no DB and no conftest -- from_row takes a ChatMessage instance, so
# unsaved in-memory rows with a plain list on .attachments are enough.

CLIENT_ID = uuid.uuid4()


def _msg(**kw) -> ChatMessage:
    msg = ChatMessage(
        **{
            "id": uuid.uuid4(),
            "client_id": CLIENT_ID,
            "sender_id": uuid.uuid4(),
            "body": "hello",
            "created_at": datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc),
            **kw,
        }
    )
    msg.attachments = kw.get("attachments", [])
    return msg


def _dto(msg: ChatMessage) -> ChatMessageDTO:
    return ChatMessageDTO.from_row(
        msg, sender_uid="uid-rm", sender_name="Rita M", sender_is_staff=True
    )


def test_no_attachments_serializes_to_empty_list():
    dto = _dto(_msg())
    assert dto.attachments == []
    assert dto.body == "hello"
    assert dto.client_id == CLIENT_ID


def test_two_attachments_come_through_in_model_order():
    msg = _msg(
        body=None,
        attachments=[
            ChatAttachment(
                id=uuid.UUID(int=1),
                storage_key="chat/a.pdf",
                filename="a.pdf",
                content_type=None,
                size_bytes=11,
            ),
            ChatAttachment(
                id=uuid.UUID(int=2),
                storage_key="chat/b.png",
                filename="b.png",
                content_type="image/png",
                size_bytes=22,
            ),
        ],
    )
    dto = _dto(msg)
    assert [a.filename for a in dto.attachments] == ["a.pdf", "b.png"]
    assert dto.attachments[0].id == uuid.UUID(int=1)
    assert dto.attachments[0].content_type is None
    assert dto.attachments[0].size_bytes == 11
    assert dto.attachments[1].content_type == "image/png"
    assert dto.body is None


def test_storage_key_never_reaches_the_wire():
    msg = _msg(
        attachments=[
            ChatAttachment(
                id=uuid.uuid4(),
                storage_key="chat/secret/path.pdf",
                filename="a.pdf",
                content_type=None,
                size_bytes=1,
            )
        ]
    )
    payload = json.dumps(_dto(msg).model_dump(mode="json"))
    assert "storage_key" not in payload
    assert "chat/secret/path.pdf" not in payload
    assert "download_url" not in payload


def test_sender_identity_is_taken_from_arguments_not_the_relationship():
    """A row whose `sender` raises on access still serializes: proof that
    from_row never lazy-loads the relationship (which would N+1 history)."""

    class _PoisonedSender:
        """Duck-types the row; `.sender` blows up instead of lazy-loading.

        A subclass rather than a class-level patch on ChatMessage -- patching
        the real class would leak into every other test in the session.
        """

        def __init__(self, msg: ChatMessage):
            self.id = msg.id
            self.client_id = msg.client_id
            self.body = msg.body
            self.attachments = msg.attachments
            self.created_at = msg.created_at

        @property
        def sender(self):
            raise AssertionError("from_row must not read msg.sender")

    dto = ChatMessageDTO.from_row(
        _PoisonedSender(_msg()), sender_uid="uid-client", sender_name=None, sender_is_staff=False
    )

    assert dto.sender_uid == "uid-client"
    assert dto.sender_name is None
    assert dto.sender_is_staff is False
