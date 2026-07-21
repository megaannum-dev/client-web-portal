# 014 — Client Onboarding Follow-Up Fixes (Queue, Documents, Subscriptions, Client Detail, Cash Deposit)

> Status: **DRAFT — pending implementation approval.**
> Scope: Eight concrete defects/gaps found on the `client-onboarding-integration` branch after [proposal 013](013-2026-07-19-client-onboarding-integration.md) landed — three are regressions against 013's own stated design (the RM board not reflecting a just-onboarded client until an unrelated refetch, wrong KYC chip, missing status guard on the documents/submit stage), and five are net-new scope 013 never touched (per-client KYC storage segmentation, a real model-subscription view, a Firebase auth-provider fix, the Client Information detail subpage, and an Initial Cash Deposit / AUM floor). Full root-cause investigation lives at [docs/findings/2026-07-21-onboarding-followup-issues.md](../findings/2026-07-21-onboarding-followup-issues.md); this proposal is the fix spec.
> Constraint: **No design or layout change** to any existing page (same constraint as 013) — this proposal changes data sources, guards, and a small number of new buttons/fields, not the visual shape of any surface. All new file-storage behavior is additive to the storage root (renamed `pc_storage_root` → `storage_root`, see Backend C-5): no existing file's `storage_key` is moved or invalidated.

---

## 1. Context and Motivation

013 built the onboarding state machine and wired four pages to it. Since then, exercising the live branch surfaced three ways the shipped code doesn't honor 013's own design (the wizard-created client doesn't appear on the RM board until an unrelated refetch happens, one UI chip regressed to a stale rule, and the documents-stage endpoints never got the same `onboarding.status` guard the review-stage endpoints already have), plus five areas 013 explicitly left alone that turn out to need the same kind of backend-first treatment:

- Per-client KYC document storage is currently one flat, ungrouped directory (`app/libs/trade_models/storage.py`).
- The Model Subscription page (`admin-frontend/app/(roles)/rm/model-subscription/`) is still 100% frontend mock, and no RM-facing backend endpoint exists for it at all.
- New Firebase client (and staff) accounts are created with no sign-in provider attached (`app/libs/identity/service.py:20`).
- The Client Information detail subpage (`admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx`) was never in 013's scope and still reads a frontend mock (`lib/mock/rm-data.ts`) for ID info, the approving officer's name, KYC documents, and history.
- The RM added an "Initial Cash Deposit" field to the Start Onboarding wizard with nowhere to send it, no validation, and no destination table.

> **Why now / why this order.** All eight issues sit on the same branch and the same onboarding service/schema files; fixing them together avoids several separate reviews of the same `OnboardingService.start`/`approve` methods. The three regressions (1, 3, 5) are grouped with the five new items because #5's backend fix (a status guard on `upload_document`/`submit`) sits in the exact same two service methods #3's chip fix reads its data from — doing them in one pass avoids re-opening `service.py` twice. #1 is purely a frontend state-lift, independent of the other two, but shares the same board component being touched for #3. This proposal makes **no database schema change** — every write lands in a column or table that already exists (`client_portfolios`, from proposal 011), so there is no migration to plan around.

---

## 2. Goals

1. The RM board reflects a wizard-created client immediately — no stale "no client" view requiring an unrelated navigation/refresh to clear (§ Frontend A-1).
2. The KYC board chip reads `verified_count/required_count` for every non-`initial` column; only the `initial` column ever shows "Not started" (§ Frontend A-2).
3. `upload_document` and `submit` reject with `409` once `onboarding.status` is `reviewing` or `active` — the same guard shape `verdict`/`approve`/`reject` already use (§ Backend C-2).
4. The RM board's "Submit All"/"Request docs" slot is replaced by a **Download All** (zip) action once `status ∈ {reviewing, active}`; a per-document download affordance replaces the (now-locked) upload affordance for any doc that is `in_review` or `verified` (§ Backend C-3/C-4, Frontend A-3).
5. New client KYC documents are written under a dedicated `client_kyc_docs/<client-name>_<uid8>/` subdirectory; the existing trade_models materials move to their own `trade_models/` subdirectory; the storage root itself is renamed from `pc_storage` to `crm_filesystem` (it is no longer PC-specific once it holds two unrelated features' files) — existing files keep resolving under their current keys untouched (§ Backend C-5).
6. `FirebaseIdentityService.create_user` attaches the Email/Password provider with a default password, for every caller of `ensure_identity` (client and staff onboarding alike) (§ Backend C-6).
7. The Client Information detail subpage renders live ID info, the real approving compliance officer's name, live KYC documents, and live history — replacing `getMockOverlay`/`clientHistory` for exactly those four fields (§ Backend C-7/C-8, Frontend A-4).
8. An "Initial Cash Deposit" submitted at onboarding start is validated against the subscribed model's value (`units × model_size`) at a configurable AUM floor (`N = 0` today) and, in the same request, resolved straight into the client's `client_portfolios` row (`amount_in_trade`, `cash_deposit`) — the raw deposit figure itself is never stored anywhere (§ Backend C-9).
9. The Model Subscription page reads real `client_subscriptions`/`client_allotment_redemptions` data through two new RM-scoped endpoints, replacing `SUB_CLIENTS`/`MODEL_SIZES`/`OB_MODEL_CATALOG` (§ Backend D, Frontend A-5).

## 3. Non-Goals

- **Ad-hoc subscription/allotment/redemption creation from the Model Subscription page.** The page's mock UI implies three write modes (`new-subscription`, `add-allotment`, `redemption`); this proposal only wires the **read** side (client book → subscribed models → transaction history). Creating a subscription outside the onboarding flow, or any redemption logic, stays owned by 013's own redemption non-goal — see Frontend A-5.
- **Real password-reset UX.** The default password (`"12345678"`) is a stated interim value; a self-service reset flow is a future proposal. The existing `generate_invite_link`/`generate_password_reset_link` plumbing is untouched.
- **NAS storage.** `NasStorage` stays an unimplemented placeholder; the subdirectory scheme is `LocalStorage`-only (it degrades to a no-op for NAS until that backend exists).
- **Document expiry enforcement / the renewal scheduler.** Untouched — 013's own deferral stands.
- **Physically migrating any file already on disk.** New subdirectory keys apply only to documents saved *after* this proposal lands; pre-existing `storage_key`s (any doc type, any feature) resolve exactly as before.
- **The `client_info` list page's Account Balance card** (`portfolioValue`/`cashValue`, `overlay.tone`/`mandate`/`since`) — none of the 8 issues mention it; it stays mocked. Only the four fields named in Goal 7 change.
- **The "Request Tickets" deep-link's own backend** (`?client=&model=&mode=` into the Model Subscription page) — its target ids must become real client/model UUIDs once the mock is gone (noted in Frontend A-5), but the ticket feature itself is a separate track.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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
                       # added (post-draft refinement) so the FE accordion/AUM figure needs no
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

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Backend | Serves every route/DTO above; owns the AUM-floor guard, the status guard, the zip stream, the subdir key scheme, the default-password fix; resolves `initial_cash_deposit` into `client_portfolios` inside `start()` without persisting the raw figure anywhere | `client_portfolios`/`ClientSubscription` tables already exist (proposal 011/013) with the exact columns needed — no schema change of any kind is required; RBAC actions already registered (013 C-1) cover the new routes' gating |
| Frontend | Consumes the widened DTOs; wires the wizard's cash-deposit field into form state; swaps mock imports on the client-detail and model-subscription pages; adds the Download All button gated on status | Backend returns exactly the DTOs above; `id_type`/`id_number`/`authorized_by_name` are `null`-safe (render `"—"` when absent, matching the page's existing fallback convention) |

This proposal touches **no table or column that doesn't already exist** — every write lands in `client_portfolios` (proposal 011), `client_subscriptions`/`client_allotment_redemptions` (013), or `users`/`client_onboardings` fields 013 already added. There is accordingly no `## Layer 1 — Database` section below; the two layers actually changed are Backend and Frontend.

### 4.3 Change protocol (post-freeze)

Same as 013 §4.3 — any edit to §4 comes back here first; this is the only proposal touching these routes/DTOs, so no sibling impl doc renegotiation risk exists yet.

---

## Layer 1 — Backend

### A. Structural change

None — every change below lands inside the existing `app/libs/onboarding/` package (`service.py`, `repository.py`, `router.py`, `schemas.py`, `storage.py`'s sibling in `trade_models/`) plus small additive joins in `app/libs/clients/repository.py` and `schemas.py`. No new feature package.

### B. Findings — regressions against 013's own design

#### B-1 (=C-1). RM board doesn't reflect a just-onboarded client (MANDATORY)

Not a status/transition bug — landing in `initial` after the wizard is correct and expected (confirmed with the user: they don't mind the client sitting in "Initial Onboarding"). The actual defect is that the **board never learns the client exists** until something unrelated forces a refetch. `OnboardingBoard` and `OnboardingModal` are independent siblings (`onboarding-renewal/page.tsx:22-23`), and each calls `useOnboardingBoard()` itself (`OnboardingBoard.tsx:180`, `OnboardingModal.tsx:62`) — a plain hook with no shared cache/context behind it, so each call produces its own isolated `data`/`fetch_` closure. When the modal's `startOnboarding` succeeds, its *own* hook instance's `fetch_()` fires (`useOnboardingBoard.ts:46-51`) and updates a `data` state that nothing renders — the `OnboardingBoard` component on screen is a completely different hook instance with its own stale `data`, untouched. The user sees "no client" until an unrelated navigation remounts the board and its hook refetches fresh.

**Refactor:** this is a **Frontend**-side fix — lift the single `useOnboardingBoard()` call up to the shared parent (`onboarding-renewal/page.tsx`) so both children read/mutate the same state — see Frontend A-1. No backend change needed here (the underlying `submit`/board-read routes are already correct).

#### C-2. `upload_document`/`submit` never check `onboarding.status` (MANDATORY — fixes issue 5's backend half)

`verdict`/`approve`/`reject` (`service.py:172,184,271`) already guard `onboarding.status != "reviewing"`. `upload_document` (`service.py:128-147`) and `submit` (`service.py:149-165`) never look at the parent cycle's status at all — only `upload_document` checks the **document's own** status (`_CAN_REUPLOAD_STATUSES`). A document sitting `rejected` can be re-uploaded, and `submit` re-fired, even after the cycle has reached `active`.

**Confirmed observed, not just theoretical:** clicking "Submit All" against an already-`active` client flips `onboarding.status` straight back to `reviewing` (`service.py:161`, `onboarding.status = OnboardingStatus.REVIEWING`, unconditional) — an approved, activated client gets silently un-activated back into the review queue. This is the concrete failure mode the guard below closes: `active` is deliberately excluded from `_EDITABLE_STATUSES`, so this exact call now 409s before the status line is ever reached.

**Refactor:**

```python
_EDITABLE_STATUSES = {OnboardingStatus.INITIAL, OnboardingStatus.PENDING_REVIEW}

def upload_document(self, onboarding_id, doc_type, *, stream, filename, content_type) -> DocumentDTO:
    onboarding = self._require_onboarding(onboarding_id)
    if onboarding.status not in _EDITABLE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT,
            "Documents cannot be uploaded while the cycle is under review or active")
    doc = self._require_document(onboarding_id, doc_type)
    ...  # unchanged from here

def submit(self, onboarding_id) -> OnboardingDTO:
    onboarding = self._require_onboarding(onboarding_id)
    if onboarding.status not in _EDITABLE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cycle has already been submitted or decided")
    ...  # unchanged from here
```

`_EDITABLE_STATUSES` covers both the pre-submission (`initial`) and rejected-awaiting-resubmit (`pending_review`) cases — the same two statuses the renewal scheduler (013 C-6) already resets documents into. `reviewing` and `active` are locked, matching the user's spec exactly.

### C. Other backend findings

#### C-3. Per-document download, RM-scoped (MANDATORY — issue 5's "flip to download")

The compliance-side download route (`router.py:125-137` → `service.download_document` → `get_storage().open(storage_key)`) already proves files remain retrievable after upload — nothing here is write-only. There is no RM-facing equivalent.

**Refactor:** add `GET /rm/onboardings/{onboarding_id}/documents/{doc_type}/download` to `onboarding/router.py`, identical body to the existing compliance route, gated by `Action.ONBOARDING_MANAGE` instead of `ONBOARDING_REVIEW`. No new service method — reuses `service.download_document` verbatim.

#### C-4. "Download All" — zip of every submitted document (Yes — user req.)

New endpoint, new (small) service method:

```python
# service.py
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
                # doc_type prefix guards against two docs sharing a filename
                zf.writestr(f"{doc.doc_type}_{doc.filename or doc.doc_type}", fh.read())
    buf.seek(0)
    zip_name = f"{display.client_name or 'client'}_kyc_docs.zip"
    return buf, zip_name
```

```python
# router.py
@router.get("/rm/onboardings/{onboarding_id}/documents/download-all")
def download_all_documents(onboarding_id, svc, _: Depends(require_action(Action.ONBOARDING_MANAGE))) -> StreamingResponse:
    stream, zip_name = svc.download_all_documents(onboarding_id)
    return StreamingResponse(stream, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'})
```

Uses only `io`/`zipfile` (stdlib) — no new dependency. Building the zip in memory is acceptable at this document count (≤7 files, typical KYC PDF sizes); no streaming-zip library needed.

#### C-5. Per-client KYC storage subdirectory, and a root-directory rename (MANDATORY — issue 2, refined spec)

**Current:** `LocalStorage.save()` (`trade_models/storage.py:43-55`) builds `key = f"{uuid4().hex}_{suggested_name}"`, always directly under the configured root — one flat directory shared by `trade_models`' own model-material uploads and onboarding's KYC documents. The root itself is `settings.pc_storage_root` (`app/core/config.py:23`, default `"./pc_storage"`) — a name that made sense when PC's model materials were the only thing it held, but is now misleading once it also holds unrelated onboarding KYC documents.

**Refactor — additive, zero data migration, three coordinated renames:**

1. **The root directory is renamed** `pc_storage` → `crm_filesystem` (it's no longer PC-specific): `app/core/config.py`'s `pc_storage_backend`/`pc_storage_root` settings become `storage_backend`/`storage_root` (default `"./crm_filesystem"`), and `docker-compose.yml`'s `PC_STORAGE_ROOT` env var + `./pc_storage:/app/pc_storage` bind mount become `STORAGE_ROOT` + `./crm_filesystem:/app/crm_filesystem`. This is a **one-time physical directory rename** (`mv ./pc_storage ./crm_filesystem` wherever it's deployed), not a data migration — every `storage_key` is a path *relative to* the root, so renaming the root directory itself doesn't touch a single key or move a single file within it.
2. **Both features get their own named subdirectory** *inside* the renamed root — `trade_models/` (existing model materials) and `client_kyc_docs/` (new onboarding KYC docs) — so nothing collides with the root's own name and each subdirectory is self-describing:

```python
# trade_models/storage.py
class FileStorage(Protocol):
    def save(self, stream, *, suggested_name, content_type=None, subdir=None) -> str: ...
    def open(self, storage_key: str) -> BinaryIO: ...

class LocalStorage:
    def save(self, stream, *, suggested_name, content_type=None, subdir=None) -> str:
        key_body = f"{uuid.uuid4().hex}_{suggested_name}"
        key = f"{subdir}/{key_body}" if subdir else key_body
        dest = self._root / key
        dest.parent.mkdir(parents=True, exist_ok=True)   # subdir may not exist yet
        with dest.open("wb") as fh:
            fh.write(stream.read())
        return key

    def open(self, storage_key: str) -> BinaryIO:
        return (self._root / storage_key).open("rb")   # UNCHANGED — a plain relative
                                                          # join resolves both old (flat)
                                                          # and new (subdir-prefixed) keys

def get_storage() -> FileStorage:
    settings = get_settings()
    backend = settings.storage_backend.lower()   # renamed from pc_storage_backend
    if backend == "nas":
        return NasStorage()
    return LocalStorage(settings.storage_root)    # renamed from pc_storage_root
```

`open()` needs **no change at all**: `storage_key` already carries the full relative path (subdir included, when present), so existing keys saved before this proposal — anywhere in the codebase — keep resolving exactly as they do today, regardless of the root rename. This is why no data migration is needed: nothing physically moves *within* the root, and no old `storage_key` becomes invalid; only the root's own location on disk changes, which is a deploy-time step (rename the directory, update the env var), not a code-driven migration.

Two call sites pass an explicit `subdir` going forward:
- `trade_models/service.py`'s existing model-material `save()` calls (lines 345, 391 per the investigation) pass `subdir="trade_models"`.
- `OnboardingService.upload_document` passes `subdir=f"client_kyc_docs/{self.repo.client_folder_name(onboarding)}"`.

New repository helper (`onboarding/repository.py`):

```python
import re

def client_folder_name(self, onboarding: ClientOnboarding) -> str:
    """"{clientname}_{n prefix of firebase id}" per spec. Slugified so the
    client's display name can never produce path separators or other
    filesystem-unsafe characters; n=8 (see rationale below)."""
    display = self.display_fields(onboarding)
    user = self.db.get(User, onboarding.user_id)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", display.client_name).strip("_") or "client"
    return f"{slug}_{user.firebase_uid[:8]}"
```

**Why `n=8`:** Firebase UIDs are ~28-character, high-entropy (base62-ish) identifiers — 8 characters already carries far more collision resistance than the `[:6]` hex slice this same codebase already uses for allotment references (`create_allotment`'s `reference`, `repository.py:281`) or the `[:4]` slice used for the client-ref display code (`service.py:388`). 8 is chosen to keep the folder name short enough to read in a directory listing while being a strictly wider slice than either existing precedent, given this identifies a folder (not just a display label) and two clients could plausibly share a sanitized name.

Both `upload_document` and `download_all_documents`/`download_document` pass the same `subdir` when calling `get_storage().save(...)`/reading `storage_key` — but note `open()` needs no `subdir` argument at all (it's baked into the stored key), so only the `save()` call site changes.

#### C-6. Firebase user has no sign-in provider (MANDATORY — issue 6)

`FirebaseIdentityService.create_user` (`identity/service.py:20`) calls `auth.create_user(email=email)` — no password, no provider attaches. Single call site (`ensure_identity`, `identity/service.py:61`), shared verbatim by client onboarding (`ClientService.onboard` → `ensure_identity`) and staff onboarding (`staff/service.py:50,69`).

**Refactor:**

```python
_DEFAULT_PASSWORD = "12345678"  # interim only — see Non-Goals; real reset flow is a future proposal

def create_user(self, email: str) -> str:
    if self._settings.firebase_auth_disabled:
        return f"dev-{email}"
    _init_firebase(self._settings)
    user = auth.create_user(email=email, password=_DEFAULT_PASSWORD)
    return user.uid
```

**Decision:** apply uniformly to both callers rather than parameterizing `create_user`/`ensure_identity` with a per-caller flag. Staff accounts have the identical "no provider" defect today, and there is no product requirement stated for staff to behave differently — splitting the two paths would cost a threaded parameter for zero stated benefit. `generate_invite_link` is untouched; it remains the day-1 path for a user to set their *own* real password, independent of this default.

#### C-7. `authorized_by` uid is never resolved to a display name (MANDATORY — issue 7.2)

`_approve_initial` (`service.py:251`) sets `user.authorized_by = compliance_uid`, but nothing resolves that firebase uid to a name anywhere. `ClientListItemOut.authorized_person` (what the client-detail page currently renders) is a *different*, free-text field captured manually at client creation (`clients/router.py:82`, `ClientOnboardIn.authorized_person`) — unrelated to compliance approval.

**Refactor:** extend `OnboardingRepository.display_fields` (or add a sibling helper) to resolve `users.authorized_by` the same way `assigned_rm_uid` is already resolved — same alias/coalesce shape as `clients/repository.py:60-63`/`onboarding/repository.py:159-176`:

```python
# repository.py — extends OnboardingDisplayRow with:
approved_by: str | None   # resolved display name, or None if authorized_by is NULL (not yet approved)
```

```python
Approver = aliased(User)
ApproverProfile = aliased(AdminProfile)
approved_by_expr = func.coalesce(ApproverProfile.name, Approver.email, user.authorized_by)
# user.authorized_by is NULL until first approval — coalesce short-circuits to None cleanly
# only when authorized_by itself is NULL; when it holds a uid, at least one of
# ApproverProfile.name/Approver.email should resolve, same as assigned_rm's own coalesce.
```

`OnboardingDTO` gains `approved_by: str | None` (§4.1), populated in `_to_dto` from `display.approved_by`.

Separately, the widened `ClientListItemOut.authorized_by_name` (issue 7's target field on the client-detail page) is populated the same way inside `clients/repository.py._base_query()` — a second `Approver`/`ApproverProfile` alias pair joined on `RM.firebase_uid == User.authorized_by` (the *client's own* `users.authorized_by`, not the RM alias already in that query). Both call sites resolve the identical uid→name mapping; no new resolution logic is invented twice, just applied in two places that each already have their own join scaffolding.

#### C-8. Client-detail needs onboarding-sourced ID info, live documents, and live history (MANDATORY — issues 7.1/7.3/7.4)

- **7.1 (ID info):** `ClientListItemOut` gains `id_type`/`id_number`, joined from the client's `client_onboardings` row inside `ClientRepository._base_query()` (`clients/repository.py:65-81`) via an `outerjoin(ClientOnboarding, ClientOnboarding.user_id == ClientProfile.user_id)` — outer, since a client created via the older bare `POST /rm/clients` path (pre-013) has no onboarding row and must still render `"—"`.
- **7.3 (KYC & Documents):** new endpoint `GET /rm/onboardings/by-client/{client_id}` (§4.1) — resolves the client's one `client_onboardings` row via the existing `OnboardingRepository.get_by_user_id` and returns the same `OnboardingDTO` (`with_documents=True`) the RM board's own detail fetch already produces. Lives in `onboarding/router.py` (needs `OnboardingService`), even though its path reads `/rm/onboardings/...` rather than `/rm/clients/...` — kept under the onboarding prefix since it returns an `OnboardingDTO`, not a `ClientListItemOut`; 404s if the client has no onboarding row (same pre-013-client edge case as above).
- **7.4 (History):** new endpoint `GET /rm/clients/{client_id}/events` (§4.1) — a direct, thin re-exposure of the already-existing `OnboardingService.client_events(user_id)` (`service.py:347-353`, today only reachable via the client's own token at `GET /client/events`). Gated by `Action.CLIENT_VIEW` (same action `GET /rm/clients/{id}` already requires) instead of `get_current_client_user`. Zero new repository/service code — one new route calling one existing method with an explicit `client_id` path param instead of resolving from the caller's own token.

### D. Model Subscription read endpoints (MANDATORY — issue 4/Goal 9)

No RM-facing subscription endpoint exists today (`GET /client/subscriptions` is client-token-scoped and read-only). Two new routes in `onboarding/router.py` (they read `ClientSubscription`/`ClientAllotmentRedemption`, already owned by this package's models/repo):

```python
# repository.py — new read methods, no writes
def list_all_subscriptions(self) -> list[tuple[ClientProfile, ClientSubscription, Model]]:
    """Every (client, subscription, model) row, joined. Scoping (RM book vs.
    ADMIN full-visibility) is applied by the SERVICE layer using the same
    FULL_VISIBILITY_ROLES / assigned_rm_uid filter clients/repository.py
    already implements — not duplicated here as SQL; the service asks
    ClientRepository for the visible client_id set first, then filters this
    list in Python. (Cheapest correct option: this table is small — one row
    per (client, model) — a Python-side filter over a few hundred rows costs
    nothing worth a second bespoke scoped query.)"""
    ...

def list_allotments_for_client(self, user_id: uuid.UUID) -> list[ClientAllotmentRedemption]:
    return (self.db.query(ClientAllotmentRedemption)
            .filter(ClientAllotmentRedemption.user_id == user_id)
            .order_by(ClientAllotmentRedemption.created_at.desc()).all())
```

```python
# router.py
@router.get("/rm/subscriptions", response_model=list[ClientSubscriptionsDTO])
def list_subscriptions(svc, user: Depends(require_action(Action.CLIENT_VIEW)), role: Depends(_get_caller_role)):
    return svc.list_subscriptions(role=role, rm_uid=user.firebase_uid)

@router.get("/rm/subscriptions/{client_id}/allotments", response_model=list[AllotRdmptDTO])
def list_client_allotments(client_id, svc, _: Depends(require_action(Action.CLIENT_VIEW))):
    return svc.client_allotments(client_id)
```

`ClientSubscriptionRowDTO.mgmt_fee`/`incentive_fee` are the effective values — `sub.mgmt_fee_override ?? model.mgmt_fee` — computed the same read-side coalesce 013's Backend C-5 already established, applied here instead of at approve time.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| C-1 | (Frontend-side; no backend change beyond C-2) | MANDATORY | — |
| C-2 | status guard on `upload_document`/`submit` | MANDATORY | XS |
| C-3 | RM-scoped single-doc download route | MANDATORY | XS |
| C-4 | Download All (zip) route + service method | Yes — user req. | S |
| C-5 | storage `subdir` param + `client_folder_name` helper | MANDATORY | S |
| C-6 | default password on `create_user` | MANDATORY | XS |
| C-7 | resolve `authorized_by` uid → display name (2 call sites) | MANDATORY | S |
| C-8 | `id_type`/`id_number` join, by-client onboarding route, by-client events route | MANDATORY | S |
| C-9 | AUM-floor validation + `client_portfolios` seeding, both inside `start()` | MANDATORY | S |
| D | `GET /rm/subscriptions`, `GET /rm/subscriptions/{id}/allotments` | MANDATORY | S |

#### C-9. Initial Cash Deposit — resolved directly into `client_portfolios` at intake, no new column (MANDATORY — issue 8)

`client_portfolios` (`app/models/post_trade_allocation.py:116-143`, proposal 011) already has exactly the two columns needed — `cash_deposit` (comment: *"static; NOT written by this proposal"* — 011 deliberately left it for a future writer) and `amount_in_trade` (currently written only by `post_trade_allocation`'s own delta-accumulation, `repository.py:95-113`). **No column is added to `client_onboardings` to hold the raw `initial_cash_deposit` figure.** `model_id`, `units`, and `initial_cash_deposit` are all present in the same `POST /rm/onboardings` request — the resolved values (`amount_in_trade`, `cash_deposit`) are computed once, right there in `OnboardingService.start`, and written straight into the client's `client_portfolios` row. Nothing about the raw deposit figure needs to survive past that one request, so nothing persists it.

Confirmed non-conflicting with `post_trade_allocation`'s own use of the same table: `get_or_create_portfolio` only zero-fills a row that doesn't yet exist; later allocation runs **add** a signed delta on top of whatever `amount_in_trade` already holds. A brand-new client has no orders to attribute (no subscription exists until this same request creates one), so `get_or_create_portfolio` cannot have touched this `user_id` before `start()` runs — there is no write-order conflict with seeding the row here instead of at approval.

**Validation (generalized for a future N%, N=0 today):**

```
initial_cash_deposit >= amount_in_trade / (1 - N/100)
```
which collapses to `initial_cash_deposit >= amount_in_trade` at `N=0`. `amount_in_trade = units * model.model_size` — the same formula already used for `AllotRdmptDTO.amount` (`service.py:435`). `N` is a module-level constant (`ONBOARDING_MIN_CASH_DEPOSIT_PCT = 0`, alongside `ONBOARDING_SETTLEMENT_DAYS`'s `os.getenv` convention) so raising it later is a config change, not a rewrite. Checked exactly **once**, inside `OnboardingService.start` — `422` if violated, before the client record is even created. No second check is needed at approve: since nothing is deferred past this one request, there is no later point where the inputs could have drifted (unlike `mgmt_fee`/`incentive_fee`, which really are captured at start and only consumed at approve — see 013's own precedent — the cash-deposit math has no such gap here).

**`client_portfolios` seeding**, inside `OnboardingService.start`'s existing transaction (`service.py:58-101`), right after `create_cycle`:

```python
amount_in_trade = req.units * model.model_size
cash_deposit = req.initial_cash_deposit - amount_in_trade
if cash_deposit < 0:   # N=0% floor; see the generalized form above
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
        "Initial cash deposit must cover at least the subscribed amount in trade")
self.repo.set_initial_portfolio(staged_user.id, amount_in_trade=amount_in_trade, cash_deposit=cash_deposit)
```

```python
# repository.py
def set_initial_portfolio(self, user_id, *, amount_in_trade: Decimal, cash_deposit: Decimal) -> None:
    """Runs exactly once per client, inside OnboardingService.start (never
    again afterward — a renewal never touches this). Assumes no ClientPortfolio
    row exists yet for this user_id: true by construction, since this is the
    same request that creates the client's subscription in the first place —
    post_trade_allocation's own get_or_create_portfolio has nothing to have
    created on this user_id's behalf before now."""
    portfolio = self.db.get(ClientPortfolio, user_id)
    if portfolio is None:
        portfolio = ClientPortfolio(user_id=user_id, cash_deposit=cash_deposit,
                                     amount_in_trade=amount_in_trade, previous_amount_in_trade=Decimal("0"))
        self.db.add(portfolio)
    else:
        # Defensive only — see docstring; a pre-existing row here would indicate
        # an ordering bug elsewhere, not a case to silently paper over by overwriting it.
        portfolio.cash_deposit = cash_deposit
        portfolio.amount_in_trade = amount_in_trade
```
(`ClientPortfolio` imported from `app.models.post_trade_allocation` — a model import, not a lib-to-lib service dependency, matching how `onboarding/repository.py` already imports `app.models.pc`.)

**Consequence worth flagging for review:** because this now runs at **intake** rather than at approval, a client's `client_portfolios` row is seeded even if that client is later **rejected** or never gets past `initial`. This is a deliberate simplification per the user's own direction (resolve the figure once, at onboarding, not gated on a later decision) — the portfolio numbers describe the deal terms captured at intake, independent of whether compliance later approves them. If this is undesirable in practice (e.g. a rejected client showing a nonzero portfolio), the fix is to zero it back out inside `reject()`/`_approve_renewal`'s sibling path — not addressed here since no issue in this proposal's list asks for it, and reintroducing an approve-time gate would just re-add the deferred-state problem this change was meant to remove.

---

## Layer 2 — Frontend

| File | Role |
|---|---|
| `admin-frontend/components/rm/OnboardingModal.tsx` | Start Onboarding wizard — wire cash-deposit field, client-side AUM floor check |
| `admin-frontend/components/rm/OnboardingBoard.tsx` | KYC board — chip fix, status-aware button slot, download affordances |
| `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` | Client Information detail — swap 4 mock reads for live data |
| `admin-frontend/app/(roles)/rm/model-subscription/page.tsx`, `SubscriptionAccordion.tsx`, `SubscriptionFormModal.tsx` | Model Subscription — swap mock reads for the two new endpoints |

### A. Findings

#### A-1. Board doesn't refresh after the wizard onboards a client (MANDATORY — issue 1)

`OnboardingBoard` (`OnboardingBoard.tsx:180`) and `OnboardingModal` (`OnboardingModal.tsx:62`) each call `useOnboardingBoard()` independently — two isolated hook instances, each with its own `data`/`fetch_` closure. `onboarding-renewal/page.tsx:22-23` renders them as plain siblings with no shared state between them, so the modal's own `fetch_()` (fired internally by its `startOnboarding` call, `useOnboardingBoard.ts:46-51`) updates a `data` state nothing on screen reads. Landing the new client in "Initial Onboarding" is correct and intentional (confirmed) — the bug is purely that the visible board doesn't know a new card exists until an unrelated remount refetches it.

**Refactor:** lift the single `useOnboardingBoard()` call from `OnboardingBoard.tsx` up into `onboarding-renewal/page.tsx`, and pass its return value down as props to both children — one hook instance, one `data`/`fetch_` closure, shared by whichever component triggers a mutation:

```tsx
// onboarding-renewal/page.tsx
const board = useOnboardingBoard();
...
<OnboardingBoard {...board} />
{onboarding && (
  <OnboardingModal
    onClose={() => setOnboarding(false)}
    startOnboarding={board.startOnboarding}
    uploadDocument={board.uploadDocument}
    fetchRmOptions={board.fetchRmOptions}
    fetchDocSpecs={board.fetchDocSpecs}
  />
)}
```

`OnboardingBoard.tsx:180` and `OnboardingModal.tsx:62` each drop their own `useOnboardingBoard()` call and instead destructure from props. No new state/cache mechanism is introduced — this is the standard "hoist state to the nearest common parent" move for two siblings that need to observe the same mutation, not a new abstraction. Because `startOnboarding` now comes from the *same* hook instance the board renders from, its internal `fetch_()` updates the board's own `data` directly — the fix is that the state is shared, not that a new refetch call is added anywhere.

#### A-2. Chip branches on count, not status (MANDATORY — issue 3)

`KanbanCard` (`OnboardingBoard.tsx:44-68`) renders "Not started" whenever `verifiedCount === 0`, regardless of column. `KycBoardClient` carries no `status`, and `OnboardingBoard.tsx:257-264` never passes `col.status` down.

**Refactor:** add `status: OnboardingStatus` to `KycBoardClient` (`lib/onboarding/types.ts:71-78`), populate it in `mapRow`/`mapBoardToColumns` (`mappers.ts:21-40` — `mapBoardToColumns` already has `status` in scope per-column, just needs to stamp it onto each mapped row), and branch the chip on it instead of the count:

```tsx
function KanbanCard({ item }: { item: KycBoardClient & { status: OnboardingStatus } }) {
  ...
  {item.status === "initial"
    ? <Chip tone="neutral" dot={false}>Not started</Chip>
    : <Chip tone={tone} dot={false}>{item.verifiedCount}/{item.requiredCount} verified</Chip>}
}
```

#### A-3. Status-locked buttons + download affordances (MANDATORY — issue 5)

`KycPanel`'s "Request docs" (`OnboardingBoard.tsx:163`, already inert — no handler) and "Submit All" (`:164`, gated only on doc-completeness) render unconditionally regardless of the item's status.

**Refactor:**
- When `item.status ∈ {"reviewing", "active"}`: hide "Request docs" entirely (it was never wired to anything, so this is strictly a subtraction), and replace "Submit All" in the same slot with a new **Download All** button that hits `GET /rm/onboardings/{id}/documents/download-all` and triggers a browser download (`window.location.href = ...` with the auth'd fetch's blob URL, or an `<a download>` populated from a blob — whichever the existing download-button pattern elsewhere in this codebase uses, for consistency).
- When `item.status ∈ {"initial", "pending_review"}`: keep today's "Submit All" behavior unchanged (still gated on `canSubmit`).
- Per-document row (`OnboardingBoard.tsx:139-149`): when `!d.can_reupload` (i.e. `in_review`/`verified`) **and** the document has a file, render a small download icon/link next to its status chip (calling the new single-doc download route) instead of the current bare, non-interactive chip. When `can_reupload` is true, the existing hover-to-upload affordance is unchanged.

#### A-4. Client-detail page reads a frontend mock for 4 fields (MANDATORY — issue 7)

`page.tsx:133` (`getMockOverlay`) and its four consuming spots:

- **ID Info** (`page.tsx:199`, hardcoded `"—"`) → `${data.idType ?? ""} ${data.idNumber ?? ""}".trim() || "—"`, sourced from the widened `useClient` hook (which now carries `id_type`/`id_number` per Backend C-8).
- **Authorized Person** (`page.tsx:202`, currently `data.authorizedPerson`) → `data.authorizedByName ?? "—"` (widened field, Backend C-7).
- **KYC & Documents** (`page.tsx:245-247`, `overlay.docs`) → fetch `GET /rm/onboardings/by-client/{id}` once on mount, map `DocumentDTO[]` into the existing `ClientDoc` shape using the same `DOC_STATUS_TONE`/status→icon convention `OnboardingBoard.tsx` already defines (reused, not reinvented) instead of `overlay.docs`. The verified/total counts in the card header (`page.tsx:134,241`) come from the fetched `OnboardingDTO.verified_count`/`required_count`, not the mock's `.tone === "active"` filter.
- **History** (`page.tsx:259-261`, `overlay.history`) → fetch `GET /rm/clients/{id}/events`, map `ClientEventDTO[]` into the existing `HistoryEntry` shape (`t` ← `title`, `d` ← formatted `created_at`, `detail` ← `[body]`).

`overlay.tone`/`overlay.status`/`overlay.mandate`/`overlay.since`/`overlay.portfolioValue`/`overlay.cashValue` stay on `getMockOverlay` — explicitly out of scope (§3).

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend C-2 (status guard) | a `409` from upload/submit on a locked cycle surfaces the existing generic alert path — no new UI state, this can only fire if A-3's own gating has a bug | `OnboardingBoard.tsx` |
| Backend C-7 (`approved_by`) | (not rendered by this proposal's FE scope — `OnboardingDTO.approved_by` is available for a future board/compliance-page display, but no page in the 8 issues asks for it there) | none |
| Backend C-9 (cash deposit + AUM floor) | wizard field wired into `ObForm`, client-side floor check mirrors the server's | `OnboardingModal.tsx` |
| Backend D (subscription endpoints) | `SUB_CLIENTS`/`MODEL_SIZES`/`OB_MODEL_CATALOG` mock imports replaced by a new `useSubscriptions()` hook | `model-subscription/page.tsx`, `SubscriptionAccordion.tsx`, `SubscriptionFormModal.tsx` |

### C. Additional findings

#### A-5. Initial Cash Deposit field wiring + AUM floor (MANDATORY — issue 8)

`OnboardingModal.tsx:273-279`'s field has no `value`/`onChange` and isn't in `ObForm` (`:32-47`) or its `useState` initializer (`:69-73`). Sibling numeric fields use the inline setter pattern `modelUnit` already uses (`:266-271`).

**Refactor:**
```tsx
interface ObForm { ...; modelUnit: string; initialCashDeposit: string; mgmtFee: string; ... }
// useState initializer: ..., modelUnit: "", initialCashDeposit: "", mgmtFee: "", ...

<ObField label="Initial Cash Deposit" required>
  <input className={inputCls} inputMode="numeric" value={form.initialCashDeposit}
    onChange={(e) => setForm((f) => ({ ...f, initialCashDeposit: e.target.value.replace(/[^\d.]/g, "") }))}
    placeholder="e.g. 250000" />
</ObField>
```
`page2Valid` (`:122-125`) gains a floor check mirroring the backend's: `Number(form.initialCashDeposit) >= Number(form.modelUnit) * (selectedModel?.model_size ?? 0)` (at `N=0`; matches Backend C-9's formula so the Next button/submit disable state agrees with what the server will accept) — surfaced as an inline validation message near the field, not just a disabled button, so the RM knows *why*. `handleSubmit` (`:134-144`) sends `initial_cash_deposit: Number(form.initialCashDeposit)` in the `startOnboarding(...)` payload.

#### A-6. Model Subscription page — mock swap, non-goal boundary (MANDATORY / non-goal noted)

`model-subscription/page.tsx:14`, `SubscriptionAccordion.tsx:8`, `SubscriptionFormModal.tsx:23` import `SUB_CLIENTS`/`MODEL_SIZES`/`MODEL_SIZE_LIST`/`OB_MODEL_CATALOG` directly (`lib/mock/rm-data.ts:4`: *"All data is mock; no backend wiring."*).

**Refactor:** new `hooks/api/useSubscriptions.ts` (following the existing `useModels.ts`/`useOnboardingBoard.ts` pattern) calling `GET /rm/subscriptions` + `GET /rm/subscriptions/{id}/allotments`; `SubscriptionAccordion.tsx` renders from that hook's data instead of `SUB_CLIENTS`. **`SubscriptionFormModal.tsx`'s submit button (`:132-136`, currently no `onClick` at all) stays a no-op** — wiring `new-subscription`/`add-allotment`/`redemption` creation is explicitly out of scope (§3); the modal continues to open/close and display context correctly, it just doesn't persist anything yet, same as today, so this is not a regression.

The `RequestTickets.tsx` deep-link (`resolveDeepLink`, `page.tsx:22-48`) resolves `?client=&model=` against `SUB_CLIENTS`' array — once that mock is gone, its `client` param must become a real client UUID and `model` a real `model_id` (not an array index) for the deep-link to keep working; flagged here since it's a direct consequence of this proposal's mock removal, even though `RequestTickets.tsx` itself is untouched.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | lift `useOnboardingBoard()` to the shared parent page so the board sees the modal's mutations | MANDATORY | S |
| A-2 | chip branches on status, not count | MANDATORY | XS |
| A-3 | status-locked buttons + download affordances | MANDATORY | S |
| A-4 | client-detail: 4 fields off mock, onto live data | MANDATORY | S |
| A-5 | cash-deposit field wiring + client-side floor check | MANDATORY | XS |
| A-6 | model-subscription: mock swap, submit stays a no-op | MANDATORY | S |

---

## Design decisions (settled)

- **D-1 — Default password applies to every `create_user` caller, not just client onboarding.** Single call site (Backend C-6); splitting client vs. staff behavior would need a threaded parameter for no stated product benefit, and staff accounts have the identical defect today.
- **D-2 — Storage subdirectories are additive; no file ever moves. The root rename is the one exception, and it's a path relabel, not a migration.** `open()`'s signature is unchanged because `storage_key` already carries the full relative path; only `save()` gains an optional `subdir`. This is what makes the migration-free story possible (Backend C-5) — a stricter reading ("re-file every existing document into its new subdir") was considered and rejected as unnecessary churn against files that already resolve correctly today. Renaming the root itself (`pc_storage` → `crm_filesystem`) was accepted despite touching every existing key's *effective* location, because a `storage_key` was never an absolute path — it's always resolved relative to whatever `settings.storage_root` currently points at, so a root rename is one `mv` plus one config value, not a per-row data migration.
- **D-3 — `client_portfolios` is seeded once, at the same approve transaction that already writes `client_subscriptions`/the allotment row, never anywhere else.** Consistent with 013's existing atomic-approve design (013 Backend C-2) — one more write inside an already-atomic transaction, not a new transaction boundary.
- **D-4 — The Initial Cash Deposit is resolved once, at intake, and never persisted in raw form.** Rejected an earlier draft that added a `client_onboardings.initial_cash_deposit` column and deferred the `client_portfolios` write to approval (mirroring how `mgmt_fee`/`incentive_fee` are captured at start and consumed at approve). Since the AUM-floor math needs nothing that isn't already in the same `POST /rm/onboardings` request (`units`, `model_id`, `initial_cash_deposit` all arrive together), there is no gap to bridge with a new column — the resolved `amount_in_trade`/`cash_deposit` are computed and written directly into the client's `client_portfolios` row inside `start()`, and the raw figure is discarded. This keeps the AUM-floor check to a single validation point (no start/approve double-check needed) and means this proposal requires zero database schema changes.
- **D-5 — Model Subscription is wired read-only; write actions stay mocked.** The page's UI implies three creation modes, but 013 already deferred redemption entirely, and no issue in this proposal's list asks for ad-hoc subscription creation outside onboarding — extending scope there would be a silent scope-creep, not a fix to a reported defect.

---

## Objectives & standard of the expected outcome

- **No regression to 013's guarantees.** The existing "one record, four views" invariant, atomic approve, and additive/reversible schema story all hold — this proposal adds one column and one table's-worth of writes to an already-atomic transaction, it does not restructure any of it.
- **Locked-stage documents are genuinely locked, both ends.** A raw API call to `upload_document`/`submit` against a `reviewing`/`active` cycle returns `409` — not just a disabled button.
- **Storage change is invisible to every existing file.** Every `storage_key` written before this proposal opens exactly as it did before; only new saves land in a named subdirectory.
- **Client-detail page shows nothing invented.** Every one of the four swapped fields either already existed in the DB (id_type/id_number, `authorized_by`) or is a direct re-exposure of an endpoint 013 already built (`documents`, `client_events`) — no new storage of anything not already captured somewhere.

---

## Execution & verification

1. **Backend** — status guard, download routes, storage subdir, default password, resolution joins, cash-deposit validation + portfolio seeding, subscription read endpoints. Verify: pytest exercises (a) `upload_document`/`submit` returning `409` once `status` is `reviewing`/`active` — **specifically including the observed regression**: `POST /rm/onboardings/{id}/submit` against an `active` onboarding must 409 and leave `status` unchanged at `active`, not silently revert it to `reviewing`; (b) `POST /rm/onboardings` with `initial_cash_deposit` exactly at the N=0 floor succeeds and one cent under it returns `422`; (c) immediately after a successful `start()`, `client_portfolios` has the expected `amount_in_trade`/`cash_deposit` for that client, and a second onboarding for a different client doesn't perturb the first client's row; (d) `download-all` returns a valid zip containing every uploaded doc and 404s with zero uploads; (e) two clients with colliding sanitized names get distinct folders (via the uid suffix) — assert on `client_folder_name`'s output directly; (f) `GET /rm/clients/{id}/events` and `GET /rm/onboardings/by-client/{id}` return data equivalent to their existing client-token/RM-board counterparts for the same underlying rows.
2. **Frontend** — re-point the four surfaces. Verify (browser): onboard a client through the wizard → the board (already open behind the modal) shows the new card in "Initial Onboarding" the moment the modal closes, with no navigation/refresh needed; a client submitted with 0 verified docs shows "0/7 verified", not "Not started"; once in Reviewing, "Request docs"/"Submit All" are gone and "Download All" produces a zip; the client-detail page for an approved client shows real ID info, the actual approving officer's name, the real uploaded documents, and real history entries; the Model Subscription page lists a client's real onboarding-created subscription.

**Human gate(s):** none required at the database level — this proposal makes no schema change, so there is no live-DB migration to sign off on. Merges to `main` and PRs remain human-owned; agents stop at "branch pushed + PR drafted," per [[git_workflow_human_owns_main]]. The storage root's physical directory rename (Backend C-5) is a deploy-time step the human operator performs when this branch is deployed, not a code-reviewed migration.

---

## Rollback

- **Backend/Frontend:** revert the branch — no schema of its own to unwind, since this proposal adds no table or column.
- **`client_portfolios` data:** reverting the branch does not undo any `cash_deposit`/`amount_in_trade` values already written for a client onboarded while this code was live — those are real, already-acted-upon figures (same caveat 013's own Rollback section states for its own activation side-effects), and would need a manual data decision to reverse, not a schema rollback.
- **Storage:** nothing to roll back at the code/data level — new files simply land in `client_kyc_docs/...`/`trade_models/...` subdirectories going forward; no existing file was touched, so there is nothing to restore. The root's directory rename (`pc_storage` → `crm_filesystem`) is the one manual, deploy-time step to revert (rename it back, restore the old env var/bind mount) if this proposal is rolled back before the new subdirectories accumulate any files worth keeping.

---

## Open questions

### Out of scope (tracked elsewhere)

- **Subscription/allotment/redemption creation from the Model Subscription page** — future proposal, alongside 013's own deferred redemption workflow.
- **Real password-reset UX** — future proposal; the default password is explicitly interim.
- **NAS storage backend** — unimplemented placeholder, untouched by this proposal.
- **`RequestTickets.tsx`'s deep-link backend** — noted in Frontend A-6 as a consequence, owned by whichever proposal covers that feature.
