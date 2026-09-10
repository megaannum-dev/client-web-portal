# 021 BE-0 — CHAT storage bucket
"""The Bucket member and its Settings field must ship together: _bucket_root
does getattr(settings, f"storage_root_{bucket.value}") with no default."""

import io

import pytest

from app.core.config import get_settings
from app.core.storage import Bucket, LocalStorage, get_storage


@pytest.fixture
def chat_storage(monkeypatch, tmp_path):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()
    get_storage.cache_clear()
    yield get_storage(Bucket.CHAT)
    get_settings.cache_clear()
    get_storage.cache_clear()


def test_chat_bucket_root(chat_storage):
    assert isinstance(chat_storage, LocalStorage)
    assert chat_storage._root.name == "chat"


def test_chat_round_trip(chat_storage):
    key = chat_storage.save(io.BytesIO(b"hello chat"), suggested_name="note.txt")
    with chat_storage.open(key) as fh:
        assert fh.read() == b"hello chat"


def test_settings_field_paired(chat_storage):
    # AttributeError here == Bucket.CHAT added without storage_root_chat.
    getattr(get_settings(), f"storage_root_{Bucket.CHAT.value}")
