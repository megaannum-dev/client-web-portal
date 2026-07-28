"""BE-1 — File storage adapter.

The DB stores only opaque ``storage_key`` strings.  Swapping LocalStorage →
NasStorage requires changes only here — nothing else in the feature package
changes.

Active implementation is chosen by ``STORAGE_BACKEND`` (default: ``local``).
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, NamedTuple, Protocol

from app.core.config import get_settings


class StoredFile(NamedTuple):
    key: str
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None  # immediate sub-folder name; None at the listed dir's own root


class FileStorage(Protocol):
    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None = None,
        subdir: str | None = None,
    ) -> str:
        """Persist *stream* and return an opaque storage_key."""
        ...

    def open(self, storage_key: str) -> BinaryIO:
        """Return a readable binary stream for *storage_key*."""
        ...

    def list(self, subdir: str) -> list[StoredFile]:
        """Enumerate files under `subdir`, one level deep. Never raises for a
        missing directory — returns []."""
        ...


class LocalStorage:
    """Writes files to a configured filesystem mount (``STORAGE_ROOT``)."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None = None,
        subdir: str | None = None,
    ) -> str:
        # Build a unique key so we never overwrite on re-upload.
        key_body = f"{uuid.uuid4().hex}_{suggested_name}"
        key = f"{subdir}/{key_body}" if subdir else key_body
        dest = self._root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            fh.write(stream.read())
        return key

    def open(self, storage_key: str) -> BinaryIO:  # type: ignore[return]
        path = self._root / storage_key
        return path.open("rb")  # caller is responsible for closing

    def list(self, subdir: str) -> list[StoredFile]:
        base = self._root / subdir
        if not base.is_dir():
            return []
        out: list[StoredFile] = []
        for entry in base.iterdir():
            if entry.is_file():
                stat = entry.stat()
                out.append(
                    StoredFile(
                        key=f"{subdir}/{entry.name}",
                        filename=entry.name,
                        size_bytes=stat.st_size,
                        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                        category=None,
                    )
                )
            elif entry.is_dir():
                for child in entry.iterdir():
                    if child.is_file():
                        stat = child.stat()
                        out.append(
                            StoredFile(
                                key=f"{subdir}/{entry.name}/{child.name}",
                                filename=child.name,
                                size_bytes=stat.st_size,
                                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                                category=entry.name,
                            )
                        )
        return sorted(
            out,
            key=lambda f: f.modified_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )


class NasStorage:
    """Placeholder — swap in once NAS share/credentials are confirmed."""

    def save(
        self,
        stream: BinaryIO,
        *,
        suggested_name: str,
        content_type: str | None = None,
        subdir: str | None = None,
    ) -> str:
        raise NotImplementedError("NasStorage is not yet configured")

    def open(self, storage_key: str) -> BinaryIO:
        raise NotImplementedError("NasStorage is not yet configured")

    def list(self, subdir: str) -> list[StoredFile]:
        raise NotImplementedError("NasStorage is not yet configured")


def get_storage() -> FileStorage:
    """Return the active FileStorage implementation based on config."""
    settings = get_settings()
    backend = settings.storage_backend.lower()
    if backend == "nas":
        return NasStorage()
    # Default: local
    return LocalStorage(settings.storage_root)
