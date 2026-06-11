# 005 — Database Foundation Cleanup: UUID Keys, Column Order, and Test-Data Reclassification

**Date:** 2026-06-11
**Branch:** `db/foundation-005`
**Status:** Decisions locked (D-A…D-E resolved 2026-06-11) — ready for execution prompt
**Author:** QinQipeng
**Builds on:** [002 — Separating Client and Admin Handling](002-2026-06-10-client-admin-separation.md)
**Related:** [003 — Refactor Basis](003-2026-06-11-refactor-cleanup-placeholders.md) · [004 — Authentication Flow Rework](004-2026-06-11-auth-flow-rework.md)

---

## 1. Context and Motivation

Before real business logic lands, the data foundation from 002 needs three corrections. Two are **schema** changes (apply to every DB, via Alembic); one is a **dev-data** fix (the live 15-row dev DB only, via a one-off script). Keeping these separate from 003 (code-only) and 004 (auth behaviour) is deliberate — this proposal is the only one that touches **schema + rows**, and it carries the highest blast radius, so it gets its own review and its own migration.

**Crucial split, enforced throughout this proposal:**

- **Schema changes** (§4, §5) → Alembic revision, run on *every* environment including fresh/prod.
- **Dev-data reclassification** (§6, §7) → a one-off, idempotent, **dev-only** script with an explicit allowlist. It must **never** run against production (same constraint as the removed 002 seed).

---

## 2. Goals

1. `users.id` is a **UUID**, not an auto-incrementing integer.
2. The `users.portal` column sits **after `email` and before `created_at`** (logical ordering).
3. Test/ambiguous accounts currently misfiled as admins are **reclassified to the client portal** (row moved from `admin_profiles` to `client_profiles`, null fields filled with dummy data).
4. Every client is **assigned a relationship manager** — `client_profiles.assigned_rm_uid` set to a randomly chosen RM; one RM may own many clients.

## 3. Non-Goals

- Code-level dead-code/placeholder removal — **003**.
- Auth/provisioning behaviour — **004**. (Note: 004's bind-on-login and RM-onboarding build *on top* of the keys this proposal establishes; do 005 before or with 004's data assumptions.)
- Changing `firebase_uid` (stays the external identity / login key) or `assigned_rm_uid`'s referent (stays `users.firebase_uid`).
- Running any dev-data fix in production.

---

## 4. Schema change A — `users.id` → UUID

### 4.1 Rationale & blast radius

`users.id` is currently `Integer PK autoincrement`. Moving to UUID removes sequential enumeration and makes IDs non-guessable/merge-safe. But it cascades:

- **`client_profiles.user_id`** and **`admin_profiles.user_id`** are FKs → `users.id`; both change type to UUID.
- **`assigned_rm_uid`** → `users.firebase_uid` is **unaffected** (it references the firebase UID string, not `id`).
- **`UserOut.id`** is currently `int` and exposed on the wire (`app/schemas/users.py`). Per **D-A (resolved)** the field is **dropped** from `UserOut` — the internal UUID PK is never serialised; `firebase_uid` is the public identifier. Requires frontend coordination.

### 4.2 Proposed model

Use SQLAlchemy 2.0's cross-dialect `Uuid` type with a Python-side default (portable to the SQLite used in tests; MariaDB 11.4 stores it natively / as `CHAR(32)`):

```python
import uuid
from sqlalchemy import Uuid

class User(Base):
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
```

`client_profiles.user_id` / `admin_profiles.user_id` become `Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("users.id"), ...)`.

### 4.3 Migration approach (Alembic, on top of 002's `0002`)

A new revision `0003`. Because this is a PK-type change on a table with two inbound FKs and live rows, it cannot be a single `alter_column`. Ordered steps:

1. Add `users.id_uuid` (UUID, default uuid4) and `client_profiles.user_uuid` / `admin_profiles.user_uuid` (nullable UUID).
2. Backfill: generate a UUID per `users` row; copy into the profile `*_uuid` columns by joining on the old integer `user_id`.
3. Drop the old FKs; drop old `user_id`/`id` PK; rename `*_uuid` → final names; add the new PK + FKs + indexes.
4. (Combine the §5 column reorder into the same table rebuild where possible to avoid a second pass.)

Reversibility: provide a `downgrade` that maps UUIDs back to fresh integers (acceptable for dev; document that round-tripping does not preserve original integer ids).

> The live dev DB was adopted into Alembic via `stamp 0001` (see 002). `alembic upgrade head` will apply `0003` after `0002`. **Back up the volume first** (as in 002 V4).

## 5. Schema change B — reorder `portal`

Target order: `id, firebase_uid, email, portal, created_at, updated_at`.

- Column order is **cosmetic** (no behavioural effect; ORM access is name-based). It only changes `DESCRIBE`/SELECT-\* output ergonomics.
- MariaDB supports `ALTER TABLE users MODIFY COLUMN portal <type> NOT NULL AFTER email`. Fold this into the `0003` table rebuild from §4.3.
- The SQLAlchemy model attribute order is updated to match (move the `portal` mapped_column above `created_at`). Note SQLAlchemy emits columns in declaration order on `create_all`, so fresh DBs get the right order automatically.

Low priority / low risk; bundled here only because it shares the `0003` rebuild.

## 6. Dev-data change C — reclassify misfiled clients (dev-only script)

### 6.1 Problem

002 migrated all non-`CLIENT` legacy rows to the **admin** portal. Some of those are actually test/external accounts that belong on the **client** portal, e.g.:

- explicit client markers — `testingclient@126.com`
- no internal-role indication — `131232@123.com`

These now have an `admin_profiles` row and need to become clients.

### 6.2 Rule: explicit allowlist, not a heuristic

With only ~15 live rows, a fuzzy regex risks misclassifying a real admin. **Use an explicit, reviewed allowlist** of `firebase_uid` → reclassify-to-client. This is auditable and fail-safe. The candidate list was extracted from the live dev DB on 2026-06-11:

```python
RECLASSIFY_TO_CLIENT = [
    "yQ3VRonrzzX6siIYmwUa8FnT3BT2",  # testingclient@126.com  (explicit client marker)
    "CzBBDnyAyIRHmqDcqQF2NkySqQ33",  # 131232@123.com         (no internal indication)
    "svXeuI03c8UIeEmhMV0VKCL9k8o1",  # adwadaw@asdawd.com      (gibberish; D-B → client)
]
```

> **D-B resolved:** `adwadaw@asdawd.com` (id 14) is reclassified to client. Its current `PM` `admin_profiles` row is deleted as part of the move (step 6.3.2), so the PM role assignment is discarded — intended, since it was test noise.

**Kept as admin** (clear internal indication): `dev-user`, `testing123@admin.com`, `rm@example.com`, `rm2@example.com`, `compliance@example.com`, `compliance2@example.com`, `compliance3@example.com`, `teddy@compliance.com`, `john@rm.example.com`, `joe@mobo.example.com`. Already client: `test.client@example.com`, `waibibabo@developer.com`.

**Net result:** 15 users → **5 client** (`test.client`, `waibibabo`, `testingclient`, `131232`, `adwadaw`) + **10 admin**.

### 6.3 Per-row procedure (idempotent)

For each listed user:
1. Assert it currently has `portal=admin` + an `admin_profiles` row (skip if already client — idempotent).
2. Delete the `admin_profiles` row.
3. Set `users.portal = 'client'`.
4. Insert a `client_profiles` row; fill nullable fields with **dummy data** (`name`, `primary_phone`, `address`, `country_of_residence`, `authorized_person`, `initiate_method`) using a bounds-safe generator (the approach the removed 002 seed used).
5. Update the Firebase custom claim to `{portal: "client"}` proactively (D-C), so the reclassified user's token is correct immediately rather than waiting for lazy refresh. No-op under `FIREBASE_AUTH_DISABLED`.

## 7. Dev-data change D — assign an RM to every client (dev-only script)

After §6:

1. **Promote to RM (D-D):** set `admin_profiles.role = 'RM'` for `rm@example.com` and `rm2@example.com` (currently `ADMIN`), and re-stamp their `{portal:"admin", role:"RM"}` claim. Pool becomes 3 RMs incl. `john@rm.example.com`.
2. Build the RM pool: `users` where `portal=admin` and `admin_profiles.role = 'RM'` (now 3).
3. For each `client_profiles` row, pick an RM (random); **one RM may own many clients** (no uniqueness constraint).
4. Set `assigned_rm_uid` = that RM's `firebase_uid`.

> The script asserts the pool is non-empty and logs the resulting distribution. With 5 clients over 3 RMs, fan-out is realistic.

This runs **after** §4–§5 (so the new UUID keys exist) and as part of the same dev-only script as §6, guarded against production.

---

## 8. Decisions — ALL RESOLVED (2026-06-11)

- **D-A — `UserOut.id` contract. ✅ RESOLVED (b): stop exposing the internal `id`.** `UserOut` becomes `{firebase_uid, email, role}`; `firebase_uid` is the public identifier. The internal UUID PK is never serialised. ⚠ **Frontend coordination required** — any client/admin frontend keying on `UserOut.id` must switch to `firebase_uid`. (Lower-disruption fallback if a frontend can't change in time: keep `id` exposed as the UUID string — but the target is to drop it.)
- **D-B — reclassification allowlist. ✅ RESOLVED:** all three reclassify to client — `testingclient@126.com`, `131232@123.com`, **and `adwadaw@asdawd.com`** (gibberish email; its PM role is discarded with the move). See §6.2.
- **D-C — claim refresh. ✅ RESOLVED: proactive.** The script calls `set_custom_user_claims({portal:"client"})` for each reclassified UID so tokens are correct immediately (no wait for lazy refresh).
- **D-D — RM pool. ✅ RESOLVED: promote `rm@example.com` + `rm2@example.com` to `role=RM`** (→ 3-RM pool incl. `john@rm.example.com`) before assignment, for realistic fan-out. This promotion is part of the dev-only script (§7).
- **D-E — sequencing. ✅ RESOLVED: 005 before 004.** 004's onboarding writes `assigned_rm_uid` and assumes the UUID key shape, so the foundation lands first.

## 9. Verification

| Check | Expected |
|---|---|
| `alembic upgrade head` on a **backed-up** copy of the dev DB | `0003` applies; 15 rows preserved with new UUID ids |
| Fresh DB via `create_all` (tests/SQLite) | UUID PKs, correct column order, FKs intact |
| `DESCRIBE users` | order = `id, firebase_uid, email, portal, created_at, updated_at` |
| Profile FKs | `client_profiles.user_id` / `admin_profiles.user_id` are UUID, resolve to a `users` row |
| Reclassification script (dev) | listed users: no `admin_profiles` row, `portal=client`, populated `client_profiles`; idempotent on re-run |
| RM assignment | every client has a non-null `assigned_rm_uid` pointing at an RM; distribution logged |
| Prod guard | script refuses to run when the prod marker is set / `firebase_auth_disabled` is false |
| `UserOut` | matches the **D-A** decision; frontends coordinated |

## 10. Risk Notes

- §4 is the highest-risk change in the whole 003/004/005 set (PK-type migration on live data with FKs). **Volume backup before `upgrade head` is mandatory**; rehearse on a throwaway copy first (002 V3/V4 pattern).
- §6–§7 mutate real dev rows — explicit allowlist + idempotency + prod guard are the safety rails. Back up before running.
- Combining §4 + §5 in one table rebuild minimizes downtime and avoids a second destructive pass.
