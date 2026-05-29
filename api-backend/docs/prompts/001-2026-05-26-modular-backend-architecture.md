# 001 — Vibe Coding Prompt: Modular Backend Architecture Refactor

**Date:** 2026-05-26
**Implements:** [Implementation Plan 001](../implementations/001-2026-05-26-modular-backend-architecture.md)
**Branch:** `internal-user-backendAPI`
**Validation:** mypy + ruff must pass on `api-backend/app/`

---

## Errata and Clarifications

The following issues in the implementation document are corrected here. Child agents must follow these corrections, not the original document:

| # | Location | Original | Corrected |
|---|----------|-----------|-----------|
| E-1 | `libs/documents/router.py` stubs | `raise Response(status_code=501)` | `return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)` with return type `Response` on each endpoint |
| E-2 | `libs/auth/deps.py` `get_current_user` | Dev user created as `UserRole.CLIENT` | Dev user created as `UserRole.ADMIN` in the `firebase_auth_disabled` branch to preserve existing dev workflow |
| E-3 | Step 9 deletions | `app/schemas/user.py` not listed | Add `api-backend/app/schemas/user.py` (old singular) to the Step 9 deletion list — it is superseded by `schemas/users.py` |

---

## Dependency Chain

The 10 implementation steps map to 8 sequential/parallel child agents plus 2 validation agents. Steps 1–9 have strict sequential dependencies (each step must leave the server in a working state). The only true parallelisation opportunity is:

- **Phase 4A and 4B** (after Phase 3 completes): users schemas/service and auth module can be written concurrently. Their routers (Phase 5) must wait for both.
- **Phase 9** (validation): mypy/ruff and endpoint smoke tests run in parallel after Phase 8.

```
Phase 1 → Phase 2 → Phase 3 → Phase 4A ─┐
                                          ├─→ Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9A
                              Phase 4B ─┘                                            Phase 9B
```

---

## Parent Agent Instructions

You are the orchestrating parent agent for the modular backend refactor of `api-backend/`. Your responsibilities:

1. **Fork child agents in the order and parallelisation specified below.** Do not start a phase until all its prerequisites are confirmed complete.
2. **After each phase**, verify the server still starts:
   ```
   cd api-backend && FIREBASE_AUTH_DISABLED=true uvicorn app.main:app --reload
   GET /health → {"status": "ok"}
   ```
   If the server fails to start, halt and report the error before proceeding.
3. **Track progress** by checking off each phase in this list as it completes:
   - [ ] Phase 0 — Pre-flight
   - [ ] Phase 1 — Core infrastructure and utilities (Agent 1)
   - [ ] Phase 2 — Firebase security extraction (Agent 2)
   - [ ] Phase 3 — ORM model layer (Agent 3)
   - [ ] Phase 4 — Repository and domain schemas/service stubs (Agent 4A + 4B in parallel)
   - [ ] Phase 5 — Auth and users routers (Agent 5)
   - [ ] Phase 6 — Financial and documents modules (Agent 6)
   - [ ] Phase 7 — Rewrite `main.py` (Agent 7)
   - [ ] Phase 8 — Delete old flat files (Agent 8)
   - [ ] Phase 9 — Validation (Agent V1 + V2 in parallel)
4. **Do not edit any file yourself.** Your role is orchestration and verification only.
5. **Halt on any phase failure.** Report the failing agent, its error output, and the current file state before asking how to proceed.

---

## Phase 0 — Pre-flight (Parent runs this directly)

Before forking any agent, confirm the current codebase is healthy on branch `internal-user-backendAPI`.

Expected current file tree under `api-backend/app/`:
```
app/config.py
app/database.py
app/models.py
app/main.py
app/deps/auth.py
app/routers/auth.py
app/routers/users.py
app/routers/allotment.py
app/routers/redemption.py
app/schemas/auth.py
app/schemas/user.py
app/schemas/financial.py
app/services/financial.py
```

Confirm with:
```bash
cd api-backend
FIREBASE_AUTH_DISABLED=true uvicorn app.main:app --reload
# GET /health must return {"status": "ok"}
```

---

## Agent 1 — Core Infrastructure and Utilities

**Implements:** Implementation doc Steps 1.1–1.8  
**Prerequisites:** Phase 0 green  
**Working directory:** `api-backend/`

### Task

Create the `core/` and `utils/` packages and migrate config/database into them. Leave backward-compatible shims at the old paths so nothing breaks.

### Files to create (exact content below)

**`app/core/__init__.py`** — empty file.

**`app/utils/__init__.py`** — empty file.

**`app/core/config.py`:**
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

    # True (dev): register endpoint accepts `role` field for internal users.
    # False (prod): internal users cannot self-register; Super Admin must pre-create them.
    dev_mode: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

**`app/core/database.py`:**
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

**`app/utils/pagination.py`:**
```python
from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)
```

**`app/utils/responses.py`:**
```python
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str
```

**`app/utils/datetime.py`:**
```python
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)
```

### Files to replace entirely (compatibility shims)

**`app/config.py`** — replace entire file contents:
```python
from app.core.config import Settings, get_settings  # noqa: F401
```

**`app/database.py`** — replace entire file contents:
```python
from app.core.database import Base, engine, get_db, SessionLocal  # noqa: F401
```

### Verification

Server must start and `GET /health` → `{"status": "ok"}`. All existing routes must return the same responses as before.

---

## Agent 2 — Firebase Security Extraction

**Implements:** Implementation doc Step 2  
**Prerequisites:** Agent 1 complete and verified  
**Working directory:** `api-backend/`

### Task

Extract the three Firebase functions from `app/deps/auth.py` into `app/core/security.py`. Update `deps/auth.py` to import from there. Do not change any other logic in `deps/auth.py`.

### File to create

**`app/core/security.py`:**
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


def verify_firebase_id_token_string(id_token: str | None, settings: Settings) -> dict:  # type: ignore[type-arg]
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
) -> dict:  # type: ignore[type-arg]
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

### File to update

**`app/deps/auth.py`** — at the top of the file:
1. Remove the definitions of `_init_firebase`, `verify_firebase_id_token_string`, `verify_firebase_token`.
2. Remove the line `security = HTTPBearer(auto_error=False)`.
3. Remove `FIREBASE_CLOCK_SKEW_SECONDS = 10`.
4. Remove `import json` and `import os` if they are only used by the removed functions.
5. Add this import at the top (after existing imports):
   ```python
   from app.core.security import security, verify_firebase_token, verify_firebase_id_token_string
   ```

All other functions in `deps/auth.py` — `ensure_user_for_firebase_claims`, `get_current_user`, `require_roles`, `default_role_for_portal` — stay untouched.

### Verification

Server starts. `POST /api/auth/login` returns `UserOut`. `GET /api/auth/me` returns `UserOut`.

---

## Agent 3 — ORM Model Layer

**Implements:** Implementation doc Steps 3.1–3.5  
**Prerequisites:** Agent 2 complete and verified  
**Working directory:** `api-backend/`

### Task

Convert the flat `app/models.py` into the `app/models/` package. Add `PC` and `RM` to `UserRole`. Drop `OPS`. Create empty placeholders for future model files.

### Important: order of filesystem operations

1. Delete `app/models.py` first.
2. Then create the `app/models/` directory and its files.

Python cannot have both a `models.py` file and a `models/` directory in the same package.

### Files to create

**`app/models/__init__.py`:**
```python
from app.models.users import User, UserRole  # noqa: F401
from app.core.database import Base  # noqa: F401
```

**`app/models/users.py`:**
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

**`app/models/financial.py`:**
```python
# Placeholder for future ORM models: Allotment, Redemption, Fund
```

**`app/models/documents.py`:**
```python
# Placeholder for future ORM model: Document
```

**`app/libs/__init__.py`** — empty file.

**`app/libs/users/__init__.py`** — empty file.

### Update `app/main.py`

Find the import `from app.models import Base` (or wherever `Base` is currently imported) and change it to:
```python
from app.core.database import Base
```

Also add this import line (before `Base.metadata.create_all` is called):
```python
import app.models.users  # noqa: F401 — registers User with Base.metadata
```

### Verification

Server starts. `GET /api/users/me` returns `UserOut`. In a Python REPL:
```python
from app.models.users import UserRole
list(UserRole)
# Must be: [CLIENT, RM, PM, PC, COMPLIANCE, ADMIN] — no OPS
```

---

## Agent 4A — Users Repository

**Implements:** Implementation doc Step 4  
**Prerequisites:** Agent 3 complete and verified  
**Working directory:** `api-backend/`

### Task

Create the `UserRepository` class. This file is not yet wired into any router — no verification step is needed beyond confirming the file imports cleanly.

### File to create

**`app/libs/users/repository.py`:**
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


def get_user_repo(db: Annotated[Session, Depends(get_db)]) -> UserRepository:
    return UserRepository(db)
```

Add this missing import at the top:
```python
from typing import Annotated
```

### Verification

From `api-backend/`, confirm the module imports without error:
```bash
python -c "from app.libs.users.repository import UserRepository; print('ok')"
```

---

## Agent 4B — Auth Module Core (Actions, Deps, Schemas, Service)

**Implements:** Implementation doc Steps 6.1–6.5  
**Prerequisites:** Agent 3 complete (Agent 4A can run in parallel)  
**Working directory:** `api-backend/`

### Task

Build the auth module's non-router components: the Action enum, permission logic, auth service, and schemas. Do not create the auth router yet (that is Agent 5's job). Do not create `libs/users/router.py` yet either.

### Files to create

**`app/libs/auth/__init__.py`** — empty file.

**`app/libs/auth/actions.py`:**
```python
import enum
from typing import Any

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
    """Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."""
    return ROLE_ACTIONS.get(role, set())
```

**`app/libs/auth/deps.py`:**
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
    claims: Annotated[dict, Depends(verify_firebase_token)],  # type: ignore[type-arg]
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    repo = UserRepository(db)
    if settings.firebase_auth_disabled:
        # Dev mode: always return/create dev-user as ADMIN so all routes are accessible.
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            user = repo.create("dev-user", "dev@example.com", UserRole.ADMIN)
        return user

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid")
    raw_email = claims.get("email")
    email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None

    user = repo.get_by_firebase_uid(uid)
    if user is None:
        user = repo.create(uid, email, UserRole.CLIENT)
    elif email and user.email != email:
        user = repo.update_email(user, email)
    return user


def require_action(action: Action):  # type: ignore[return]
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if action not in get_actions_for_role(user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user
    return _dep
```

**`app/schemas/auth.py`** — replace the entire existing file:
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
    role: UserRole | None = None
```

**`app/libs/auth/service.py`:**
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
        assigned_role = requested_role if requested_role is not None else default_role_for_portal(portal)
        return repo.create(uid, email, assigned_role)

    if email and existing.email != email:
        return repo.update_email(existing, email)

    return existing
```

### Verification

Confirm modules import without error. No server restart required yet (routers are not wired until Agent 5).

---

## Agent 5 — Auth and Users Routers

**Implements:** Implementation doc Steps 5.2–5.4 and 6.6  
**Prerequisites:** Agents 4A and 4B both complete  
**Working directory:** `api-backend/`

### Task

Create the horizontal `schemas/users.py`, the `libs/users/service.py`, and both routers (`libs/users/router.py` and `libs/auth/router.py`). Wire the new routers into `main.py` temporarily alongside the old ones so both respond during transition.

### Files to create

**`app/schemas/__init__.py`** — empty file (if it doesn't exist).

**`app/schemas/users.py`:**
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

**`app/libs/users/service.py`:**
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

**`app/libs/users/router.py`:**
```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_user, require_action
from app.libs.users.repository import UserRepository, get_user_repo
from app.libs.users.service import UserService
from app.models.users import User
from app.schemas.users import UserOut, UserSelfUpdate, UserUpsert

router = APIRouter(prefix="/users", tags=["users"])


def _get_service(repo: Annotated[UserRepository, Depends(get_user_repo)]) -> UserService:
    return UserService(repo)


@router.get("/me", response_model=UserOut)
def read_me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserSelfUpdate,
    service: Annotated[UserService, Depends(_get_service)],
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if body.email is not None:
        return service.update_email(user, str(body.email))
    return user


@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: UserUpsert,
    service: Annotated[UserService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
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
    service: Annotated[UserService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> User:
    row = service.repo.get_by_firebase_uid(firebase_uid)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row
```

**`app/libs/auth/router.py`:**
```python
from typing import Annotated

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
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
) -> User:
    if body.portal == "admin" and not settings.dev_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Internal user self-registration is disabled. Contact a Super Admin.",
        )
    requested_role = body.role if settings.dev_mode and body.portal == "admin" else None
    return login_or_register(
        body.id_token, body.portal, repo, settings,
        must_be_new=True, requested_role=requested_role,
    )


@router.post("/login", response_model=UserOut)
def login_with_firebase(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
) -> User:
    return login_or_register(body.id_token, body.portal, repo, settings, must_be_new=False)


@router.get("/me", response_model=UserOut)
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

### Verification (combined Steps 5+6)

Server starts. All of the following must pass with `FIREBASE_AUTH_DISABLED=true`:

| Method | Path | Body | Expected |
|--------|------|------|----------|
| `POST` | `/api/auth/register` | `{"portal": "client"}` | 201 `UserOut` |
| `POST` | `/api/auth/register` (repeat) | same | 409 Conflict |
| `POST` | `/api/auth/login` | `{"portal": "client"}` | 200 `UserOut` |
| `GET` | `/api/auth/me` | — | 200 `UserOut` |
| `POST` | `/api/auth/logout` | — | 204 No Content |
| `GET` | `/api/users/me` | — | 200 `UserOut` |
| `PATCH` | `/api/users/me` | `{"email": "new@example.com"}` | 200 `UserOut` with updated email |

---

## Agent 6 — Financial and Documents Modules

**Implements:** Implementation doc Step 7  
**Prerequisites:** Agent 5 complete and verified  
**Working directory:** `api-backend/`

### Task

Create the `libs/financial/` and `libs/documents/` vertical slices, along with their placeholder ORM models and Pydantic schemas. The documents router endpoints return `Response(status_code=501)` (note: `return`, not `raise`).

### Files to create

**`app/libs/financial/__init__.py`** — empty.

**`app/libs/financial/repository.py`:**
```python
class FinancialRepository:
    pass
```

**`app/libs/financial/service.py`:**
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

**`app/libs/financial/router.py`:**
```python
from typing import Annotated

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
    user: Annotated[User, Depends(require_action(Action.FINANCIAL_SUBMIT))],
) -> AllotmentResponse:
    return process_allotment(body)


@router.post("/redemptions", response_model=RedemptionResponse)
def create_redemption(
    body: RedemptionRequest,
    user: Annotated[User, Depends(require_action(Action.FINANCIAL_SUBMIT))],
) -> RedemptionResponse:
    return process_redemption(body)
```

**`app/models/financial.py`:** (already created in Agent 3 as placeholder — no change needed)

**`app/models/documents.py`:** (already created in Agent 3 as placeholder — no change needed)

**`app/schemas/documents.py`:**
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

**`app/libs/documents/__init__.py`** — empty.

**`app/libs/documents/repository.py`:**
```python
class DocumentRepository:
    pass
```

**`app/libs/documents/service.py`:**
```python
class DocumentService:
    pass
```

**`app/libs/documents/router.py`** — IMPORTANT: use `return Response(...)`, not `raise`:
```python
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.models.users import User
from app.schemas.documents import DocumentOut, DocumentUploadRequest

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/me")
def list_own_documents(
    _: Annotated[User, Depends(require_action(Action.DOCUMENT_VIEW_OWN))],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.post("/me", status_code=status.HTTP_201_CREATED)
def upload_own_document(
    body: DocumentUploadRequest,
    _: Annotated[User, Depends(require_action(Action.DOCUMENT_SUBMIT_OWN))],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.get("")
def list_all_documents(
    _: Annotated[User, Depends(require_action(Action.DOCUMENT_VIEW_ALL))],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)
```

### Verification

Server starts. `POST /api/financial/allotments` with a valid body and dev user (ADMIN) returns 200. `GET /api/documents/me` as CLIENT returns 501.

---

## Agent 7 — Rewrite `main.py`

**Implements:** Implementation doc Step 8  
**Prerequisites:** Agent 6 complete and verified  
**Working directory:** `api-backend/`

### Task

Replace `app/main.py` entirely with the final version that imports only from `libs/` routers.

### File to replace

**`app/main.py`** — replace entire file:
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

import app.models.users  # noqa: F401 — registers User with Base.metadata
import app.models.financial  # noqa: F401
import app.models.documents  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[type-arg]
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

### Verification

Server starts cleanly. Run the full contract checklist:

| # | Method | Path | Expected |
|---|--------|------|----------|
| 1 | `GET` | `/health` | `{"status": "ok"}` |
| 2 | `POST` | `/api/auth/login` | 200 `UserOut` |
| 3 | `GET` | `/api/auth/me` | 200 `UserOut` |
| 4 | `POST` | `/api/auth/logout` | 204 |
| 5 | `GET` | `/api/users/me` | 200 `UserOut` |
| 6 | `POST` | `/api/financial/allotments` | 200 `AllotmentResponse` |

---

## Agent 8 — Delete Old Flat Files

**Implements:** Implementation doc Step 9  
**Prerequisites:** Agent 7 complete and verified  
**Working directory:** `api-backend/`

### Task

Confirm no dangling imports remain, then delete the old flat layout directories and files.

### Step 1 — Confirm zero dangling imports

Run each of the following. All must return zero results:
```bash
grep -rn "from app\.config\b" app/ --include="*.py"
grep -rn "from app\.database\b" app/ --include="*.py"
grep -rn "from app\.deps" app/ --include="*.py"
grep -rn "from app\.routers" app/ --include="*.py"
grep -rn "from app\.services" app/ --include="*.py"
grep -rn "from app\.schemas\.user\b" app/ --include="*.py"
```

If any grep returns results, stop and report them to the parent agent before deleting anything.

### Step 2 — Delete

Delete the following. All are dead code at this point:

```
api-backend/app/config.py          (shim from Agent 1)
api-backend/app/database.py        (shim from Agent 1)
api-backend/app/deps/              (entire directory)
api-backend/app/routers/           (entire directory)
api-backend/app/services/          (entire directory)
api-backend/app/schemas/user.py    (singular — superseded by schemas/users.py)
```

**Do not delete:**
- `app/models/` — canonical horizontal layer
- `app/schemas/` — canonical horizontal layer (only `user.py` is deleted, not the directory)
- `app/core/`
- `app/utils/`
- `app/libs/`

### Verification

Server starts. Run all 6 contract tests from Agent 7. Zero test regressions.

---

## Agent V1 — Static Analysis Validation

**Implements:** mypy + ruff validation  
**Prerequisites:** Agent 8 complete  
**Working directory:** `api-backend/`  
**Runs in parallel with Agent V2**

### Task

Run mypy and ruff on the refactored backend. Report all errors to the parent agent. Do not fix anything — report only.

```bash
# From api-backend/
python -m mypy app/ --ignore-missing-imports --no-strict-optional
python -m ruff check app/
python -m ruff format --check app/
```

### Expected outcome

Zero errors from ruff. Mypy may emit warnings on Firebase SDK types (external stubs not available) — these are acceptable. Any error in `app/` code itself is a failure and must be reported with file path and line number.

### Report format

```
MYPY: [PASS|FAIL]
  <list of errors if any>

RUFF CHECK: [PASS|FAIL]
  <list of errors if any>

RUFF FORMAT: [PASS|FAIL]
  <list of files that need formatting if any>
```

---

## Agent V2 — Endpoint Smoke Test Validation

**Implements:** Implementation doc Step 10  
**Prerequisites:** Agent 8 complete  
**Working directory:** `api-backend/`  
**Runs in parallel with Agent V1**

### Task

Start the server with `FIREBASE_AUTH_DISABLED=true` and run all 17 endpoint tests from the implementation doc. For tests requiring a specific role (e.g. test 9 "Financial — CLIENT"), set the `dev-user` row's role directly in the database between tests.

```bash
FIREBASE_AUTH_DISABLED=true uvicorn app.main:app --port 8001 &
```

### Test matrix

| # | Role | Method | Path | Body | Expected |
|---|------|--------|------|------|----------|
| 1 | any | `GET` | `/health` | — | 200 `{"status":"ok"}` |
| 2 | — | `POST` | `/api/auth/register` | `{"portal":"client"}` | 201 `UserOut` |
| 3 | — | `POST` | `/api/auth/register` | same | 409 |
| 4 | — | `POST` | `/api/auth/login` | `{"portal":"client"}` | 200 `UserOut` |
| 5 | — | `GET` | `/api/auth/me` | — | 200 `UserOut` |
| 6 | — | `GET` | `/api/users/me` | — | 200 `UserOut` |
| 7 | — | `POST` | `/api/auth/logout` | — | 204 |
| 8 | ADMIN | `POST` | `/api/financial/allotments` | valid body | 200 |
| 9 | CLIENT | `POST` | `/api/financial/allotments` | valid body | 403 |
| 10 | RM | `POST` | `/api/financial/allotments` | valid body | 200 |
| 11 | CLIENT | `GET` | `/api/documents/me` | — | 501 |
| 12 | PM | `GET` | `/api/documents/me` | — | 403 |
| 13 | PM | `GET` | `/api/documents` | — | 501 |
| 14 | ADMIN | `PATCH` | `/api/users/{uid}/role` | `{"role":"PM"}` | 200 `UserOut` |
| 15 | PM | `PATCH` | `/api/users/{uid}/role` | `{"role":"PM"}` | 403 |
| 16 | PM | `GET` | `/api/users/{uid}` | — | 200 `UserOut` |
| 17 | RM | `GET` | `/api/users/{uid}` | — | 403 |

### Report format

```
Tests passed: X/17
Tests failed:
  - Test #N: [actual response] (expected [expected])
```

All 17 must pass for the refactor to be considered complete.

---

## Success Criteria

The refactor is complete when:

1. All 17 smoke tests pass (Agent V2 reports 17/17).
2. Ruff check and format pass with zero errors (Agent V1).
3. Mypy reports zero errors in `app/` code (Firebase SDK type warnings are acceptable).
4. The final directory layout matches:
   ```
   api-backend/app/
   ├── core/         (config.py, database.py, security.py)
   ├── utils/        (pagination.py, responses.py, datetime.py)
   ├── models/       (users.py, financial.py, documents.py)
   ├── schemas/      (auth.py, users.py, financial.py, documents.py)
   ├── libs/
   │   ├── auth/     (actions.py, deps.py, service.py, router.py)
   │   ├── users/    (repository.py, service.py, router.py)
   │   ├── financial/(repository.py, service.py, router.py)
   │   └── documents/(repository.py, service.py, router.py)
   └── main.py
   ```
5. No files remain in `app/deps/`, `app/routers/`, `app/services/`, or as flat-file shims (`app/config.py`, `app/database.py`).
