# 014 — Client Onboarding Follow-Up Fixes · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: [proposal `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md`](../proposals/014-2026-07-21-onboarding-follow-up-fixes.md) § Layer 1 — Backend (Findings B-1/C-2 through D, i.e. C-2, C-3, C-4, C-5, C-6, C-7, C-8, C-9, D)
> Layer: **Backend**
> Sibling layer docs: [`docs/implementations/014-onboarding-follow-up-fixes-fe.md`](014-onboarding-follow-up-fixes-fe.md)
> Execution schedule: `docs/execution-schedules/014-onboarding-follow-up-fixes-be.md`
> Builds on: proposal 013 (`client-onboarding-integration`, already merged into the current branch) — `app/libs/onboarding/` package, `client_portfolios` table (proposal 011), `client_subscriptions`/`client_allotment_redemptions` tables. **No migration** — this proposal makes zero schema changes (proposal §4.2).

<!-- OVERRIDE — branching convention (per explicit user instruction on this proposal):
This is a fix/patch pass on an already-in-progress feature branch, NOT a fresh
multi-branch build. There is no `<parent>-be` branch and no worktree isolation
for this layer. Every unit below commits directly to the CURRENT branch
(`onboarding-subsystem-fixing`). The Frontend layer commits to the SAME branch,
not a sibling branch — the two layers are kept from colliding by touching
disjoint working directories (`api-backend/` vs `admin-frontend/`), not by git
branch isolation. Wherever the template below says "this layer's own branch" or
"isolation," read it as "this layer's own subtree of the current branch." -->

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` § Layer 1 — Backend |
| Execution schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-be.md` |
| Sibling layer impl docs | `docs/implementations/014-onboarding-follow-up-fixes-fe.md` |
| Builds on | Proposal 013 (already merged, this branch); `client_portfolios` (proposal 011, `app/models/post_trade_allocation.py`) |

---

## 2. Branch & session contract

- **Branch:** `onboarding-subsystem-fixing` (the current branch) — **override, no per-layer branch.** All `BE-*` units in this doc commit directly here, as ordinary commits on the branch already in progress. There is no `014-onboarding-follow-up-fixes-be` branch and no worktree isolation for this layer.
- **Isolation (redefined for this override):** this layer is not built on its own branch in parallel with Frontend — both layers land on this same branch. Non-collision comes from disjoint file ownership: every `BE-*` unit below touches only `api-backend/**`; the sibling Frontend doc's `FE-*` units touch only `admin-frontend/**`. A session working this doc never needs to touch a file owned by an `FE-*` unit, and vice versa.
- **Preconditions (must be true before starting):**
  - [ ] Proposal 013 is present on this branch (it already is — `app/libs/onboarding/{service,repository,router,schemas}.py`, `app/models/onboarding.py`, RBAC actions in `app/libs/auth/actions.py` all exist).
  - [ ] `client_portfolios` (`app/models/post_trade_allocation.py:116-143`) and `client_subscriptions`/`client_allotment_redemptions` (`app/models/pc.py`, `app/models/onboarding.py`) exist and are migrated on the target DB — proposal 011/013's migrations, already applied.
  - [ ] The frozen seam in proposal §4.1 is agreed — §7 below is copied verbatim from it.
- **Read-first inventory:**
  - `api-backend/app/libs/onboarding/service.py` — `OnboardingService`: `start`, `upload_document`, `submit`, `download_document`, `_approve_initial`; every `BE-*` unit except BE-5/BE-6 touches this file.
  - `api-backend/app/libs/onboarding/repository.py` — `OnboardingRepository`: `create_cycle`, `display_fields`, new helpers `client_folder_name`, `set_initial_portfolio`, `list_all_subscriptions`, `list_allotments_for_client`.
  - `api-backend/app/libs/onboarding/router.py` — route registrations for every new endpoint (BE-2, BE-3, BE-7, BE-9).
  - `api-backend/app/libs/onboarding/schemas.py` — `OnboardingDTO.approved_by`, `ClientSubscriptionRowDTO`, `ClientSubscriptionsDTO`.
  - `api-backend/app/libs/trade_models/storage.py` — `FileStorage`/`LocalStorage`/`get_storage()`, the `subdir` param (BE-4).
  - `api-backend/app/libs/trade_models/service.py:345,391` — existing `save()` call sites, need `subdir="trade_models"` (BE-4).
  - `api-backend/app/core/config.py` — `pc_storage_backend`/`pc_storage_root` → `storage_backend`/`storage_root` rename (BE-4).
  - `api-backend/docker-compose.yml` — `PC_STORAGE_ROOT` env var + bind mount rename (BE-4).
  - `api-backend/app/libs/identity/service.py` — `FirebaseIdentityService.create_user` (BE-5).
  - `api-backend/app/libs/clients/repository.py` — `ClientRepository._base_query()`, needs the `id_type`/`id_number`/`authorized_by_name` joins (BE-6, BE-7).
  - `api-backend/app/libs/clients/schemas.py` — `ClientListItemOut` widened fields (BE-7).
  - `api-backend/app/libs/auth/actions.py` — read-only reference; no new `Action` values needed (every new route reuses `ONBOARDING_MANAGE` or `CLIENT_VIEW`, both already registered per 013 C-1).
- **Hand-off / exit signal:** all `BE-1`..`BE-9` committed on `onboarding-subsystem-fixing`; `ruff`/`mypy`/`pytest` gate green; §7 seam matches the proposal verbatim; ready for the Frontend layer's units to build against the same branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- Layering: `router.py` → `service.py` → `repository.py`; a router function only calls its service, a service only calls its own repository (plus, where already established, another feature's *model* — never another feature's *repository/service* — e.g. `onboarding/repository.py` already imports `app.models.pc.Model`; this proposal adds `app.models.post_trade_allocation.ClientPortfolio` the same way, per proposal C-9).
- RBAC: every route is gated with `Depends(require_action(Action.<X>))`; never trust a role name directly.
- Enums persist lowercase, `native_enum=False`, `values_callable=lambda e: [m.value for m in e]` (unchanged — no new enum this proposal).
- Numeric precision: `Numeric(28,10)` for multiplier/amount-shaped values, `Numeric(9,6)` for fee fractions — reuse existing columns' precision, introduce no new column.
- Settings: `pydantic-settings` `BaseSettings` subclass in `app/core/config.py`; env var name is the field name uppercased (renaming a field renames its env var — BE-4 must update every place that env var is referenced, including `docker-compose.yml`).
- File storage: all bytes go through `get_storage()` (`app/libs/trade_models/storage.py`) — never a bare `open()`/`Path.write_bytes` elsewhere in a service.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each `BE-*` unit is one commit, leaves the branch green.
- **Every unit is independently revertible.** No unit depends on an uncommitted sibling unit (dependencies are called out per-unit in §6; where BE-9's `start()` write depends on nothing else in this doc, it's stated as such).
- **Additive & backward-compatible first.** BE-4's config rename is the one exception worth flagging: it's a rename, not additive — see BE-4's own note on sequencing the config change with the deploy-time directory rename so no environment is left pointing at a directory that no longer has that name.
- **Gates before merge** (verified present in this repo — `api-backend/pyproject.toml` has `[tool.ruff]`/`[tool.pytest.ini_options]`/`[tool.mypy]`):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** The storage root's physical directory rename (BE-4) is a deploy-time step, not a merge-path step — it's called out as a gate for the execution schedule/human, not baked into a commit.
- **Reversibility documented** (§9).

---

## 4. Architecture

**Target layout (no new modules — every change lands in an existing package):**
```
api-backend/app/libs/onboarding/
  service.py        # BE-1, BE-2, BE-3, BE-4 (call site), BE-6, BE-7, BE-8, BE-9
  repository.py      # BE-4 (client_folder_name), BE-7, BE-8, BE-9 (set_initial_portfolio)
  router.py          # BE-2, BE-3, BE-7, BE-9 (new routes)
  schemas.py         # BE-6 (approved_by), BE-9 (subscription DTOs)
api-backend/app/libs/trade_models/
  storage.py         # BE-4 (subdir param)
  service.py         # BE-4 (call-site update)
api-backend/app/libs/identity/
  service.py         # BE-5
api-backend/app/libs/clients/
  repository.py      # BE-6, BE-7 (new joins)
  schemas.py          # BE-6, BE-7 (widened DTO)
api-backend/app/core/config.py      # BE-4 (settings rename)
api-backend/docker-compose.yml      # BE-4 (env var + bind mount rename)
```

**Dependency direction:** unchanged from 013 — `router → service → repository`; `onboarding/repository.py` reads `app.models.pc` and (new) `app.models.post_trade_allocation` directly (model imports, not lib-to-lib service calls); `clients/repository.py` gains a self-join pattern already used for `assigned_rm` (no new cross-lib dependency).

**External seams:** every route/DTO in proposal §4.1 (copied verbatim in §7 below); reads/writes `client_portfolios`, `client_onboardings`, `client_subscriptions`, `client_allotment_redemptions`, `users`, `onboarding_documents` — all pre-existing tables.

---

## 5. Modules

### 5.1 `onboarding` (existing package, extended)
- **Responsibility:** owns the onboarding state machine, its documents, and every RM/Compliance/PC/Client route over it — unchanged scope from 013, this proposal only adds guards, routes, and one more write inside an existing method.
- **Files:** `service.py`, `repository.py`, `router.py`, `schemas.py`.
- **Public surface:** `OnboardingService` (all public methods), the router's mounted endpoints.
- **Owns features:** BE-1, BE-2, BE-3, BE-6 (onboarding half), BE-7, BE-8, BE-9.

### 5.2 `trade_models.storage`
- **Responsibility:** the shared `FileStorage` adapter used by both `trade_models` (model materials) and `onboarding` (KYC docs).
- **Files:** `storage.py`, plus `trade_models/service.py`'s two existing call sites and `app/core/config.py`.
- **Public surface:** `FileStorage` protocol, `get_storage()`.
- **Owns features:** BE-4.

### 5.3 `identity`
- **Responsibility:** the sole module that mutates Firebase Auth identities.
- **Files:** `service.py`.
- **Owns features:** BE-5.

### 5.4 `clients`
- **Responsibility:** the RM/ADMIN client-book read surface (`GET /rm/clients`, `GET /rm/clients/{id}`).
- **Files:** `repository.py`, `schemas.py`.
- **Owns features:** BE-6 (client-side half), BE-7 (id_type/id_number join).

---

## 6. Features

### BE-1 — Status guard on `upload_document`/`submit` (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-2
- **Module:** 5.1 `onboarding`
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** none — parallel-safe with every other unit in this doc.

**Contract:**

```python
_EDITABLE_STATUSES = {OnboardingStatus.INITIAL, OnboardingStatus.PENDING_REVIEW}

def upload_document(
    self, onboarding_id: uuid.UUID, doc_type: str, *,
    stream: BinaryIO, filename: str, content_type: str | None,
) -> DocumentDTO:
    onboarding = self._require_onboarding(onboarding_id)
    if onboarding.status not in _EDITABLE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT,
            "Documents cannot be uploaded while the cycle is under review or active")
    doc = self._require_document(onboarding_id, doc_type)
    # ... unchanged from here (existing _CAN_REUPLOAD_STATUSES check on `doc` stays)

def submit(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
    onboarding = self._require_onboarding(onboarding_id)
    if onboarding.status not in _EDITABLE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cycle has already been submitted or decided")
    # ... unchanged from here
```

**Behavior / invariants:**
- `upload_document` and `submit` both 409 whenever `onboarding.status ∈ {"reviewing", "active"}`, checked **before** any other logic in the method runs.
- **Confirmed regression this closes:** `POST /rm/onboardings/{id}/submit` against an `active` onboarding must return `409` and leave `onboarding.status` unchanged at `"active"` — it must never reach the `onboarding.status = OnboardingStatus.REVIEWING` assignment.
- The existing per-document `_CAN_REUPLOAD_STATUSES` check inside `upload_document` is unchanged and still runs (this is an *additional* guard, not a replacement).

**Done when:** a raw API call to either endpoint against a `reviewing` or `active` cycle returns `409` and produces no database write; both endpoints behave identically to today for `initial`/`pending_review` cycles.

---

### BE-2 — RM-scoped single-document download route (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-3
- **Module:** 5.1 `onboarding`
- **Files:** `modify: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** none.

**Contract:**

```python
@router.get(
    "/rm/onboardings/{onboarding_id}/documents/{doc_type}/download",
)
def download_document_rm(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(onboarding_id, doc_type)
    return StreamingResponse(
        stream, media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Behavior / invariants:** byte-for-byte identical body to the existing `GET /compliance/onboardings/{onboarding_id}/documents/{doc_type}/download` (`router.py:125-137`) — only the path prefix and the gating `Action` differ (`ONBOARDING_MANAGE` instead of `ONBOARDING_REVIEW`). No new service method — calls the existing `service.download_document` verbatim. 404 if the document has no file (`service.download_document` already raises this).

**Done when:** an RM-authorized caller can download any document belonging to an onboarding cycle they can see on the board; a caller with only `ONBOARDING_REVIEW` (Compliance) gets `403` on this specific route (they use their own existing route instead).

---

### BE-3 — "Download All" zip route + service method (Yes — user req.)

- **Proposal ref:** § Layer 1 — Backend, C-4
- **Module:** 5.1 `onboarding`
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** none.

**Contract:**

```python
# service.py — new imports: io, zipfile (stdlib only)
def download_all_documents(self, onboarding_id: uuid.UUID) -> tuple[BinaryIO, str]:
    docs = [d for d in self.repo.documents_for(onboarding_id) if d.storage_key]
    if not docs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No documents have been uploaded yet")
    onboarding = self._require_onboarding(onboarding_id)
    display = self.repo.display_fields(onboarding)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            with get_storage().open(doc.storage_key) as fh:
                zf.writestr(f"{doc.doc_type}_{doc.filename or doc.doc_type}", fh.read())
    buf.seek(0)
    return buf, f"{display.client_name or 'client'}_kyc_docs.zip"
```

```python
# router.py
@router.get("/rm/onboardings/{onboarding_id}/documents/download-all")
def download_all_documents(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> StreamingResponse:
    stream, zip_name = svc.download_all_documents(onboarding_id)
    return StreamingResponse(stream, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'})
```

**Behavior / invariants:**
- Every entry name is prefixed with `doc_type` (`f"{doc.doc_type}_{filename}"`) so two documents that happen to share an original filename never collide inside the zip.
- 404 if zero documents on the cycle have a `storage_key` (nothing uploaded yet) — do not return an empty zip.
- Uses only `io`/`zipfile` (stdlib); no new dependency added to `pyproject.toml`.
- The zip is built fully in memory (`io.BytesIO`) — acceptable at the ≤7-document, PDF-sized scale this feature operates at; no streaming-zip library needed.

**Done when:** `GET /rm/onboardings/{id}/documents/download-all` on a cycle with N uploaded documents returns a valid zip containing exactly N entries, each readable and matching its source file's bytes; the same route on a cycle with zero uploads returns `404`.

---

### BE-4 — Per-client KYC storage subdirectory + storage-root rename (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-5
- **Module:** 5.2 `trade_models.storage`
- **Files:** `modify: api-backend/app/libs/trade_models/storage.py`, `modify: api-backend/app/libs/trade_models/service.py` (lines 345, 391 — pass `subdir="trade_models"`), `modify: api-backend/app/core/config.py`, `modify: api-backend/docker-compose.yml`, `modify: api-backend/app/libs/onboarding/repository.py` (new `client_folder_name` helper), `modify: api-backend/app/libs/onboarding/service.py` (pass `subdir` at the `upload_document` call site)
- **Dependencies:** none — independently revertible from every other unit (a revert restores the flat/`pc_storage`-named layout, no data is lost either way per the proposal's D-2).

**Contract:**

```python
# app/core/config.py — renamed fields (env vars follow: STORAGE_BACKEND / STORAGE_ROOT)
storage_backend: str = "local"          # was: pc_storage_backend
storage_root: str = "./crm_filesystem"  # was: pc_storage_root, default "./pc_storage"
```

```python
# trade_models/storage.py
class FileStorage(Protocol):
    def save(self, stream: BinaryIO, *, suggested_name: str,
              content_type: str | None = None, subdir: str | None = None) -> str: ...
    def open(self, storage_key: str) -> BinaryIO: ...

class LocalStorage:
    def save(self, stream: BinaryIO, *, suggested_name: str,
              content_type: str | None = None, subdir: str | None = None) -> str:
        key_body = f"{uuid.uuid4().hex}_{suggested_name}"
        key = f"{subdir}/{key_body}" if subdir else key_body
        dest = self._root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            fh.write(stream.read())
        return key

    def open(self, storage_key: str) -> BinaryIO:  # UNCHANGED body
        return (self._root / storage_key).open("rb")

def get_storage() -> FileStorage:
    settings = get_settings()
    backend = settings.storage_backend.lower()
    if backend == "nas":
        return NasStorage()
    return LocalStorage(settings.storage_root)
```

```python
# onboarding/repository.py — new helper
import re

def client_folder_name(self, onboarding: ClientOnboarding) -> str:
    display = self.display_fields(onboarding)
    user = self.db.get(User, onboarding.user_id)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", display.client_name).strip("_") or "client"
    return f"{slug}_{user.firebase_uid[:8]}"
```

```python
# onboarding/service.py — upload_document call site
storage_key = get_storage().save(
    stream, suggested_name=filename, content_type=content_type,
    subdir=f"client_kyc_docs/{self.repo.client_folder_name(onboarding)}",
)
```

```yaml
# docker-compose.yml
environment:
  STORAGE_ROOT: /app/crm_filesystem   # was: PC_STORAGE_ROOT: /app/pc_storage
volumes:
  - ./crm_filesystem:/app/crm_filesystem   # was: ./pc_storage:/app/pc_storage
```

**Behavior / invariants:**
- `open()`'s **signature and body are byte-for-byte unchanged** — `storage_key` already carries the full relative path (subdir included when present), so every `storage_key` written before this unit lands — anywhere in the codebase, any feature — keeps opening exactly as it does today.
- `save()`'s new `subdir` parameter is optional and defaults to `None` (flat, unprefixed key) — any caller not updated by this unit (there are none left after BE-4, but the signature itself stays backward-compatible).
- `trade_models/service.py`'s two existing `save()` calls (materials upload) pass `subdir="trade_models"`; `onboarding/upload_document` passes `subdir=f"client_kyc_docs/{client_folder_name(...)}"`.
- `client_folder_name` never produces a path separator or other filesystem-unsafe character from an arbitrary client display name (non-alnum runs collapse to a single `_`); the trailing 8-character firebase-uid slice guarantees two clients with an identical sanitized name still get distinct folders.
- The root directory rename (`pc_storage` → `crm_filesystem`) is a **deploy-time physical `mv`**, not something this unit's code performs — the code change (config default + docker-compose) must land in the same commit as (or be sequenced immediately before) that manual step, so no environment is left with `storage_root` pointing at a directory that doesn't exist under its new name. Call this out explicitly to the execution schedule as a deploy-time gate, not a code-path branch.

**Done when:** a document uploaded after this unit lands resolves under `crm_filesystem/client_kyc_docs/<slug>_<uid8>/...`; a model-material file resolves under `crm_filesystem/trade_models/...`; a `storage_key` written before this unit (test fixture or otherwise) still opens correctly with no code change on the read path; two clients whose names sanitize identically get two different folders (assert on `client_folder_name`'s raw output).

---

### BE-5 — Default password on `create_user` (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-6
- **Module:** 5.3 `identity`
- **Files:** `modify: api-backend/app/libs/identity/service.py`
- **Dependencies:** none.

**Contract:**

```python
_DEFAULT_PASSWORD = "12345678"  # interim only — real reset flow is a future proposal

def create_user(self, email: str) -> str:
    if self._settings.firebase_auth_disabled:
        return f"dev-{email}"
    _init_firebase(self._settings)
    user = auth.create_user(email=email, password=_DEFAULT_PASSWORD)
    return user.uid
```

**Behavior / invariants:** applies uniformly to every caller of `ensure_identity`/`create_user` — client onboarding (`ClientService.onboard`) and staff onboarding (`staff/service.py:50,69`) both get the Email/Password provider attached with this default. `generate_invite_link`/`generate_password_reset_link` are untouched — they remain the existing path to set a real password. The `firebase_auth_disabled` dev-bypass branch is untouched (still returns a synthetic `dev-{email}` uid with no real Firebase call).

**Done when:** a newly created Firebase user (dev-mode `firebase_auth_disabled=False` path, exercised against the Firebase emulator or a mock of `auth.create_user`) has the Email/Password provider present, and the call was made with `password="12345678"`.

---

### BE-6 — Resolve `authorized_by` uid → display name (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-7
- **Module:** 5.1 `onboarding` (DTO half) + 5.4 `clients` (list half)
- **Files:** `modify: api-backend/app/libs/onboarding/repository.py`, `modify: api-backend/app/libs/onboarding/schemas.py`, `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/clients/repository.py`, `modify: api-backend/app/libs/clients/schemas.py`
- **Dependencies:** none.

**Contract:**

```python
# onboarding/repository.py — OnboardingDisplayRow gains:
approved_by: str | None

# resolution, same alias/coalesce shape as assigned_rm's own resolution:
Approver = aliased(User)
ApproverProfile = aliased(AdminProfile)
approved_by_expr = func.coalesce(ApproverProfile.name, Approver.email, User.authorized_by)
# joined: outerjoin(Approver, Approver.firebase_uid == <the CLIENT's own> User.authorized_by)
#         outerjoin(ApproverProfile, ApproverProfile.user_id == Approver.id)
```

```python
# onboarding/schemas.py
class OnboardingDTO(BaseModel):
    ...
    approved_by: str | None   # NEW
```

```python
# clients/schemas.py
class ClientListItemOut(BaseModel):
    ...
    authorized_by_name: str | None   # NEW — resolved from users.authorized_by
```

```python
# clients/repository.py — _base_query() gains a second Approver/ApproverProfile
# alias pair (distinct from the existing RM/RMProfile pair), joined on
# Approver.firebase_uid == User.authorized_by (the CLIENT's own users row, aliased
# as ClientUser in the existing query — NOT the RM alias).
```

**Behavior / invariants:**
- Both `OnboardingDTO.approved_by` and `ClientListItemOut.authorized_by_name` resolve the identical `users.authorized_by` firebase-uid → display-name mapping — the same coalesce logic applied at two call sites (onboarding detail, client list), not duplicated as two different implementations.
- `None` when `authorized_by` itself is `NULL` (client never approved yet) — the coalesce must not raise or short-circuit to an empty string.
- Uses `outerjoin`, not `innerjoin` — a client with no approval yet (or predating 013) must still appear in the query, just with this field `None`.

**Done when:** for an approved client, `GET /rm/onboardings/{id}` returns `approved_by` equal to the approving compliance officer's `AdminProfile.name` (or email fallback); `GET /rm/clients/{id}` returns the identical name in `authorized_by_name`; for a client never approved, both are `None`.

---

### BE-7 — Client-detail endpoints: `id_type`/`id_number` join, by-client onboarding route, by-client events route (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-8
- **Module:** 5.1 `onboarding` (routes) + 5.4 `clients` (join)
- **Files:** `modify: api-backend/app/libs/clients/repository.py`, `modify: api-backend/app/libs/clients/schemas.py`, `modify: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** none.

**Contract:**

```python
# clients/schemas.py
class ClientListItemOut(BaseModel):
    ...
    id_type: str | None      # NEW — client_onboardings.id_type, joined
    id_number: str | None    # NEW — client_onboardings.id_number, joined
```

```python
# clients/repository.py — _base_query() gains:
.outerjoin(ClientOnboarding, ClientOnboarding.user_id == ClientProfile.user_id)
# select additions: ClientOnboarding.id_type, ClientOnboarding.id_number
```

```python
# onboarding/router.py
@router.get("/rm/onboardings/by-client/{client_id}", response_model=OnboardingDTO)
def get_onboarding_by_client(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    return svc.detail_by_client(client_id)   # new service method: get_by_user_id + _to_dto(with_documents=True); 404 if None

@router.get("/rm/clients/{client_id}/events", response_model=list[ClientEventDTO])
def get_client_events_rm(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> list[ClientEventDTO]:
    return svc.client_events(client_id)   # reuses the EXISTING method verbatim — client_id IS the user_id
```

**Behavior / invariants:**
- `id_type`/`id_number` use an `outerjoin` — a client onboarded via the older bare `POST /rm/clients` path (pre-013, no `client_onboardings` row) still returns from `GET /rm/clients/{id}`, with these two fields `None`.
- `GET /rm/onboardings/by-client/{client_id}` 404s (not 500s) when the client has no onboarding row — same pre-013-client edge case.
- `GET /rm/clients/{client_id}/events` adds **zero** new repository/service code — it is a new route calling the already-existing `OnboardingService.client_events(user_id)` with an explicit path param instead of resolving `user_id` from the caller's own token. Gated by `Action.CLIENT_VIEW` (the same action `GET /rm/clients/{id}` already requires), not `get_current_client_user`.

**Done when:** `GET /rm/clients/{id}` for a 013-onboarded client returns non-null `id_type`/`id_number` matching that client's `client_onboardings` row; the same route for a pre-013 client returns `null` for both without erroring; `GET /rm/onboardings/by-client/{id}` returns the same `OnboardingDTO` shape (with documents) as the existing `GET /rm/onboardings/{onboarding_id}` for that client's cycle; `GET /rm/clients/{id}/events` returns the same rows `GET /client/events` would for that client, called with an RM/ADMIN token instead of the client's own.

---

### BE-8 — Initial Cash Deposit: AUM-floor validation + `client_portfolios` seeding at intake (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, C-9
- **Module:** 5.1 `onboarding`
- **Files:** `modify: api-backend/app/libs/onboarding/schemas.py`, `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/repository.py`
- **Dependencies:** none.

**Contract:**

```python
# schemas.py
class StartOnboardingReq(BaseModel):
    ...
    initial_cash_deposit: Decimal   # NEW — request-only, never persisted raw
```

```python
# service.py — inside OnboardingService.start, after create_cycle, before commit:
amount_in_trade = req.units * model.model_size
cash_deposit = req.initial_cash_deposit - amount_in_trade
if cash_deposit < 0:   # N=0% floor (generalized: cash_deposit >= amount_in_trade * N/(100-N))
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
        "Initial cash deposit must cover at least the subscribed amount in trade")
self.repo.set_initial_portfolio(staged_user.id, amount_in_trade=amount_in_trade, cash_deposit=cash_deposit)
```

```python
# repository.py
def set_initial_portfolio(self, user_id: uuid.UUID, *, amount_in_trade: Decimal, cash_deposit: Decimal) -> None:
    portfolio = self.db.get(ClientPortfolio, user_id)
    if portfolio is None:
        portfolio = ClientPortfolio(user_id=user_id, cash_deposit=cash_deposit,
                                     amount_in_trade=amount_in_trade, previous_amount_in_trade=Decimal("0"))
        self.db.add(portfolio)
    else:
        portfolio.cash_deposit = cash_deposit
        portfolio.amount_in_trade = amount_in_trade
```

(`ClientPortfolio` imported from `app.models.post_trade_allocation`.)

**Behavior / invariants:**
- **No new column anywhere** — `client_onboardings` is untouched; `initial_cash_deposit` lives only in the request body and the in-memory computation inside `start()`.
- Validated exactly **once**, inside `start()` — `422` on violation, before `create_cycle`'s row (or at minimum before the transaction commits — either ordering is acceptable as long as a `422` here leaves no `client_onboardings`/`onboarding_documents`/`client_portfolios` row behind; prefer failing the check before `create_cycle` runs to avoid a rollback dance).
- `set_initial_portfolio` runs exactly once per client, inside `start()`'s transaction, never again afterward (a renewal never touches `client_portfolios`).
- Assumes no `ClientPortfolio` row exists yet for this `user_id` (true by construction — this is the same request that creates the client's subscription eligibility in the first place); the `else` branch is defensive-only, not an expected path — if it's ever hit in practice, that indicates an ordering bug elsewhere worth investigating, not a case to silently paper over.
- **Known, accepted consequence:** because this runs at intake, a client's `client_portfolios` row is seeded even if that client is later rejected or never leaves `initial`. This is intentional per the proposal's D-4 — not a bug to fix in this unit.

**Done when:** `POST /rm/onboardings` with `initial_cash_deposit` exactly at the floor (`== units * model.model_size`) succeeds and the resulting `client_portfolios` row has `cash_deposit == 0`, `amount_in_trade == units * model.model_size`; one cent under the floor returns `422` and creates no rows at all (no `client_onboardings`, no `client_portfolios`); two different clients onboarded in sequence each get their own correctly-computed row, with no cross-contamination.

---

### BE-9 — Model Subscription read endpoints (MANDATORY)

- **Proposal ref:** § Layer 1 — Backend, D
- **Module:** 5.1 `onboarding`
- **Files:** `modify: api-backend/app/libs/onboarding/schemas.py`, `modify: api-backend/app/libs/onboarding/repository.py`, `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** none.

> **Refinement (post-draft):** `ClientSubscriptionRowDTO` gains an `amount` field (`= units * model.model_size`, mirroring `AllotRdmptDTO.amount`). Without it, the Frontend layer would need a second hook (`useModels()`) just to compute a per-model notional/AUM figure the backend already has every ingredient for in the same joined query — a one-field addition here removes a whole cross-hook join on the Frontend side. This widens the proposal §4.1 seam by one field; both impl docs' §7 below are re-copied from the updated proposal.

**Contract:**

```python
# schemas.py
class ClientSubscriptionRowDTO(BaseModel):
    model_id: uuid.UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal   # effective = override ?? Model default
    ib_account: str | None
    amount: Decimal   # NEW — units * model.model_size (mirrors AllotRdmptDTO.amount)

class ClientSubscriptionsDTO(BaseModel):
    client_id: uuid.UUID; client_name: str
    subscriptions: list[ClientSubscriptionRowDTO]
```

```python
# repository.py
def list_all_subscriptions(self) -> list[tuple[ClientProfile, ClientSubscription, Model]]:
    """Every (client profile, subscription, model) row, joined — unfiltered by
    RM-book visibility (the SERVICE layer applies that, see below)."""
    return (
        self.db.query(ClientProfile, ClientSubscription, Model)
        .join(ClientSubscription, ClientSubscription.user_id == ClientProfile.user_id)
        .join(Model, Model.id == ClientSubscription.model_id)
        .all()
    )

def list_allotments_for_client(self, user_id: uuid.UUID) -> list[ClientAllotmentRedemption]:
    return (
        self.db.query(ClientAllotmentRedemption)
        .filter(ClientAllotmentRedemption.user_id == user_id)
        .order_by(ClientAllotmentRedemption.created_at.desc())
        .all()
    )
```

```python
# service.py
def list_subscriptions(self, *, role: AdminRole, rm_uid: str) -> list[ClientSubscriptionsDTO]:
    """Groups the repo's flat joined rows by client, scoped to the caller's
    visible book. Reuses ClientRepository's own visibility rule instead of
    duplicating FULL_VISIBILITY_ROLES/assigned_rm_uid filtering as a second
    SQL WHERE clause -- local import to avoid a module-level onboarding<->clients
    circular dependency (both packages already reference each other's models,
    never each other's service/router, at import time)."""
    from app.libs.clients.repository import ClientRepository

    visible_ids = {row.id for row in ClientRepository(self.db).list_visible(role, rm_uid)}
    by_client: dict[uuid.UUID, ClientSubscriptionsDTO] = {}
    for profile, sub, model in self.repo.list_all_subscriptions():
        if str(profile.user_id) not in visible_ids:
            continue
        amount = sub.multiplier * (model.model_size or Decimal("0"))
        row = ClientSubscriptionRowDTO(
            model_id=model.id,
            model_name=model.name,
            units=sub.multiplier,
            mgmt_fee=sub.mgmt_fee_override if sub.mgmt_fee_override is not None else model.mgmt_fee,
            incentive_fee=(
                sub.incentive_fee_override
                if sub.incentive_fee_override is not None
                else model.incentive_fee
            ),
            ib_account=profile.ib_account,
            amount=amount,
        )
        bucket = by_client.setdefault(
            profile.user_id,
            ClientSubscriptionsDTO(client_id=profile.user_id, client_name=profile.name or "", subscriptions=[]),
        )
        bucket.subscriptions.append(row)
    return list(by_client.values())

def client_allotments(self, client_id: uuid.UUID) -> list[AllotRdmptDTO]:
    return [self._allotment_to_dto(a) for a in self.repo.list_allotments_for_client(client_id)]
```

```python
# router.py — a small local role-lookup dependency, mirroring clients/router.py's
# own _get_caller_role (that function is underscore-private to its module; rather
# than import a private name across packages, this router keeps its own copy of
# the same 3-line lookup, same pattern clients/router.py's own comment already
# accepts: "one small extra query rather than changing a shared dependency's shape").
def _get_subscriptions_caller_role(
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)  # type: ignore[union-attr]

@router.get("/rm/subscriptions", response_model=list[ClientSubscriptionsDTO])
def list_subscriptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
) -> list[ClientSubscriptionsDTO]:
    return svc.list_subscriptions(role=role, rm_uid=user.firebase_uid)

@router.get("/rm/subscriptions/{client_id}/allotments", response_model=list[AllotRdmptDTO])
def list_client_allotments(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> list[AllotRdmptDTO]:
    return svc.client_allotments(client_id)
```

**Behavior / invariants:**
- `list_subscriptions` groups `list_all_subscriptions()`'s joined rows by client, filtered to the caller's visible book via `ClientRepository.list_visible` — `ADMIN`/full-visibility roles see every client (013's `FULL_VISIBILITY_ROLES`), every other role only clients where `ClientProfile.assigned_rm_uid == rm_uid`. Filtering happens in Python over the already-fetched joined rows, not as a second SQL WHERE — this table is small (one row per (client, model)), so this costs nothing worth a second bespoke scoped query, and it guarantees the two endpoints (`/rm/clients`, `/rm/subscriptions`) can never disagree about who's "visible" since they resolve it through the exact same method.
- `ClientSubscriptionRowDTO.mgmt_fee`/`incentive_fee`/`amount` are **effective, read-time-computed** values — `sub.*_fee_override ?? model.*_fee` for fees (013's own read-side coalesce, C-5), `sub.multiplier * (model.model_size or 0)` for `amount` — none are written back anywhere; a client with `model_size = NULL` on its model gets `amount = 0`, not a crash.
- `list_allotments_for_client` returns both `kind`s (though only `"allotment"` rows exist today, per 013's redemption deferral) and both `status`es, newest first — reuses the existing `_allotment_to_dto` verbatim, so its output is byte-identical in shape to what `GET /pc/allotments` already returns for the same underlying rows.

**Done when:** `GET /rm/subscriptions` called as an RM returns only that RM's book (per `assigned_rm_uid`); called as ADMIN returns every client with ≥1 subscription; each row's `mgmt_fee`/`incentive_fee`/`amount` matches the override-or-default/multiplier rule exactly; `GET /rm/subscriptions/{client_id}/allotments` returns that one client's `client_allotment_redemptions` rows (and no other client's), in the same DTO shape `GET /pc/allotments` already produces.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# ---- New / changed StartOnboardingReq field (Goal 8) -----------------------
class StartOnboardingReq(BaseModel):
    ...                       # unchanged existing fields (013 §4.1)
    initial_cash_deposit: Decimal   # NEW — "Initial Cash Deposit" step-2 field. Request-only:
                                     # consumed once inside OnboardingService.start to resolve
                                     # client_portfolios.cash_deposit/amount_in_trade (Backend C-9)
                                     # and then discarded — no column on client_onboardings or
                                     # anywhere else stores this raw figure.

# 422 from POST /rm/onboardings if initial_cash_deposit < units * model.model_size
# (the N=0% floor; see Backend C-9 for the generalized N% form) — the ONLY place this is
# checked, since the value is resolved and written in this same request, not deferred to approve.

# ---- OnboardingDTO widened field (Goal 7.2) --------------------------------
class OnboardingDTO(BaseModel):
    ...                       # unchanged existing fields (013 §4.1, widened D-9)
    approved_by: str | None   # NEW — display name of the compliance officer who approved
                               # (resolved from users.authorized_by firebase_uid); null until approved

# ---- New RM-scoped client-detail endpoints (Goal 7) ------------------------
# GET /api/rm/onboardings/by-client/{client_id}   -> 200 OnboardingDTO (with documents)
#   404 if the client has no onboarding row (shouldn't happen post-013, but a client
#   created via the pre-existing bare POST /rm/clients path, bypassing onboarding,
#   would have none)
# GET /api/rm/clients/{client_id}/events          -> 200 list[ClientEventDTO]
#   thin re-exposure of the existing OnboardingService.client_events(user_id),
#   gated by Action.CLIENT_VIEW instead of the client's own token

# ---- ClientListItemOut widened fields (Goal 7.1/7.2) -----------------------
class ClientListItemOut(BaseModel):
    ...                       # unchanged existing fields
    id_type: str | None       # NEW — client_onboardings.id_type, joined
    id_number: str | None     # NEW — client_onboardings.id_number, joined
    authorized_by_name: str | None  # NEW — resolved display name of users.authorized_by

# ---- New download endpoints (Goal 4) ---------------------------------------
# GET /api/rm/onboardings/{onboarding_id}/documents/{doc_type}/download  -> 200 file stream
#   RM-scoped mirror of the existing compliance download route; same
#   service.download_document, gated by ONBOARDING_MANAGE instead of ONBOARDING_REVIEW
# GET /api/rm/onboardings/{onboarding_id}/documents/download-all         -> 200 application/zip
#   streams a zip of every document that has a file (storage_key is not null);
#   404 if none has ever been uploaded

# ---- Model Subscription read endpoints (Goal 9) -----------------------------
class ClientSubscriptionRowDTO(BaseModel):
    model_id: uuid.UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal   # effective = override ?? Model default (013 C-5's read-side coalesce)
    ib_account: str | None
    amount: Decimal   # = units * model.model_size — mirrors AllotRdmptDTO.amount (service.py:435);
                       # added (post-draft refinement, BE-9) so the FE accordion/AUM figure needs no
                       # separate model-size lookup via useModels()

class ClientSubscriptionsDTO(BaseModel):
    client_id: uuid.UUID; client_name: str
    subscriptions: list[ClientSubscriptionRowDTO]

# GET /api/rm/subscriptions                          -> 200 list[ClientSubscriptionsDTO]
#   scoped by the same RM-book visibility rule as GET /rm/clients (clients/repository.py
#   FULL_VISIBILITY_ROLES / _scoped)
# GET /api/rm/subscriptions/{client_id}/allotments   -> 200 list[AllotRdmptDTO]
#   that one client's rows from client_allotment_redemptions (both kinds, history + pending)

# ---- Storage adapter signature widening (Goal 5) ----------------------------
# FileStorage.save(stream, *, suggested_name, content_type=None, subdir: str | None = None) -> str
# FileStorage.open(storage_key) -> BinaryIO   # UNCHANGED signature — subdir is baked into
#                                              # the returned storage_key, not a separate param
```

### 7.2 How this layer honours the seam
- **What this layer contributes:** serves every route/DTO above exactly as specified; owns the AUM-floor guard, the status guard, the zip stream, the subdir key scheme, and the default-password fix.
- **What this layer assumes from the other side:** the Frontend layer sends `initial_cash_deposit` as a plain number in `StartOnboardingReq`, renders `id_type`/`id_number`/`authorized_by_name` as `null`-safe (`"—"` fallback), and gates its own "Submit All"/"Request docs" UI on `status` the same way this layer gates the underlying endpoints (defense-in-depth, not a substitute for BE-1's server-side guard).
- **Change protocol:** any edit to this seam goes back to the proposal's §4 first; this §7 is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** `pytest` — command: `pytest -q` (confirmed configured: `api-backend/pyproject.toml` has `[tool.pytest.ini_options]`).
- **Fixtures / seed:** existing `api-backend/tests/` fixtures for an in-memory/SQLite `Session`, following the pattern already used by `tests/libs/onboarding/` (013's own tests).
- **Isolation:** hermetic, parallel-safe; no shared external state.
- **Layer isolation:** tests import only from `api-backend/app/**` and test doubles — no import of `admin-frontend/**`, no assumption that the Frontend layer's code exists on this branch.
- **Test location:** `api-backend/tests/libs/onboarding/`, `api-backend/tests/libs/trade_models/`, `api-backend/tests/libs/identity/`, `api-backend/tests/libs/clients/` — mirroring source path.
- **Commit policy:** tests are never committed — `tests/` is git-ignored; generated and run locally/CI only.
- **Code generation:** concrete test code is written by the `test-gen` skill from §8.3's goals.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | `upload_document`/`submit` 409 on `reviewing`/`active`; unchanged on `initial`/`pending_review`; the observed active→reviewing regression specifically | none |
| BE-2 | RM download route serves identical bytes to the compliance route; 403 for a `CLIENT_VIEW`-only caller | none |
| BE-3 | zip contains every uploaded doc, prefixed by doc_type; 404 on zero uploads | none |
| BE-4 | `save()` with `subdir` nests correctly; `open()` unchanged for pre-existing flat keys; `client_folder_name` collision-safe | none |
| BE-5 | `create_user` passes the default password; dev-bypass path unaffected | mock `firebase_admin.auth.create_user` |
| BE-6 | `approved_by`/`authorized_by_name` resolve identically from the same uid; `None` when unset | none |
| BE-7 | `id_type`/`id_number` outerjoin correct incl. pre-013 client edge case; by-client routes match their token-scoped counterparts | none |
| BE-8 | floor validation exact-boundary + one-cent-under; portfolio seeded correctly at intake, once | none |
| BE-9 | RM-book scoping (RM vs ADMIN); effective fee coalesce; per-client allotment filter | fake `ClientRepository`-visible-id-set if the service-layer scoping is tested standalone |

### 8.3 Test goals

#### BE-1
- **Positive:** `upload_document`/`submit` succeed unchanged for `status ∈ {initial, pending_review}`.
- **Negative:** both raise `HTTPException(409)` for `status ∈ {reviewing, active}`; specifically, `submit` on an `active` cycle raises `409` and the cycle's `status` attribute is unchanged after the call (assert it's still `"active"`, not `"reviewing"`).
- **Invariants:** the guard check happens before any other side effect in either method — no partial write occurs on the rejected path.
- **Seam mocks:** none — pure service-layer logic against an in-memory `ClientOnboarding` row.

#### BE-2
- **Positive:** a `ONBOARDING_MANAGE`-scoped caller downloading a document with a `storage_key` gets the same bytes/filename/content-type the existing compliance route would return for the same document.
- **Negative:** a caller with only `ONBOARDING_REVIEW` gets `403` on this route; a doc with no `storage_key` gets `404`.
- **Invariants:** none beyond byte-identical output to the pre-existing route.
- **Seam mocks:** none.

#### BE-3
- **Positive:** given 3 documents with distinct filenames all having `storage_key`, the returned zip has exactly 3 entries, each matching the source bytes; given 2 documents that happen to share a raw filename, both entries exist distinctly (doc_type-prefixed names differ).
- **Negative:** a cycle with zero uploaded documents raises `404`.
- **Invariants:** entry count always equals the count of documents with non-null `storage_key`, regardless of total document count.
- **Seam mocks:** fake `FileStorage.open()` returning canned byte streams.

#### BE-4
- **Positive:** `LocalStorage.save(..., subdir="trade_models")` writes under `<root>/trade_models/...` and returns a key containing that prefix; `save(..., subdir="client_kyc_docs/foo_bar")` writes under the nested path, creating intermediate directories as needed.
- **Negative:** none specific — this unit has no invalid-input class beyond normal filesystem errors, out of scope.
- **Invariants:** `open()` given a key saved *before* this change (no subdir prefix) still resolves correctly — assert on a pre-fabricated flat key fixture; `client_folder_name` for two onboardings whose client names sanitize to the identical slug produces two different strings (differing by the uid suffix).
- **Seam mocks:** none — filesystem operations against a temp directory fixture.

#### BE-5
- **Positive:** `create_user(email)` invokes the mocked `auth.create_user` with `password="12345678"` exactly.
- **Negative:** with `firebase_auth_disabled=True`, no call to `auth.create_user` happens at all (existing dev-bypass path unaffected).
- **Invariants:** none beyond "always passes this literal password when not in dev-bypass."
- **Seam mocks:** `firebase_admin.auth.create_user` mocked/monkeypatched.

#### BE-6
- **Positive:** for an onboarding whose client's `users.authorized_by` is set to a known compliance uid with an `AdminProfile.name`, `display_fields(...).approved_by` equals that name; the identical uid resolved via `ClientListItemOut.authorized_by_name` for the same client matches.
- **Negative:** `authorized_by` is `NULL` → both resolve to `None`, no exception.
- **Invariants:** the two resolution paths (onboarding DTO, client list DTO) never disagree for the same underlying uid.
- **Seam mocks:** none.

#### BE-7
- **Positive:** a 013-onboarded client's `GET /rm/clients/{id}` response has `id_type`/`id_number` matching its `client_onboardings` row; `GET /rm/onboardings/by-client/{id}` returns the same shape (docs included) as `GET /rm/onboardings/{onboarding_id}` for that same underlying row; `GET /rm/clients/{id}/events` returns the same rows as `GET /client/events` would for that client's own token.
- **Negative:** a pre-013 client (no `client_onboardings` row) still returns from `GET /rm/clients/{id}` with `id_type`/`id_number` both `None` — no error; `GET /rm/onboardings/by-client/{id}` for such a client returns `404`.
- **Invariants:** the outerjoin never drops a client row that the existing (unwidened) query would have returned.
- **Seam mocks:** none.

#### BE-8
- **Positive:** `initial_cash_deposit == units * model.model_size` succeeds; resulting `client_portfolios` row has `cash_deposit == 0`, `amount_in_trade == units * model.model_size`.
- **Negative:** `initial_cash_deposit` one cent under the floor raises `422`, and no `client_onboardings`/`client_portfolios`/`onboarding_documents` rows exist afterward for that attempted client.
- **Invariants:** onboarding client A's `start()` call never perturbs client B's pre-existing `client_portfolios` row; calling `set_initial_portfolio` is idempotent-safe if (defensively) invoked twice with the same arguments.
- **Seam mocks:** none — pure service/repository logic against an in-memory DB.

#### BE-9
- **Positive:** an RM caller's `GET /rm/subscriptions` includes only clients where `ClientProfile.assigned_rm_uid == caller`; an ADMIN caller's includes every client with ≥1 subscription; a row whose `ClientSubscription.mgmt_fee_override` is set returns that override, not the model default; a row with no override returns the model's own `mgmt_fee`; `amount` on every row equals `units * model.model_size` exactly, matching `AllotRdmptDTO.amount`'s own formula for the same `(units, model_size)` pair.
- **Negative:** `GET /rm/subscriptions/{client_id}/allotments` for a client with zero allotments returns an empty list, not an error; a subscription whose `Model.model_size` is `NULL` returns `amount == 0`, not a `TypeError`/`None`.
- **Invariants:** the allotments list for client A never includes a row whose `user_id` belongs to client B; two clients who share the exact same subscribed model each get their own independent `ClientSubscriptionRowDTO` row (the grouping-by-client dict never merges two different clients' rows together, even when `model_id` collides).
- **Seam mocks:** fake `ClientRepository.list_visible` (or a real in-memory `ClientProfile`/`AdminProfile` fixture, if this unit's tests exercise the real `clients` module rather than isolating the scoping logic behind a fake).

### 8.4 Aggregate gate
- Local gate, run before commit/PR hand-off: all of the above green.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `service.py`/`repository.py`/`router.py`/`storage.py`/`identity/service.py`/`clients/repository.py`.
- Chosen `test-gen` level: **standard** (happy path + main negative + role/permission per unit) — bump to `thorough` for BE-1 and BE-8 specifically given they're the two units closing an observed production-bound bug and a money-math validation, respectively.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1 through BE-9 committed on `onboarding-subsystem-fixing`; each commit left the branch green.
- [ ] §8 unit tests all pass; `ruff check . && ruff format --check . && mypy app && pytest -q` green.
- [ ] §7 matches the proposal's frozen seam verbatim.
- [ ] The storage root's physical directory rename (BE-4) has been performed on every environment this branch is deployed to, in the same change window as the config default flip — flagged to the execution schedule as a deploy-time step, not left implicit.
- [ ] PR opened; human owns the merge to `main`.

**Rollback:** every unit reverts cleanly with the branch (no schema of its own — this proposal makes zero DB changes). The one non-code artifact is the storage root's directory name: reverting BE-4's commit without also reverting the physical `mv` back to `pc_storage` would leave the config pointing at a directory name (`crm_filesystem`) the revert no longer creates — the rollback must pair the code revert with reversing the directory rename, in that order. `client_portfolios` rows already written by BE-8 for clients onboarded while this code was live are real data, not undone by a branch revert (same caveat as 013's own rollback story for its activation side-effects) — reversing those is a manual data decision, not a code rollback.
