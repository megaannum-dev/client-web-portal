# 021 BE-3 — in-process WS ticket store + ConnectionManager
from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from collections.abc import Iterable

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# ponytail: both singletons below are per-process. Correct today because
# Dockerfile:18 runs a single `uvicorn app.main:app` with no --workers, so every
# socket and every fan-out live in the same interpreter. Upgrade trigger: a
# second replica or a --workers flag. Then tickets need a shared store (Redis)
# and fan-out needs a broker/pubsub so a message published on worker A reaches a
# socket parked on worker B.

# Feature-local tunable, bare os.getenv rather than a Settings field --
# same convention as CLIENT_UPLOAD_WINDOW_DAYS (client_portal/service.py:76).
# Why cap socket lifetime at all: a parked socket would otherwise outlive an
# account deactivation indefinitely (auth happened once, at handshake). The cap
# bounds that window; the cost is a periodic reconnect the frontend already does.
MAX_LIFETIME = max(1, int(os.getenv("CHAT_WS_MAX_LIFETIME_SECONDS", "3600")))

TICKET_TTL_SECONDS = 30

# Indirected so a test can monkeypatch the clock. monotonic, not wall clock:
# expiry must not move when the system clock is stepped/NTP-corrected.
_now = time.monotonic


# ---------------------------------------------------------------------------
# Ticket store
# ---------------------------------------------------------------------------
# Why a ticket instead of the Firebase ID token itself:
#   * The whole auth chain here is header-based HTTPBearer (core/security.py:20),
#     and a browser cannot set headers on `new WebSocket()`.
#   * There is no session cookie to fall back on. The admin-frontend `id_token`
#     cookie is a Next.js RSC workaround, set on the *frontend* origin with
#     SameSite=Strict, so it never reaches the API origin.
#   * A Firebase ID token in a query string sits in proxy/access logs for its
#     full ~1h validity. A ticket is single-use and dead in 30s.
#
# The ticket carries an ALREADY-RESOLVED uid: POST /chat/ws-ticket is an ordinary
# header-authenticated endpoint, so _resolve_user has already run -- including the
# firebase_auth_disabled dev bypass (auth/deps.py:27-33), which is therefore
# honoured for free. Consequences: the WS path never verifies a Firebase token
# itself, needs no duplicated dev-mode branch, and socket lifetime is decoupled
# from the ~1h token expiry (see MAX_LIFETIME above).
_tickets: dict[str, tuple[str, float]] = {}
# Precedent: core/security.py:26 -- sync code touched from a threadpool.
_tickets_lock = threading.Lock()


def mint(uid: str) -> str:
    """Issue a single-use 30s ticket for ``uid``."""
    ticket = secrets.token_urlsafe(32)
    now = _now()
    with _tickets_lock:
        # ponytail: opportunistic prune, no background task -- the store only
        # ever holds ~one entry per connecting tab for 30s.
        for stale in [t for t, (_, exp) in _tickets.items() if exp <= now]:
            del _tickets[stale]
        _tickets[ticket] = (uid, now + TICKET_TTL_SECONDS)
    return ticket


def pop_ticket(ticket: str | None) -> str | None:
    """Redeem a ticket, returning its uid, or ``None`` if unknown/used/expired.

    ``None`` input is expected: an unauthenticated socket sends no query param.
    """
    if not ticket:
        return None
    with _tickets_lock:
        # Delete first, then check expiry -- that ordering is what makes a ticket
        # single-use even when it is still within its TTL.
        entry = _tickets.pop(ticket, None)
    if entry is None:
        return None
    uid, expires_at = entry
    return uid if expires_at > _now() else None


# ---------------------------------------------------------------------------
# Connection registry
# ---------------------------------------------------------------------------
class ConnectionManager:
    """Live sockets, keyed by the connecting user's ``firebase_uid``.

    Modelled on the fastapi-postgresql-realtime-tracker reference, with four
    deliberate departures:

    1. Keyed per participant, not a flat list. The reference broadcasts to every
       connection -- right for one shared inventory board, wrong for per-client
       threads.
    2. The key is the *connecting* user's own firebase_uid (popped from their
       ticket) -- not a thread id, not a counterparty. One socket = one
       authenticated user. Two of the three fan-out targets are already uid
       strings on client_profiles (assigned_rm_uid, asst_rm_uid), so a uid-keyed
       registry consumes them raw. House rule: persisted rows use users.id, the
       Firebase/transport boundary uses firebase_uid -- this registry is transport.
    3. A set per uid, because one user may have several tabs open.
    4. No PostgresNotifier equivalent. The reference needs LISTEN/NOTIFY because
       writes can arrive from outside the app; MariaDB has no equivalent and we
       need none -- the only writer is this app, and the sender's own request
       fans out synchronously after commit. Hence no broker anywhere here.
    """

    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}

    def add(self, uid: str, websocket: WebSocket) -> None:
        """Register an *already accepted* socket.

        Named ``add``, not ``connect``: the reference fuses accept() with
        registration, which cannot survive an auth step that runs after accept
        (the ticket arrives in the handshake query string, so the handler must
        accept() -> read ticket -> register). accept() stays out of this class
        rather than gaining an ``already_accepted`` flag for its only caller.
        """
        self.connections.setdefault(uid, set()).add(websocket)

    def disconnect(self, uid: str, websocket: WebSocket) -> None:
        sockets = self.connections.get(uid)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            # Drop the key so departed users don't leak empty sets.
            del self.connections[uid]

    async def send(self, payload: dict, *, to_uids: Iterable[str]) -> None:  # type: ignore[type-arg]
        """Push ``payload`` to every live socket of every uid in ``to_uids``.

        Membership is evaluated by the caller at send time, so a just-unassigned
        RM is simply absent from ``to_uids`` and their still-open socket gets
        nothing -- no registry bookkeeping needed for revocation.
        """
        for uid in to_uids:
            # Copy: eviction below mutates the set we're iterating.
            for websocket in list(self.connections.get(uid, ())):
                try:
                    await websocket.send_json(payload)
                except Exception as exc:
                    logger.warning("chat ws send failed for %s, evicting: %s", uid, exc)
                    self.disconnect(uid, websocket)


manager = ConnectionManager()


async def park(websocket: WebSocket) -> None:
    """Block until the peer disconnects.

    The socket is push-only: no client->server frames are part of this design.
    Inbound frames are read and discarded; receive_text() exists solely so the
    disconnect is observed (same park loop as the reference, main.py:161-170).
    """
    while True:
        await websocket.receive_text()
