"""Root-level shared fixtures/doubles for the whole `tests/` tree.

Generated for docs/implementations/020-schema-format-cleanup-refactor-be.md §BE-2.

Two shared pieces live here, both consumed by package-local conftests / test
files instead of being hand-rolled per package (the ~264-failure cluster this
unit fixes):

- `make_admin_stub`: the one constructor for a committed admin `User` that is
  safe to hand to `app.dependency_overrides[get_current_admin_user] = lambda:
  user` -- `user.admin_profile` is loaded ON THE INSTANCE before the seed
  session closes, so `access.resolver.actions_for` (which reads
  `user.admin_profile.role`) never lazy-loads a relationship on a detached
  instance. Root cause verified at tests/libs/eod/test_be10_router.py's
  pre-fix fixture shape.

- `FakeIdentityService`: the one test double for
  `app.libs.identity.service.FirebaseIdentityService`, superset of the three
  former per-package copies (tests/cli/conftest.py, tests/libs/clients/conftest.py,
  tests/libs/staff/conftest.py). Exposes `generate_set_password_link` (the
  real service's current name, identity/service.py:66) -- `generate_invite_link`
  is retired and is NOT re-exposed.
"""

from __future__ import annotations

import uuid

from app.models.users import AdminProfile, AdminRole, Portal, User


def make_admin_stub(
    db_factory,
    *,
    role: AdminRole = AdminRole.MOBO,
    firebase_uid: str = "uid-admin",
    email: str = "admin@example.com",
) -> User:
    """A committed Portal.ADMIN User + AdminProfile(role=role) pair, seeded
    through a throwaway session opened from `db_factory` (a sessionmaker) and
    closed before returning -- exactly the router-fixture shape every
    auth-override fixture in this repo uses. `user.admin_profile` is
    refreshed onto the instance before the seed session closes, so the
    returned (now detached) User is safe to use as
    `app.dependency_overrides[get_current_admin_user] = lambda: user`
    indefinitely, even though its session is gone."""
    db = db_factory()
    user = User(id=uuid.uuid4(), firebase_uid=firebase_uid, email=email, portal=Portal.ADMIN)
    db.add(user)
    db.flush()
    db.add(AdminProfile(user_id=user.id, role=role))
    db.commit()
    db.refresh(user)
    db.refresh(user, attribute_names=["admin_profile"])  # load the relationship BEFORE close
    db.close()
    return user


class FakeIdentityService:
    """The single test double for `app.libs.identity.service.FirebaseIdentityService`.
    Superset of the three former per-package copies:

        __init__(self, settings=None, *, existing=None, fail_ensure=False, fail_ensure_exc=None)
        ensure_identity(email, password=None) -> tuple[str, bool]  # adopt (created=False) vs mint
        delete_user(uid) -> None
        generate_set_password_link(email) -> str       # mirrors identity/service.py:66
        fail_next_ensure(exc) -> None                  # one-shot failure, from the staff copy

    `fail_ensure`/`fail_ensure_exc` (constructor kwargs, from the clients copy) make
    EVERY `ensure_identity` call raise, persistently, until toggled off directly.
    `fail_next_ensure` (from the staff copy) is a one-shot failure that fires on the
    very next call only. Both mechanisms are independent and may be combined.

    Call-tracking lists are kept for every method. `generate_invite_link` (the old
    name) is NOT re-exposed -- BE-2 is the unit that retires it from the double."""

    def __init__(
        self,
        settings: object = None,
        *,
        existing: dict[str, str] | None = None,
        fail_ensure: bool = False,
        fail_ensure_exc: Exception | None = None,
    ) -> None:
        self.settings = settings
        self._existing: dict[str, str] = dict(existing or {})
        self._counter = 0
        self.fail_ensure = fail_ensure
        self._fail_ensure_exc = fail_ensure_exc or RuntimeError("firebase identity creation failed")
        self._one_shot_fail: Exception | None = None
        self.ensure_identity_calls: list[str] = []
        self.create_user_calls: list[str] = []
        self.delete_user_calls: list[str] = []
        self.generate_set_password_link_calls: list[str] = []

    def fail_next_ensure(self, exc: Exception) -> None:
        self._one_shot_fail = exc

    def ensure_identity(self, email: str, password: str | None = None) -> tuple[str, bool]:
        self.ensure_identity_calls.append(email)
        if self._one_shot_fail is not None:
            exc, self._one_shot_fail = self._one_shot_fail, None
            raise exc
        if self.fail_ensure:
            raise self._fail_ensure_exc
        existing_uid = self._existing.get(email)
        if existing_uid is not None:
            return existing_uid, False
        self._counter += 1
        uid = f"fake-uid-{self._counter}"
        self._existing[email] = uid
        self.create_user_calls.append(email)
        return uid, True

    def delete_user(self, uid: str) -> None:
        self.delete_user_calls.append(uid)
        for email, existing_uid in list(self._existing.items()):
            if existing_uid == uid:
                del self._existing[email]
                return

    def generate_set_password_link(self, email: str) -> str:
        self.generate_set_password_link_calls.append(email)
        return f"https://fake.invalid/set-password?email={email}"
