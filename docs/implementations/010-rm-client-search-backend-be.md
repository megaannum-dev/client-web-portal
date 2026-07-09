# 010 — RM Client Book: Live Search Against `client_profiles` · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 1 — Backend
> Layer: Backend — **one layer per file.**
> Sibling layer docs: `docs/implementations/010-rm-client-search-backend-fe.md`
> Execution schedule: `docs/execution-schedules/010-rm-client-search-backend-be.md`
> Branch: `searchbar-client-book-be` — cut from parent `searchbar-client-book`, merges back into it (human owns the merge).
> Builds on / prerequisites: `client_profiles`, `users`, `admin_profiles` at their current shape (post-migration `c9e2f4a7b183` / 0011); `Action.CLIENT_VIEW` already declared and granted to `AdminRole.RM` and `AdminRole.ADMIN` (via `set(Action)`) at `api-backend/app/libs/auth/actions.py:9-10,24,34`. No `ROLE_ACTIONS` change is needed for this layer — see proposal § Layer 1 B-3. `AdminRole.COMPLIANCE` is explicitly **not** touched (reverted from an earlier draft of this doc — see D-4).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 1 — Backend |
| Execution schedule | `docs/execution-schedules/010-rm-client-search-backend-be.md` |
| Sibling layer impl docs | `docs/implementations/010-rm-client-search-backend-fe.md` |
| Builds on | Alembic head incl. `c9e2f4a7b183` (0011); no new migration in this layer. |

---

## 2. Branch & session contract

- **Branch:** `searchbar-client-book-be` — cut from parent `searchbar-client-book`. All BE-* units land on this one branch.
- **Isolation:** implementable in a separate session on its own layer branch, in parallel with the Frontend layer. Shares state with the Frontend only through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] Alembic history is at or beyond revision `c9e2f4a7b183` (0011) — the current `client_profiles` shape (native UUID PK, `ib_account` present).
  - [ ] `Action.CLIENT_VIEW` remains granted to `AdminRole.RM` and `AdminRole.ADMIN` in `app/libs/auth/actions.py` (no change needed for either; this is a state check).
  - [ ] §7 seam is a verbatim copy of the proposal's §4 — no drift.
- **Read-first inventory:**
  - `api-backend/app/models/users.py` — `User`, `ClientProfile`, `AdminProfile` models; no edits, but every unit reads their column set. Also `AdminRole` enum (used for role-based scoping).
  - `api-backend/app/libs/auth/deps.py` — `require_action(...)` dep + the `User` it yields (has `firebase_uid`); note it does **not** return the caller's role, only the `User` — every route in this layer looks the role up a second time (see BE-3/BE-4).
  - `api-backend/app/libs/auth/actions.py` — `Action.CLIENT_VIEW` enum member; `ROLE_ACTIONS` dict. **Not modified** by this layer.
  - `api-backend/app/libs/auth/repository.py` (or wherever `AdminProfileRepository` is actually defined — confirm against the import `deps.py:69` uses) — `AdminProfileRepository.get_by_user_id(user_id)`, reused here to resolve the caller's role.
  - `api-backend/app/libs/trade_models/repository.py:208-219` — the `resolve_actor_names` join, the mirror pattern for BE-2.
  - `api-backend/app/libs/trade_models/router.py` — reference layout for router → service dep injection.
  - `api-backend/app/libs/trade_models/schemas.py:126-129` — `ModelsListOut`, the bespoke-envelope precedent.
  - `api-backend/app/main.py:42-45` — where the new router is mounted.
- **Hand-off / exit signal:** all BE-* units committed on `searchbar-client-book-be`, `pytest -q` green, PR opened against `searchbar-client-book`. Human owns the merge.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering / dependency direction:** `router → service → repository`. Router does auth (`Depends(require_action(...))`) + response_model + delegates. Service raises `HTTPException` for business errors and translates repo results to Pydantic. Repository owns all `db.query(...)` — no other layer touches SQLAlchemy. (Pattern: `app/libs/users/`, `app/libs/trade_models/`.)
- **Module layout:** `app/libs/clients/{__init__.py, router.py, service.py, repository.py, schemas.py}`.
- **Router mount:** every new router is included under prefix `/api` in `app/main.py`, matching lines 42-45.
- **Response envelopes:** bespoke, non-generic (mirrors `ModelsListOut`). Do **not** introduce a `Page[T]` generic.
- **Return/error shape:** Pydantic-serialized DTO on 200; `HTTPException(status_code=…)` for anything else. `require_action` handles 401/403.
- **SQLAlchemy usage:** joins to the same table twice **must** use `aliased(User)` so the ON clauses don't collide. Both `ClientUser` (client's own user row, for `email`) and `RM` (the RM's user row, for `assigned_rm_uid` → name) are aliases of `User`.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Every BE-* unit leaves `searchbar-client-book-be` green.
- **Every unit is independently revertible.** BE-3 and BE-4 (the two routes) do not depend on each other; both depend on BE-1/BE-2. Reverting either route commit leaves the other route working.
- **Additive & backward-compatible first.** Everything in this layer is additive — no existing route, model, or migration is edited. Reverting the branch restores the pre-proposal state.
- **Gates before merge (CI, in order):**
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** No DB migration in this layer.
- **Reversibility documented** (see §9).

---

## 4. Architecture

**Target layout:**
```
api-backend/app/libs/clients/
├── __init__.py
├── router.py            # GET /rm/clients, GET /rm/clients/{id}
├── service.py           # ClientService — auth-agnostic business layer
├── repository.py        # ClientRepository — the one SQL query, shared between both endpoints
└── schemas.py           # ClientListItemOut, ClientListOut
```

**Dependency direction:** `router → service → repository`. `repository` imports `app.models.users` (SQLAlchemy models) and nothing from `app.libs.*`. Neither `service` nor `repository` reads request state — the caller's `firebase_uid` is passed in as a plain argument.

**External seams:**
- Reads: `client_profiles`, `users`, `admin_profiles` (all via SQLAlchemy models, no raw SQL).
- Exposes: `GET /api/rm/clients`, `GET /api/rm/clients/{id}` (both guarded by `require_action(Action.CLIENT_VIEW)`, both role-scoped per D-4).
- Consumes: the caller's `User` yielded by `require_action` (specifically, `user.firebase_uid`) and the caller's `AdminRole` (resolved separately via `_get_caller_role`, since `require_action` doesn't expose it).

---

## 5. Modules

### 5.1 `app.libs.clients.schemas`
- **Responsibility:** the Pydantic wire types for the two endpoints (§7 seam, verbatim).
- **Files:** `api-backend/app/libs/clients/schemas.py`.
- **Public surface:** `ClientListItemOut`, `ClientListOut`.
- **Owns features:** BE-1.

### 5.2 `app.libs.clients.repository`
- **Responsibility:** one SQL query builder + two entry points (list, single-by-id) sharing that builder, plus the single role-based scoping decision (D-4). Owns all SQLAlchemy for this module.
- **Files:** `api-backend/app/libs/clients/repository.py`.
- **Public surface:** `ClientRepository.list_visible(role, firebase_uid)`, `ClientRepository.get_visible(role, firebase_uid, client_id)`; module constant `FULL_VISIBILITY_ROLES`.
- **Owns features:** BE-2.

### 5.3 `app.libs.clients.service`
- **Responsibility:** thin translation layer between repository rows and Pydantic DTOs; raises `HTTPException(404)` on empty single-row lookup. Role-agnostic itself — just forwards `role` through to the repository.
- **Files:** `api-backend/app/libs/clients/service.py`.
- **Public surface:** `ClientService.list_visible(role, firebase_uid)`, `ClientService.get_visible(role, firebase_uid, client_id)`.
- **Owns features:** BE-3 (list), BE-4 (detail).

### 5.4 `app.libs.clients.router`
- **Responsibility:** the two FastAPI routes, auth guards, response_model wiring.
- **Files:** `api-backend/app/libs/clients/router.py`, plus a one-line change to `api-backend/app/main.py`.
- **Public surface:** the routes themselves; a `router` symbol imported by `main.py`.
- **Owns features:** BE-3 (list), BE-4 (detail).

---

## 6. Features

### BE-1 — Module scaffold & Pydantic schemas (MANDATORY)

- **Proposal ref:** § Layer 1 A, B-1
- **Module:** §5.1
- **Files:** `create: api-backend/app/libs/clients/__init__.py`, `create: api-backend/app/libs/clients/schemas.py`, `modify: api-backend/app/main.py`
- **Dependencies:** none — parallel-safe.

**Contract:**

```python
# api-backend/app/libs/clients/schemas.py
from __future__ import annotations
from pydantic import BaseModel


class ClientListItemOut(BaseModel):
    """One client_profiles row, joined + shaped per §7.1 of the proposal."""
    id: str                              # str(client_profiles.user_id) — UUID
    name: str | None
    phone: str | None                    # client_profiles.primary_phone
    assigned_rm: str | None              # resolved: admin_profiles.name -> users.email -> uid -> None
    address: str | None
    country_of_residence: str | None
    authorized_person: str | None
    initiate_method: str | None
    ib_account: str | None
    email: str | None                    # users.email (client's user, not RM's)


class ClientListOut(BaseModel):
    items: list[ClientListItemOut]
```

```python
# api-backend/app/main.py — additive line only
from app.libs.clients.router import router as clients_router  # noqa: E402
# ...
app.include_router(clients_router, prefix="/api")
```

**Behavior / invariants:**

- Field names in `ClientListItemOut` are the seam contract; do **not** rename.
- The router import in `main.py` sits alongside the existing `include_router(...)` calls at lines 42-45.
- `main.py` mount does not add BE-3/BE-4's routes at this stage — the router file exists and is empty of routes until those units land. This keeps BE-1 committable in isolation.
- This unit does **not** touch `app/libs/auth/actions.py` — RM and ADMIN both already carry `Action.CLIENT_VIEW` (see front matter). `AdminRole.COMPLIANCE` stays at its current `set()` and is out of scope for this proposal.

**Done when:** `from app.libs.clients import schemas` imports clean; `python -c "from app.main import app; print([r.path for r in app.routes])"` shows the new router mounted (with no `/rm/clients` routes yet).

---

### BE-2 — Repository: shared query builder with dual joins + role-based scoping (MANDATORY)

- **Proposal ref:** § Layer 1 B-2, B-3
- **Module:** §5.2
- **Files:** `create: api-backend/app/libs/clients/repository.py`
- **Dependencies:** BE-1 (module dir must exist).

**Contract:**

```python
# api-backend/app/libs/clients/repository.py
from __future__ import annotations
import uuid
from dataclasses import dataclass
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased
from app.models.users import AdminRole, ClientProfile, User, AdminProfile


# D-4: roles in this set see every client_profiles row, unfiltered. Every other
# role with CLIENT_VIEW (today: only RM) is scoped to their own book. Written as
# an explicit allowlist, not "every role except RM" — so COMPLIANCE (or any future
# role) is never swept into full visibility by accident if it later gains CLIENT_VIEW.
FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}


@dataclass(frozen=True)
class ClientRow:
    """Repository return shape — one row of the joined query. Service maps this
    into ClientListItemOut. Kept plain (dataclass, not Pydantic) so the repo has
    no dependency on the wire schemas."""
    id: str
    name: str | None
    phone: str | None
    assigned_rm: str | None
    address: str | None
    country_of_residence: str | None
    authorized_person: str | None
    initiate_method: str | None
    ib_account: str | None
    email: str | None


class ClientRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_query(self):
        """The one query shared by list + single-row. NO scoping filter here —
        scoping is applied by the caller (list_visible/get_visible) based on role.

        Two aliases of `User`:
          - RM         — the assigned RM's user row, for resolving assigned_rm_uid
          - ClientUser — the client's own user row, for pulling email
        """
        RM = aliased(User)
        RMProfile = aliased(AdminProfile)
        ClientUser = aliased(User)
        rm_name = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)

        return (
            self.db.query(
                ClientProfile.user_id.label("id"),
                ClientProfile.name,
                ClientProfile.primary_phone.label("phone"),
                rm_name.label("assigned_rm"),
                ClientProfile.address,
                ClientProfile.country_of_residence,
                ClientProfile.authorized_person,
                ClientProfile.initiate_method,
                ClientProfile.ib_account,
                ClientUser.email.label("email"),
            )
            .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
            .outerjoin(RMProfile, RMProfile.user_id == RM.id)
            .outerjoin(ClientUser, ClientUser.id == ClientProfile.user_id)
        )

    def _scoped(self, query, role: AdminRole, rm_firebase_uid: str):
        """Applies D-4's role-based WHERE clause. Full-visibility roles get the
        query untouched; every other role is scoped to their own assigned book."""
        if role in FULL_VISIBILITY_ROLES:
            return query
        return query.filter(ClientProfile.assigned_rm_uid == rm_firebase_uid)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> list[ClientRow]:
        rows = self._scoped(self._base_query(), role, rm_firebase_uid).all()
        return [self._row(r) for r in rows]

    def get_visible(self, role: AdminRole, rm_firebase_uid: str, client_id: uuid.UUID) -> ClientRow | None:
        query = self._base_query().filter(ClientProfile.user_id == client_id)
        row = self._scoped(query, role, rm_firebase_uid).one_or_none()
        return self._row(row) if row else None

    @staticmethod
    def _row(r) -> ClientRow:
        return ClientRow(
            id=str(r.id), name=r.name, phone=r.phone, assigned_rm=r.assigned_rm,
            address=r.address, country_of_residence=r.country_of_residence,
            authorized_person=r.authorized_person, initiate_method=r.initiate_method,
            ib_account=r.ib_account, email=r.email,
        )
```

**Behavior / invariants:**

- `_base_query` carries **no** scoping filter — it is pure joins, shared by every caller regardless of role. `_scoped` is the single place D-4's rule lives; both `list_visible` and `get_visible` route through it, so there is exactly one code path that can get the visibility rule wrong, not two.
- `FULL_VISIBILITY_ROLES = {ADMIN}` is a module-level constant, not a per-call parameter — a reviewer can grep this one set to answer "who sees everything" without reading call sites. It does **not** include `COMPLIANCE`.
- `assigned_rm` resolution mirrors `resolve_actor_names` at `api-backend/app/libs/trade_models/repository.py:208-219`: `admin_profiles.name → users.email → raw uid → NULL`. All four levels fall through in SQL, not Python. This join runs unconditionally (even for ADMIN's unfiltered query) — the joins produce the *display* value, independent of the *visibility* filter.
- `LEFT OUTER JOIN` on all three joins — a client with `assigned_rm_uid = NULL` or a missing `admin_profiles` row still returns; the coalesce lands on `NULL` in the worst case.
- `get_visible` returns `None` (not raises) when the id is outside the caller's visible set. Service translates that to 404.

**Done when:** unit tests in §8.3 BE-2 pass — for an RM caller, only their assigned rows return; for an ADMIN caller, every row returns regardless of assignment; email/assigned_rm resolve to the expected joined values in both cases.

---

### BE-3 — List endpoint `GET /rm/clients` (MANDATORY)

- **Proposal ref:** § Layer 1 B-1, B-4; § D-3, D-4
- **Module:** §5.3, §5.4
- **Files:** `create: api-backend/app/libs/clients/service.py`, `create: api-backend/app/libs/clients/router.py`
- **Dependencies:** BE-1, BE-2.

**Contract:**

```python
# api-backend/app/libs/clients/service.py — partial
from __future__ import annotations
import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.libs.clients.repository import ClientRepository, ClientRow
from app.libs.clients.schemas import ClientListItemOut, ClientListOut
from app.models.users import AdminRole


class ClientService:
    def __init__(self, db: Session) -> None:
        self.repo = ClientRepository(db)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> ClientListOut:
        rows = self.repo.list_visible(role, rm_firebase_uid)
        return ClientListOut(items=[self._to_dto(r) for r in rows])

    @staticmethod
    def _to_dto(r: ClientRow) -> ClientListItemOut:
        return ClientListItemOut(**r.__dict__)
```

```python
# api-backend/app/libs/clients/router.py — partial
from __future__ import annotations
from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.auth.repository import AdminProfileRepository  # confirm import path against deps.py:69
from app.libs.clients.schemas import ClientListOut
from app.libs.clients.service import ClientService
from app.models.users import AdminRole, User

router = APIRouter(prefix="/rm", tags=["rm"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> ClientService:
    return ClientService(db)


def _get_caller_role(
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    # Duplicates the AdminProfile lookup require_action already makes internally
    # to check the action — accepted as one small extra query rather than
    # changing require_action's return type for every existing consumer of it.
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)


@router.get("/clients", response_model=ClientListOut)
def list_clients(
    service: Annotated[ClientService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_caller_role)],
) -> ClientListOut:
    return service.list_visible(role, user.firebase_uid)
```

**Behavior / invariants:**

- No query params. No pagination. No server-side filtering.
- Empty visible set is `200 {"items": []}`, never a 404 — applies to an RM with no assigned clients; not realistically applicable to ADMIN unless `client_profiles` itself is empty.
- `require_action(Action.CLIENT_VIEW)` handles 401/403; a caller whose role's `ROLE_ACTIONS` lacks `CLIENT_VIEW` (e.g. MOBO, PM, **COMPLIANCE**) gets 403 before `_get_caller_role` even runs (FastAPI resolves both dependencies, but `require_action` raises first in practice since it's declared first — either order is correct, since both are required for the endpoint to answer). COMPLIANCE getting 403 here is unchanged from today — this proposal does not grant it anything.
- `_get_caller_role` re-queries `AdminProfile` rather than threading the role through `require_action`'s return value — a deliberate small duplication (see the code comment) to avoid touching the shared `app/libs/auth` dependency's signature for this one new consumer.

**Done when:** §8.3 BE-3 tests pass — an RM caller gets only their book; an ADMIN caller gets every client_profiles row; a COMPLIANCE caller gets 403 (unchanged from today); empty items for an RM with no clients; the response body matches `ClientListOut` exactly per §7.

---

### BE-4 — Detail endpoint `GET /rm/clients/{id}` (MANDATORY)

- **Proposal ref:** § Layer 1 B-5; § D-5
- **Module:** §5.3, §5.4
- **Files:** `modify: api-backend/app/libs/clients/service.py`, `modify: api-backend/app/libs/clients/router.py`
- **Dependencies:** BE-1, BE-2, BE-3.

**Contract:**

```python
# app/libs/clients/service.py — additional method
def get_visible(self, role: AdminRole, rm_firebase_uid: str, client_id: uuid.UUID) -> ClientListItemOut:
    row = self.repo.get_visible(role, rm_firebase_uid, client_id)
    if row is None:
        # For RM: does NOT distinguish "not found" from "not yours" — see D-5.
        # For ADMIN: this genuinely means the client doesn't exist, since its
        # visible set (per D-4) is unfiltered.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return self._to_dto(row)
```

```python
# app/libs/clients/router.py — additional route
import uuid

@router.get("/clients/{client_id}", response_model=ClientListItemOut)
def get_client(
    client_id: uuid.UUID,
    service: Annotated[ClientService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_caller_role)],
) -> ClientListItemOut:
    return service.get_visible(role, user.firebase_uid, client_id)
```

**Behavior / invariants:**

- `client_id` is typed as `uuid.UUID` — FastAPI validates and returns 422 on malformed input before the service is called.
- Response body is a **bare** `ClientListItemOut`, not wrapped in `{"items": [...]}` — per §7.
- 404 semantics are role-dependent per D-4: for RM, "does not exist" and "exists but not assigned to caller" are indistinguishable (prevents RM A from probing for RM B's clients); for ADMIN, a 404 always means the client genuinely does not exist, since its visible set has no assignment filter to hide behind.
- Same auth guard + role dependency as BE-3. COMPLIANCE still 403s here, same as BE-3.

**Done when:** §8.3 BE-4 tests pass — the assigned RM gets 200 + the row; a different RM gets 404 (same as a truly-nonexistent id); ADMIN gets 200 + the row for *any* client id, including ones assigned to some RM; a malformed UUID gets 422 for every role.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1)

```
GET /api/rm/clients
  Guard: Depends(require_action(Action.CLIENT_VIEW))
         # already granted to AdminRole.RM; AdminRole.ADMIN already has every Action
         # via ROLE_ACTIONS[ADMIN] = set(Action) — no permission change needed for either role
  Scope (role-based — D-4):
    RM    -> WHERE client_profiles.assigned_rm_uid = current_user.firebase_uid
    ADMIN -> no WHERE clause — every client_profiles row, unfiltered

Query params: none. All filtering happens client-side against the fetched set (D-3).

200 response body (ClientListOut):
{
  "items": [
    {
      "id": "b3f1c2a4-...-uuid",        // client_profiles.user_id, stringified
      "name": "Ardent Capital",
      "phone": "+1 (415) 555-0142",     // client_profiles.primary_phone
      "assigned_rm": "Dana Okafor",     // resolved: admin_profiles.name -> users.email -> raw uid -> null
      "address": "120 Battery Street, Suite 1400\nSan Francisco, CA 94111",
      "country_of_residence": "United States",
      "authorized_person": "Helena Voss",
      "initiate_method": "Referral",
      "ib_account": "IB-4471",
      "email": "h.voss@ardentcap.com"    // users.email, joined via client_profiles.user_id
    }
  ]
}

Errors: standard APIResult envelope on the frontend side (401 -> UNAUTHORIZED via require_action,
403 if caller's role lacks CLIENT_VIEW, network/HTTP_* on transport failure). A caller with an
empty visible set (e.g. an RM with no assigned clients) is a normal 200 with items: [] — never a 404.


GET /api/rm/clients/{id}
  Guard: same as above (require_action(Action.CLIENT_VIEW))
  Scope: same role-based rule as above (RM: assigned_rm_uid match; ADMIN: unfiltered)
  Path param: id — the ClientListItemOut.id (== client_profiles.user_id, UUID)

200 response body: ONE ClientListItemOut (same shape as an items[] element above), NOT wrapped.
404: id is outside the caller's visible set — for an RM this means "doesn't exist OR not assigned
     to them" (indistinguishable, to avoid leaking existence across RMs); for ADMIN it means the
     client genuinely doesn't exist, since its visible set is everything.
Errors: same envelope as the list endpoint.
```

**Field-name ↔ column-name map** (also the exact key set both layers must use verbatim):

| Wire field | `client_profiles` column | Notes |
|---|---|---|
| `id` | `user_id` | Stringified UUID; replaces today's mock slug ids |
| `name` | `name` | |
| `phone` | `primary_phone` | |
| `assigned_rm` | `assigned_rm_uid` (resolved) | Joined to `users.firebase_uid` → `admin_profiles.name`, fallback `users.email`, fallback raw uid, `null` if unset |
| `address` | `address` | |
| `country_of_residence` | `country_of_residence` | |
| `authorized_person` | `authorized_person` | |
| `initiate_method` | `initiate_method` | |
| `ib_account` | `ib_account` | |
| `email` | `users.email` | Joined via `client_profiles.user_id = users.id` (the *client's* user row, not the RM's) |

### 7.2 How this layer honours the seam
- **What this layer contributes:** the two routes, exactly as above, guarded by `require_action(Action.CLIENT_VIEW)`, scoped by role per D-4 (RM: own book; ADMIN: unfiltered), with `assigned_rm` and `email` resolved via SQL-level joins (not Python post-processing). No `ROLE_ACTIONS` change — COMPLIANCE remains at zero granted actions.
- **What this layer assumes from the other side:** the Frontend calls each route at most once per session per caller (D-3); no query params are ever sent; a 404 on `/rm/clients/{id}` is treated as "not yours or not there" for an RM, and as "genuinely doesn't exist" for ADMIN, without further probing either way.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework:** `pytest` — command: `pytest -q` from `api-backend/`.
- **Fixtures / seed:** in-repo `conftest.py` fixtures for a SQLAlchemy session against an ephemeral DB, plus factories for `User` (+ Firebase UID), `AdminProfile` (parameterizable `role` — `RM`, `ADMIN`, `MOBO`, `COMPLIANCE`), and `ClientProfile`. Reuse existing patterns from `api-backend/tests/` (mirror `trade_models` tests).
- **Isolation:** each test creates its own users/clients, no cross-test state.
- **Layer isolation (critical):** tests import only from `app.libs.clients.*`, `app.libs.auth.*`, `app.models.users`, `app.core.database`. They must **not** import from the frontend, spin up a browser, or hit a real network. The seam is honoured by asserting the response body's JSON shape (per §7), not by importing a frontend DTO.

### 8.2 Coverage matrix

| Unit | Test(s) | Asserts |
|---|---|---|
| BE-1 | `test_router_mounted`, `test_schemas_shape` | `/api/rm/clients` and `/api/rm/clients/{id}` are registered on the app; `ClientListItemOut` has the 10 fields of §7. |
| BE-2 | `test_list_visible_rm_returns_assigned_only`, `test_list_visible_admin_returns_everything`, `test_list_for_rm_resolves_names`, `test_get_visible_missing_returns_none_for_rm` | RM scoping filters cross-RM rows; ADMIN sees all seeded clients regardless of assignment; `assigned_rm` = admin_profiles.name; `email` = joined client user email; missing id returns None for an RM caller. |
| BE-3 | `test_list_endpoint_rm_returns_own_book`, `test_list_endpoint_admin_returns_all`, `test_list_endpoint_empty_book`, `test_list_endpoint_forbids_compliance` | Route wraps items in `ClientListOut`; RM gets only their book; ADMIN gets every client; empty is `{"items":[]}` not 404; COMPLIANCE (no granted actions) gets 403, unchanged from today. |
| BE-4 | `test_get_endpoint_returns_item`, `test_get_endpoint_404_when_not_assigned`, `test_get_endpoint_admin_can_fetch_any_client`, `test_get_endpoint_404_when_missing`, `test_get_endpoint_422_on_bad_uuid` | Returns bare `ClientListItemOut`; 404 for foreign-RM's client; ADMIN can fetch a client assigned to any RM; 404 for a genuinely-missing id; 422 on malformed path param. |

### 8.3 Tests

#### BE-1
```python
def test_router_mounted(client):
    paths = {r.path for r in client.app.routes}
    assert "/api/rm/clients" in paths
    assert "/api/rm/clients/{client_id}" in paths


def test_schemas_shape():
    from app.libs.clients.schemas import ClientListItemOut
    assert set(ClientListItemOut.model_fields) == {
        "id", "name", "phone", "assigned_rm", "address", "country_of_residence",
        "authorized_person", "initiate_method", "ib_account", "email",
    }
```

#### BE-2
```python
from app.models.users import AdminRole

def test_list_visible_rm_returns_assigned_only(db_session, make_rm, make_client):
    rm_a = make_rm(name="Dana Okafor")
    rm_b = make_rm(name="Jules Bennett")
    make_client(assigned_rm_uid=rm_a.firebase_uid, name="Ardent Capital")
    make_client(assigned_rm_uid=rm_b.firebase_uid, name="Vela Holdings")

    from app.libs.clients.repository import ClientRepository
    rows = ClientRepository(db_session).list_visible(AdminRole.RM, rm_a.firebase_uid)
    assert [r.name for r in rows] == ["Ardent Capital"]


def test_list_visible_admin_returns_everything(db_session, make_rm, make_client):
    rm_a = make_rm(name="Dana Okafor")
    rm_b = make_rm(name="Jules Bennett")
    make_client(assigned_rm_uid=rm_a.firebase_uid, name="Ardent Capital")
    make_client(assigned_rm_uid=rm_b.firebase_uid, name="Vela Holdings")

    rows = ClientRepository(db_session).list_visible(AdminRole.ADMIN, "irrelevant-uid")
    assert {r.name for r in rows} == {"Ardent Capital", "Vela Holdings"}


def test_list_for_rm_resolves_names(db_session, make_rm, make_client):
    rm = make_rm(name="Dana Okafor", email="dana@x.com")
    make_client(assigned_rm_uid=rm.firebase_uid, name="Ardent Capital", client_email="h.voss@ardentcap.com")

    rows = ClientRepository(db_session).list_visible(AdminRole.RM, rm.firebase_uid)
    assert rows[0].assigned_rm == "Dana Okafor"       # admin_profiles.name wins
    assert rows[0].email == "h.voss@ardentcap.com"     # client user's email


def test_get_visible_missing_returns_none_for_rm(db_session, make_rm):
    import uuid
    rm = make_rm()
    assert ClientRepository(db_session).get_visible(AdminRole.RM, rm.firebase_uid, uuid.uuid4()) is None
```

#### BE-3
```python
def test_list_endpoint_rm_returns_own_book(client, as_rm, seed_book):
    rm_a = as_rm("Dana Okafor")
    rm_b = as_rm("Jules Bennett")
    seed_book(rm_a, ["Ardent Capital"])
    seed_book(rm_b, ["Vela Holdings"])
    r = client.get("/api/rm/clients", headers=rm_a.auth_headers)
    assert r.status_code == 200
    assert {i["name"] for i in r.json()["items"]} == {"Ardent Capital"}


def test_list_endpoint_admin_returns_all(client, as_rm, as_admin_role, seed_book):
    rm_a = as_rm("Dana Okafor")
    rm_b = as_rm("Jules Bennett")
    seed_book(rm_a, ["Ardent Capital"])
    seed_book(rm_b, ["Vela Holdings"])
    admin = as_admin_role("ADMIN")
    r = client.get("/api/rm/clients", headers=admin.auth_headers)
    assert r.status_code == 200
    assert {i["name"] for i in r.json()["items"]} == {"Ardent Capital", "Vela Holdings"}


def test_list_endpoint_empty_book(client, as_rm):
    rm = as_rm("Dana Okafor")  # no clients seeded
    r = client.get("/api/rm/clients", headers=rm.auth_headers)
    assert r.status_code == 200
    assert r.json() == {"items": []}


def test_list_endpoint_forbids_compliance(client, as_admin_role):
    caller = as_admin_role("COMPLIANCE")  # ROLE_ACTIONS[COMPLIANCE] == set(), unchanged by this proposal
    r = client.get("/api/rm/clients", headers=caller.auth_headers)
    assert r.status_code == 403
```

#### BE-4
```python
def test_get_endpoint_returns_item(client, as_rm, seed_book):
    rm = as_rm("Dana Okafor")
    [ardent] = seed_book(rm, ["Ardent Capital"])
    r = client.get(f"/api/rm/clients/{ardent.user_id}", headers=rm.auth_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Ardent Capital"
    assert "items" not in r.json()  # bare object, not wrapped


def test_get_endpoint_404_when_not_assigned(client, as_rm, seed_book):
    rm_a = as_rm("Dana Okafor")
    rm_b = as_rm("Jules Bennett")
    [others_client] = seed_book(rm_b, ["Vela Holdings"])
    r = client.get(f"/api/rm/clients/{others_client.user_id}", headers=rm_a.auth_headers)
    assert r.status_code == 404


def test_get_endpoint_admin_can_fetch_any_client(client, as_rm, as_admin_role, seed_book):
    rm = as_rm("Jules Bennett")
    [vela] = seed_book(rm, ["Vela Holdings"])
    admin = as_admin_role("ADMIN")
    r = client.get(f"/api/rm/clients/{vela.user_id}", headers=admin.auth_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Vela Holdings"


def test_get_endpoint_404_when_missing(client, as_rm):
    import uuid
    rm = as_rm("Dana Okafor")
    r = client.get(f"/api/rm/clients/{uuid.uuid4()}", headers=rm.auth_headers)
    assert r.status_code == 404


def test_get_endpoint_422_on_bad_uuid(client, as_rm):
    rm = as_rm("Dana Okafor")
    r = client.get("/api/rm/clients/not-a-uuid", headers=rm.auth_headers)
    assert r.status_code == 422
```

### 8.4 Aggregate gate
- `pytest -q` green is a merge gate; a red test blocks the branch.
- Target coverage for changed lines: ≥ 90% of new statements in `app/libs/clients/*`.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1..BE-4 committed on `searchbar-client-book-be`; each commit left the branch green.
- [ ] §8 unit tests all pass; CI gate (§3.2) green.
- [ ] §7 matches the proposal's frozen seam verbatim.
- [ ] PR opened against `searchbar-client-book`; human owns the merge.

**Rollback:** fully additive — reverting the branch removes `app/libs/clients/` and the one-line `include_router` in `app/main.py`. No Alembic migration to reverse, no data change. Clean rollback.
