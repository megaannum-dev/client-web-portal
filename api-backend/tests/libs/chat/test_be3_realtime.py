# 021 BE-3 — in-process WS ticket store + ConnectionManager
from __future__ import annotations

import asyncio

from app.libs.chat import realtime


class FakeSocket:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[dict] = []  # type: ignore[type-arg]

    async def send_json(self, payload: dict) -> None:  # type: ignore[type-arg]
        if self.fail:
            raise RuntimeError("socket closed")
        self.sent.append(payload)


def test_ticket_is_single_use() -> None:
    ticket = realtime.mint("uid-1")
    assert realtime.pop_ticket(ticket) == "uid-1"
    assert realtime.pop_ticket(ticket) is None


def test_ticket_expires(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    ticket = realtime.mint("uid-1")
    base = realtime._now()
    monkeypatch.setattr(realtime, "_now", lambda: base + 31)
    assert realtime.pop_ticket(ticket) is None


def test_bad_tickets_return_none() -> None:
    assert realtime.pop_ticket(None) is None
    assert realtime.pop_ticket("garbage") is None


def test_send_targets_only_listed_uids() -> None:
    mgr = realtime.ConnectionManager()
    rm1, rm2 = FakeSocket(), FakeSocket()
    mgr.add("rm1", rm1)  # type: ignore[arg-type]
    mgr.add("rm2", rm2)  # type: ignore[arg-type]

    asyncio.run(mgr.send({"m": 1}, to_uids={"rm1"}))

    assert rm1.sent == [{"m": 1}]
    assert rm2.sent == []


def test_multi_tab_both_receive() -> None:
    mgr = realtime.ConnectionManager()
    tab_a, tab_b = FakeSocket(), FakeSocket()
    mgr.add("rm1", tab_a)  # type: ignore[arg-type]
    mgr.add("rm1", tab_b)  # type: ignore[arg-type]

    asyncio.run(mgr.send({"m": 2}, to_uids=["rm1"]))

    assert tab_a.sent == [{"m": 2}] == tab_b.sent


def test_failing_socket_is_evicted() -> None:
    mgr = realtime.ConnectionManager()
    dead = FakeSocket(fail=True)
    mgr.add("rm1", dead)  # type: ignore[arg-type]

    asyncio.run(mgr.send({"m": 3}, to_uids=["rm1"]))

    assert "rm1" not in mgr.connections
