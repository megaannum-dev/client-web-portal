# 001 — Implementation: Modular Backend Architecture

**Date:** 2026-05-26
**Implements:** [Proposal 001](../proposals/001-2026-05-26-modular-backend-architecture.md)
**Branch:** `internal-user-backendAPI`
**Status:** Draft
**Author:** QinQipeng

---

## Decisions and Assumptions

The following are resolved here so the document is self-contained and executable:

| # | Decision |
|---|----------|
| D-1 | **OPS users**: No OPS rows exist in the database. `OPS` is simply dropped from the `UserRole` enum — no data migration SQL required. |
| D-2 | **Documents module**: A stub `libs/documents/` module is created now alongside `financial/`. All endpoints return `501 Not Implemented`. The `DOCUMENT_*` actions are wired immediately. |
| D-3 | **`FIREBASE_SERVICE_ACCOUNT_JSON`**: Currently read via `os.environ.get()` inside `deps/auth.py`, bypassing `Settings`. It is moved into `core/config.py` as `firebase_service_account_json: str | None = None`. No behaviour change; all secrets consolidated in one place. |
| D-4 | **`create_all()` / Alembic**: `Base.metadata.create_all()` remains in `lifespan` for now. Alembic is a separate pre-production task. `Base` is made importable from `core/database.py` so Alembic can discover all models. |
| D-5 | **Refactor strategy**: Compatibility shims are introduced at old paths during the transition so that each step leaves the server in a working state. Shims are deleted in Step 9 only after all routes are verified. |
| D-6 | **`dev_mode` flag**: A single boolean in `Settings` controls whether internal users can self-select their role at registration. `True` = dev (self-selection allowed); `False` = prod (admin must pre-create internal users via a protected endpoint; self-registration for internal portal is rejected). CLIENT portal registration is unaffected by this flag in both modes. |

---

## Pre-flight Checks

Before touching any code, confirm the server is healthy on the current branch:

```bash
cd api-backend
FIREBASE_AUTH_DISABLED=true uvicorn app.main:app --reload
```

`GET /health` must return `{"status": "ok"}`.

Also confirm the expected current file tree:

```
api-backend/app/
├── config.py
├── database.py
├── models.py
├── main.py
├── deps/auth.py
├── routers/auth.py
├── routers/users.py
├── routers/allotment.py
├── routers/redemption.py
├── schemas/auth.py
├── schemas/user.py
├── schemas/financial.py
└── services/financial.py
```

---

## Step 1 — Create `core/` and `utils/`; migrate `config.py` and `database.py`

**What changes:** Two new top-level packages are introduced. `config.py` and `database.py` move into `core/`. Compatibility shims at the old paths forward all existing imports unchanged.

**Risk:** Low. Import-only change.

### 1.1 Files to create

```
api-backend/app/core/__init__.py         (empty)
api-backend/app/core/config.py
api-backend/app/core/database.py
api-backend/app/utils/__init__.py        (empty)
api-backend/app/utils/pagination.py
api-backend/app/utils/responses.py
api-backend/app/utils/datetime.py
```

### 1.2 `app/core/config.py`

Identical to the current `app/config.py` plus the new `firebase_service_account_json` field (D-3):

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://portal:portalsecret@localhost:3306/portal"
    firebase_project_id: str | None = None
    firebase_credentials_path: str | None = None
    firebase_service_account_json: str | None = None
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    firebase_auth_disabled: bool = False

    # Controls internal-user registration behaviour (see D-6):
    #   True  (dev)  — the register endpoint accepts a `role` field from the request body,
    #                  letting internal users pick their role at signup for testing purposes.
    #   False (prod) — the register endpoint rejects admin-portal self-registration entirely;
    #                  internal users must be pre-created by a Super Admin via POST /api/users.
    dev_mode: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`FIREBASE_SERVICE_ACCOUNT_JSON` is the environment variable name. `pydantic-settings` maps it automatically to `firebase_service_account_json`.

### 1.3 `app/core/database.py`

`Base` moves here from `app/models.py`. This is the single location Alembic will target for model discovery.

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=30,
    pool_recycle=3600,
    pool_timeout=30,
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 1.4 `app/utils/pagination.py`

```python
from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)
```

### 1.5 `app/utils/responses.py`

```python
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str
```

### 1.6 `app/utils/datetime.py`

```python
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)
```

### 1.7 Compatibility shims at old paths

These shims keep all existing imports working while the migration proceeds. They are deleted in Step 9.

**`app/config.py`** — replace entire contents:

```python
from app.core.config import Settings, get_settings  # noqa: F401
```

**`app/database.py`** — replace entire contents:

```python
from app.core.database import Base, engine, get_db, SessionLocal  # noqa: F401
```

### 1.8 Step 1 verification

Restart the server. All existing routes (`/health`, `/api/auth/login`, `/api/users/me`) must return the same responses as before.

---

## Step 2 — Extract Firebase plumbing into `core/security.py`

**What changes:** The three Firebase functions in `app/deps/auth.py` (`_init_firebase`, `verify_firebase_id_token_string`, `verify_firebase_token`) move to `core/security.py`. `deps/auth.py` is updated to import from there.

**Risk:** Low. Pure code movement; logic is identical.

### 2.1 Files to create

```
api-backend/app/core/security.py
```

### 2.2 `app/core/security.py`

```python
from __future__ import annotations

import json
import logging
from typing import Annotated

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

FIREBASE_CLOCK_SKEW_SECONDS = 10
security = HTTPBearer(auto_error=False)


def _init_firebase(settings: Settings) -> None:
    if settings.firebase_auth_disabled:
        return
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    opts: dict[str, str] = {}
    if settings.firebase_project_id:
        opts["projectId"] = settings.firebase_project_id

    if settings.firebase_service_account_json:
        info = json.loads(settings.firebase_service_account_json)
        cred = credentials.Certificate(info)
        firebase_admin.initialize_app(cred, opts)
        return

    cred_path = settings.firebase_credentials_path
    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, opts)
        return

    if settings.firebase_project_id:
        try:
            firebase_admin.initialize_app(options=opts)
            return
        except Exception:
            pass

    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, opts)
    except Exception as exc:
        raise RuntimeError(
            "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or "
            "FIREBASE_CREDENTIALS_PATH, or set FIREBASE_AUTH_DISABLED=true for local smoke tests."
        ) from exc


def verify_firebase_id_token_string(id_token: str | None, settings: Settings) -> dict:
    """Verify a raw Firebase ID token string (e.g. from POST /auth/login)."""
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if not id_token or not id_token.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id_token is required")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(id_token.strip(), clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS)
    except Exception as exc:
        logger.info("Invalid Firebase id_token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired id_token"
        ) from exc


def verify_firebase_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Verify Authorization: Bearer <Firebase ID token>."""
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(creds.credentials, clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS)
    except Exception as exc:
        logger.info("Invalid Firebase token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc
```

### 2.3 Update `app/deps/auth.py`

Replace the three Firebase function definitions with imports from `core/security.py`. All other functions (`ensure_user_for_firebase_claims`, `get_current_user`, `require_roles`, `default_role_for_portal`) remain in place — they are superseded in Step 6 but must not be removed yet.

At the top of `app/deps/auth.py`, replace:

```python
# REMOVE these three function definitions:
#   def _init_firebase(...)
#   def verify_firebase_id_token_string(...)
#   def verify_firebase_token(...)
# REMOVE: security = HTTPBearer(auto_error=False)
# REMOVE: FIREBASE_CLOCK_SKEW_SECONDS = 10
# REMOVE: import json, os (if only used by the Firebase functions)
```

Add at the top instead:

```python
from app.core.security import (
    security,
    verify_firebase_token,
    verify_firebase_id_token_string,
)
```

The rest of `deps/auth.py` (`ensure_user_for_firebase_claims`, `get_current_user`, `require_roles`, `default_role_for_portal`) stays untouched.

### 2.4 Step 2 verification

Server starts. `POST /api/auth/login` returns `UserOut`. `GET /api/auth/me` with a bearer token (or disabled auth) returns `UserOut`.

---

## Step 3 — Create `models/users.py`; extend `UserRole`; drop `OPS`

**What changes:** `User` and `UserRole` move into the horizontal `models/users.py`. `OPS` is dropped (D-1). `PC` and `RM` are added. `app/models.py` (the old flat file) is deleted and replaced by the `app/models/` package; `app/models/__init__.py` re-exports the same names so existing imports continue to work.

**Risk:** Low for adding `PC`/`RM`. Dropping `OPS` is safe because no `OPS` rows exist (D-1). The column is `native_enum=False` (VARCHAR), so no DDL migration is required for either addition or removal.

### 3.1 Files to create

```
api-backend/app/models/__init__.py       (re-export shim — see 3.3)
api-backend/app/models/users.py
api-backend/app/libs/__init__.py         (empty)
api-backend/app/libs/users/__init__.py   (empty)
```

**Note:** Delete the old `api-backend/app/models.py` flat file before creating the `app/models/` directory.

### 3.2 `app/models/users.py`

```python
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, enum.Enum):
    CLIENT = "CLIENT"
    RM = "RM"
    PM = "PM"
    PC = "PC"
    COMPLIANCE = "COMPLIANCE"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, native_enum=False, length=32), nullable=False, default=UserRole.CLIENT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

### 3.3 `app/models/__init__.py` (backward-compat re-export)

Any code still using `from app.models import User, UserRole` continues to work:

```python
from app.models.users import User, UserRole  # noqa: F401
from app.core.database import Base  # noqa: F401
```

### 3.4 Update `app/main.py` (interim)

`main.py` currently imports `Base` from `app.models`. Update it to import directly from `app.core.database` so the `create_all` call discovers the moved model:

```python
# Change:
from app.models import Base
# To:
from app.core.database import Base
```

Also ensure `models/users.py` is imported before `create_all` runs (importing it registers the ORM class with `Base.metadata`). Add to `main.py`:

```python
import app.models.users  # noqa: F401 — registers User with Base.metadata
```

This import line is removed in Step 8 when `main.py` is fully rewritten.

### 3.5 Step 3 verification

Server starts. `GET /api/users/me` still returns `UserOut`. Confirm no `OPS` value appears in `UserRole` by checking the enum in the Python REPL:

```python
from app.models.users import UserRole
list(UserRole)
# Expected: [CLIENT, RM, PM, PC, COMPLIANCE, ADMIN]
```

---

## Step 4 — Create `libs/users/repository.py`

**What changes:** All raw DB queries for `User` objects move from `deps/auth.py` and `routers/users.py` into a `UserRepository` class.

**Risk:** Medium — logic moves but behaviour is identical. Existing code in `deps/auth.py` and `routers/users.py` continues to call DB directly until Step 5 replaces those files.

### 4.1 Files to create

```
api-backend/app/libs/users/repository.py
```

### 4.2 `app/libs/users/repository.py`

```python
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.users import User, UserRole


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.db.query(User).filter(User.firebase_uid == uid).one_or_none()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).one_or_none()

    def create(self, uid: str, email: str | None, role: UserRole) -> User:
        user = User(firebase_uid=uid, email=email, role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_email(self, user: User, email: str) -> User:
        user.email = email
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_role(self, user: User, role: UserRole) -> User:
        user.role = role
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_all(self) -> list[User]:
        return self.db.query(User).all()


def get_user_repo(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
```

No verification step needed — this file is not yet wired into any router.

---

## Step 5 — Create `schemas/users.py`; create `libs/users/service.py` and `router.py`

**What changes:** The `users` module is completed. Pydantic schemas are placed in the horizontal `schemas/users.py`. The new router replaces `routers/users.py` as the handler for `/api/users/*`. Role-gating switches from `require_roles()` to `require_action()` (imported from `libs/auth/` which is created in Step 6 — see note below on ordering).

**Risk:** Medium. The users router is replaced.

**Ordering note:** `libs/users/router.py` imports `require_action` and `Action` from `libs/auth/`. Because `libs/auth/` is created in Step 6, there are two acceptable orderings:

- **Option A (recommended):** Complete Step 6 immediately after Step 5.2 and Step 5.3 (schemas and service), then finish Step 5.4 (router) after Step 6 is done.
- **Option B:** Write the router with a `# TODO: switch to require_action after Step 6` comment and import `require_roles` from `deps/auth` as a temporary placeholder.

This document assumes Option A.

### 5.1 Files to create

```
api-backend/app/schemas/__init__.py      (empty)
api-backend/app/schemas/users.py
api-backend/app/libs/users/service.py
api-backend/app/libs/users/router.py
```

### 5.2 `app/schemas/users.py`

```python
from pydantic import BaseModel, EmailStr

from app.models.users import UserRole


class UserOut(BaseModel):
    id: int
    firebase_uid: str
    email: str | None
    role: UserRole

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    email: EmailStr | None = None


class UserUpsert(BaseModel):
    email: EmailStr | None = None
    role: UserRole = UserRole.CLIENT
```

`UserOut` is the frozen client-frontend contract. The field names and types must not change.

### 5.3 `app/libs/users/service.py`

```python
from app.models.users import User, UserRole
from app.libs.users.repository import UserRepository


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.repo.get_by_firebase_uid(uid)

    def ensure_user(self, uid: str, email: str | None, role: UserRole) -> User:
        user = self.repo.get_by_firebase_uid(uid)
        if user is None:
            return self.repo.create(uid, email, role)
        if email and user.email != email:
            return self.repo.update_email(user, email)
        return user

    def update_email(self, user: User, email: str) -> User:
        return self.repo.update_email(user, email)

    def update_role(self, user: User, role: UserRole) -> User:
        return self.repo.update_role(user, role)
```

### 5.4 `app/libs/users/router.py`

*(Complete this after Step 6 so `require_action` and `Action` are available.)*

```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_user, require_action
from app.libs.users.repository import UserRepository, get_user_repo
from app.libs.users.service import UserService
from app.models.users import User
from app.schemas.users import UserOut, UserSelfUpdate, UserUpsert

router = APIRouter(prefix="/users", tags=["users"])


def _get_service(repo: UserRepository = Depends(get_user_repo)) -> UserService:
    return UserService(repo)


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserSelfUpdate,
    service: UserService = Depends(_get_service),
    user: User = Depends(get_current_user),
) -> User:
    if body.email is not None:
        return service.update_email(user, str(body.email))
    return user


@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: UserUpsert,
    service: UserService = Depends(_get_service),
    _: User = Depends(require_action(Action.USER_MANAGE)),
) -> User:
    row = service.repo.get_by_firebase_uid(firebase_uid)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.email is not None:
        service.update_email(row, str(body.email))
    return service.update_role(row, body.role)


@router.get("/{firebase_uid}", response_model=UserOut)
def read_user_by_uid(
    firebase_uid: str,
    service: UserService = Depends(_get_service),
    _: User = Depends(require_action(Action.USER_VIEW)),
) -> User:
    row = service.repo.get_by_firebase_uid(firebase_uid)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row
```

**Change from current behaviour:** `PATCH /{firebase_uid}/role` previously required `UserRole.ADMIN`; it now requires `Action.USER_MANAGE` (which is granted only to `ADMIN`). Net enforcement is identical.

**Change from current behaviour:** `GET /{firebase_uid}` previously allowed `ADMIN | COMPLIANCE | PM`; it now requires `Action.USER_VIEW` (granted to `PM`, `PC`, `COMPLIANCE`, `ADMIN`). This adds `PC` to the allowed set, which is consistent with the proposal matrix.

---

## Step 6 — Create `libs/auth/` and `schemas/auth.py`

**What changes:** The auth module is built. `actions.py` introduces the `Action` enum and `ROLE_ACTIONS` dict. `deps.py` introduces `get_current_user` (new version, calling repository) and `require_action`. Auth request/response schemas go into the horizontal `schemas/auth.py`. The auth router replaces `routers/auth.py`.

**Risk:** Medium. The auth router and the auth dependency chain are replaced.

### 6.1 Files to create

```
api-backend/app/libs/auth/__init__.py    (empty)
api-backend/app/libs/auth/actions.py
api-backend/app/libs/auth/deps.py
api-backend/app/libs/auth/service.py
api-backend/app/libs/auth/router.py
api-backend/app/schemas/auth.py
```

### 6.2 `app/libs/auth/actions.py`

```python
import enum

from app.models.users import UserRole


class Action(str, enum.Enum):
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
    UserRole.ADMIN: set(Action),
}


def get_actions_for_role(role: UserRole) -> set[Action]:
    """
    Today: reads from the hardcoded dict.
    Tomorrow: replace with a DB query — all callers are unchanged.
    """
    return ROLE_ACTIONS.get(role, set())
```

### 6.3 `app/libs/auth/deps.py`

```python
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import verify_firebase_token
from app.libs.auth.actions import Action, get_actions_for_role
from app.libs.users.repository import UserRepository
from app.models.users import User, UserRole


def get_current_user(
    claims: Annotated[dict, Depends(verify_firebase_token)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if settings.firebase_auth_disabled:
        uid, email = "dev-user", "dev@example.com"
    else:
        uid = claims.get("uid")
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid")
        raw_email = claims.get("email")
        email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None

    repo = UserRepository(db)
    user = repo.get_by_firebase_uid(uid)
    if user is None:
        user = repo.create(uid, email, UserRole.CLIENT)
    elif email and user.email != email:
        user = repo.update_email(user, email)
    return user


def require_action(action: Action):
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if action not in get_actions_for_role(user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user
    return _dep
```

**Note on dev user role:** In `firebase_auth_disabled` mode, `get_current_user` looks up the `dev-user` row (created on first call). The existing code in `deps/auth.py` creates the dev user with `UserRole.ADMIN`. After the migration, `get_current_user` here creates the dev user with `UserRole.CLIENT`. To preserve the dev user as ADMIN during development, either:

- Set the dev user's role to ADMIN manually after first login, or
- Change the default `UserRole.CLIENT` to `UserRole.ADMIN` in the `firebase_auth_disabled` branch only.

The current `app/deps/auth.py` explicitly creates dev users as `ADMIN`. The new `deps.py` must match this to avoid breaking the dev workflow. Update the `firebase_auth_disabled` branch:

```python
if settings.firebase_auth_disabled:
    uid, email = "dev-user", "dev@example.com"
    repo = UserRepository(db)
    user = repo.get_by_firebase_uid(uid)
    if user is None:
        user = repo.create(uid, email, UserRole.ADMIN)
    return user
```

### 6.4 `app/schemas/auth.py`

```python
from typing import Literal

from pydantic import BaseModel, Field

from app.models.users import UserRole

PortalKind = Literal["client", "admin"]


class FirebaseLoginBody(BaseModel):
    id_token: str | None = Field(
        default=None,
        description="Firebase ID token. Optional when FIREBASE_AUTH_DISABLED is set.",
    )
    portal: PortalKind = Field(default="client")
    # Only honoured by POST /api/auth/register when dev_mode=True and portal="admin".
    # Ignored in all other cases; never persisted from login requests.
    role: UserRole | None = None
```

### 6.5 `app/libs/auth/service.py`

```python
from fastapi import HTTPException, status

from app.core.config import Settings
from app.core.security import verify_firebase_id_token_string
from app.libs.users.repository import UserRepository
from app.models.users import User, UserRole
from app.schemas.auth import PortalKind


def default_role_for_portal(portal: PortalKind) -> UserRole:
    return UserRole.ADMIN if portal == "admin" else UserRole.CLIENT


def login_or_register(
    id_token: str | None,
    portal: PortalKind,
    repo: UserRepository,
    settings: Settings,
    *,
    must_be_new: bool = False,
    requested_role: UserRole | None = None,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)

    if settings.firebase_auth_disabled:
        uid, email = "dev-user", "dev@example.com"
    else:
        uid = claims.get("uid")
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid")
        raw_email = claims.get("email")
        email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None

    existing = repo.get_by_firebase_uid(uid)

    if must_be_new and existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered. Use POST /api/auth/login.",
        )

    if existing is None:
        # requested_role is only set when dev_mode=True and the caller is an internal user
        # self-selecting their role at signup. Falls back to portal default otherwise.
        assigned_role = requested_role if requested_role is not None else default_role_for_portal(portal)
        return repo.create(uid, email, assigned_role)

    if email and existing.email != email:
        return repo.update_email(existing, email)

    return existing
```

### 6.6 `app/libs/auth/router.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.config import Settings, get_settings
from app.libs.auth.deps import get_current_user
from app.libs.auth.service import login_or_register
from app.libs.users.repository import UserRepository, get_user_repo
from app.models.users import User
from app.schemas.auth import FirebaseLoginBody
from app.schemas.users import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_with_firebase(
    body: FirebaseLoginBody,
    settings: Settings = Depends(get_settings),
    repo: UserRepository = Depends(get_user_repo),
) -> User:
    if body.portal == "admin" and not settings.dev_mode:
        # prod: internal users cannot self-register; a Super Admin must pre-create them
        # via POST /api/users (gated on Action.USER_MANAGE).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Internal user self-registration is disabled. Contact a Super Admin.",
        )

    # dev_mode only: honour the role field for admin-portal registrations so testers
    # can exercise different permission scopes without an admin account.
    requested_role = body.role if settings.dev_mode and body.portal == "admin" else None

    return login_or_register(
        body.id_token, body.portal, repo, settings,
        must_be_new=True, requested_role=requested_role,
    )


@router.post("/login", response_model=UserOut)
def login_with_firebase(
    body: FirebaseLoginBody,
    settings: Settings = Depends(get_settings),
    repo: UserRepository = Depends(get_user_repo),
) -> User:
    return login_or_register(body.id_token, body.portal, repo, settings, must_be_new=False)


@router.get("/me", response_model=UserOut)
def auth_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

### 6.7 Step 5+6 combined verification

After both steps are complete and the router is wired (Steps 5.4 and 6.6 done):

- `POST /api/auth/register` → 201 `UserOut`
- `POST /api/auth/login` → 200 `UserOut`
- `GET /api/auth/me` → 200 `UserOut`
- `POST /api/auth/logout` → 204
- `GET /api/users/me` → 200 `UserOut`
- `PATCH /api/users/me` with `{"email": "new@example.com"}` → 200 `UserOut` with updated email
- `GET /api/users/{firebase_uid}` as dev ADMIN → 200

---

## Step 7 — Create `libs/financial/`, `libs/documents/`, and their horizontal schemas/models

**What changes:** The two existing financial routers (`allotment.py`, `redemption.py`) are consolidated into one `libs/financial/router.py`. A stub `libs/documents/` module is created with placeholder endpoints that return `501 Not Implemented`. ORM model definitions go into `models/financial.py` and `models/documents.py`; Pydantic schemas go into `schemas/financial.py` and `schemas/documents.py`. Neither `libs/` module contains a `models.py` or `schemas.py`.

**Risk:** Low for financial (existing placeholder logic is preserved). New for documents (no existing code).

### 7.1 Files to create

```
api-backend/app/models/financial.py
api-backend/app/models/documents.py
api-backend/app/schemas/documents.py         (new — no existing file)

api-backend/app/libs/financial/__init__.py    (empty)
api-backend/app/libs/financial/repository.py
api-backend/app/libs/financial/service.py
api-backend/app/libs/financial/router.py

api-backend/app/libs/documents/__init__.py   (empty)
api-backend/app/libs/documents/repository.py
api-backend/app/libs/documents/service.py
api-backend/app/libs/documents/router.py
```

**Note on `app/schemas/financial.py`:** This file already exists in the current flat layout and contains the correct Pydantic schemas. It does not need to be moved or recreated — it is already at the canonical path. The only action in step 7.5 is to update its import path in `libs/financial/service.py`.

### 7.2 `app/schemas/financial.py`

No changes needed. The existing file at `app/schemas/financial.py` is already the canonical location. Its content is correct as-is.

### 7.3 `app/models/financial.py`

```python
# Placeholder for future ORM models: Allotment, Redemption, Fund
# When defined, import them in main.py so Base.metadata discovers them.
```

### 7.4 `app/libs/financial/repository.py`

```python
# Placeholder — financial operations are stateless (stub) today.
# When financial models are added, this class encapsulates all DB queries.

class FinancialRepository:
    pass
```

### 7.5 `app/libs/financial/service.py`

Move contents of `app/services/financial.py`; update the import path for schemas:

```python
import uuid

from app.schemas.financial import (
    AllotmentRequest,
    AllotmentResponse,
    AllotmentStatus,
    RedemptionRequest,
    RedemptionResponse,
    RedemptionStatus,
)


def process_allotment(payload: AllotmentRequest) -> AllotmentResponse:
    _ = payload
    return AllotmentResponse(
        request_id=str(uuid.uuid4()),
        status=AllotmentStatus.RECEIVED,
        message="Queued for downstream settlement orchestration (placeholder).",
    )


def process_redemption(payload: RedemptionRequest) -> RedemptionResponse:
    _ = payload
    return RedemptionResponse(
        request_id=str(uuid.uuid4()),
        status=RedemptionStatus.RECEIVED,
        message="Queued for compliance review and settlement scheduling (placeholder).",
    )
```

### 7.6 `app/libs/financial/router.py`

The two existing routers (`/financial/allotments` and `/financial/redemptions`) merge into one. The URL paths are preserved exactly.

```python
from fastapi import APIRouter, Depends

from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.financial.service import process_allotment, process_redemption
from app.models.users import User
from app.schemas.financial import (
    AllotmentRequest,
    AllotmentResponse,
    RedemptionRequest,
    RedemptionResponse,
)

router = APIRouter(prefix="/financial", tags=["financial"])


@router.post("/allotments", response_model=AllotmentResponse)
def create_allotment(
    body: AllotmentRequest,
    user: User = Depends(require_action(Action.FINANCIAL_SUBMIT)),
) -> AllotmentResponse:
    return process_allotment(body)


@router.post("/redemptions", response_model=RedemptionResponse)
def create_redemption(
    body: RedemptionRequest,
    user: User = Depends(require_action(Action.FINANCIAL_SUBMIT)),
) -> RedemptionResponse:
    return process_redemption(body)
```

**Behaviour change from current code:** The current allotment and redemption routers use `get_current_user` (authentication only, no action check). The new router gates on `Action.FINANCIAL_SUBMIT`. Roles without this action (`CLIENT`, `PM`, `PC`, `COMPLIANCE`) will now receive `403` instead of `200`.

### 7.7 `app/schemas/documents.py`

```python
from pydantic import BaseModel, Field


class DocumentUploadRequest(BaseModel):
    document_type: str = Field(..., description="e.g. 'kyc_questionnaire', 'supporting_id'")
    filename: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class DocumentOut(BaseModel):
    id: int
    owner_firebase_uid: str
    document_type: str
    filename: str
    status: str

    model_config = {"from_attributes": True}
```

### 7.8 `app/models/documents.py`

```python
# Placeholder for future ORM model: Document
# Fields to add: id, owner_firebase_uid (FK to users), document_type, filename,
#                storage_path, status, uploaded_at, reviewed_at
```

### 7.9 `app/libs/documents/repository.py`

```python
# Placeholder — wire to DB when Document model is defined.

class DocumentRepository:
    pass
```

### 7.10 `app/libs/documents/service.py`

```python
# Placeholder — implement when storage backend is chosen (S3, local, etc.).

class DocumentService:
    pass
```

### 7.11 `app/libs/documents/router.py`

```python
from fastapi import APIRouter, Depends, Response, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_user, require_action
from app.models.users import User
from app.schemas.documents import DocumentOut, DocumentUploadRequest

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/me", response_model=list[DocumentOut])
def list_own_documents(
    _: User = Depends(require_action(Action.DOCUMENT_VIEW_OWN)),
) -> list[DocumentOut]:
    raise Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.post("/me", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_own_document(
    body: DocumentUploadRequest,
    _: User = Depends(require_action(Action.DOCUMENT_SUBMIT_OWN)),
) -> DocumentOut:
    raise Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.get("", response_model=list[DocumentOut])
def list_all_documents(
    _: User = Depends(require_action(Action.DOCUMENT_VIEW_ALL)),
) -> list[DocumentOut]:
    raise Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)
```

---

## Step 8 — Rewrite `main.py`

Replace `app/main.py` entirely:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, engine
from app.libs.auth.router import router as auth_router
from app.libs.documents.router import router as documents_router
from app.libs.financial.router import router as financial_router
from app.libs.users.router import router as users_router

# Import all model modules so Base.metadata discovers their tables before create_all.
import app.models.users  # noqa: F401
import app.models.financial  # noqa: F401
import app.models.documents  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("Database metadata ensured (create_all).")
    yield


settings = get_settings()
app = FastAPI(title="Client Web Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(documents_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

---

## Step 9 — Delete old flat files

After Step 8 verification passes, check for dangling imports and then delete the old layout.

### 9.1 Confirm no dangling imports

Run from `api-backend/`:

```bash
grep -rn "from app\.config\b" app/ --include="*.py"
grep -rn "from app\.database\b" app/ --include="*.py"
grep -rn "from app\.deps" app/ --include="*.py"
grep -rn "from app\.routers" app/ --include="*.py"
grep -rn "from app\.services" app/ --include="*.py"
```

All must return zero results. Note: `from app.models` and `from app.schemas` are valid canonical imports in the hybrid layout and must **not** be grepped away.

### 9.2 Files to delete

```
api-backend/app/config.py              (shim from Step 1 — now dead)
api-backend/app/database.py            (shim from Step 1 — now dead)
api-backend/app/deps/                  (entire directory)
api-backend/app/routers/               (entire directory)
api-backend/app/services/              (entire directory)
```

`app/models/` and `app/schemas/` are **canonical locations** in the hybrid layout — do not delete them.

---

## Step 10 — Final Verification

Run all checks with `FIREBASE_AUTH_DISABLED=true`:

| # | Test | Method + Path | Expected |
|---|------|---------------|----------|
| 1 | Health | `GET /health` | `{"status": "ok"}` |
| 2 | Register (new user) | `POST /api/auth/register` `{"portal": "client"}` | 201 `UserOut` |
| 3 | Register (existing) | `POST /api/auth/register` again | 409 Conflict |
| 4 | Login | `POST /api/auth/login` `{"portal": "client"}` | 200 `UserOut` |
| 5 | Auth me | `GET /api/auth/me` | 200 `UserOut` |
| 6 | Users me | `GET /api/users/me` | 200 `UserOut` |
| 7 | Logout | `POST /api/auth/logout` | 204 No Content |
| 8 | Financial — ADMIN | `POST /api/financial/allotments` (dev user = ADMIN) | 200 `AllotmentResponse` |
| 9 | Financial — CLIENT | Set `role = CLIENT` in DB; repeat #8 | 403 Forbidden |
| 10 | Financial — RM | Set `role = RM`; repeat #8 | 200 `AllotmentResponse` |
| 11 | Documents — CLIENT | Set `role = CLIENT`; `GET /api/documents/me` | 501 Not Implemented (auth passed, stub returned) |
| 12 | Documents — PM | Set `role = PM`; `GET /api/documents/me` | 403 Forbidden (PM lacks DOCUMENT_VIEW_OWN) |
| 13 | Documents — all (PM) | `GET /api/documents` | 501 (auth passed) |
| 14 | User role update — ADMIN | `PATCH /api/users/{uid}/role` as ADMIN | 200 `UserOut` |
| 15 | User role update — PM | Same endpoint as PM | 403 Forbidden |
| 16 | User read — PM | `GET /api/users/{uid}` as PM | 200 `UserOut` |
| 17 | User read — RM | Same as RM | 403 Forbidden |

---

## Final Directory Layout

After all steps complete:

```
api-backend/app/
├── core/
│   ├── __init__.py
│   ├── config.py
│   ├── database.py
│   └── security.py
├── utils/
│   ├── __init__.py
│   ├── datetime.py
│   ├── pagination.py
│   └── responses.py
├── models/                  ← horizontal layer (ORM definitions)
│   ├── __init__.py
│   ├── users.py
│   ├── financial.py
│   └── documents.py
├── schemas/                 ← horizontal layer (Pydantic types)
│   ├── __init__.py
│   ├── auth.py
│   ├── users.py
│   ├── financial.py
│   └── documents.py
├── libs/                    ← vertical slices (repository + service + router only)
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── actions.py
│   │   ├── deps.py
│   │   ├── router.py
│   │   └── service.py
│   ├── users/
│   │   ├── __init__.py
│   │   ├── repository.py
│   │   ├── router.py
│   │   └── service.py
│   ├── financial/
│   │   ├── __init__.py
│   │   ├── repository.py
│   │   ├── router.py
│   │   └── service.py
│   └── documents/
│       ├── __init__.py
│       ├── repository.py
│       ├── router.py
│       └── service.py
└── main.py
```

---

## Remaining Open Questions (from Proposal)

These do not block the refactor but must be resolved before the first endpoint in the relevant domain is built:

| ID | Question | Affects |
|----|----------|---------|
| OQ-3 | **RM client scope**: `CLIENT_SUBMIT_ON_BEHALF` is currently global to all RMs. In practice, an RM should only act on their assigned clients. A join table (`rm_client_assignments`) or FK on `User` is needed before the first RM-facing endpoint is implemented. | `libs/financial/` and `libs/users/` |
| OQ-4 | **PC on compliance**: PC has `COMPLIANCE_VIEW` (read-only). If PC needs to annotate or flag items without full review authority, a `COMPLIANCE_ANNOTATE` action should be added to `actions.py`. | `libs/auth/actions.py` |
| OQ-5 | **CLIENT read scope**: CLIENT currently has no `FINANCIAL_VIEW_OWN` or analytics view action. Once the portfolio/overview page is connected to real data, decide if clients can view their own holdings or transaction history. | `libs/auth/actions.py`, `libs/financial/` |
| OQ-6 | **Alembic**: `create_all()` is acceptable for development. Before the first production deployment, introduce Alembic and generate the initial migration from the current schema. `Base` in `core/database.py` is the target for `env.py`. | `api-backend/` root |
| OQ-7 | **Role self-selection at signup**: Controlled by `dev_mode` (D-6). In dev, internal users pass a `role` field at registration. In prod, they cannot self-register; a Super Admin pre-creates them via `POST /api/users`. The prod admin-creation endpoint (`POST /api/users`, `Action.USER_MANAGE`) is not yet implemented and should be added before `dev_mode` is set to `False`. Final policy to confirm with Wilson / Joanna. | `libs/users/router.py`, `libs/auth/service.py` |
