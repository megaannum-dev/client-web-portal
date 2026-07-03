# Change Log — 005 Database Foundation Cleanup (UUID Keys · Column Order · Dev-Data Reclassification)

**Date:** 2026-06-11
**Branch:** `db/foundation-005`
**Scope:** `api-backend/` (FastAPI + SQLAlchemy 2.0 + MariaDB) + dev-data on the live `portal-mariadb`
**Status:** Implemented and validated (L0–L5 green on a throwaway rehearsal; live cutover applied 2026-06-11). Migration `0003` applied to live; dev-data fixup run on live.
**Drove from:** Proposal / Implementation / Prompt 005 (the doc trio).

Converts `users.id` (and the profile FKs) from auto-increment integers to UUID `CHAR(32)`, reorders `users.portal` after `email`, drops `UserOut.id` from the wire, and reclassifies 3 misfiled test accounts to the client portal with RM assignment.

---

## ⚠ TOP NOTE — Frontend impact & deferred follow-ups (read first)

### 1. Frontend impact of dropping `UserOut.id` — NO RUNTIME BREAK
The API response contract changed: `/api/auth/{register,login,me}` and `/api/users/*` now return `{firebase_uid, email, role}` — **`id` is gone** (D-A).

Both frontends were audited (2026-06-11):
- `client-frontend` and `admin-frontend` cast the response to `PortalUser` (`lib/auth-api.ts`) and store it in `components/auth/AuthProvider.tsx`.
- **`portalUser` is consumed only via `portalUser?.role`** (route redirects, `HeaderActions`, `SidebarNav`) plus truthiness checks. **`portalUser.id` is never read anywhere** in either app.
- Because the value comes from an unchecked `as PortalUser` cast, the missing `id` produces **no runtime error**, and TypeScript does not complain (nothing accesses `.id`).

**Conclusion: the cutover does not break either frontend.** The only inaccuracy is a now-stale type field. See the root reminder doc [`FRONTEND_FOLLOWUP_005.md`](../../../FRONTEND_FOLLOWUP_005.md) for the (non-urgent) type cleanup.

### 2. Deferred: proactive Firebase claims (D-C) were NOT written
The dev-data script intended to proactively stamp `{portal:"client"}` / `{role:"RM"}` claims (D-C). During cutover the Firebase Admin credential failed:

```
invalid_grant: Invalid JWT Signature
service account: firebase-adminsdk-fbsvc@client-web-portal-2026.iam.gserviceaccount.com
private_key_id: c99756a6bc353436328e6a821f1cebad7594c7e3
```

The private key in `api-backend/firebase-client-web-portal.json` no longer matches Google's record for the service account (rotated/revoked). This is **not** a network issue (Google endpoints are reachable) and **not** introduced by 005.

**Mitigation applied:** the data script was run with `FIREBASE_AUTH_DISABLED=true`, so claim writes were no-ops and **all DB changes completed**. Correctness is preserved because **the DB is the source of truth** for `portal` — `portal_from_claims` falls back to the DB row, and claims refresh lazily on next token mint. ID-token *verification* (login) is unaffected (it uses Google public certs, not the service-account grant).

**Follow-ups (tracked in the root reminder doc):**
- Rotate the Firebase Admin service-account key, untrack the secret from git, and re-run the claim-stamp step (or let lazy refresh handle it).

---

## 1. Data model (`app/models/users.py`)

- **`User.id`**: `Mapped[int]` autoincrement → `Mapped[uuid.UUID]` with `mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)`. Stored as `CHAR(32)` on MariaDB and SQLite; Python-side `uuid4` default.
- **`ClientProfile.user_id` / `AdminProfile.user_id`**: int FK → `Mapped[uuid.UUID]` `Uuid(native_uuid=False)` FK→`users.id` (unique, indexed).
- **`assigned_rm_uid`** is unchanged — it references `users.firebase_uid` (a string), not `id`.
- `portal` stays declared after `email` in the model (the DB-side reorder matches it).

## 2. API response contract (`app/schemas/users.py`)

- **`UserOut.id` removed (D-A).** `UserOut` is now `{firebase_uid, email, role}` with `from_attributes`. `firebase_uid` is the public identifier; the internal UUID PK is never serialised.

## 3. Repository typing (`app/libs/users/repository.py`)

- `get_by_id`, `AdminProfileRepository.get_by_user_id`, and `upsert_role` parameter annotations changed `int → uuid.UUID` to match the new key type (no behavioural change).

## 4. Migration `0003` (`alembic/versions/8f2a1c9d4b6e_0003_uuid_keys_and_column_order.py`)

- `down_revision = "79729eec2af4"` (0002). MariaDB-only DDL via `op.execute`.
- **Expand/contract pattern** (never alters a live PK in place):
  - EXPAND: add parallel `users.uuid` (`CHAR(32)`) + `{client,admin}_profiles.user_uuid`; backfill from a Python `int→uuid4().hex` map; assert no NULLs / no duplicates.
  - CONTRACT: drop old int FKs (resolved by name from `information_schema`, scoped so the `assigned_rm_uid` FK is preserved); rebuild `users` PK on the UUID column with `CHANGE COLUMN uuid id ... FIRST` (keeps `id` as column 1); swap profile FKs to `CHAR(32)` with `CHANGE COLUMN user_uuid user_id ... AFTER id` (keeps `user_id` at column 2); `MODIFY portal ... AFTER email`.
  - L1 self-assertions: PK type `char`, `id` at position 1, `portal == email+1`, profile `user_id` at position 2, row counts unchanged, FKs resolve, zero orphans.
- **`downgrade`** reverses to int AUTOINCREMENT keys (`CHANGE ... AUTO_INCREMENT FIRST` restores pre-0003 order). DEV-ONLY: original integer ids are not preserved on round-trip.

## 5. Alembic env fix (`alembic/env.py`)

- Removed stale `import app.models.financial` / `app.models.documents` (deleted in 003) that raised `ModuleNotFoundError` and **broke every `alembic upgrade`** (including the Docker entrypoint on rebuild). Now imports only `app.models.users`.

## 6. Dev-data fixup script (`scripts/dev_data_fixup/`) — DEV-ONLY (removed post-migration)

> One-off migration tooling: deleted from the tree once the cutover settled. Described here for the record.

- Fail-closed guards: `RUN_DEV_DATA_FIXUP=1` + `DATABASE_URL` host ∈ {localhost,127.0.0.1,mariadb} + Firebase project must not look like prod. Aborts otherwise.
- Idempotent steps: reclassify 3 allowlisted UIDs admin→client (delete admin_profile, set portal, insert client_profile with bounds-safe dummy data); promote `rm@`/`rm2@` to RM (→ 3-RM pool); assign each client an RM (fills NULLs only → idempotent); proactive claim writes (no-op this run — see TOP NOTE §2).
- `make_dummy_profile_fields` generates unique, column-length-safe filler.

## 7. Live cutover result (`portal-mariadb`, 2026-06-11)

- Window: `portal-api` stopped; fresh proven backups taken to `C:/Users/JohnQin/v4_backups/005_cutover.*`.
- `0003` applied (now at head `8f2a1c9d4b6e`). Schema verified: `id` CHAR(32) at position 1; order `id, firebase_uid, email, portal, created_at, updated_at`; profile FKs CHAR(32)→`users.id`; `assigned_rm_uid`→`firebase_uid` intact; counts 15 users / 2→5 client_profiles / 13→10 admin_profiles; 0 orphans.
- **Post-cutover fix (column order):** the first live apply of `0003` left profile `user_id` as the *last* column (the expand-phase `user_uuid` was appended, then renamed). The migration was corrected to `CHANGE ... AFTER id` and re-rehearsed; live was repositioned in place with `ALTER TABLE {client,admin}_profiles MODIFY COLUMN user_id CHAR(32) NOT NULL AFTER id` (FKs/unique keys preserved). `user_id` is now column 2 on live and on any fresh apply of the migration.
- Dev-data script run: **15 users → 5 client + 10 admin**, 3 RMs, every client has a resolving `assigned_rm_uid`.
- `portal-api` image rebuilt from current code and restarted; `/health` 200; in-process L4 against the live schema green (`UserOut` has no `id`, reclassified user resolves as `CLIENT`).

## 8. Tests (`tests/test_models_uuid.py`) — removed post-migration

> One-off migration validation: deleted once the cutover settled. Described here for the record.

- SQLite unit tests that validated: UUID PK round-trip, distinct `uuid4` defaults, profile FK is UUID, `UserOut` has no `id` field and serialises `{firebase_uid, email, role}`.

## 9. Validation summary

- **STAGE 2 rehearsal** (throwaway from live dump): L0 (backup proven) · L1 (migration self-asserts) · L2/L3 (schema + integrity) · L3-data (reclassify/promote/assign + idempotent re-run byte-identical) · L4 (app contract) · L5 (downgrade clean + faithful, fresh-restore reproduces baseline) — all green.
- **STAGE 3 live**: backup proven · L1 · L2/L3 · L3-data · L4 — all green.

## 10. Rollback (available, not used)

- Authoritative: restore `C:/Users/JohnQin/v4_backups/005_cutover_vol.tgz` into `api-backend_mariadb_data` + start pre-migration image.
- Schema-only (data intact): `alembic downgrade -1` (proven in L5).
