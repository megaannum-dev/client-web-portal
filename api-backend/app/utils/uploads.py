# api-backend/app/utils/uploads.py
from __future__ import annotations

import os
from typing import BinaryIO

from fastapi import HTTPException, status


def validate_upload(
    filename: str, stream: BinaryIO, *, types: dict[str, str], max_bytes: int
) -> tuple[str, int]:
    """-> (content_type, size). Raises 415/422/413. The MIME comes from the
    extension allow-list `types`, never from the client; the stream is
    rewound so the caller can save it straight away."""
    ext = os.path.splitext(filename)[1].lower()
    content_type = types.get(ext)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{ext or filename}' -- expected one of "
            f"{'/'.join(sorted(types))}",
        )
    stream.seek(0, 2)
    size = stream.tell()
    stream.seek(0)
    if size == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty")
    if size > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {max_bytes} byte upload budget",
        )
    return content_type, size
