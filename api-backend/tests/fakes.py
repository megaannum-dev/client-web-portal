"""In-memory test doubles for external services.

``FakeFirebaseIdentityService`` substitutes for B2's not-yet-existing real
``FirebaseIdentityService``. It anticipates that service's public contract so
later branches (idempotency, saga/compensation) can inject it without touching
Firebase.

Contract this fake implements (frozen by the B0 spec):

* ``create_user(email) -> uid``            mint a brand-new identity (raises if
                                           the email already has one)
* ``get_user_by_email(email) -> uid|None`` lookup, ``None`` when absent
* ``generate_invite_link(email) -> str``   deterministic invite URL
* ``delete_user(uid)``                     idempotent; not-found is success
* ``ensure_identity(email) -> (uid, created)``  the load-bearing idempotency
                                           primitive: ``created=True`` when a
                                           new identity was minted, ``False``
                                           when an existing one was adopted.

Identities are stored in-memory keyed by email. UIDs are deterministic
(``fake-uid-<n>`` in creation order) so tests can assert exact values.
"""

from __future__ import annotations

import threading


class FakeFirebaseIdentityError(Exception):
    """Raised on contract violations (e.g. creating a duplicate identity)."""


class FakeFirebaseIdentityService:
    """Deterministic, in-memory stand-in for the real FirebaseIdentityService."""

    def __init__(self) -> None:
        # email -> uid  and  uid -> email, kept in sync.
        self._by_email: dict[str, str] = {}
        self._by_uid: dict[str, str] = {}
        self._counter = 0
        self._lock = threading.Lock()
        # Test-introspection counters: how many times each op ran.
        self.calls: dict[str, int] = {
            "create_user": 0,
            "get_user_by_email": 0,
            "generate_invite_link": 0,
            "delete_user": 0,
            "ensure_identity": 0,
        }

    # -- helpers ---------------------------------------------------------

    @staticmethod
    def _normalize(email: str) -> str:
        return email.strip().lower()

    def _mint_uid(self) -> str:
        self._counter += 1
        return f"fake-uid-{self._counter}"

    # -- contract --------------------------------------------------------

    def create_user(self, email: str) -> str:
        """Mint a brand-new identity. Raises if the email already has one."""
        self.calls["create_user"] += 1
        key = self._normalize(email)
        with self._lock:
            if key in self._by_email:
                raise FakeFirebaseIdentityError(
                    f"identity already exists for {email!r}"
                )
            uid = self._mint_uid()
            self._by_email[key] = uid
            self._by_uid[uid] = key
            return uid

    def get_user_by_email(self, email: str) -> str | None:
        """Return the uid for ``email`` or ``None`` if no identity exists."""
        self.calls["get_user_by_email"] += 1
        return self._by_email.get(self._normalize(email))

    def generate_invite_link(self, email: str) -> str:
        """Deterministic invite link. Does not require an existing identity."""
        self.calls["generate_invite_link"] += 1
        return f"https://fake-invite.local/{self._normalize(email)}"

    def delete_user(self, uid: str) -> None:
        """Delete by uid. Not-found is treated as success (idempotent)."""
        self.calls["delete_user"] += 1
        with self._lock:
            email = self._by_uid.pop(uid, None)
            if email is not None:
                self._by_email.pop(email, None)

    def ensure_identity(self, email: str) -> tuple[str, bool]:
        """Idempotency primitive keyed by email.

        Returns ``(uid, created)``: ``created=True`` when a new identity was
        minted, ``False`` when an existing one was adopted. Calling twice with
        the same email yields the same uid and ``created=False`` the second time.
        """
        self.calls["ensure_identity"] += 1
        key = self._normalize(email)
        with self._lock:
            existing = self._by_email.get(key)
            if existing is not None:
                return existing, False
            uid = self._mint_uid()
            self._by_email[key] = uid
            self._by_uid[uid] = key
            return uid, True
