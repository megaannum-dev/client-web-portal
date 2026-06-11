# 005 — Implementation Plan: Database Foundation Cleanup

**Date:** 2026-06-11
**Implements:** [Proposal 005](../proposals/005-2026-06-11-database-foundation-cleanup.md)
**Branch:** `db/foundation-005`
**Status:** Plan for review (no code written yet)
**Decisions in force:** D-A drop `UserOut.id` · D-B reclassify 3 rows · D-C proactive claims · D-D promote 2 RMs · D-E 005 before 004.

---

## 0. What this plan guarantees

Three changes — (A) `users.id` → UUID, (B) reorder `portal`, (C) dev-data reclassification + RM assignment — carried out so that **at no point is the live dev data at risk of an unrecoverable or silent-corruption outcome.** The method is the industry-standard sequence:

> **Back up → rehearse on a production-like copy → validate every layer → cut over in a window → validate again → keep a tested rollback.**

and the schema change itself uses the **expand / contract (parallel-change) pattern** rather than a destructive in-place type swap.

The single most important rule, enforced throughout: **the live database is touched exactly once, last, and only after the identical operation has succeeded end-to-end on a throwaway copy restored from that same backup.**

---

## 1. Guiding principles (the "industrial" standard, and how each is applied here)

| Principle | Standard practice | How we apply it |
|---|---|---|
| **Reversibility** | Every migration has a tested `downgrade`, not just `upgrade`. | `0003` ships with a real `downgrade`; rollback is exercised in rehearsal (Validation L5), not assumed. |
| **Expand/Contract** | Never `ALTER` a column's type in place under load. Add new → backfill → cut over → drop old. | New `uuid`/`*_uuid` columns are added and backfilled while the old int keys still work; the destructive drop/rename happens only in the cutover window. |
| **Separation of DDL and DML** | Schema migrations are environment-agnostic; data fixes are environment-specific and never ride the shared migration chain. | `0003` (schema) runs everywhere incl. fresh/prod. The reclassification (§C) is a **dev-only, guarded, idempotent script** — never an Alembic revision. |
| **Backup + verified restore** | A backup you haven't restored is a hope, not a backup. | Pre-flight takes a SQL dump **and** a volume tarball, then **proves** the dump by restoring it into the throwaway instance used for rehearsal. |
| **Rehearse on prod-like data** | Dry-run against a copy with the real row shapes. | The throwaway MariaDB is loaded from the live dump; the full upgrade + data script + downgrade run there first, iterated until green. |
| **Idempotency** | Re-running a data fix must not double-apply. | The §C script asserts current state per row and skips already-migrated rows; safe to re-run. |
| **Validation gates / go-no-go** | Each stage has explicit pass criteria; a failure halts, not improvises. | Six validation layers L0–L5 (§6), each a hard gate in the runbook (§7). |
| **Least blast radius** | Smallest reversible step; one concern per migration. | `0003` does only the key/column-order schema change. No behaviour, no business data, no auth logic (those are 004). |
| **Observability** | The operation reports what it did. | Migration and script log row counts, UUID-map size, reclassified set, and RM distribution; post-checks assert them. |

---

## 2. Design decisions with engineering rationale

### 2.1 UUID storage type — `CHAR(32)` via SQLAlchemy `Uuid(native_uuid=False)`

Options considered:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| `BINARY(16)` | smallest, best index locality | not human-readable; SQLite test portability friction; needs pack/unpack | rejected (portability) |
| native MariaDB `UUID` (11.4) | clean, indexed | not portable to the SQLite used in unit tests; dialect-specific Alembic | rejected (tests run on SQLite) |
| `CHAR(36)` (with dashes) | readable | 36 bytes; mixes format with `firebase_uid` strings | rejected (waste) |
| **`CHAR(32)` (hex, no dashes) = `Uuid(native_uuid=False)`** | **portable (MariaDB + SQLite), readable, one code path** | slightly larger than binary | **chosen** |

`Uuid(native_uuid=False)` gives one ORM type that maps to `CHAR(32)` on MariaDB and `CHAR(32)` on SQLite, so the **same migration and the same tests run on both** — eliminating a class of "works in tests, breaks on MariaDB" surprises.

### 2.2 UUID version — `uuid4` now, with a documented caveat

`uuid4` (random) is fine for this table (tiny, low write rate). **Professional caveat recorded for the future:** random UUID primary keys fragment InnoDB's clustered index on high-insert tables (page splits, worse locality than an auto-increment). If `users` ever becomes write-heavy, switch new-row generation to **UUIDv7** (time-ordered) — it preserves insert locality while keeping non-guessability. Not worth complicating this migration now; noted so it's a deliberate choice, not an oversight.

> Note also that `firebase_uid` is already the stable external identifier. The UUID `id` is an **internal** surrogate key; per D-A it is no longer exposed on the wire. This is why the contract change (dropping `UserOut.id`) is safe long-term.

### 2.3 Why expand/contract for a 15-row dev DB

The dataset is small enough that a single transactional rebuild would "work." We still use expand/contract because (a) it makes every pre-cutover step **non-destructive and abortable**, (b) it is the pattern that scales to the real prod table later without re-learning, and (c) it gives clean validation checkpoints between expand and contract. For a large prod table the same shape would be executed online with `pt-online-schema-change`/`gh-ost`; here a short maintenance window is acceptable and simpler, and is called out as such.

---

## 3. Change inventory (files & DB objects)

**Code (committed on `db/foundation-005`):**
- `app/models/users.py` — `User.id`, `ClientProfile.user_id`, `AdminProfile.user_id` → `Mapped[uuid.UUID]` with `Uuid(native_uuid=False)`; `User.id` default `uuid.uuid4`. (`portal` already declared after `email` in the model — fresh `create_all` is already correct; the DB-side reorder is for the *existing* table.)
- `app/schemas/users.py` — remove `id` from `UserOut` (D-A).
- `alembic/versions/<rev>_0003_uuid_keys_and_column_order.py` — new revision, `down_revision = "79729eec2af4"`.
- `scripts/dev_data_fixup/` — **new, dev-only** package (reclassify + promote RMs + assign RMs + claims). Mirrors the (removed) 002 seed's bounds-safe dummy generator. Not copied into the Docker image.

**DB objects touched by `0003`:** `users` (PK), `client_profiles` (FK+col), `admin_profiles` (FK+col). `assigned_rm_uid → users.firebase_uid` is **untouched** (references `firebase_uid`, not `id`).

---

## 4. Schema migration `0003` — expand/contract steps

Authored as explicit `op.execute` SQL for MariaDB (the int→UUID swap is not expressible as a portable `alter_column`). The migration is **self-validating** (see embedded assertions, L1).

**EXPAND (additive, non-destructive — safe even if aborted):**
1. `ALTER TABLE users ADD COLUMN uuid CHAR(32) NULL;`
2. Backfill: for each `users` row, set `uuid = <hex uuid4>` (generated in the migration; build an in-memory `{old_int_id: uuid}` map). Assert: `COUNT(uuid IS NULL) = 0`.
3. `ALTER TABLE users ADD UNIQUE KEY ux_users_uuid (uuid);`
4. `ALTER TABLE client_profiles ADD COLUMN user_uuid CHAR(32) NULL;` and same for `admin_profiles`.
5. Backfill profiles: `user_uuid = map[user_id]` (UPDATE join via the map). Assert each profile's `user_uuid` resolves and equals exactly one `users.uuid`; assert profile counts unchanged.

**CONTRACT (destructive — only in the cutover window, after EXPAND validated):**
6. Drop FK constraints `client_profiles.user_id → users.id` and `admin_profiles.user_id → users.id` (resolve the live constraint names first via `information_schema`).
7. `users`: drop `PRIMARY KEY` (and `AUTO_INCREMENT`), `DROP COLUMN id`, `CHANGE COLUMN uuid id CHAR(32) NOT NULL`, `ADD PRIMARY KEY (id)`.
8. profiles: `DROP COLUMN user_id`, `CHANGE COLUMN user_uuid user_id CHAR(32) NOT NULL`, re-add `UNIQUE(user_id)` + `FK(user_id) → users.id`.
9. **Column order (B):** `ALTER TABLE users MODIFY COLUMN portal <enum-as-string type> NOT NULL AFTER email;`
10. Final assertions (L1): `users` PK is `CHAR(32)`; both profile FKs resolve; row counts equal the pre-migration snapshot.

**`downgrade`:** reverse — add back int `id`/`user_id` with `AUTO_INCREMENT`, regenerate sequential ints, repoint, drop UUID columns. Documents that original integer ids are **not** preserved on round-trip (acceptable; dev only). Exercised in L5.

> **Collation note (carried from 002):** the throwaway DB must be created `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` so the re-added FK collations match (avoids errno 150). New `CHAR(32)` columns inherit the table charset.

---

## 5. Dev-data fixup script (§C + RM work) — dev-only, guarded, idempotent

`scripts/dev_data_fixup/run.py`, run **manually** against the dev DB **after** `0003` is applied. Never imported by the app, never in the image, never an Alembic revision.

**Guardrails (fail-closed):**
- Refuses unless an explicit `RUN_DEV_DATA_FIXUP=1` env flag is set **and** the target `DATABASE_URL` host is in a dev allowlist (`localhost`/`mariadb`/`127.0.0.1`). Logs the resolved target DB before doing anything.
- Proactive Firebase claim writes (D-C) hit the **dev** Firebase project the dev stack already uses; the script asserts it is not pointed at a prod project id.

**Steps (each idempotent — re-checks state, skips if already done):**
1. **Reclassify** the 3 allowlisted UIDs (`testingclient@126.com`, `131232@123.com`, `adwadaw@asdawd.com`): assert `portal=admin`+has `admin_profiles` (else skip) → delete `admin_profiles` row → set `users.portal='client'` → insert `client_profiles` with bounds-safe dummy data → `set_custom_user_claims({portal:'client'})`.
2. **Promote RMs (D-D):** set `admin_profiles.role='RM'` for `rm@example.com`, `rm2@example.com`; re-stamp `{portal:'admin',role:'RM'}` claims.
3. **Assign RMs:** RM pool = `role=RM` admins (now 3). For each `client_profiles` row, assign a random RM's `firebase_uid` to `assigned_rm_uid`. Assert pool non-empty; log distribution.
4. Print a final state report (counts: client/admin, RM distribution, claims set).

---

## 6. Validation framework (the core of "no surprises")

Six layers, each a hard gate. Nothing proceeds on a red.

- **L0 — Pre-flight (before touching anything).**
  - Backup taken: SQL dump + volume tarball; sizes non-zero.
  - **Backup proven**: dump restores cleanly into the throwaway instance.
  - Baseline snapshot captured: `SELECT count(*)` per table; per-portal/role counts; full `(id, firebase_uid, email, portal, role)` roster saved to a file for later diff.
- **L1 — In-migration self-checks (inside `0003`).** No null UUIDs after backfill; profile→user UUID map is total and injective; pre/post row counts equal. A failed assertion aborts the transaction.
- **L2 — Structural validation (post-`0003`, schema introspection).** `users` PK type = `CHAR(32)`; `client_profiles.user_id`/`admin_profiles.user_id` = `CHAR(32)` with FK→`users.id`; `DESCRIBE users` column order = `id, firebase_uid, email, portal, created_at, updated_at`; `assigned_rm_uid` FK intact; expected indexes present.
- **L3 — Data-integrity validation (post-`0003`, then post-script).** Row counts == L0 snapshot (no loss); every profile resolves to exactly one user (no orphans); `firebase_uid`/`email` values unchanged vs snapshot. After the script: reclassified set == the 3 UIDs (now `portal=client`, have `client_profiles`, no `admin_profiles`); client count 2→5, admin 13→10; every client has a resolvable `assigned_rm_uid`; RM pool size 3.
- **L4 — Application contract validation.** App boots; `alembic upgrade head` is idempotent (re-run = no-op); `GET /health` 200; with dev bypass `GET /api/auth/me`, `GET /api/users/me`, `GET /api/users/{uid}` 200; **`UserOut` no longer contains `id`** and serialises `{firebase_uid, email, role}`; `PATCH /api/users/{uid}/role` still works. Unit tests (SQLite) green with the new UUID type.
- **L5 — Rollback validation (on the rehearsal copy only).** `alembic downgrade -1` runs clean and yields a consistent schema; independently, restoring the L0 dump reproduces the original DB. Confirms two independent escape routes exist before the live cutover.

---

## 7. Cutover runbook (ordered, with go/no-go gates)

```
STAGE 1 — Code & migration authoring (no DB risk)
  1.1 Branch db/foundation-005; apply model + UserOut edits (§3)
  1.2 Author 0003 (§4) and the dev-data script (§5)
  1.3 Local unit tests on SQLite (L4 subset) ......................... GATE: green

STAGE 2 — Rehearsal on a throwaway MariaDB (no live risk)
  2.1 L0: dump live dev DB + tarball volume; spin throwaway MariaDB
      (utf8mb4_unicode_ci); RESTORE dump into it ................... GATE: backup proven
  2.2 Capture baseline snapshot from the throwaway ................. (L0 roster saved)
  2.3 alembic upgrade head on throwaway → run L1, L2, L3(schema) ... GATE: green
  2.4 Run dev-data script on throwaway → run L3(data) ............. GATE: green
  2.5 Point app at throwaway → L4 ................................. GATE: green
  2.6 alembic downgrade -1 on throwaway → L5 ..................... GATE: green
  2.7 If any gate red: fix, tear down throwaway, GOTO 2.1 ......... (iterate to clean)

STAGE 3 — Live cutover (maintenance window)
  3.1 Announce window; stop the api container (no writes during DDL)
  3.2 FRESH backup of live (dump + tarball) ...................... GATE: backup proven
  3.3 Apply 0003 to live (rebuild api image so its entrypoint runs
      `alembic upgrade head`, or run alembic against live directly) GATE: L1 green
  3.4 L2 + L3(schema) on live .................................... GATE: green
  3.5 Run dev-data script on live (RUN_DEV_DATA_FIXUP=1) ......... GATE: L3(data) green
  3.6 Start api; L4 on live ..................................... GATE: green
  3.7 Smoke both portals; confirm UserOut shape with frontends ... GATE: sign-off

ROLLBACK (any STAGE 3 gate red): stop api → restore the 3.2 backup
  (volume tarball = fastest, full fidelity) → restart on pre-migration image →
  verify against the L0 roster. (downgrade -1 is the lighter alternative if the
  failure is purely schema and data is intact.)
```

---

## 8. Rollback plan (explicit)

Two independent, pre-tested routes:
1. **Restore from backup (authoritative):** the 3.2 volume tarball restores the exact pre-cutover state; fastest and highest-fidelity. This is the default for any data-integrity failure.
2. **`alembic downgrade -1` (schema-only):** for a failure that is purely structural with data still intact. Validated in L5, so it is known-good before we'd need it.

The window is not declared closed until L4 + frontend sign-off (3.7) pass; until then we hold the backup and the old image.

---

## 9. Risks & how this plan neutralizes each

| Risk | Mitigation |
|---|---|
| PK swap corrupts FK relationships | expand/contract keeps old keys live until backfill is proven (L1 injective map); contract only after green |
| Data loss during destructive `CHANGE COLUMN` | full backup + proven restore (L0/3.2) + count assertions (L1/L3) + tested rollback (L5/§8) |
| `UserOut.id` removal breaks a frontend | D-A flagged for coordination; window not closed until 3.7 sign-off; fallback = expose `id` as UUID string |
| FK collation mismatch (errno 150) | throwaway + live use `utf8mb4_unicode_ci`; new `CHAR(32)` inherit table charset |
| Dev script run against prod | fail-closed guard (`RUN_DEV_DATA_FIXUP=1` + dev host allowlist + non-prod Firebase assertion) |
| Random-UUID index fragmentation later | documented; UUIDv7 path noted (§2.2) if `users` becomes write-heavy |
| "Works on SQLite, breaks on MariaDB" | one `Uuid(native_uuid=False)`=`CHAR(32)` type across both; migration rehearsed on real MariaDB (Stage 2) |
| Re-running the data script double-applies | per-row state checks make it idempotent (L3 stable across re-runs) |

---

## 10. Deliverables produced by this plan (for the execution prompt to implement)

1. Model + `UserOut` edits (§3).
2. Alembic `0003` with expand/contract `upgrade`/`downgrade` + L1 assertions (§4).
3. `scripts/dev_data_fixup/` guarded idempotent script (§5).
4. A validation harness encoding L0–L5 (§6) — runnable against throwaway and live.
5. The cutover runbook (§7) as the prompt's ordered, gated checklist.

> On approval of this plan, the **execution prompt** (`docs/prompts/005-…`) turns §7's runbook into the step-by-step executable checklist with the exact commands and the L0–L5 gates inline.
