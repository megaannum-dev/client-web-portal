# 003 — Execution Prompt: Purge Placeholders, Mockups & Dead Code

**Date:** 2026-06-11
**Implements:** [Proposal 003](../proposals/003-2026-06-11-refactor-cleanup-placeholders.md)
**Branch:** `refactor/cleanup-003` (cut from the current `client-admin-separation` HEAD)
**Nature:** Single-pass, mechanical, **behaviour-preserving** cleanup. No schema/data migration (that is 005). No auth behaviour change (that is 004).
**Validation gate:** `ruff check` + `ruff format --check` + `mypy app` clean; app boots; surviving routes unchanged; purged routes return 404.

---

## How to run this

Execute the steps **in order**. Each step is a checkbox with an exact action and an inline verification. Do not batch deletions ahead of their `grep` checks. After the last step, run the **Final Gate** (§ Validation). If any verification fails, stop and report — do not improvise around it.

**Working dir:** `api-backend/`
**Decisions already locked (do not re-litigate):**
- Full purge of `financial` + `documents` (not convert-to-501).
- Action matrix trimmed to `USER_VIEW`, `USER_MANAGE`, **plus pre-kept** `CLIENT_VIEW`, `CLIENT_MANAGE` (forward-decls for 004). All six roles kept.
- `get_current_client_user` is **retained** (004 needs it) even though its only consumer (documents) is being deleted.
- `UserService` and `AdminProfileRepository` are **retained** (live).

---

## Phase 0 — Preflight

- [ ] **0.1** Confirm clean tree on the right base: `git status` is clean; `git rev-parse --abbrev-ref HEAD`. Create the branch: `git switch -c refactor/cleanup-003`.
- [ ] **0.2** Record baseline route list for the regression check: boot is not required yet, but capture the current routers mounted in `app/main.py` (expect `auth`, `users`, `financial`, `documents`).

---

## Phase 1 — Delete confirmed-dead symbols

- [ ] **1.1 `CLIENT_ACTIONS`** — in `app/libs/auth/actions.py`, delete the `CLIENT_ACTIONS` set and its comment block.
  - Verify: `grep -rn "CLIENT_ACTIONS" app/` → **0 hits**.
- [ ] **1.2 Unused repo providers + class** — in `app/libs/users/repository.py`, delete `get_admin_profile_repo`, `get_client_profile_repo`, and `class ClientProfileRepository`.
  - Keep `AdminProfileRepository`, `class UserRepository`, and `get_user_repo`.
  - Verify: `grep -rn "get_admin_profile_repo\|get_client_profile_repo\|ClientProfileRepository" app/` → **0 hits**.
- [ ] **1.3 `extract_uid_email` (old copy)** — leave in place *for now*; it is consolidated in Phase 2 (do not delete twice). Skip here.

---

## Phase 2 — Consolidate uid/email extraction

Goal: one canonical helper; two call sites repointed.

- [ ] **2.1** In `app/core/security.py`, make `extract_uid_email` the single source. It must accept `(claims, settings)` and handle the dev-bypass identity, matching today's inlined behaviour:
  ```python
  def extract_uid_email(claims: dict, settings: Settings) -> tuple[str, str | None]:
      if settings.firebase_auth_disabled:
          return "dev-user", "dev@example.com"
      uid = claims.get("uid")
      if not uid:
          raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing uid")
      raw_email = claims.get("email")
      email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None
      return str(uid), email
  ```
  (Add the `Settings` import if not already present.)
- [ ] **2.2** In `app/libs/auth/service.py`: delete the local `_uid_email` function; import `extract_uid_email` from `app.core.security`; replace the call `uid, email = _uid_email(claims, settings)` with `uid, email = extract_uid_email(claims, settings)`.
- [ ] **2.3** In `app/libs/auth/deps.py` `_resolve_user`: replace the inline `uid = claims.get("uid") … email = …` block (and the `firebase_auth_disabled` dev-user branch if it duplicates) with `uid, email = extract_uid_email(claims, settings)`. Re-add the `extract_uid_email` import.
  - ⚠ Preserve exact behaviour: `_resolve_user` still creates/returns the dev-user admin under `firebase_auth_disabled`, and still auto-provisions unknown tokens as clients. **Do not change that logic here** — only the uid/email extraction is consolidated. (Auto-provision removal is 004.)
- [ ] **2.4** Verify: `grep -rn "_uid_email" app/` → **0 hits**; `grep -rn "extract_uid_email" app/` → exactly the definition + 2 call sites (deps, service).

---

## Phase 3 — Purge the `financial` module

- [ ] **3.1** Delete the directory `app/libs/financial/` (all of `router.py`, `service.py`, `repository.py`, `__init__.py`, `__pycache__`).
- [ ] **3.2** Delete `app/models/financial.py`.
- [ ] **3.3** Delete `app/schemas/financial.py`.
- [ ] **3.4** Verify: `grep -rn "financial" app/` → **0 hits** (case-insensitive: `grep -rin "financial" app/`).

---

## Phase 4 — Purge the `documents` module

- [ ] **4.1** Delete the directory `app/libs/documents/` (`router.py`, `service.py`, `repository.py`, `__init__.py`, `__pycache__`).
- [ ] **4.2** Delete `app/models/documents.py`.
- [ ] **4.3** Delete `app/schemas/documents.py`.
- [ ] **4.4** Verify: `grep -rin "documents" app/` → **0 hits** except any unrelated prose. `grep -rn "DocumentUploadRequest\|DocumentOut" app/` → **0 hits**.

---

## Phase 5 — Fix `app/main.py` mounts & model registration

- [ ] **5.1** Remove the imports:
  - `from app.libs.financial.router import router as financial_router`
  - `from app.libs.documents.router import router as documents_router`
  - `import app.models.financial as _models_financial  # noqa: F401`
  - `import app.models.documents as _models_documents  # noqa: F401`
- [ ] **5.2** Remove the mounts:
  - `app.include_router(financial_router, prefix="/api")`
  - `app.include_router(documents_router, prefix="/api")`
- [ ] **5.3** Leave `auth_router`, `users_router`, the `app.models.users` import, CORS, lifespan, and `/health` untouched.
- [ ] **5.4** Verify: `grep -rn "financial_router\|documents_router\|_models_financial\|_models_documents" app/` → **0 hits**.

---

## Phase 6 — Trim the Action matrix (keep all six roles)

- [ ] **6.1** Rewrite `app/libs/auth/actions.py` to exactly this `Action` enum and `ROLE_ACTIONS` (keep the `get_actions_for_role` helper and the `AdminRole` import):
  ```python
  import enum
  from app.models.users import AdminRole

  class Action(str, enum.Enum):
      USER_VIEW = "admin:user_view"
      USER_MANAGE = "admin:user_manage"
      CLIENT_VIEW = "clients:view"        # pre-kept for 004 (RM client onboarding)
      CLIENT_MANAGE = "clients:manage"    # pre-kept for 004 (RM client onboarding)

  ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
      AdminRole.RM:         {Action.CLIENT_VIEW, Action.CLIENT_MANAGE},
      AdminRole.MOBO:       set(),  # no actions yet — defined when its features are built
      AdminRole.PM:         set(),  # no actions yet
      AdminRole.PC:         set(),  # no actions yet
      AdminRole.COMPLIANCE: set(),  # no actions yet
      AdminRole.ADMIN:      set(Action),
  }

  def get_actions_for_role(role: AdminRole) -> set[Action]:
      """Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."""
      return ROLE_ACTIONS.get(role, set())
  ```
- [ ] **6.2** Verify no purged action is still referenced anywhere:
  - `grep -rn "Action\." app/` → only `USER_VIEW`, `USER_MANAGE`, `CLIENT_VIEW`, `CLIENT_MANAGE` appear.
  - Specifically confirm **0 hits** for `FINANCIAL_`, `DOCUMENT_`, `ANALYTICS_`, `COMPLIANCE_VIEW`, `COMPLIANCE_REVIEW`, `CLIENT_SUBMIT_ON_BEHALF`.
  - The only live `require_action(...)` sites remain in `app/libs/users/router.py` (`USER_MANAGE`, `USER_VIEW`) and still import cleanly.

---

## Phase 7 — Sweep for orphaned imports / references

- [ ] **7.1** `grep -rn "from app.libs.financial\|from app.libs.documents\|app.schemas.financial\|app.schemas.documents\|app.models.financial\|app.models.documents" app/` → **0 hits**.
- [ ] **7.2** Confirm `get_current_client_user` still exists in `app/libs/auth/deps.py` (retained) even with 0 consumers — this is intentional for 004.
- [ ] **7.3** `ruff check app/` will flag any leftover unused import; fix only those caused by this cleanup.

---

## Validation — Final Gate

- [ ] **V1 — Static.** `ruff format app/` then `ruff check app/` then `mypy app` → all clean.
- [ ] **V2 — Boot.** Start the app (or `python -c "import app.main"`). `Base.metadata.create_all` must succeed with the financial/documents ORM stubs gone. No import errors.
- [ ] **V3 — Live routes unchanged.** With the dev bypass, smoke:
  - `GET /health` → 200
  - `GET /api/auth/me` → 200 (dev-user)
  - `GET /api/users/me` → 200
  - `GET /api/users/{firebase_uid}` for a known uid → 200
  - `PATCH /api/users/{firebase_uid}/role` (USER_MANAGE) → still gated/working
- [ ] **V4 — Purged routes gone.** `POST /api/financial/allotments`, `POST /api/financial/redemptions`, `GET/POST /api/documents/me`, `GET /api/documents` → **404** (unmounted).
- [ ] **V5 — OpenAPI diff.** `GET /openapi.json` no longer contains `financial` or `documents` tags; `auth` + `users` paths identical to baseline.

---

## Commit

- [ ] One commit (or a small ordered series: dead-code, consolidation, purge, matrix). Suggested message:
  ```
  Refactor 003: purge financial/documents placeholders, trim action matrix, remove dead code

  - Delete financial + documents modules (routers, services, repos, ORM stubs, schemas) and their mounts
  - Trim Action matrix to USER_VIEW/USER_MANAGE + pre-kept CLIENT_VIEW/CLIENT_MANAGE (for 004); keep all six roles
  - Remove dead symbols: CLIENT_ACTIONS, get_admin_profile_repo, get_client_profile_repo, ClientProfileRepository
  - Consolidate uid/email extraction onto a single core.security.extract_uid_email
  - Behaviour-preserving: no schema/data change (005), no auth-flow change (004)
  ```
- [ ] Do **not** push or open a PR unless asked. Report the diffstat and the V1–V5 results.

---

## Guardrails

- This prompt must not touch `app/libs/auth/deps.py` provisioning/bypass logic beyond the uid/email extraction swap (Phase 2.3). Auto-provision removal, register changes, and `dev_mode` defaults are **004** — out of scope here.
- No Alembic revision, no DB writes, no `users`/profile schema edits — **005** owns all of that.
- The unrelated `megaannum-clientdata-api` stack must not be touched.
- If a `grep` verification returns unexpected hits (e.g. a financial reference in a test or doc), **stop and report** rather than deleting outside `app/`.
