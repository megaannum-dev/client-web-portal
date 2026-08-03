"""BE-5 — File storage adapter + the ``Bucket`` registry.

The DB stores only opaque ``storage_key`` strings, always relative to a
single bucket. Swapping ``LocalStorage`` -> ``NasStorage`` requires changes
only here — nothing in a feature package changes.

Active implementation is chosen by ``STORAGE_BACKEND`` (default: ``local``).

Imports only ``app.core.config`` + stdlib — never a feature package
(``app.libs...``). See proposal seam §7.1(b).
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, NamedTuple, Protocol

from fastapi import HTTPException, status

from app.core.config import get_settings


class Bucket(StrEnum):
    MARKETING = "marketing"  # model_materials.storage_key
    KYC = "kyc"  # onboarding_documents.storage_key
    CONTACT_LOG = "contact_log"  # client_contact_logs.doc_storage_key
    REPORTS = "reports"  # eod_records.file_storage_key  (EoD + EoM)
    LEGAL = "legal"  # read-only drop zone, no metadata table
    STATEMENTS = "statements"  # read-only drop zone, no metadata table


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
        """Persist *stream* and return an opaque, bucket-relative storage_key."""
        ...

    def open(self, storage_key: str) -> BinaryIO:
        """Return a readable binary stream for *storage_key*."""
        ...

    def list(self, subdir: str) -> list[StoredFile]:
        """Enumerate files under `subdir`, one level deep. Never raises for a
        missing directory — returns []."""
        ...


class LocalStorage:
    """Writes files to a configured filesystem mount — one root per bucket."""

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

    def _resolve(self, storage_key: str) -> Path:
        """Resolve a bucket-relative key to an absolute path, refusing anything
        that escapes the bucket root. TRUST BOUNDARY — not simplified away."""
        root = self._root.resolve()
        target = (root / storage_key).resolve()
        if target != root and root not in target.parents:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown storage key")
        return target

    def open(self, storage_key: str) -> BinaryIO:
        return self._resolve(storage_key).open("rb")  # caller is responsible for closing

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


def _bucket_root(bucket: Bucket) -> Path:
    """Per-bucket override if set, else `{storage_root}/{bucket.value}`.
    The setting name is `storage_root_{bucket.value}` for all six — no mapping table."""
    s = get_settings()
    override = getattr(s, f"storage_root_{bucket.value}")
    return Path(override) if override else Path(s.storage_root) / bucket.value


@lru_cache(maxsize=None)
def get_storage(bucket: Bucket) -> FileStorage:
    """The active FileStorage for one bucket. Cached per bucket, so each root is
    mkdir-ed exactly once per process (LocalStorage.__init__)."""
    if get_settings().storage_backend.lower() == "nas":
        return NasStorage()
    return LocalStorage(_bucket_root(bucket))
