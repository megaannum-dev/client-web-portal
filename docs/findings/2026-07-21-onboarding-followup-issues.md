# Onboarding follow-up — consolidated findings (pre-proposal)

> Input for the next proposal (014). Investigated across FE (`admin-frontend`) + BE (`api-backend`) in parallel, against the current `client-onboarding-integration` branch (implements [proposal 013](../proposals/013-2026-07-19-client-onboarding-integration.md)).
>
> Relationship to 013: issues **1, 3, 5** are gaps against 013's *own* stated design (013 already specifies the correct behavior in D-2/C-2 but the shipped code doesn't fully match). Issues **2, 4, 6, 7, 8** are net-new scope 013 never covered — 013's four pages were RM board / Compliance review / PC allotments / Client portfolio+events; the Client Information detail subpage (issue 7) and model-subscription page (issue 4) are separate surfaces.

---

## 1. Initial-onboarding queue stays empty

**Root cause:** `OnboardingModal.handleSubmit` (`admin-frontend/components/rm/OnboardingModal.tsx:129-162`) calls `startOnboarding(...)` then uploads staged files, then closes — it never calls the submit-all transition. Only `KycPanel`'s "Submit All" button (`OnboardingBoard.tsx:98-102,164`) → `useOnboardingBoard.ts:61-65` → `OnboardingService.submit()` (`service.py:149-165`) flips `status: initial → reviewing`. New rows default to `initial` (`models/onboarding.py:82`) and `repository.create_cycle` never touches status. So every wizard-created client sits in the "Initial Onboarding" column until someone separately opens the card and clicks "Submit All" — the wizard's own "Onboard Client" action was never wired to that transition.

**Fix direction:** either call `submit` automatically at the end of `handleSubmit` once all required docs are staged/uploaded (matching the user's expectation that "onboarded" == submitted for review), or make it explicit that the wizard only *creates* and a separate submit step is required — the user's report says the former is expected. Needs a product call on whether the wizard should auto-submit or leave partial-doc onboarding possible (013 already supports partial: docs can be uploaded later, then Submit All).

## 2. Per-client "client kyc docs" file segmentation

**Root cause:** Uploads go through `get_storage()` (`api-backend/app/libs/trade_models/storage.py`), a generic adapter (`FileStorage` protocol, `LocalStorage`, unimplemented `NasStorage`) shared with `trade_models`' own material uploads. `LocalStorage.save()` (`storage.py:51-52`) writes flat: `key = f"{uuid4().hex}_{suggested_name}"`, `dest = self._root / key` — no per-client or per-doc-type subfolder, root = `./pc_storage` (`app/core/config.py:21-23`, `pc_storage_backend`/`pc_storage_root`). Segmentation exists only in the DB (`onboarding_id`+`doc_type` on `OnboardingDocument`), never as a directory structure.

**Fix direction:** smallest correct change is adding an optional `subdir` param to `LocalStorage.save`/`open` and having `OnboardingService.upload_document`/`download_document` pass the client's display name (already resolved elsewhere via `repo.display_fields`), building `dest = self._root / subdir / key`. Persist the subpath inside `storage_key` itself (e.g. `"{client_name}/{uuid}_{filename}"`) rather than adding a new column — keeps `storage_key` an opaque string, no schema change. Root folder name ("client kyc docs") is just a config value or a fixed subfolder under `pc_storage_root`. Caveat: client names aren't unique/immutable — worth deciding whether to key by name (as literally requested) or by a stable client id with name as a display/symlink concern, since a client rename would otherwise orphan a folder.

## 3. Chip should show "N/7 verified" instead of "Not started" while reviewing

**Root cause:** counts are correctly computed end-to-end (`repository.py:219-225` against `REQUIRED_DOCS`, 7 docs, `compliance_doc_config.py:19-56`; `service.py:394,422-423`; `mappers.ts:21-31`). The bug is purely UI branching in `KanbanCard` (`OnboardingBoard.tsx:58-60`): it shows "Not started" whenever `verifiedCount === 0`, with no awareness of column/status — so a freshly-submitted "Reviewing" card (0 verified so far, correctly) hits the same branch as a card still in "Initial" that hasn't started KYC at all. `KycBoardClient` doesn't even carry a `status` field (`lib/onboarding/types.ts:71-78`), and `OnboardingBoard.tsx:257-264` doesn't pass `col.status` into `KanbanCard`.

**Fix direction:** thread column `status` into `KanbanCard`; branch the chip on status, not on the count: `initial` → "Not started", anything `reviewing`/`pending_review`/`active` → always render `${verifiedCount}/${requiredCount} verified`.

## 4. Model subscription still fully mocked

**Root cause:** `admin-frontend/lib/mock/rm-data.ts:4` literally says "All data is mock; no backend wiring." `model-subscription/page.tsx:14`, `SubscriptionAccordion.tsx:8`, `SubscriptionFormModal.tsx:23` all import `SUB_CLIENTS`/`MODEL_SIZES`/`MODEL_SIZE_LIST`/`OB_MODEL_CATALOG` directly from that mock module — zero `fetch`/hook calls anywhere in the three files. The modal's submit button (`SubscriptionFormModal.tsx:132-136`) has no `onClick` at all.

Surprising finding: a **real** subscription table (`ClientSubscription`, `pc.py:192`) and write path already exist, but only reachable through onboarding approval (`onboarding/service.py:209-257` `_approve_initial` → `repo.upsert_subscription`), exposed read-only to the client themselves via `GET /client/subscriptions` (`onboarding/router.py:192`). There is **no RM-facing list-all / ad-hoc-create endpoint** anywhere — grepped every `router.py` for "subscription", found none. So this page isn't just unwired, its backend surface doesn't exist yet.

**Fix direction:** needs new RM-facing endpoints (list all clients' subscriptions, and — if ad-hoc allotment/redemption outside the onboarding flow is actually a product requirement — create/adjust one), then replace the three mock imports with real hooks (`hooks/api/useSubscriptions.ts`, following the existing `useModels.ts`/`useOnboardingBoard.ts` pattern) and wire the modal's submit handler. Scope question for the proposal: is this page meant to be a *read view* of onboarding-created subscriptions, or does RM need to create standalone allotments/redemptions from here independent of onboarding? The current mock UI implies the latter (three modes: subscribe/allotment/redemption) but 013 explicitly deferred redemption — needs a scope decision, not just wiring.

## 5. Lock re-upload/re-submit once reviewing/active; flip to download

**Root cause — buttons:** "Request docs" (`OnboardingBoard.tsx:163`) has no `onClick`/`disabled` at all — a permanently-inert, always-visible button. "Submit All" (`:164`) is gated only by `canSubmit = outstanding === 0` (doc completeness), never by `item.status` — the panel itself renders unconditionally whenever any card is selected, regardless of column.

**Root cause — backend:** `service.py` guards are inconsistent. `verdict`/`approve`/`reject` (lines 172,184,271) already check `onboarding.status != "reviewing"` and reject otherwise. But `upload_document` (128-147) only checks the **individual document's** own status (`_CAN_REUPLOAD_STATUSES = {not_started, uploaded, rejected, expired}`) and never checks the parent cycle's status — and `submit` (149-165) never guards against re-firing when `status` is already past `reviewing`. So today, a document sitting `rejected` can still be re-uploaded (and submit re-fired) even if the cycle has since moved to `active` — same root-cause pattern the user is describing across FE and BE: the documents-stage endpoints/buttons never learned about cycle status, unlike the review-stage ones.

**Fix direction (per user, in order):**
1. FE: hide/disable "Submit All" and "Request docs" whenever `status ∈ {reviewing, active}` (only show them in `initial`/`pending_review`), not just on doc-completeness.
2. BE: add the same `onboarding.status` guard already used by verdict/approve/reject to `upload_document` and `submit` — reject with 409 if status is `reviewing` or `active`. This is the root-cause fix (one guard in the service layer both endpoints already share), not a per-button patch.
3. Download flip: a compliance-side download route already exists and works (`GET /compliance/onboardings/{id}/documents/{doc_type}/download`, `router.py:125-137` → `service.download_document` → `get_storage().open(storage_key)` — confirmed **not** write-only, files remain retrievable). No RM-facing equivalent exists. Fix is a thin new route reusing `service.download_document`, gated by `ONBOARDING_MANAGE` instead of `ONBOARDING_REVIEW`, then the FE swaps the (disabled) upload affordance for a download link when a doc is `in_review`/`verified`.

## 6. Firebase user has no auth provider

**Root cause:** `FirebaseIdentityService.create_user()` (`api-backend/app/libs/identity/service.py:20`) calls `auth.create_user(email=email)` — no password, no provider override. Per Firebase Admin SDK semantics this creates a placeholder user with **no sign-in provider**, not Email/Password. Today the account only becomes usable via `generate_invite_link()` (`identity/service.py:42-46`, wraps `auth.generate_password_reset_link`), returned by `ClientService.onboard()` — repurposing the password-reset flow as an ad-hoc invite link. Same pattern duplicated for staff (`staff/service.py:50,69`). `create_user` has exactly one call site (`ensure_identity`, `identity/service.py:61`), used by both client and staff onboarding.

**Fix direction:** one-line change — `auth.create_user(email=email, password="12345678")` — attaches the Email/Password provider with the stated default password. Real password-reset UX is explicitly deferred per the user's ask; the existing `generate_invite_link` plumbing can stay as-is or be repointed later.

## 7. Client Information detail subpage — stale/blank sections

Page: `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx`. This page is **outside 013's scope** (013 covers RM board / Compliance / PC / Client portfolio-events, not this detail view) — it was never wired to onboarding data at all.

**7.1 ID Info** — hardcoded `<InfoField label="ID Info" value="—" />` (`page.tsx:199`), never reads real data. The fields exist: `id_type`/`id_number` are captured at onboarding (`models/onboarding.py:93-95`, NOT NULL) and exposed on `OnboardingDTO` (`onboarding/schemas.py:84-85`). But this page fetches `GET /rm/clients/{id}` → `ClientListItemOut`, whose query (`clients/repository.py:65-81`) never joins `client_onboardings`. Fix: join/lookup the client's onboarding row from this endpoint (or a client-detail-specific endpoint) and concatenate `id_type + " " + id_number`.

**7.2 Authorized Person** — already wired, but to the wrong source: `page.tsx:202` reads `data.authorizedPerson` ← `ClientProfile.authorized_person`, a free-text field typed manually at client creation (`ClientOnboardIn.authorized_person`, `clients/router.py:82`) — unrelated to compliance. The real approver is recorded elsewhere: `onboarding/service.py:251` sets `user.authorized_by = compliance_uid` (the approving compliance officer's firebase uid) on the client's `users` row, but nothing resolves that uid to a display name (no join exists yet — the pattern to copy is the existing `assigned_rm` resolution in `clients/repository.py:60-63`: alias `User`/`AdminProfile`, join on `firebase_uid`, coalesce to a name).

**7.3 KYC & Documents shows seed data** — not a backend seed table (confirmed: `api-backend/app/libs/dev/service.py` seeds no documents); it's a **frontend mock**. `page.tsx:245-247` iterates `overlay.docs` from `getMockOverlay(data.id)` (`page.tsx:133` → `lib/mock/rm-data.ts:505-511,156-168`), which deterministically hash-picks one of 8 hardcoded design-handoff clients and fabricates 5 generic doc rows. The real, live data already exists and is already used elsewhere: `OnboardingDocument` rows as `DocumentDTO[]` via `GET /rm/onboardings/{onboarding_id}` (`with_documents=True`) — this page just never calls it for the client's own onboarding record.

**7.4 Stale mock history** — same root mock, `page.tsx:259-261` → `overlay.history` → `clientHistory()` (`rm-data.ts:170-193`), fixed fabricated dates. Real audit data exists (`ClientEvent`/`client_events`, populated at approval — `onboarding/service.py:252-257,262-266`), but the only route serving it, `GET /client/events` (`onboarding/router.py:200-205`), is scoped to the logged-in client themselves — **there is no RM/admin-facing endpoint to fetch another client's events by client_id yet.** Needs a new backend route before the frontend can wire this one.

## 8. Initial Cash Deposit field + AUM floor

**Current state:** the field the user added (`OnboardingModal.tsx:275-280`, uncommitted) is a bare `<input>` with no `value`/`onChange` — not in the `ObForm` type (`:32-47`) or the `useState<ObForm>` initializer (`:69-73`). Sibling fields use a `set(k)` helper (e.g. `mgmtFee` at `:295`) — same pattern applies here. `handleSubmit` (`:129-162`) doesn't send it; `StartOnboardingReq` (`onboarding/schemas.py:18-38`) has no cash/deposit/AUM field at all, nor does `ClientOnboarding` (`models/onboarding.py:48-109`).

**Model per-unit price:** `Model.model_size` (`models/pc.py:72`, `Numeric(28,10)`) — already the basis for `amount_in_trade = units * model_size` elsewhere (`AllotRdmptDTO.amount`, computed in `service.py:432`, `schemas.py:128` comment confirms the formula is already in use).

**Where to store the new record:** no existing account/balance/AUM table anywhere in `app/models/` (checked onboarding, pc, post_trade_allocation, recon, users) — `ClientProfile` only has `ib_account` (an identifier string), not a balance. The natural insertion point is `_approve_initial` (`onboarding/service.py:209-257`), the sole place approval side-effects run today, right alongside the existing `create_allotment` call — `model.model_size` and `onboarding.multiplier` are already in scope there. Whether `amount_in_trade`/`cash_deposit` become new columns on `ClientSubscription`/`ClientAllotmentRedemption` or a new table is an open design call for the proposal (no precedent to slot into).

**Validation rule (N=0%):** `initial_cash_deposit >= amount_in_trade` ⟺ `cash_deposit >= 0` ⟺ `cash_deposit / (amount_in_trade + cash_deposit) >= 0%`. At N=0 this collapses to a plain non-negativity check, but the user's framing ("at least N% of total AUM") means the validation should be written generically (`cash_deposit >= N% * (amount_in_trade + cash_deposit)`, i.e. `initial_cash_deposit >= amount_in_trade / (1 - N%)`) so raising N later is a config change, not a rewrite. Needs both a client-side check (immediate feedback in the wizard) and a server-side check at submit/approve (authoritative — same defense-in-depth pattern 013 already established for its own guards, D-2).

---

## Cross-cutting observations for the proposal

- Issues 1, 3, 5 share one root pattern: **the documents/submit stage of the onboarding service never consults `onboarding.status`**, while the review/approve stage (verdict/approve/reject) already does. A single added guard (mirroring the existing pattern) fixes both the resubmit-lock (5) and prevents the queue/chip confusion from compounding further. Fixing status-blindness in `upload_document`/`submit` should be scoped as one backend unit, not three separate patches.
- Issues 7.3 and 7.4 both need the client-detail page to stop reading `lib/mock/rm-data.ts` and instead call onboarding endpoints — 7.3 can reuse an existing endpoint (`GET /rm/onboardings/{id}`), 7.4 needs a new admin-scoped events-by-client route first.
- Issue 4 has a wider open question (does RM need to originate subscriptions/allotments outside onboarding, or only view them?) that should be settled as a design decision before scoping the backend work, since it changes whether new mutation endpoints are needed at all.
- Issue 8's AUM-floor validation and issue 4's model-subscription backend both touch `client_subscriptions`/allotment math — worth sequencing together if the proposal splits into DB/BE/FE layers, since both need `Model.model_size` in scope.
