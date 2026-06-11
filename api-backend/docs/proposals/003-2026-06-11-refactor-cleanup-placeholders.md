# 003 — Refactor Basis: Purging Placeholders, Mockups, and Dead Code

**Date:** 2026-06-11
**Branch:** `refactor/cleanup-003` (off the 002 tree)
**Status:** Draft
**Author:** QinQipeng
**Builds on:** [002 — Separating Client and Admin Handling](002-2026-06-10-client-admin-separation.md)
**Paired with:** [004 — Authentication Flow Rework](004-2026-06-11-auth-flow-rework.md) · [005 — Database Foundation Cleanup](005-2026-06-11-database-foundation-cleanup.md)

---

## 1. Context and Motivation

002 separated client and admin handling at the DB, API, and Firebase-claim layers. That refactor — plus the original 001 scaffolding — left two kinds of debris behind:

1. **Dead code from the 002 transition** — symbols created for symmetry or anticipated use that are never called.
2. **Placeholder / mockup modules from 001** — the `financial` and `documents` modules exist as routers + empty service/repository/model stubs that return fabricated responses or `501`.

The team is about to implement real business logic on top of the auth layer. This proposal is the **refactor basis**: a low-risk, behaviour-preserving pass that **deletes** confirmed-dead code and **fully removes** the placeholder modules, so the tree is clean and honest before 004 (auth) and 005 (database) land.

This proposal is **code-only** — no schema or data migration (those are owned by 005). It changes **no auth behaviour** (owned by 004).

> **Why first.** Mostly deletions — reviewable quickly, independently revertable, and it removes misleading scaffolding (an action set implying a gate that no longer exists; endpoints that fake `200 OK`).

---

## 2. Goals

1. Delete all code with zero real callers, with grep evidence per symbol.
2. Collapse the triplicated identity-extraction logic to a single helper.
3. **Purge the `financial` and `documents` placeholder modules entirely** — routers, services, repositories, ORM stubs, schemas, and their mounts.
4. **Trim the `Action` matrix to only what is wired**, removing every unimplemented action and its per-role assignments — **while keeping all six roles** (`RM, MOBO, PM, PC, COMPLIANCE, ADMIN`).
5. Leave every *surviving* live endpoint (`/api/auth/*`, `/api/users/*`, `/health`) byte-for-byte unchanged.

## 3. Non-Goals

- Any change to authentication, registration, provisioning, or portal gating — **owned by 004**.
- Any schema, primary-key, column-ordering, or data-migration change — **owned by 005**.
- Implementing real `financial` / `documents` logic — they return in their own future proposals, built from scratch on the real foundation.

---

## 4. Inventory & Actions

### 4.1 Confirmed-dead code (delete)

Verified by grepping `app/` for usages other than the definition.

| Symbol | Location | Evidence |
|---|---|---|
| `CLIENT_ACTIONS` | `app/libs/auth/actions.py:32` | 0 refs. Misleading — implies client access is action-gated; it is a pure portal check since 002. |
| `get_admin_profile_repo` | `app/libs/users/repository.py` | Never used as `Depends()`; `AdminProfileRepository` is built inline. |
| `get_client_profile_repo` | `app/libs/users/repository.py` | Never used as `Depends()`. |
| `ClientProfileRepository` | `app/libs/users/repository.py` | Reachable only via the dead provider. (004 re-introduces a real one.) |
| `extract_uid_email` | `app/core/security.py:51` | No importers — both former call sites inlined their own copy in 002. |

**Keep:** `AdminProfileRepository` (used inline), `UserService` (live: `update_email` + repo access in `users/router.py`).

### 4.2 Consolidate triplicated extraction

The "read `uid` (401 if missing) + strip/null-coerce `email` + dev-bypass identity" logic exists three times and has already drifted:
`extract_uid_email` (`core/security.py:51`, dead), `_uid_email` (`auth/service.py:14`), inline in `deps.py:33`.

**Action:** keep one canonical `extract_uid_email(claims, settings)` in `core/security.py` (handling the dev-bypass identity too); call it from both `deps._resolve_user` and `auth/service`. Removes ~20 duplicated lines. 004 then has a single call site to evolve.

### 4.3 Purge `financial` and `documents` (full removal)

Both modules are mocks. `financial` is the more dangerous one — it returns `200 OK` with fabricated `uuid4()` bodies and "(placeholder)" messages, so a frontend could believe allotments/redemptions are processing.

**Delete:**

| Path | Current state |
|---|---|
| `app/libs/financial/` (`router.py`, `service.py`, `repository.py`, `__init__.py`) | router fakes `200`; `service` ignores payload; `repository.py` = `class FinancialRepository: pass` |
| `app/libs/documents/` (`router.py`, `service.py`, `repository.py`, `__init__.py`) | client `GET/POST /me` → `501`; admin `GET ""` → `501`; service/repo = `pass` |
| `app/models/financial.py`, `app/models/documents.py` | comment-only placeholder files |
| `app/schemas/financial.py`, `app/schemas/documents.py` | schemas used only by the purged routers |

**Edit `app/main.py`:** remove the `financial_router` / `documents_router` imports + `include_router` calls, and the `import app.models.financial` / `import app.models.documents` registration lines.

**Knock-on:** purging `documents` removes the only consumers of `get_current_client_user` and of `DocumentUploadRequest`.
- `get_current_client_user` (`auth/deps.py`) — **retain** (core auth infra; 004 re-mounts client routes on it immediately). Flagged so it isn't mistaken for dead code.
- `DocumentUploadRequest` — deleted with `schemas/documents.py`.

### 4.4 Trim the Action matrix to wired only (keep roles)

`require_action` has exactly five call sites (grep-confirmed):

| Action | Endpoint | Survives the §4.3 purge? |
|---|---|---|
| `USER_MANAGE` | `PATCH /api/users/{uid}/role` | ✅ kept (critical — admin provisioning; 004's chokepoint) |
| `USER_VIEW` | `GET /api/users/{uid}` | ✅ kept (real admin lookup) |
| `FINANCIAL_SUBMIT` | financial router | ❌ purged with §4.3 |
| `DOCUMENT_VIEW_ALL` | documents router | ❌ purged with §4.3 |

So the **only wired actions after the purge are `USER_VIEW` and `USER_MANAGE`.**

**Action:** reduce `Action` (`app/libs/auth/actions.py`) to the wired pair **plus `CLIENT_VIEW`/`CLIENT_MANAGE` pre-kept** for 004 (decision **D-1** resolved: pre-keep to avoid churn, since 004 is the next proposal and the RM needs them to onboard clients). Delete all other unimplemented members (`FINANCIAL_*`, `COMPLIANCE_*`, `ANALYTICS_*`, `CLIENT_SUBMIT_ON_BEHALF`, `DOCUMENT_*`). Rewrite `ROLE_ACTIONS` to the trimmed set, **keeping all six role keys**:

```python
class Action(str, enum.Enum):
    USER_VIEW = "admin:user_view"
    USER_MANAGE = "admin:user_manage"
    CLIENT_VIEW = "clients:view"        # pre-kept for 004 (RM client onboarding)
    CLIENT_MANAGE = "clients:manage"    # pre-kept for 004 (RM client onboarding)

ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM:         {Action.CLIENT_VIEW, Action.CLIENT_MANAGE},
    AdminRole.MOBO:       set(),
    AdminRole.PM:         set(),
    AdminRole.PC:         set(),
    AdminRole.COMPLIANCE: set(),
    AdminRole.ADMIN:      set(Action),  # all four
}
```

> **Only RM and ADMIN carry actions at this point.** MOBO/PM/PC/COMPLIANCE are intentionally empty — their real capabilities are defined when the corresponding features (financial, compliance, analytics) are built, not now. `CLIENT_VIEW`/`CLIENT_MANAGE` are declared but not consumed by any endpoint until 004 mounts `POST /api/admin/clients` — a deliberate forward-declaration (not dead code) so a future cleanup pass doesn't strip them. Note: with this matrix, `USER_VIEW`/`USER_MANAGE` are reachable only by ADMIN.

---

## 5. Proposed Sequence (behaviour-preserving)

1. Delete §4.1 symbols (one commit).
2. Consolidate §4.2 onto one `extract_uid_email`; repoint `deps` + `service`.
3. Purge §4.3 modules + `main.py` edits.
4. Trim §4.4 matrix.
5. **Gate:** `ruff check` + `ruff format` + `mypy app`; boot; smoke `/health`, `/api/auth/me` (dev bypass), `/api/users/me`, `/api/users/{uid}`.

No Alembic revision — `Base.metadata` simply stops registering the deleted ORM stubs (which were comment-only anyway), so `create_all` is unaffected.

---

## 6. Decisions

- **D-1 — RM actions. ✅ RESOLVED: pre-keep `CLIENT_VIEW`/`CLIENT_MANAGE`** as forward-declarations (see §4.4), so RM retains onboarding capability and 004 has no churn.
- **D-2 — `USER_VIEW`.** Keep (recommended) or cut as the weakest wired action and re-add with an admin-management UI. **Default: keep.**
- **D-3 — `get_current_client_user`.** Retain through the documents purge (recommended; 004 needs it) vs delete-and-readd. **Default: retain.**

## 7. Verification

- Lint/type gate clean.
- App boots; `create_all` succeeds with the ORM stubs gone.
- Surviving routes (`/health`, `/api/auth/*`, `/api/users/*`) behave identically; `financial` + `documents` routes return `404` (unmounted).
- `grep` shows zero references to every deleted symbol/module.
- OpenAPI schema: `financial` + `documents` groups gone; everything else unchanged.
