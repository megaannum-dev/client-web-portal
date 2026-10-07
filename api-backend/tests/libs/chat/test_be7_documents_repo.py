# Cross-room documents query (RM "Client Correspondents")
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.libs.chat.repository import ChatRepository, DocumentFilters
from app.libs.chat.schemas import decode_cursor, encode_cursor
from app.models.users import AdminRole, ClientProfile
from tests.libs.onboarding.conftest import make_admin, make_client

T0 = datetime(2026, 3, 1, 12, 0, 0)


@pytest.fixture
def world():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    rm1 = make_admin(db, AdminRole.RM, name="Rita RM")
    rm2 = make_admin(db, AdminRole.RM, name="Ron RM")
    a = make_client(db, assigned_rm_uid=rm1.firebase_uid, name="Alpha Fund")
    b = make_client(db, assigned_rm_uid=rm2.firebase_uid, name="Beta Fund")
    c = make_client(db, assigned_rm_uid=rm2.firebase_uid, name="Gamma Fund")
    db.get(ClientProfile, b.id).asst_rm_uid = rm1.firebase_uid  # rm1 is ARM of Beta
    db.commit()

    repo = ChatRepository(db)
    n = 0

    def add(client, sender, filename, at):
        nonlocal n
        msg = repo.create(client_id=client.id, sender_id=sender.id, body=None)
        att = repo.add_attachment(
            message_id=msg.id,
            storage_key=f"k{n}",
            filename=filename,
            content_type="application/pdf",
            size_bytes=1,
        )
        att.created_at = at
        n += 1
        return att

    # Alpha: 60 rows, minute-spaced, every 3rd one shares a timestamp with the
    # previous (tie-break by id), alternating client / rm senders.
    for i in range(60):
        add(a, a if i % 2 else rm1, f"a{i:02}.pdf", T0 + timedelta(minutes=i - i % 3))
    for i in range(5):
        add(b, b if i % 2 else rm2, f"b{i}.pdf", T0 + timedelta(days=1, minutes=i))
    add(c, c, "Gamma_Report.pdf", T0 + timedelta(days=2))
    db.commit()
    yield repo, rm1, rm2, a, b, c
    db.close()


def _all(repo, uid, f=None, sort="desc"):
    """Walk every page; return (ids, pages)."""
    ids, cursor, pages = [], None, 0
    while True:
        rows, more, _ = repo.documents(
            uid, f or DocumentFilters(), sort=sort, cursor=cursor, limit=7
        )
        ids += [r[0].id for r in rows]
        pages += 1
        if not more:
            return ids, pages
        cursor = (rows[-1][0].created_at, rows[-1][0].id)


def test_scope_rm_and_arm_and_view_all(world):
    repo, rm1, rm2, *_ = world
    assert _all(repo, rm1.firebase_uid)[0].__len__() == 65  # RM of Alpha + ARM of Beta
    assert _all(repo, rm2.firebase_uid)[0].__len__() == 6  # Beta + Gamma
    assert len(_all(repo, None)[0]) == 66  # ADMIN view-all


@pytest.mark.parametrize("sort", ["desc", "asc"])
def test_paging_visits_every_row_once(world, sort):
    repo, rm1, *_ = world
    ids, pages = _all(repo, None, sort=sort)
    assert len(ids) == len(set(ids)) == 66
    assert pages == 10  # 66 rows / 7 per page, last page ends with has_more False
    rows, more, total = repo.documents(None, DocumentFilters(), sort=sort, limit=100)
    assert (more, total, [r[0].id for r in rows]) == (False, 66, ids)


def test_total_ignores_cursor_and_limit(world):
    repo, *_ = world
    rows, more, total = repo.documents(None, DocumentFilters(), limit=5)
    cur = (rows[-1][0].created_at, rows[-1][0].id)
    rows2, _, total2 = repo.documents(None, DocumentFilters(), cursor=cur, limit=5)
    assert (more, total, total2) == (True, 66, 66)
    assert rows2[0][0].id not in {r[0].id for r in rows}


def test_filters(world):
    repo, rm1, rm2, a, b, c = world
    n = lambda f, uid=None: len(_all(repo, uid, f)[0])  # noqa: E731
    assert n(DocumentFilters(view="in")) == 30 + 2 + 1  # client senders
    assert n(DocumentFilters(view="out")) == 30 + 3
    assert n(DocumentFilters(senders=[c.firebase_uid])) == 1
    assert n(DocumentFilters(senders=[rm1.firebase_uid, c.firebase_uid])) == 31
    # inclusive date bounds: day 2 only (Gamma) / day 1 only (Beta)
    d1, d2 = date(2026, 3, 2), date(2026, 3, 3)
    assert n(DocumentFilters(date_from=d2)) == 1
    assert n(DocumentFilters(date_from=d1, date_to=d1)) == 5
    assert n(DocumentFilters(date_to=d1)) == 65
    # q: filename / client name / sender name, case-insensitive
    assert n(DocumentFilters(q="GAMMA_rep")) == 1
    assert n(DocumentFilters(q="beta fund")) == 5
    assert n(DocumentFilters(q="ron rm")) == 3
    assert n(DocumentFilters(q="a07")) == 1
    assert n(DocumentFilters(q="%")) == 0  # LIKE wildcard is escaped
    assert n(DocumentFilters(view="out", q="alpha"), uid=rm2.firebase_uid) == 0


def test_senders_scoped(world):
    repo, rm1, rm2, a, b, c = world
    got = {r[0]: r for r in repo.senders(rm2.firebase_uid)}
    assert set(got) == {rm2.firebase_uid, b.firebase_uid, c.firebase_uid}
    assert got[b.firebase_uid][1:] == ("Beta Fund", False, False, "Beta Fund")
    assert len(repo.senders(None)) == 5  # + rm1, a


def test_cursor_roundtrip_and_malformed():
    import uuid

    ts, i = T0, uuid.uuid4()
    assert decode_cursor(encode_cursor(ts, i)) == (ts, i)
    for bad in ("!!!", "bm90LWEtY3Vyc29y", encode_cursor(ts, i)[:-6]):
        with pytest.raises(HTTPException) as e:
            decode_cursor(bad)
        assert e.value.status_code == 422
