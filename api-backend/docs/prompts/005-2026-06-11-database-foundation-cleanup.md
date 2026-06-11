# 005 — Execution Prompt: Database Foundation Cleanup (UUID Keys · Column Order · Dev-Data Reclassification)

**Date:** 2026-06-11
**Implements:** [Implementation 005](../implementations/005-2026-06-11-database-foundation-cleanup.md) · [Proposal 005](../proposals/005-2026-06-11-database-foundation-cleanup.md)
**Branch:** `db/foundation-005` (cut from the cleaned `api-backend-cleaning-refactor` / post-003 tree)
**Nature:** **Destructive schema migration on live dev data.** Expand/contract pattern, rehearsed on a throwaway copy, gated cutover, tested rollback.
**Validation gate:** every STAGE gate (L0–L5) green before the next; live DB touched only in STAGE 3.

---

## ⚠ Read before doing anything

1. **The live DB (`portal-mariadb`) is touched ONLY in STAGE 3**, and only after the *identical* sequence has gone fully green on a throwaway copy in STAGE 2.
2. **Never run the dev-data script (Appendix C) against anything but the dev DB.** It is fail-closed (`RUN_DEV_DATA_FIXUP=1` + dev-host allowlist) — do not weaken those guards.
3. A backup is not real until it has been **restored** (L0). Take the dump *and* the volume tarball.
4. If any gate is red: **stop and report.** Do not improvise around a failed assertion. For STAGE 2 iterate; for STAGE 3 roll back.
5. Decisions are locked (D-A…D-E). Do not re-litigate. In particular **`UserOut.id` is removed** (D-A).

**Environment facts** (verified 2026-06-11):
- Live DB: container `portal-mariadb`, `root`/`rootsecret`, db `portal`, host port `3306`, volume `api-backend_mariadb_data`.
- Tooling: project `.venv` has `python`, `alembic` (via `-m alembic`), `ruff`, `mypy`, `uvicorn`, `pytest`/`httpx`. Use `.venv/Scripts/python.exe`.
- Current head: `0002` = `79729eec2af4` (so `0003.down_revision = "79729eec2af4"`).
- Reclassify UIDs: `yQ3VRonrzzX6siIYmwUa8FnT3BT2` (testingclient@126.com), `CzBBDnyAyIRHmqDcqQF2NkySqQ33` (131232@123.com), `svXeuI03c8UIeEmhMV0VKCL9k8o1` (adwadaw@asdawd.com).
- Promote to RM: `TIyxJDYt56QBlUc4vEEUiKYPHz63` (rm@example.com), `mqQacAj9jBTihGdTpeBmLEDDbdr2` (rm2@example.com). Existing RM: `T1CGu2o0hlUjfudbAF5Qzwjh79r2` (john@rm.example.com).
- Working dir: `api-backend/`. Backups dir: `C:/Users/JohnQin/v4_backups/` (create if missing).

---

## STAGE 1 — Author code + migration + script (no DB risk)

- [ ] **1.1 Branch.** `git switch -c db/foundation-005` from the post-003 tree.
- [ ] **1.2 Model edits** (`app/models/users.py`) — Appendix A: `User.id`, `ClientProfile.user_id`, `AdminProfile.user_id` → `Mapped[uuid.UUID]` with `Uuid(native_uuid=False)`; `User.id` `default=uuid.uuid4`. Confirm `portal` stays declared after `email` (already true).
- [ ] **1.3 Schema edit** (`app/schemas/users.py`) — remove the `id` field from `UserOut` (D-A). Leave `from_attributes`.
- [ ] **1.4 Author `0003`** — Appendix B. File `alembic/versions/<rev>_0003_uuid_keys_and_column_order.py`, `down_revision = "79729eec2af4"`. Expand/contract `upgrade` + real `downgrade` + L1 self-assertions.
- [ ] **1.5 Author dev-data script** — Appendix C. `scripts/dev_data_fixup/` (run.py + __init__.py + a bounds-safe dummy generator). **Do not** add it to the Dockerfile.
- [ ] **1.6 Static gate (L4 subset).** `.venv/Scripts/ruff.exe format app/ scripts/ alembic/versions` · `ruff check` · `mypy app`. Then unit tests on SQLite (Appendix D, L4-unit) for the new UUID type + `UserOut` shape.
  - **GATE 1:** ruff/mypy clean (modulo the pre-existing `firebase_admin` stub); UUID unit tests green. → else fix, repeat.

---

## STAGE 2 — Rehearse on a throwaway MariaDB (no live risk)

> Goal: run the **entire** live sequence on a disposable copy first. Iterate until every gate is green.

- [ ] **2.1 L0 — backup live + prove it.**
  - SQL dump: `docker exec portal-mariadb mariadb-dump -uroot -prootsecret --databases portal --routines --triggers > C:/Users/JohnQin/v4_backups/005_pre_live.sql` (verify size > 0).
  - Volume tarball: `MSYS_NO_PATHCONV=1 docker run --rm -v api-backend_mariadb_data:/data -v C:/Users/JohnQin/v4_backups:/backup busybox tar czf /backup/005_pre_live_vol.tgz -C /data .` (verify size > 0).
  - Spin throwaway (matched collation): `docker run -d --name portal-mariadb-rehearsal -e MARIADB_ROOT_PASSWORD=rootsecret -e MARIADB_DATABASE=portal -p 3307:3306 mariadb:11.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`; wait healthy.
  - **Prove the dump**: `docker exec -i portal-mariadb-rehearsal mariadb -uroot -prootsecret portal < C:/Users/JohnQin/v4_backups/005_pre_live.sql`.
  - **GATE L0:** restore succeeds; throwaway has 15 users.
- [ ] **2.2 Baseline snapshot** (from throwaway) — Appendix D §L0: save per-table counts, per-portal/role counts, and the full `(id, firebase_uid, email, portal, role)` roster to `C:/Users/JohnQin/v4_backups/005_baseline.txt`.
- [ ] **2.3 Apply `0003` to throwaway.** `$env:DATABASE_URL = "mysql+pymysql://root:rootsecret@localhost:3307/portal"`; `.venv/Scripts/python.exe -m alembic upgrade head`.
  - **GATE L1:** migration self-assertions pass (no abort).
- [ ] **2.4 L2 + L3(schema) on throwaway** — Appendix D: PK type `CHAR(32)`; profile FKs `CHAR(32)`→`users.id`; `DESCRIBE users` order `id, firebase_uid, email, portal, created_at, updated_at`; `assigned_rm_uid` FK intact; row counts == baseline; no orphan profiles.
  - **GATE L2/L3-schema:** green.
- [ ] **2.5 Run dev-data script on throwaway.** `$env:RUN_DEV_DATA_FIXUP="1"; $env:DATABASE_URL="...3307..."; $env:FIREBASE_AUTH_DISABLED="true"` (claims become no-ops on the throwaway — that's fine for rehearsal). `.venv/Scripts/python.exe -m scripts.dev_data_fixup.run`.
  - **GATE L3-data:** reclassified set == the 3 UIDs (portal=client, has client_profiles, no admin_profiles); client 2→5, admin 13→10; every client `assigned_rm_uid` resolves; RM pool == 3. Re-run the script → identical state (idempotency).
- [ ] **2.6 L4 app contract against throwaway.** Point app at `:3307`; boot; `/health` 200; dev-bypass `GET /api/auth/me`, `/api/users/me`, `/api/users/{uid}` 200; assert `UserOut` JSON has **no `id`** and is `{firebase_uid, email, role}`; `alembic upgrade head` again = no-op.
  - **GATE L4:** green.
- [ ] **2.7 L5 rollback rehearsal.** `alembic downgrade -1` on throwaway → schema consistent, app boots. Separately confirm restoring `005_pre_live.sql` into a fresh throwaway reproduces the baseline roster.
  - **GATE L5:** both rollback routes proven.
- [ ] **2.8 Iterate or proceed.** Any red in 2.3–2.7 → fix STAGE 1 artifacts, `docker rm -f portal-mariadb-rehearsal`, GOTO 2.1. All green → tear down throwaway, proceed.

---

## STAGE 3 — Live cutover (maintenance window)

> Only enter after STAGE 2 is fully green. Coordinate the `UserOut.id` removal with both frontends **before** 3.7.

- [ ] **3.1 Open window.** Announce; stop writes: `docker stop portal-api` (DB stays up).
- [ ] **3.2 Fresh live backup + prove.** Repeat 2.1's dump + tarball into `C:/Users/JohnQin/v4_backups/005_cutover_*` and prove the dump restores into a fresh throwaway.
  - **GATE:** backup proven.
- [ ] **3.3 Apply `0003` to live.** Either rebuild the api image and start (entrypoint runs `alembic upgrade head`), or run directly: `$env:DATABASE_URL="mysql+pymysql://root:rootsecret@localhost:3306/portal"; .venv/Scripts/python.exe -m alembic upgrade head`.
  - **GATE L1:** self-assertions pass.
- [ ] **3.4 L2 + L3(schema) on live** — same queries as 2.4.
  - **GATE:** green.
- [ ] **3.5 Run dev-data script on live.** This DB uses the **real dev Firebase** project, so leave `FIREBASE_AUTH_DISABLED` unset/false → claims are written for real (D-C proactive). `$env:RUN_DEV_DATA_FIXUP="1"; $env:DATABASE_URL="...3306..."; .venv/Scripts/python.exe -m scripts.dev_data_fixup.run`. Script asserts dev host + non-prod Firebase before acting.
  - **GATE L3-data:** green (same checks as 2.5).
- [ ] **3.6 Start api; L4 on live.** `docker start portal-api` (or the rebuilt image). Run L4 against `:3306`.
  - **GATE:** green.
- [ ] **3.7 Smoke + sign-off.** Exercise both portals; confirm frontends handle `UserOut` without `id`.
  - **GATE:** frontend sign-off → window closed. Hold the 3.2 backup + old image until this passes.

---

## ROLLBACK (any STAGE 3 gate red)

1. **Authoritative (data issue):** `docker stop portal-api` → restore the 3.2 **volume tarball** into `api-backend_mariadb_data` → restart on the pre-migration image → verify against `005_baseline.txt`.
2. **Schema-only (data intact):** `alembic downgrade -1` (proven in L5).

Do not declare done until L4 + 3.7 are green.

---

## Commit

- [ ] Commit on `db/foundation-005`: model + `UserOut` + `0003` + `scripts/dev_data_fixup/` + docs. Suggested message:
  ```
  005: UUID primary keys, portal column reorder, dev-data reclassification

  - users.id + profile FKs -> Uuid(native_uuid=False)/CHAR(32) via expand/contract migration 0003
  - Drop UserOut.id (D-A); firebase_uid is the public identifier
  - Reorder users.portal after email (DB-side; model already correct)
  - Dev-only fixup script: reclassify 3 test rows to client, promote rm/rm2 to RM, assign RMs, proactive claims
  - Migration rehearsed on throwaway from live dump; L0-L5 validation green; rollback tested

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- [ ] **Do not push / open PR / run STAGE 3 without explicit go-ahead.** Report STAGE 2 results + diffstat first.

---

## Appendix A — Model & schema edits

```python
# app/models/users.py
import uuid
from sqlalchemy import Uuid  # add to imports

class User(Base):
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # firebase_uid, email unchanged; portal stays declared here (after email) ...

class ClientProfile(Base):
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), unique=True, index=True
    )

class AdminProfile(Base):
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), unique=True, index=True
    )
```
```python
# app/schemas/users.py  — UserOut loses `id`
class UserOut(BaseModel):
    firebase_uid: str
    email: str | None
    role: str
    model_config = {"from_attributes": True}
```

## Appendix B — `0003` expand/contract (MariaDB, `op.execute`)

`down_revision = "79729eec2af4"`. Resolve live FK constraint names from `information_schema.KEY_COLUMN_USAGE` before dropping. Generate the int→uuid map in Python (`uuid.uuid4().hex`, 32 chars).

**upgrade — EXPAND (additive):**
1. `ALTER TABLE users ADD COLUMN uuid CHAR(32) NULL;`
2. Backfill `users.uuid` per row from the map. **Assert** `SELECT COUNT(*) FROM users WHERE uuid IS NULL` == 0.
3. `ALTER TABLE users ADD UNIQUE KEY ux_users_uuid (uuid);`
4. `ALTER TABLE client_profiles ADD COLUMN user_uuid CHAR(32) NULL;` (+ `admin_profiles`).
5. Backfill `user_uuid = map[user_id]`. **Assert** every profile's `user_uuid` resolves to exactly one `users.uuid`; profile counts unchanged.

**upgrade — CONTRACT (destructive):**
6. Drop FKs `client_profiles.user_id→users.id`, `admin_profiles.user_id→users.id` (by resolved name).
7. `ALTER TABLE users DROP PRIMARY KEY, MODIFY id INT NOT NULL` (strip AUTO_INCREMENT) `, DROP COLUMN id, CHANGE COLUMN uuid id CHAR(32) NOT NULL, ADD PRIMARY KEY (id);`
8. For each profile: `DROP COLUMN user_id, CHANGE COLUMN user_uuid user_id CHAR(32) NOT NULL, ADD UNIQUE KEY ux_<t>_user_id (user_id), ADD CONSTRAINT fk_<t>_user FOREIGN KEY (user_id) REFERENCES users(id);`
9. `ALTER TABLE users MODIFY COLUMN portal VARCHAR(16) NOT NULL AFTER email;` (matches the `native_enum=False` string column).
10. **Assert** `users` PK col type `char(32)`; both profile FKs resolve; `COUNT(*)` per table == pre-migration.

**downgrade:** reverse — add int `id`/`user_id` AUTO_INCREMENT, regenerate sequential ints + map, repoint, drop UUID columns, restore portal position. Document: original integer ids not preserved on round-trip (dev only).

> Charset: new `CHAR(32)` inherit the table's `utf8mb4_unicode_ci` → FK collations match (no errno 150).

## Appendix C — `scripts/dev_data_fixup/run.py` spec

**Guards (fail-closed, checked first):** require `os.environ["RUN_DEV_DATA_FIXUP"] == "1"`; parse `DATABASE_URL` host ∈ {`localhost`,`127.0.0.1`,`mariadb`}; assert configured Firebase project is not a prod id; log resolved DB + Firebase target. Abort otherwise.

**Idempotent steps:**
1. **Reclassify** each of the 3 UIDs: if `portal=='admin'` and has `admin_profiles` → delete `admin_profiles`, set `portal='client'`, insert `client_profiles` with bounds-safe dummy `name/primary_phone/address/country_of_residence/authorized_person/initiate_method`, `set_portal_claims(uid,'client',None,settings)`. Else skip.
2. **Promote RMs:** for `rm@`/`rm2@` UIDs set `admin_profiles.role='RM'`; `set_portal_claims(uid,'admin','RM',settings)`.
3. **Assign RMs:** pool = admins with `role=='RM'` (assert ≥1, expect 3). For each `client_profiles` row, set `assigned_rm_uid = random.choice(pool).firebase_uid`. (Vary by row; seedless is fine for dev.)
4. **Report:** print counts (client/admin), reclassified set, RM distribution.

Bounds-safe dummy generator: reuse the 002 seed approach (name pool with generated fallback past pool end; unique per row).

## Appendix D — Validation query library

**L0 baseline:** `SELECT portal, COUNT(*) FROM users GROUP BY portal;` · `SELECT a.role, COUNT(*) FROM admin_profiles a GROUP BY a.role;` · full roster join (saved).
**L2 structure:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='portal' AND TABLE_NAME='users' ORDER BY ORDINAL_POSITION;   -- id=char(32); portal pos == email pos+1
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='portal' AND COLUMN_NAME IN ('user_id') AND TABLE_NAME LIKE '%_profiles'; -- char(32)
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
 FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA='portal' AND REFERENCED_TABLE_NAME IS NOT NULL;  -- profiles.user_id->users.id; assigned_rm_uid->users.firebase_uid
```
**L3 integrity:**
```sql
SELECT COUNT(*) FROM users;                              -- == baseline (15)
SELECT COUNT(*) FROM client_profiles c LEFT JOIN users u ON c.user_id=u.id WHERE u.id IS NULL;  -- 0 orphans
SELECT COUNT(*) FROM admin_profiles a LEFT JOIN users u ON a.user_id=u.id WHERE u.id IS NULL;    -- 0
-- post-script:
SELECT portal, COUNT(*) FROM users GROUP BY portal;     -- client=5, admin=10
SELECT COUNT(*) FROM client_profiles WHERE assigned_rm_uid IS NULL;  -- 0
SELECT assigned_rm_uid, COUNT(*) FROM client_profiles GROUP BY assigned_rm_uid;  -- distribution over 3 RMs
SELECT COUNT(*) FROM admin_profiles WHERE role='RM';    -- 3
```
**L4 contract:** boot; `/health`→200; dev-bypass `/api/auth/me`,`/api/users/me`,`/api/users/{uid}`→200; assert response JSON keys == `{firebase_uid,email,role}` (no `id`); `alembic upgrade head` again → "already at head".
**L4-unit (SQLite):** model round-trip with `Uuid(native_uuid=False)`; `UserOut.model_validate(user)` has no `id`.
**L5 rollback:** `alembic downgrade -1` clean + app boots; restore of `005_pre_live.sql` reproduces `005_baseline.txt`.
