# 006 · Database — Implementation details

System-level technical specification for the MariaDB layer of the PC workspace. This is the **single
source of truth** for schema content. It is organised into work units `DB-1 … DB-8`; the
[execution schedule](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (database).md>) and [prompts](<../prompts/006-2026-06-24-trading-models-and-client-subscriptions (database).md>) reference these IDs and never
restate their content.

**Conventions (repo-wide, non-negotiable).** Mirror the existing models in `app/models/users.py`:
- PKs: `Uuid(native_uuid=False)`, `default=uuid.uuid4`.
- Enums: `SAEnum(SomeEnum, native_enum=False, values_callable=lambda e: [m.value for m in e])`,
  persisted **by value**.
- Money/decimals: `Numeric(28, 10)`.
- Timestamps: `DateTime(timezone=True)`, `server_default=func.now()`, `updated_at` adds
  `onupdate=func.now()`.
- New model module: **`app/models/pc.py`**. All additions are **additive** (clean `downgrade`).

Proposal cross-refs in parentheses (e.g. *prop §4.1*) point at
[../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md](../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md).

---

## DB-1 — `models` book + enums (`app/models/pc.py`)

*prop §4.1.* Create the module and the value enums, then the `models` table.

```python
class ModelStatus(str, enum.Enum):
    LIVE = "live"
    DRAFT = "draft"

class PeriodStatus(str, enum.Enum):
    OPEN = "open"
    CONFIRMED = "confirmed"

class ModelChangeKind(str, enum.Enum):     # change-log entry types (DB-1b, D-19)
    CREATED = "created"
    EDITED = "edited"
    PUBLISHED = "published"
    MATERIAL_UPLOADED = "material_uploaded"
```

`models` columns:

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `Uuid(native_uuid=False)` PK | no | `default=uuid.uuid4` |
| `name` | `String(255)` | no | |
| `manager` | `String(255)` | yes | |
| `model_size` | `Numeric(28, 10)` | yes | single size; account fund = `multiplier × model_size` (prop D-6) |
| `intro` | `String(255)` | yes | free-text introduced date |
| `symbols` | `JSON` | yes | list of tickers |
| `status` | `SAEnum(ModelStatus, native_enum=False, …)` → `String(16)` | no | `server_default="draft"` |
| `version` | `String(32)` | yes | cached max material version; maintained by the service (`BE-4`) |
| `created_at` | `DateTime(tz)` | no | `server_default=func.now()` |
| `updated_at` | `DateTime(tz)` | no | `server_default=func.now()`, `onupdate=func.now()` |

- **No** `ib_account` column (account is per-client — `DB-2`, prop D-3).
- **No** `mgmt`/`incentive` columns (fees not persisted — prop D-7).
- Index `ix_models_status` on `status` (matrix derivation filters live models — see `DB-6`).

## DB-1a — `model_materials` (versioned documents, child of `models`)

*prop §4.2.* Defined in `app/models/pc.py` alongside `models`; columns exactly per *prop §4.2*, with a
unique index `uq_model_materials_model_version` on `(model_id, version)` and an `ON DELETE CASCADE` FK.
Stores the opaque `storage_key` (resolved by the `BE-1` storage adapter); the model's `version` is the
max material version.

## DB-1b — `model_changes` (the change-log store, child of `models`)

*prop §4.3.* The append-only change history backing M8, in `app/models/pc.py` alongside `models`. Written
**only** by the service (`BE-4`), never by the client. **Structured, not pre-rendered:** each row records
the *kind* of change and the *before/after values* — the human-readable message is rendered on the
frontend from per-`kind` templates (D-19, `FE-5`). One row per action (one save / upload / publish /
create).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `Uuid(native_uuid=False)` PK | no | |
| `model_id` | `Uuid` FK → `models.id` | no | `ix_model_changes_model_id`; `ON DELETE CASCADE` |
| `kind` | `SAEnum(ModelChangeKind, native_enum=False, …)` → `String(32)` | no | created / edited / published / material_uploaded |
| `detail` | `JSON` | yes | structured payload; shape depends on `kind` (below); `null`/`{}` for kinds with no data |
| `actor` | `String(255)` | yes | who performed it (`ChangeEntry.user`) |
| `version` | `String(32)` | yes | model version at the time (`ChangeEntry.ver`) |
| `created_at` | `DateTime(tz)` | no | timestamp (`ChangeEntry.date`) |

**`detail` shapes by `kind` (the contract the frontend templates read, `FE-5`):**
- `created` / `published` → `{}` (no data).
- `material_uploaded` → `{ "filename": "ModelA_Marketing_v2.pdf", "version": "v2" }`.
- `edited` → `{ "fields": [ { "name": "model_size", "before": 100000000, "after": 120000000 }, … ] }`
  — **raw** before/after values; the frontend formats them (money, symbol +/−, …).

> This **replaces** the old free-text `change` column: the service stores structured data, not a rendered
> sentence (D-19).

## DB-2 — `client_profiles.ib_account` column (`app/models/users.py`)

*prop §4.4.* Add one nullable, indexed column to the existing `ClientProfile`, positioned after
`initiate_method`, before the timestamps.

| Column | Type | Null | Notes |
|---|---|---|---|
| `ib_account` | `String(255)` | yes | the client's single IB account (`AllocationClient.acct`, e.g. `"U-7101"`); `index=True` |

This is the **only** IB account in the schema. Every allocation a client holds trades through it.

## DB-3 — `client_subscriptions` (`app/models/pc.py`)

*prop §4.5, D-12.* The live current-state source the open matrix derives from. Period-agnostic.

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `Uuid` FK → `users.id` | no | part of composite PK; client (`portal='client'`) |
| `model_id` | `Uuid` FK → `models.id` | no | part of composite PK |
| `multiplier` | `Numeric(28, 10)` | no | current units; `server_default="1"`; invariant ≥ 1 |
| `created_at` | `DateTime(tz)` | no | |
| `updated_at` | `DateTime(tz)` | no | `onupdate=func.now()` — **a cache watermark input (`DB-6`)** |

- Composite PK `(user_id, model_id)`.
- Secondary index `ix_client_subscriptions_model_id` on `model_id` (reverse lookup + derivation join).
- FK `ON DELETE CASCADE` on both legs.
- Writes come from the client-subscription flow (out of scope); the PC workspace only reads it.

## DB-4 — `allocation_periods` (`app/models/pc.py`)

*prop §4.6.* The period lifecycle. At most one `open` row (service-enforced; MariaDB has no partial
unique index).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `Uuid` PK | no | |
| `label` | `String(32)` | no | e.g. `"Aug 2026"`; **unique** (`uq_allocation_periods_label`) |
| `status` | `SAEnum(PeriodStatus, …)` → `String(16)` | no | `server_default="open"` |
| `confirmed_at` | `DateTime(tz)` | yes | set on confirm |
| `confirmed_by` | `String(255)` | yes | actor who confirmed |
| `created_at` / `updated_at` | `DateTime(tz)` | no | |

Index `ix_allocation_periods_status` on `status` (find-the-open-period is a hot path).

## DB-5 — `allocation_model_snapshots` (`app/models/pc.py`)

*prop §4.7, D-10.* Immutable frozen matrix, written **only** at confirm. No rows for the open period.

| Column | Type | Null | Notes |
|---|---|---|---|
| `period_id` | `Uuid` FK → `allocation_periods.id` | no | part of composite PK; a *confirmed* period |
| `user_id` | `Uuid` FK → `users.id` | no | part of composite PK |
| `model_id` | `Uuid` FK → `models.id` | no | part of composite PK |
| `multiplier` | `Numeric(28, 10)` | no | units at confirm; ≥ 1 |
| `model_size` | `Numeric(28, 10)` | yes | **frozen** model size at confirm |
| `ib_account` | `String(255)` | yes | **frozen** client IB account at confirm |
| `created_at` | `DateTime(tz)` | no | = confirm timestamp; **no** `updated_at` (immutable) |

- Composite PK `(period_id, user_id, model_id)`.
- Secondary index `ix_allocation_model_snapshots_model_id` on `model_id`.
- Rows are append-once; never updated or deleted (enforced in service `BE-5`).

## DB-6 — Cache-support: watermark indexes + derivation indexes

This unit exists solely to make the **open-matrix cache** (`BE-6`) correct and the recompute cheap. No
new business columns; it adds the indexes the ETag computation and the derivation query rely on.

> **The cache is not in the database.** It lives in the backend (the derived-matrix store, `BE-6`) and
> the frontend (the hook's conditional ETag cache, `FE-4`). The DB's only job is to answer *"has any
> input changed since the cached version?"* cheaply. That check has to live at the DB because the most
> important invalidating write — a **new client subscription** — originates in a separate flow/process
> (the client-subscription track, out of scope) that the PC backend cannot observe via in-process
> events. The DB is the single shared source of truth, so the backend reads input *freshness*
> (`MAX(updated_at)` + `COUNT(*)`) from it; these indexes just make that read O(log n) instead of a full
> scan. **No table is added** (see the deferred optional table below).

**Watermark inputs.** The open-matrix ETag (computed in `BE-6`) is derived from the freshness of the
three contributing tables. To make `MAX(updated_at)` and `COUNT(*)` cheap, ensure:

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `ix_client_subscriptions_updated_at` | `client_subscriptions` | `updated_at` | watermark `MAX(updated_at)` for the open-matrix ETag |
| `ix_models_updated_at` | `models` | `updated_at` | watermark for live-model changes (publish, `model_size` edit) |
| `ix_client_profiles_updated_at` | `client_profiles` | `updated_at` | watermark for **roster** changes (client-portal users added/removed, D-14) and client row labels (name/code); also catches the rare `ib_account` correction |

(`ix_models_status` from `DB-1`, `ix_client_subscriptions_model_id` from `DB-3`, and
`ix_allocation_periods_status` from `DB-4` are the join/filter indexes the derivation query uses.)

**Watermark semantics the backend relies on (documented here so `BE-6` can depend on it):**
- A **new client subscribing to a model** inserts/updates a `client_subscriptions` row → its
  `updated_at` advances → the open-matrix ETag changes → cache invalidated.
- Publishing/unpublishing a model or editing `model_size` advances `models.updated_at`.
- Adding/removing a client-portal user, or editing a client's name/code, advances
  `client_profiles.updated_at` (roster + row labels). A client's `ib_account` is effectively immutable
  under normal operation, so it is **not** a primary invalidation driver; the rare correction is caught
  here for free.

> **No cache table in the DB.** The derived matrix is cached in the backend process/cache store
> (`BE-6`), not persisted. The database's only caching role is to make the watermark + recompute fast.
> Confirmed-period responses need no watermark — they read immutable `allocation_model_snapshots` (`DB-5`).

> **Optional hardening (defer unless contention shows up):** a single-row `cache_watermarks` table the
> mutating flows bump in the same transaction, giving an O(1) version read instead of three
> `MAX(updated_at)` probes. Not built now; the index-based watermark is the baseline. If adopted later it
> is purely additive and lives under this same `DB-6` ID.

## DB-7 — ORM/migration wiring

*prop §4.8.*
- `app/models/__init__.py`: export `ModelStatus`, `PeriodStatus`, `ModelChangeKind`, `Model`,
  `ModelMaterial`, `ModelChange`, `ClientSubscription`, `AllocationPeriod`, `AllocationModelSnapshot`.
- `alembic/env.py`: add `import app.models.pc` (env imports each module explicitly).

## DB-8 — Alembic migration `0008`

*prop §4.8.* One hand-written, additive migration
`alembic/versions/<rev>_0008_pc_workspace.py`, `revises = "d4e5f6a7b8c9"` (current head). `upgrade()`
creates `models`, `model_materials` (`DB-1a`), `model_changes` (`DB-1b`), `client_subscriptions`,
`allocation_periods`, `allocation_model_snapshots`, all indexes from `DB-1…DB-6`, and adds
`client_profiles.ib_account` + its index. `downgrade()` drops them in reverse FK-safe order. No data
backfill.

---

## Verification (throwaway — run once on a scratch DB, then purge)

The precise one-off check **per work unit**. This is *not* a committed test suite: run it to prove the
migration, then discard the scratch DB and any snippet. The execution schedule's verify wave (`D-W5`)
just references this section by ID.

| Unit | Precise check (assert true) |
|---|---|
| `DB-1` | `import app.models.pc` clean; `Model.__table__` columns == the §DB-1 set; **no** `ib_account`/`mgmt`/`incentive` on `models`; `ModelStatus`/`PeriodStatus`/`ModelChangeKind` persist by value (`native_enum=False`); `ix_models_status` present. |
| `DB-1a` | `model_materials` columns == prop §4.2; unique `uq_model_materials_model_version` on `(model_id, version)`; FK `ON DELETE CASCADE`. |
| `DB-1b` | `model_changes` has `kind`(enum)/`detail`(JSON)/`actor`/`version`/`created_at`; **no** `change` text column; `ix_model_changes_model_id` present. |
| `DB-2` | `client_profiles.ib_account` exists, nullable, indexed. |
| `DB-3` | `client_subscriptions` PK == `(user_id, model_id)`; `ix_client_subscriptions_model_id` present; `multiplier` `server_default "1"`. |
| `DB-4` | `allocation_periods.label` unique; `status` default `"open"`; `confirmed_at`/`confirmed_by` nullable; `ix_allocation_periods_status` present. |
| `DB-5` | `allocation_model_snapshots` PK == `(period_id, user_id, model_id)`; `ix_allocation_model_snapshots_model_id` present; **no** `updated_at`. |
| `DB-6` | the three `*_updated_at` watermark indexes exist on `client_subscriptions` / `models` / `client_profiles`. |
| `DB-7` | `app.models.__init__` exports every new class; `alembic/env.py` imports `app.models.pc`; `Base.metadata.tables` lists all six PC tables. |
| `DB-8` | on a scratch DB: `alembic upgrade head` → `alembic current` == `0008` and every object above exists; `alembic downgrade -1` removes them all. |
| `DB-IV` (integration) | dump the schema before `0008` and after `upgrade`+`downgrade -1`; the two dumps are identical (additive ⇒ fully reversible). |
