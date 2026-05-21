# Vibe Coding Prompt — Module 1: Authentication & User Management

> **Target:** `api-backend/` directory  
> **Source design:** `docs/detailed-design-module-1.md` (read that document first for full rationale)  
> **Source requirements:** `docs/proposal.md`  
> **Verification:** must pass `pytest tests/test_module1.py -v`, `mypy app/ --ignore-missing-imports`, and `ruff check app/ tests/`

---

## 0. Before You Start

### Read the existing skeleton

The working directory is `api-backend/`. The skeleton already has:

| File | What it does |
|------|-------------|
| `app/config.py` | Pydantic-settings `Settings`; reads `.env`; has `database_url`, `firebase_auth_disabled`, etc. |
| `app/database.py` | Creates a module-level SQLAlchemy `engine` and `SessionLocal`; exposes `get_db()` generator |
| `app/models.py` | `UserRole` enum (5 roles: PM, COMPLIANCE, CLIENT, ADMIN, OPS) and `User` ORM model |
| `app/schemas/auth.py` | `FirebaseLoginBody` + `PortalKind` type alias |
| `app/schemas/user.py` | `UserOut`, `UserSelfUpdate`, `UserUpsert` |
| `app/deps/auth.py` | Firebase token verification, `get_current_user`, `require_roles`, `ensure_user_for_firebase_claims` |
| `app/routers/auth.py` | `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` |
| `app/routers/users.py` | `/api/users/me`, `PATCH /api/users/me`, `PATCH /api/users/{uid}/role`, `GET /api/users/{uid}` |
| `app/main.py` | FastAPI app; registers all routers; lifespan calls `Base.metadata.create_all(bind=engine)` |
| `app/routers/allotment.py` | Stub allotment route — **do not touch** |
| `app/routers/redemption.py` | Stub redemption route — **do not touch** |
| `app/services/financial.py` | Stub financial service — **do not touch** |

### Key constraints

- **Do not touch** allotment, redemption, financial service files.
- **Do not add PostgreSQL or MongoDB** — only MariaDB (existing) is in scope for Module 1.
- **Do not change `app/config.py`** or **`app/database.py`** or **`app/main.py`** (beyond registering the new routers, which are already included).
- All new code must pass `mypy` and `ruff`.

### Dev mode (`FIREBASE_AUTH_DISABLED=true`)

When `FIREBASE_AUTH_DISABLED=true`, the `firebase_uid` is always `"dev-user"` for **all** endpoints — registration, login, and bearer-token-protected routes. All tests run in dev mode. Tests that need a specific role insert the `User` row directly into the database via the `db` fixture before making the request.

---

## 1. `app/models.py` — update in place

Replace the entire file. The `User` model gains two new columns; `UserRole` gains 3 new values and removes `OPS`.

```python
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    CLIENT     = "CLIENT"
    ADMIN      = "ADMIN"
    PC         = "PC"
    PM         = "PM"
    COMPLIANCE = "COMPLIANCE"
    RISK       = "RISK"
    RM         = "RM"
    MOBO       = "MOBO"


class User(Base):
    __tablename__ = "users"

    id:           Mapped[int]        = mapped_column(primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str]        = mapped_column(String(128), unique=True, index=True)
    email:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    role:         Mapped[UserRole]   = mapped_column(
                                           SAEnum(UserRole, native_enum=False, length=32),
                                           nullable=False,
                                           default=UserRole.CLIENT,
                                       )
    is_active:    Mapped[bool]       = mapped_column(Boolean, nullable=False, default=True)
    created_at:   Mapped[datetime]   = mapped_column(
                                           DateTime(timezone=True), server_default=func.now()
                                       )
    updated_at:   Mapped[datetime]   = mapped_column(
                                           DateTime(timezone=True),
                                           server_default=func.now(),
                                           onupdate=func.now(),
                                       )
```

---

## 2. `app/schemas/auth.py` — replace entirely

```python
from typing import Literal

from pydantic import BaseModel, Field

from app.models import UserRole

PortalKind = Literal["client", "admin"]


class RegisterBody(BaseModel):
    id_token:     str | None = Field(
        default=None,
        description="Firebase ID token. Optional when FIREBASE_AUTH_DISABLED=true.",
    )
    portal:       PortalKind = Field(default="client")
    display_name: str        = Field(min_length=1, max_length=128)
    role:         UserRole | None = Field(
        default=None,
        description="Admin portal only. Ignored for client portal.",
    )


class LoginBody(BaseModel):
    id_token: str | None = Field(
        default=None,
        description="Firebase ID token. Optional when FIREBASE_AUTH_DISABLED=true.",
    )
```

---

## 3. `app/schemas/user.py` — replace entirely

```python
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models import UserRole


class UserOut(BaseModel):
    id:           int
    firebase_uid: str
    email:        str | None
    display_name: str | None
    role:         UserRole
    is_active:    bool

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    email:        EmailStr | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UserSelfUpdate":
        if self.display_name is None and self.email is None:
            raise ValueError("At least one of display_name or email must be provided")
        return self


class RoleChangeBody(BaseModel):
    role: UserRole


class ModuleInfo(BaseModel):
    id:          str
    name:        str
    description: str
    status:      Literal["available", "coming_soon"]


class AuthResponse(BaseModel):
    user:               UserOut
    accessible_modules: list[ModuleInfo]
```

---

## 4. `app/services/module_access.py` — create new file

Pure data — no database calls. Maps each `UserRole` to the modules it can access, derived strictly from the Permission Matrix in `proposal.md` Section 7.

```python
from app.models import UserRole
from app.schemas.user import ModuleInfo

_ALL_MODULES: dict[str, tuple[str, str]] = {
    "M1":  ("Authentication & User Management",
            "Register, log in, manage your profile, and (ADMIN) manage all users"),
    "M2":  ("Client Onboarding & KYC/AML",
            "Onboard new clients, manage profiles, and handle identity verification documents"),
    "M3":  ("Trading Models",
            "Create and manage the trading model information table"),
    "M4":  ("Pre-Trade Check & Allocation",
            "Review portfolio exposure limits and sign pre-trade allocation matrices"),
    "M5":  ("Allotment & Redemption",
            "Submit, review, and execute client investment and withdrawal requests"),
    "M6":  ("Model Client Assignment",
            "View the live record of which trading models each client is currently invested in"),
    "M7":  ("Reporting",
            "Access end-of-day, end-of-month, and post-trade risk reports"),
    "M8":  ("Role & Feature Configuration",
            "(ADMIN) Configure which features are accessible to which roles"),
    "M9":  ("KYC/AML Document Audit",
            "Compliance-grade audit log of all regulated approval actions"),
    "M10": ("IB API Integration",
            "(Placeholder) Future integration with Interactive Brokers data"),
}

_ROLE_MODULE_IDS: dict[UserRole, list[str]] = {
    UserRole.CLIENT:     ["M5", "M7"],
    UserRole.RISK:       ["M7"],
    UserRole.COMPLIANCE: ["M2", "M4", "M5", "M6", "M7", "M9"],
    UserRole.PC:         ["M3", "M4", "M5", "M6", "M7"],
    UserRole.PM:         ["M4", "M5", "M6", "M7"],
    UserRole.MOBO:       ["M7"],
    UserRole.RM:         ["M2"],
    UserRole.ADMIN:      ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"],
}

_AVAILABLE: frozenset[str] = frozenset({"M1"})


def get_accessible_modules(role: UserRole) -> list[ModuleInfo]:
    result: list[ModuleInfo] = []
    for mid in _ROLE_MODULE_IDS.get(role, []):
        name, description = _ALL_MODULES[mid]
        status = "available" if mid in _AVAILABLE else "coming_soon"
        result.append(ModuleInfo(id=mid, name=name, description=description, status=status))
    return result
```

---

## 5. `app/deps/auth.py` — replace entirely

Key changes from the skeleton:
- `default_role_for_portal` accepts an optional explicit `role` (admin portal only).
- `ensure_user_for_firebase_claims` removed — login no longer upserts.
- `get_current_user` looks up by `firebase_uid`, guards `is_active`.
- New `get_auth_response` helper builds `AuthResponse`.

```python
from __future__ import annotations

import json
import logging
import os
from typing import Annotated

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import User, UserRole
from app.schemas.auth import PortalKind
from app.schemas.user import AuthResponse, UserOut
from app.services.module_access import get_accessible_modules

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)
FIREBASE_CLOCK_SKEW_SECONDS = 10


def default_role_for_portal(
    portal: PortalKind,
    *,
    requested_role: UserRole | None = None,
) -> UserRole:
    if portal == "client":
        return UserRole.CLIENT
    return requested_role if requested_role is not None else UserRole.ADMIN


def _init_firebase(settings: Settings) -> None:
    if settings.firebase_auth_disabled:
        return
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass
    cred_path = settings.firebase_credentials_path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    json_blob = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    opts: dict[str, str] = {}
    if settings.firebase_project_id:
        opts["projectId"] = settings.firebase_project_id

    if json_blob:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(json_blob)), opts)
        return
    if cred_path:
        firebase_admin.initialize_app(credentials.Certificate(cred_path), opts)
        return
    if settings.firebase_project_id:
        try:
            firebase_admin.initialize_app(options=opts)
            return
        except Exception:
            pass
    try:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), opts)
    except Exception as exc:
        raise RuntimeError(
            "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or "
            "FIREBASE_CREDENTIALS_PATH, or set FIREBASE_AUTH_DISABLED=true for local smoke tests."
        ) from exc


def verify_firebase_id_token_string(id_token: str | None, settings: Settings) -> dict[str, str]:
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if not id_token or not id_token.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id_token is required")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(id_token.strip(), clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS)  # type: ignore[return-value]
    except Exception as exc:
        logger.info("Invalid Firebase id_token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired id_token"
        ) from exc


def verify_firebase_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(  # type: ignore[return-value]
            creds.credentials, clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS
        )
    except Exception as exc:
        logger.info("Invalid Firebase token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc


def get_current_user(
    token: Annotated[dict[str, str], Depends(verify_firebase_token)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    uid = token.get("uid", "dev-user")
    user = db.query(User).filter(User.firebase_uid == uid).one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not registered. Call POST /api/auth/register first.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated. Contact an administrator.",
        )
    return user


def get_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        user=UserOut.model_validate(user),
        accessible_modules=get_accessible_modules(user.role),
    )


def require_roles(*allowed: UserRole):  # type: ignore[no-untyped-def]
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _dep
```

---

## 6. `app/routers/auth.py` — replace entirely

```python
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.deps.auth import (
    default_role_for_portal,
    get_auth_response,
    get_current_user,
    verify_firebase_id_token_string,
    verify_firebase_token,
)
from app.models import User
from app.schemas.auth import LoginBody, RegisterBody
from app.schemas.user import AuthResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_with_firebase(
    body: RegisterBody,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> AuthResponse:
    claims = verify_firebase_id_token_string(body.id_token, settings)
    uid: str = claims.get("uid", "dev-user")
    email_raw = claims.get("email")
    email: str | None = email_raw.strip() if isinstance(email_raw, str) and email_raw.strip() else None

    if db.query(User).filter(User.firebase_uid == uid).one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered. Use POST /api/auth/login.",
        )

    user = User(
        firebase_uid=uid,
        email=email,
        display_name=body.display_name,
        role=default_role_for_portal(body.portal, requested_role=body.role),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return get_auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login_with_firebase(
    body: LoginBody,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> AuthResponse:
    claims = verify_firebase_id_token_string(body.id_token, settings)
    uid: str = claims.get("uid", "dev-user")

    user = db.query(User).filter(User.firebase_uid == uid).one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not registered. Call POST /api/auth/register first.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated. Contact an administrator.",
        )

    email_raw = claims.get("email")
    synced_email: str | None = (
        email_raw.strip() if isinstance(email_raw, str) and email_raw.strip() else None
    )
    if synced_email and user.email != synced_email:
        user.email = synced_email
        db.add(user)
        db.commit()
        db.refresh(user)

    return get_auth_response(user)


@router.get("/me", response_model=AuthResponse)
def auth_me(user: User = Depends(get_current_user)) -> AuthResponse:
    return get_auth_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(_token: dict[str, str] = Depends(verify_firebase_token)) -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

---

## 7. `app/routers/users.py` — replace entirely

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_auth_response, get_current_user, require_roles
from app.models import User, UserRole
from app.schemas.user import AuthResponse, RoleChangeBody, UserOut, UserSelfUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=AuthResponse)
def read_me(user: User = Depends(get_current_user)) -> AuthResponse:
    return get_auth_response(user)


@router.patch("/me", response_model=AuthResponse)
def update_me(
    body: UserSelfUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AuthResponse:
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.email is not None:
        user.email = str(body.email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return get_auth_response(user)


@router.get("/", response_model=list[UserOut])
def list_users(
    role: UserRole | None = None,
    is_active: bool | None = None,
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    query = db.query(User)
    if role is not None:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    return [UserOut.model_validate(u) for u in query.all()]


@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: RoleChangeBody,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    row.role = body.role
    db.add(row)
    db.commit()
    db.refresh(row)
    return UserOut.model_validate(row)


@router.patch("/{firebase_uid}/deactivate", response_model=UserOut)
def deactivate_user(
    firebase_uid: str,
    db: Session = Depends(get_db),
    caller: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    if firebase_uid == caller.firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already deactivated")
    row.is_active = False
    db.add(row)
    db.commit()
    db.refresh(row)
    return UserOut.model_validate(row)


@router.patch("/{firebase_uid}/reactivate", response_model=UserOut)
def reactivate_user(
    firebase_uid: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if row.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already active")
    row.is_active = True
    db.add(row)
    db.commit()
    db.refresh(row)
    return UserOut.model_validate(row)


@router.get("/{firebase_uid}", response_model=UserOut)
def read_user_by_uid(
    firebase_uid: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(row)
```

---

## 8. `app/main.py` — no change needed

The skeleton already includes `auth.router` and `users.router`. Since both router files are replaced in place (same filenames, same prefixes), nothing in `main.py` changes.

---

## 9. Tool configuration — create `pyproject.toml`

```toml
[tool.mypy]
python_version = "3.11"
strict = false
ignore_missing_imports = true
disallow_untyped_defs = true
warn_return_any = false
warn_unused_ignores = false

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "RUF"]
ignore = ["E501", "B008", "RUF012"]

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["E402"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

---

## 10. `tests/__init__.py` — create empty file

---

## 11. `tests/conftest.py` — create

Setting `DATABASE_URL` before importing `app` causes `database.py`'s module-level `create_engine` to build a SQLite engine. The lifespan's `create_all(bind=engine)` then targets SQLite, not MariaDB. No engine patching required.

The `client` fixture creates its own session per request so handlers run with a fresh connection — test-body insertions committed via `db` are visible to handlers through normal SQLite file isolation.

```python
import os

os.environ["DATABASE_URL"] = "sqlite:///./tests/test.db"
os.environ["FIREBASE_AUTH_DISABLED"] = "true"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.database import engine, get_db
from app.main import app
from app.models import Base

_Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(autouse=True)
def setup_db() -> pytest.Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db() -> pytest.Generator[Session, None, None]:
    session = _Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client() -> pytest.Generator[TestClient, None, None]:
    def _override() -> pytest.Generator[Session, None, None]:
        session = _Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Add `tests/test.db` to `.gitignore`.

---

## 12. `tests/test_module1.py` — create

### Dev-mode recap

All requests authenticate as `firebase_uid="dev-user"`. Tests that need a specific role insert that user directly via `db` (with `db.commit()`). The handler's separate session reads the committed row from the SQLite file.

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User, UserRole


# ── helpers ──────────────────────────────────────────────────────────────────

def _register(client: TestClient, **kwargs: object) -> object:
    payload: dict[str, object] = {"display_name": "Test User", "portal": "client"}
    payload.update(kwargs)
    return client.post("/api/auth/register", json=payload)


def _login(client: TestClient) -> object:
    return client.post("/api/auth/login", json={"id_token": "any"})


def _insert(db: Session, uid: str, role: UserRole, *, active: bool = True) -> User:
    user = User(firebase_uid=uid, email=f"{uid}@example.com",
                display_name=uid.title(), role=role, is_active=active)
    db.add(user)
    db.commit()
    return user


# ── Registration (T1.1 – T1.7) ───────────────────────────────────────────────

def test_t1_1_register_client_portal(client: TestClient) -> None:
    r = _register(client, portal="client", display_name="Jane Client")
    assert r.status_code == 201
    data = r.json()
    assert data["user"]["role"] == "CLIENT"
    module_ids = [m["id"] for m in data["accessible_modules"]]
    assert "M5" in module_ids and "M7" in module_ids


def test_t1_2_register_admin_portal_with_role(client: TestClient) -> None:
    r = _register(client, portal="admin", display_name="Pete PM", role="PM")
    assert r.status_code == 201
    data = r.json()
    assert data["user"]["role"] == "PM"
    module_ids = [m["id"] for m in data["accessible_modules"]]
    assert all(mid in module_ids for mid in ["M4", "M5", "M6", "M7"])


def test_t1_3_register_admin_portal_no_role(client: TestClient) -> None:
    r = _register(client, portal="admin", display_name="Super Admin")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "ADMIN"


def test_t1_4_client_portal_ignores_role_field(client: TestClient) -> None:
    r = _register(client, portal="client", display_name="Sneaky", role="PM")
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "CLIENT"


def test_t1_5_register_missing_display_name(client: TestClient) -> None:
    r = client.post("/api/auth/register", json={"portal": "client"})
    assert r.status_code == 422


def test_t1_6_register_invalid_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException, status as s
    import app.deps.auth as _dep

    def _fail(id_token: str | None, settings: object) -> dict[str, str]:  # type: ignore[override]
        raise HTTPException(status_code=s.HTTP_401_UNAUTHORIZED, detail="Invalid or expired id_token")

    monkeypatch.setattr(_dep, "verify_firebase_id_token_string", _fail)
    assert _register(client, id_token="bad", display_name="Eve").status_code == 401


def test_t1_7_register_duplicate(client: TestClient) -> None:
    _register(client, display_name="First")
    assert _register(client, display_name="Second").status_code == 409


# ── Login (T1.8 – T1.11) ─────────────────────────────────────────────────────

def test_t1_8_login_registered_user(client: TestClient) -> None:
    _register(client, display_name="Valid User")
    r = _login(client)
    assert r.status_code == 200
    assert "user" in r.json() and "accessible_modules" in r.json()


def test_t1_9_login_unregistered_user(client: TestClient) -> None:
    assert _login(client).status_code == 404


def test_t1_10_login_deactivated_user(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.CLIENT, active=False)
    r = _login(client)
    assert r.status_code == 403
    assert "deactivated" in r.json()["detail"].lower()


def test_t1_11_login_returns_modules_for_role(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.PM)
    r = _login(client)
    assert r.status_code == 200
    assert sorted(m["id"] for m in r.json()["accessible_modules"]) == sorted(["M4", "M5", "M6", "M7"])


# ── Module list correctness per role (T1.12 – T1.19) ─────────────────────────

@pytest.mark.parametrize("role, expected_ids", [
    (UserRole.CLIENT,     ["M5", "M7"]),
    (UserRole.RISK,       ["M7"]),
    (UserRole.COMPLIANCE, ["M2", "M4", "M5", "M6", "M7", "M9"]),
    (UserRole.PC,         ["M3", "M4", "M5", "M6", "M7"]),
    (UserRole.PM,         ["M4", "M5", "M6", "M7"]),
    (UserRole.MOBO,       ["M7"]),
    (UserRole.RM,         ["M2"]),
    (UserRole.ADMIN,      ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"]),
])
def test_module_list_by_role(
    role: UserRole, expected_ids: list[str], client: TestClient, db: Session
) -> None:
    _insert(db, "dev-user", role)
    r = _login(client)
    assert r.status_code == 200
    assert sorted(m["id"] for m in r.json()["accessible_modules"]) == sorted(expected_ids)


# ── Own-profile management (T1.20 – T1.23) ───────────────────────────────────

def test_t1_20_auth_me_valid_session(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.CLIENT)
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert "user" in r.json() and "accessible_modules" in r.json()


def test_t1_21_auth_me_no_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException, status as s
    import app.deps.auth as _dep

    def _fail(creds: object, settings: object) -> dict[str, str]:  # type: ignore[override]
        raise HTTPException(status_code=s.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    monkeypatch.setattr(_dep, "verify_firebase_token", _fail)
    assert client.get("/api/auth/me").status_code == 401


def test_t1_22_patch_me_update_display_name(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.CLIENT)
    r = client.patch("/api/users/me", json={"display_name": "New Name"},
                     headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert r.json()["user"]["display_name"] == "New Name"


def test_t1_23_patch_me_empty_body(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.CLIENT)
    r = client.patch("/api/users/me", json={}, headers={"Authorization": "Bearer any"})
    assert r.status_code == 422


# ── ADMIN user management (T1.24 – T1.34) ────────────────────────────────────

def test_t1_24_list_users_as_admin(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "other-user", UserRole.PM)
    r = client.get("/api/users/", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_t1_25_list_users_as_non_admin(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.PM)
    assert client.get("/api/users/", headers={"Authorization": "Bearer any"}).status_code == 403


def test_t1_26_list_users_filter_by_role(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "pm-user", UserRole.PM)
    _insert(db, "compliance-user", UserRole.COMPLIANCE)
    r = client.get("/api/users/?role=PM", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    users = r.json()
    assert len(users) == 1 and users[0]["role"] == "PM"


def test_t1_27_patch_role_as_admin(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "target-user", UserRole.CLIENT)
    r = client.patch("/api/users/target-user/role", json={"role": "PM"},
                     headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert r.json()["role"] == "PM"


def test_t1_28_patch_role_as_non_admin(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.PM)
    _insert(db, "target-user", UserRole.CLIENT)
    r = client.patch("/api/users/target-user/role", json={"role": "COMPLIANCE"},
                     headers={"Authorization": "Bearer any"})
    assert r.status_code == 403


def test_t1_29_patch_role_invalid_value(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "target-user", UserRole.CLIENT)
    r = client.patch("/api/users/target-user/role", json={"role": "SUPERUSER"},
                     headers={"Authorization": "Bearer any"})
    assert r.status_code == 422


def test_t1_30_deactivate_user(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "target-user", UserRole.CLIENT)
    r = client.patch("/api/users/target-user/deactivate", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_t1_31_admin_cannot_deactivate_self(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    r = client.patch("/api/users/dev-user/deactivate", headers={"Authorization": "Bearer any"})
    assert r.status_code == 400
    assert "own account" in r.json()["detail"].lower()


def test_t1_32_reactivate_user(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "target-user", UserRole.CLIENT, active=False)
    r = client.patch("/api/users/target-user/reactivate", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_t1_33_get_user_by_uid_as_admin(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.ADMIN)
    _insert(db, "target-user", UserRole.PM)
    r = client.get("/api/users/target-user", headers={"Authorization": "Bearer any"})
    assert r.status_code == 200
    assert r.json()["role"] == "PM"


def test_t1_34_get_user_by_uid_as_pm(client: TestClient, db: Session) -> None:
    _insert(db, "dev-user", UserRole.PM)
    _insert(db, "target-user", UserRole.CLIENT)
    assert client.get("/api/users/target-user", headers={"Authorization": "Bearer any"}).status_code == 403
```

---

## 13. Verification

Run from the `api-backend/` directory:

```bash
.venv/Scripts/pytest tests/test_module1.py -v
.venv/Scripts/mypy app/ --ignore-missing-imports
.venv/Scripts/ruff check app/ tests/
```

Expected: ~41 pytest items pass (34 named tests + 8 parametrized role variants); 0 mypy errors; 0 ruff errors.

---

## 14. Confirmed decisions

| Decision | Choice |
|----------|--------|
| Dev-mode `firebase_uid` | Always `"dev-user"` for all endpoints |
| Login upsert | Removed — returns 404 if user not registered |
| `PATCH /{uid}/role` response | `UserOut` |
| `GET /api/users/` response | `list[UserOut]` (flat array, no wrapper) |
| Email update | MariaDB only; Firebase account NOT synced (TD-2) |
| Admin self-registration role | Caller supplies role; defaults to ADMIN (TD-1, temporary) |

---

## 15. Do NOT create in this phase

- `alembic/` directory
- Any PostgreSQL or MongoDB connection modules
- Any router for Modules 2–10
