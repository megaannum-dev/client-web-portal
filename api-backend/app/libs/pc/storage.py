"""BE-1 — File storage adapter.

The DB stores only opaque ``storage_key`` strings.  Swapping LocalStorage →
NasStorage requires changes only here — nothing else in the feature package
changes.

Active implementation is chosen by ``PC_STORAGE_BACKEND`` (default: ``local``).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import BinaryIO, Protocol

from app.core.config import get_settings


class FileStorage(Protocol):
    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None,
    ) -> str:
        """Persist *stream* and return an opaque storage_key."""
        ...

    def open(self, storage_key: str) -> BinaryIO:
        """Return a readable binary stream for *storage_key*."""
        ...


class LocalStorage:
    """Writes files to a configured filesystem mount (``PC_STORAGE_ROOT``)."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None = None,
    ) -> str:
        # Build a unique key so we never overwrite on re-upload.
        key = f"{uuid.uuid4().hex}_{suggested_name}"
        dest = self._root / key
        with dest.open("wb") as fh:
            fh.write(stream.read())
        return key

    def open(self, storage_key: str) -> BinaryIO:  # type: ignore[return]
        path = self._root / storage_key
        return path.open("rb")  # caller is responsible for closing


class NasStorage:
    """Placeholder — swap in once NAS share/credentials are confirmed."""

    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None = None,
    ) -> str:
        raise NotImplementedError("NasStorage is not yet configured")

    def open(self, storage_key: str) -> BinaryIO:
        raise NotImplementedError("NasStorage is not yet configured")


def get_storage() -> FileStorage:
    """Return the active FileStorage implementation based on config."""
    settings = get_settings()
    backend = settings.pc_storage_backend.lower()
    if backend == "nas":
        return NasStorage()
    # Default: local
    return LocalStorage(settings.pc_storage_root)
