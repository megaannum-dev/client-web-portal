# Run: .venv/Scripts/python.exe -m pytest -q app/libs/chat/test_schemas.py
import uuid
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder

from app.libs.chat.schemas import ChatDocumentDTO, ChatMessageDTO

_NAIVE_UTC = datetime(2026, 11, 23, 10, 40, 0)  # 18:40 HKT


def _message(**kwargs: object) -> ChatMessageDTO:
    return ChatMessageDTO(
        id=uuid.uuid4(),
        client_id=uuid.uuid4(),
        sender_uid="u",
        sender_name=None,
        sender_role="client",
        body="hi",
        attachments=[],
        created_at=_NAIVE_UTC,
        **kwargs,
    )


def test_naive_created_at_is_stamped_utc_on_the_wire() -> None:
    dto = _message()
    assert dto.created_at == datetime(2026, 11, 23, 10, 40, tzinfo=timezone.utc)
    dumped = dto.model_dump(mode="json")["created_at"]
    assert dumped.endswith("+00:00") or dumped.endswith("Z")
    # WS path uses jsonable_encoder, not pydantic json mode.
    wire = jsonable_encoder(dto)["created_at"]
    assert wire.endswith("+00:00") or wire.endswith("Z")


def test_document_naive_created_at_is_stamped_utc() -> None:
    dto = ChatDocumentDTO(
        id=uuid.uuid4(),
        filename="a.pdf",
        content_type="application/pdf",
        size_bytes=1,
        created_at=_NAIVE_UTC,
        message_id=uuid.uuid4(),
        client_id=uuid.uuid4(),
        client_name="c",
        sender_uid="u",
        sender_name=None,
        sender_role="client",
        rm_name=None,
        arm_name=None,
    )
    dumped = dto.model_dump(mode="json")["created_at"]
    assert dumped.endswith("+00:00") or dumped.endswith("Z")
