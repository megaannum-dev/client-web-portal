# 001 — Modular Backend Architecture with Role-Based Permissions

**Date:** 2026-05-26  
**Branch:** `internal-user-backendAPI`  
**Status:** Draft  
**Author:** QinQipeng

---

## 1. Context and Motivation

The current backend is a small FastAPI service with a flat layout: one `models.py`, one `deps/auth.py`, and thin routers over placeholder services. As the product grows, this structure has three specific failure modes:

- **Role changes bleed everywhere.** Adding a role today requires touching `models.py`, the auth dependency, and every router that gates on roles.
- **No home for new features.** There is no clear boundary between business logic and data access; new features would be written inconsistently.
- **Data sources are hard-wired.** The database URL is directly consumed inside services; plugging in a second DB or an external financial API requires changing service code.

This proposal defines a modular monolith structure that solves all three without over-engineering.

---

## 2. Goals

1. Adding a role touches exactly one place: the `UserRole` enum and its permission bundle.
2. Adding a feature domain produces a self-contained vertical slice; no other module needs to change.
3. Swapping or extending a data source (database, external API) is isolated to a repository adapter; service and router code is unchanged.
4. The `client-frontend` auth contract is preserved byte-for-byte.
5. The permission system is hardcoded today and extractable to admin-configurable DB rows later with zero endpoint changes.

## 3. Non-Goals

- Splitting into micro-services (this remains a single deployable process).
- Event sourcing, CQRS, or any pattern not required today.
- Changing any API URL, HTTP method, or response shape that `client-frontend` currently calls.
- Admin-configurable permissions (deferred feature — architecture makes it easy to add later).

---

## 4. Preserved Client-Frontend Contract

The following surface must not change in any refactor:

| Method | Path | Response |
|--------|------|----------|
| POST | `/api/auth/register` | `UserOut` (201) |
| POST | `/api/auth/login` | `UserOut` (200) |
| POST | `/api/auth/logout` | 204 No Content |
| GET | `/api/auth/me` | `UserOut` |
| GET | `/api/users/me` | `UserOut` |

`UserOut` fields consumed by `client-frontend/types/portal.ts`:

```typescript
type PortalUser = {
  id: number;
  firebase_uid: string;
  email: string | null;
  role: string;
};
```

These field names and types are frozen. Additional fields may be added to `UserOut` in the future (additive changes are safe), but existing fields must not be renamed, removed, or have their type narrowed.

---

## 5. Role Mapping

| Role Name | Enum Value | Status |
|-----------|-----------|--------|
| Super Admin | `ADMIN` | Existing — unchanged |
| Compliance Officer | `COMPLIANCE` | Existing — unchanged |
| Portfolio Manager | `PM` | Existing — unchanged |
| Portfolio Commander | `PC` | **New** |
| Relationship Manager | `RM` | **New** |
| Client portal user | `CLIENT` | Existing — kept for client-facing portal |
| OPS | *(removed)* | Deprecated — migrate existing OPS users to an appropriate new role before removal |

Because the DB column uses `native_enum=False` (stored as VARCHAR), adding `PC` and `RM` to the enum is a Python-only change. Removing `OPS` requires a data migration to reassign existing rows before the value is dropped from the enum.

---

## 6. Proposed Directory Layout

This is a **hybrid slice** architecture. ORM models and Pydantic schemas are horizontal — they live in top-level shared packages (`models/` and `schemas/`) that any module can import without crossing a module boundary. Everything else (data access, business logic, HTTP wiring) remains in vertical domain slices under `libs/`.

```
api-backend/app/
│
├── core/                         # Infrastructure plumbing — no domain knowledge
│   ├── __init__.py
│   ├── config.py                 # Settings (pydantic-settings), get_settings()
│   ├── database.py               # SQLAlchemy engine, SessionLocal, get_db()
│   └── security.py               # Firebase SDK wrappers (verify token functions)
│
├── utils/                        # Shared stateless helpers — no domain knowledge, no I/O
│   ├── __init__.py
│   ├── pagination.py             # Page/offset helpers for list endpoints
│   ├── responses.py              # Shared response envelope builders
│   └── datetime.py               # Timezone-aware date formatting, parsing utilities
│
├── models/                       # Horizontal layer — SQLAlchemy ORM models (shared across libs/)
│   ├── __init__.py
│   ├── users.py                  # User, UserRole
│   ├── financial.py              # (future: Allotment, Redemption, Fund)
│   └── documents.py              # (future: Document)
│
├── schemas/                      # Horizontal layer — Pydantic request/response types (shared across libs/)
│   ├── __init__.py
│   ├── auth.py                   # FirebaseLoginBody, PortalKind
│   ├── users.py                  # UserOut, UserSelfUpdate, UserUpsert
│   ├── financial.py              # AllotmentRequest/Response, RedemptionRequest/Response
│   └── documents.py              # DocumentUploadRequest, DocumentOut
│
├── libs/                         # Vertical domain slices — repository, service, router only
│   ├── auth/                     # Authentication module
│   │   ├── __init__.py
│   │   ├── deps.py               # get_current_user, require_action (FastAPI Depends)
│   │   ├── actions.py            # Action enum + ROLE_ACTIONS mapping
│   │   ├── router.py             # /api/auth/* endpoints
│   │   └── service.py            # login_or_register, default_role_for_portal
│   │
│   ├── users/                    # User profile module
│   │   ├── __init__.py
│   │   ├── repository.py         # All DB queries for users
│   │   ├── router.py             # /api/users/* endpoints
│   │   └── service.py            # Business logic, calls repository
│   │
│   ├── financial/                # Financial operations module
│   │   ├── __init__.py
│   │   ├── repository.py         # Data access — DB today, external APIs tomorrow
│   │   ├── router.py             # /api/financial/* endpoints
│   │   └── service.py            # process_allotment, process_redemption
│   │
│   └── [future_module]/          # Every new domain follows this same three-file pattern
│       ├── __init__.py
│       ├── repository.py
│       ├── router.py
│       └── service.py
│
└── main.py                       # FastAPI app, CORS middleware, lifespan, router registration
```

### Directory responsibilities at a glance

| Directory | What belongs here | Has I/O or state? |
|-----------|-------------------|:-----------------:|
| `core/` | DB engine, config, Firebase SDK wrappers | Yes |
| `utils/` | Pure stateless helper functions | No |
| `models/` | SQLAlchemy ORM model definitions — shared across all `libs/` modules | Declared, not I/O |
| `schemas/` | Pydantic request/response types — shared across all `libs/` modules | No |
| `libs/` | Domain repositories, services, and routers | Per-request only |

### Module boundary rule

Modules in `libs/` may import from `core/`, `utils/`, `models/`, and `schemas/` freely. A module must **not** import from another `libs/` module directly. Cross-module runtime dependencies (e.g., `financial` needing the authenticated `User`) are satisfied via FastAPI `Depends()` pulling from `libs/auth/deps.py`, which is the single authorised cross-module bridge.

---

## 7. Layer Responsibilities

### 7.1 `core/`

Pure infrastructure. Contains no business rules and no knowledge of what the application does.

**`core/config.py`** — `Settings` (pydantic-settings). All environment variables and secrets are declared here as typed fields. No connection string or credential appears anywhere else.

**`core/database.py`** — SQLAlchemy engine, `SessionLocal`, `Base`, and `get_db()` generator. To add a second database, add a second engine and a second `get_db_*()` here; no other file changes.

**`core/security.py`** — Firebase Admin SDK wrappers: `_init_firebase()`, `verify_firebase_token()`, `verify_firebase_id_token_string()`. Zero domain logic; purely identity-verification plumbing.

### 7.2 `utils/`

Stateless pure functions. No imports from `core/` or `libs/`. If a function requires mocking to unit-test, it does not belong here.

### 7.3 `models/`

The single source of truth for all SQLAlchemy ORM model classes and enums. Split by domain (`users.py`, `financial.py`, `documents.py`) but all referenced against the shared `Base` from `core/database.py`. Any module in `libs/` that needs an ORM type imports it from here directly — no cross-`libs/` import needed.

### 7.4 `schemas/`

All Pydantic request bodies, response models, and shared type aliases. Split by domain to match `models/`. Keeping schemas horizontal avoids the problem where a `libs/auth/` router needs to return `UserOut` (defined in `libs/users/`) — it simply imports from `schemas/users.py` instead.

### 7.5 `libs/auth/deps.py`

The single place that bridges a Firebase identity to a portal `User` row, and the single place that enforces actions. Exposes two reusable FastAPI dependencies:

```python
def get_current_user(...) -> User:
    """Resolve Bearer token → portal User row. Creates row on first sign-in."""

def require_action(action: Action):
    """Return a dependency that enforces a specific action."""
```

### 7.6 `libs/{module}/repository.py`

The only layer that performs data access. Services call repository methods; repositories call the DB session or an external HTTP client. This is the adapter boundary.

Concrete example for the `users` module:

```python
class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.db.query(User).filter(User.firebase_uid == uid).one_or_none()

    def create(self, uid: str, email: str | None, role: UserRole) -> User:
        user = User(firebase_uid=uid, email=email, role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_email(self, user: User, email: str) -> User: ...
    def update_role(self, user: User, role: UserRole) -> User: ...
```

Its FastAPI dependency:

```python
def get_user_repo(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
```

### 7.7 `libs/{module}/service.py`

Contains business logic. Receives repository instances via dependency injection — not raw `Session` objects. Does not know whether data came from MariaDB, PostgreSQL, or an HTTP API.

### 7.8 `libs/{module}/router.py`

Wires HTTP I/O to service calls only. No direct DB access, no raw SQL, no Firebase calls.

---

## 8. Action and Capability Design

### 8.1 Core concept

Each role is a named bundle of actions. An `Action` is the atomic unit — it maps to one specific thing a user can do in one domain. Endpoints gate on actions, not on roles directly. The mapping from role to actions is the only thing that changes when role definitions evolve.

```
UserRole  ──(1:N)──►  Action  ──(1:1)──►  Endpoint / data scope
  ADMIN                FINANCIAL_SUBMIT         POST /api/financial/allotments
  PM                   ANALYTICS_VIEW           GET  /api/analytics/dashboard
  PC                   COMPLIANCE_VIEW          GET  /api/compliance/queue
  ...                  ...
```

This means:
- Adding a new role = adding an enum member + defining its action bundle. No endpoint changes.
- Adding a new capability = adding an `Action` member + updating affected role bundles + gating the new endpoint. No other roles affected.
- Future admin-config = replacing the hardcoded dict with a DB lookup. No endpoint changes.

### 8.2 Functional domains and actions

#### Financial (`financial:*`)

| Action | Description |
|-----------|-------------|
| `FINANCIAL_SUBMIT` | Submit an allotment or redemption (own account or on behalf of a client) |
| `FINANCIAL_MANAGE` | Internal portfolio-level allotment/redemption management |
| `FINANCIAL_VIEW_ALL` | View all transactions across all accounts |

#### Compliance (`compliance:*`)

| Action | Description |
|--------|-------------|
| `COMPLIANCE_VIEW` | Read access to the compliance queue and flagged transactions |
| `COMPLIANCE_REVIEW` | Approve or reject items in the compliance queue |

#### Analytics (`analytics:*`)

| Action | Description |
|--------|-------------|
| `ANALYTICS_VIEW` | View portfolio holdings and NAV for managed portfolios |
| `ANALYTICS_CROSS_PORTFOLIO` | View cross-portfolio aggregates and risk data (senior access) |
| `ANALYTICS_EXPORT` | Export reports to file |

#### Client Management (`clients:*`)

| Action | Description |
|--------|-------------|
| `CLIENT_VIEW` | Read client profiles and account records |
| `CLIENT_MANAGE` | Create and edit client profiles |
| `CLIENT_SUBMIT_ON_BEHALF` | Submit financial requests on behalf of an assigned client |

#### Documents (`documents:*`)

Covers client-facing document storage: KYC questionnaires, legal agreements, and compliance uploads from the client portal. Distinct from the internal compliance review queue.

| Action | Description |
|--------|-------------|
| `DOCUMENT_VIEW_OWN` | View own documents (statements, contracts, KYC status) |
| `DOCUMENT_SUBMIT_OWN` | Upload compliance-related documents (KYC questionnaire, supporting files) |
| `DOCUMENT_VIEW_ALL` | View documents across all client accounts (internal roles) |

#### Administration (`admin:*`)

| Action | Description |
|--------|-------------|
| `USER_VIEW` | List and read internal user records |
| `USER_MANAGE` | Create internal users, assign and change roles |

### 8.3 Role → action matrix

`●` = action granted. All unlisted combinations are denied.

| Action | CLIENT | RM | PM | PC | COMPLIANCE | ADMIN |
|-----------|:------:|:--:|:--:|:--:|:----------:|:-----:|
| `FINANCIAL_SUBMIT` | | ● | | | | ● |
| `FINANCIAL_MANAGE` | | | ● | ● | | ● |
| `FINANCIAL_VIEW_ALL` | | | ● | ● | ● | ● |
| `COMPLIANCE_VIEW` | | | | ● | ● | ● |
| `COMPLIANCE_REVIEW` | | | | | ● | ● |
| `ANALYTICS_VIEW` | | | ● | ● | ● | ● |
| `ANALYTICS_CROSS_PORTFOLIO` | | | | ● | | ● |
| `ANALYTICS_EXPORT` | | | ● | ● | ● | ● |
| `CLIENT_VIEW` | | ● | | ● | | ● |
| `CLIENT_MANAGE` | | ● | | | | ● |
| `CLIENT_SUBMIT_ON_BEHALF` | | ● | | | | ● |
| `DOCUMENT_VIEW_OWN` | ● | | | | | ● |
| `DOCUMENT_SUBMIT_OWN` | ● | | | | | ● |
| `DOCUMENT_VIEW_ALL` | | | ● | ● | ● | ● |
| `USER_VIEW` | | | ● | ● | ● | ● |
| `USER_MANAGE` | | | | | | ● |

**Portfolio Commander (PC)** is a senior Portfolio Manager — inherits all PM actions and additionally gains `COMPLIANCE_VIEW`, `ANALYTICS_CROSS_PORTFOLIO`, and `CLIENT_VIEW`.

**Relationship Manager (RM)** is client-facing — submits allotment and redemption requests on behalf of their assigned clients, and manages client records. No access to portfolio management, compliance, or analytics.

**Compliance Officer** has read access across all transactions, can view and action the compliance queue, and has analytics read access, but cannot initiate transactions or manage users.

**CLIENT** (external, client portal only) is view-only. Clients do not initiate financial requests — they contact their RM directly. The only write action available is uploading their own compliance-related documents (KYC questionnaire, supporting files) through the client portal. Source: stakeholder feedback, Wilson 2026-05-20.

### 8.4 Implementation — `libs/auth/actions.py`

```python
import enum
from app.models.users import UserRole


class Action(str, enum.Enum):  # each member = one thing a role can do
    FINANCIAL_SUBMIT          = "financial:submit"
    FINANCIAL_MANAGE          = "financial:manage"
    FINANCIAL_VIEW_ALL        = "financial:view_all"

    COMPLIANCE_VIEW           = "compliance:view"
    COMPLIANCE_REVIEW         = "compliance:review"

    ANALYTICS_VIEW            = "analytics:view"
    ANALYTICS_CROSS_PORTFOLIO = "analytics:cross_portfolio"
    ANALYTICS_EXPORT          = "analytics:export"

    CLIENT_VIEW               = "clients:view"
    CLIENT_MANAGE             = "clients:manage"
    CLIENT_SUBMIT_ON_BEHALF   = "clients:submit_on_behalf"

    DOCUMENT_VIEW_OWN         = "documents:view_own"
    DOCUMENT_SUBMIT_OWN       = "documents:submit_own"
    DOCUMENT_VIEW_ALL         = "documents:view_all"

    USER_VIEW                 = "admin:user_view"
    USER_MANAGE               = "admin:user_manage"


ROLE_ACTIONS: dict[UserRole, set[Action]] = {
    UserRole.CLIENT: {
        Action.DOCUMENT_VIEW_OWN,
        Action.DOCUMENT_SUBMIT_OWN,
    },
    UserRole.RM: {
        Action.FINANCIAL_SUBMIT,
        Action.CLIENT_VIEW,
        Action.CLIENT_MANAGE,
        Action.CLIENT_SUBMIT_ON_BEHALF,
    },
    UserRole.PM: {
        Action.FINANCIAL_MANAGE,
        Action.FINANCIAL_VIEW_ALL,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_EXPORT,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.PC: {
        Action.FINANCIAL_MANAGE,
        Action.FINANCIAL_VIEW_ALL,
        Action.COMPLIANCE_VIEW,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_CROSS_PORTFOLIO,
        Action.ANALYTICS_EXPORT,
        Action.CLIENT_VIEW,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.COMPLIANCE: {
        Action.FINANCIAL_VIEW_ALL,
        Action.COMPLIANCE_VIEW,
        Action.COMPLIANCE_REVIEW,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_EXPORT,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.ADMIN: set(Action),  # all actions
}


def get_actions_for_role(role: UserRole) -> set[Action]:
    """
    Today: reads from the hardcoded dict above.
    Tomorrow: replace with a DB query — callers are unchanged.
    """
    return ROLE_ACTIONS.get(role, set())
```

### 8.5 `require_action()` dependency — `libs/auth/deps.py`

```python
from app.libs.auth.actions import Action, get_actions_for_role
from app.models.users import User

def require_action(action: Action):
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        granted = get_actions_for_role(user.role)
        if action not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user
    return _dep
```

### 8.6 Usage at an endpoint

```python
# libs/financial/router.py
@router.post("/allotments", response_model=AllotmentResponse)
def create_allotment(
    body: AllotmentRequest,
    user: User = Depends(require_action(Action.FINANCIAL_SUBMIT)),
):
    return financial_service.process_allotment(body, submitted_by=user)


# libs/analytics/router.py
@router.get("/cross-portfolio")
def cross_portfolio_view(
    user: User = Depends(require_action(Action.ANALYTICS_CROSS_PORTFOLIO)),
):
    ...
```

The endpoint never mentions a role. The action-to-role mapping lives entirely in `actions.py`.

---

## 9. Data Source Extensibility

The repository pattern is the only required convention for data source pluggability.

| Scenario | What changes | What stays the same |
|----------|-------------|---------------------|
| Add a second SQL database | New engine + `get_db_2()` in `core/database.py`; inject into the target repository | All services and routers |
| Replace MariaDB with PostgreSQL | Change `DATABASE_URL` in config; swap `pymysql` driver | All repositories, services, routers |
| Pull portfolio data from a custodian API | `financial/repository.py` calls HTTP client instead of (or alongside) DB | `financial/service.py`, `financial/router.py` |
| Add a caching layer (Redis) | Add Redis client to `core/`; inject into relevant repositories | Services and routers |
| Add Bloomberg market data | New `market_data/repository.py` wraps Bloomberg adapter | All other modules |

All connection strings, API keys, and credentials are declared as `Settings` fields in `core/config.py` and sourced from environment variables. Nothing is hard-coded.

---

## 10. Future: Admin-Configurable Actions

When this feature is needed, only `get_actions_for_role()` changes. Every endpoint, service, and test is untouched.

```python
# BEFORE (today — hardcoded dict)
def get_actions_for_role(role: UserRole) -> set[Action]:
    return ROLE_ACTIONS.get(role, set())

# AFTER (DB-driven)
def get_actions_for_role(role: UserRole, db: Session) -> set[Action]:
    rows = db.query(RoleAction).filter(RoleAction.role == role).all()
    return {Action(row.action) for row in rows}
```

The DB table for that future state:

```sql
CREATE TABLE role_actions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    role        VARCHAR(32) NOT NULL,
    action      VARCHAR(64) NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT NOW(),
    UNIQUE KEY uq_role_action (role, action)
);
```

Seeding this table from `ROLE_ACTIONS` is a one-time data migration. The hardcoded dict can be removed after the seed is verified.

---

## 11. Migration Path (zero breaking changes)

This refactor is purely a file reorganisation. No API URL, response shape, or database schema changes.

| Step | Action | Risk |
|------|--------|------|
| 1 | Create `core/` and `utils/`; move `config.py` and `database.py` into `core/`; update imports | Low — import-only change |
| 2 | Create `core/security.py`; extract Firebase functions from `deps/auth.py` | Low |
| 3 | Create `models/users.py` (horizontal); move `User` + `UserRole`; add `PC`, `RM`; drop `OPS` | Low (no DDL change) |
| 4 | Create `libs/users/repository.py`; move raw DB queries out of `deps/auth.py` and `routers/users.py` | Medium — logic moves but behaviour unchanged |
| 5 | Create `schemas/users.py` (horizontal); create `libs/users/service.py` and `libs/users/router.py` | Medium |
| 6 | Create `libs/auth/`; move auth logic to `service.py`; create `actions.py`; create `schemas/auth.py` (horizontal); move router and deps | Medium |
| 7 | Create `schemas/financial.py`, `schemas/documents.py`, `models/financial.py`, `models/documents.py` (horizontal); create `libs/financial/` and `libs/documents/` with repository, service, router only | Low |
| 8 | Update `main.py` to import routers from `libs/` paths | Low |
| 9 | Delete old shims and flat dirs (`app/config.py`, `app/database.py`, `app/deps/`, `app/routers/`, `app/services/`). `app/models/` and `app/schemas/` are **canonical** — do not delete them | Low — dead code removal |
| 10 | Smoke-test: `POST /api/auth/login` returns `UserOut`; `GET /api/users/me` works | Verification |

Each step is independently reviewable. Steps 1–2 and steps 7–8 can be parallelised.

---

## 12. What Does Not Change

- **Docker Compose setup** — the `api-backend` service definition, port, and environment variables are unchanged.
- **Client-frontend** — no code changes required in `client-frontend/`.
- **Admin-frontend** — no code changes required.
- **Database schema** — no DDL migrations required for the refactor itself. The only data migration is reassigning `OPS` users before removing that enum value.
- **Firebase integration** — auth flow, token verification, and the dev bypass (`FIREBASE_AUTH_DISABLED`) behave identically.

---

## 13. Open Questions

1. **OPS role migration**: Which new role should existing `OPS` users be reassigned to before `OPS` is removed? (Options: `RM`, `ADMIN`, or case-by-case manual review.)
2. **Role self-selection at signup**: To be decided with Wilson / Joanna. Architecture supports both flows — no code change needed once the policy is decided.
3. **RM client scope**: The current design grants `CLIENT_SUBMIT_ON_BEHALF` globally to all RMs. In practice, an RM is likely scoped to their assigned client list — a data-level constraint (join table or FK) on top of the permission. This should be designed before the first RM endpoint is built.
4. **PC on compliance**: PC currently has read-only access to the compliance queue. If PC needs to annotate or flag items without full approval authority, a `COMPLIANCE_ANNOTATE` action should be added.
5. **CLIENT read access scope**: CLIENT is currently write-only for documents and has no explicit view actions for portfolio or transaction history. If clients need to view their own holdings or past transaction status (as a read-only audit trail), a `FINANCIAL_VIEW_OWN` action or a data-scoped variant of `ANALYTICS_VIEW` should be added. This depends on what the `/portfolio` and `/overview` pages will actually fetch from the backend once mock data is replaced.
6. **Alembic**: The current setup uses `Base.metadata.create_all()` on startup. Alembic should be introduced before the first production deployment.
