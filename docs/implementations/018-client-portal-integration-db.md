# 018 — Client Portal ↔ Backend Integration · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/018-2026-07-28-client-portal-integration.md` § "Layer 1 — Database" (findings B-1 through B-6), § "3. Non-Goals" (the "No RM relationship-management API/UI" line — B-6's scope boundary), § "4. Cross-layer seam (frozen here)", § "Design decisions (settled)" (D-9 in particular), § "Rollback", § "Execution & verification" step 1
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/018-client-portal-integration-be.md`, `docs/implementations/018-client-portal-integration-fe.md`, `docs/implementations/018-client-portal-integration-admin-fe.md`
> Execution schedule: `docs/execution-schedules/018-client-portal-integration-db.md`
> Branch: `client-portal-integration-db`
> Builds on / prerequisites: nothing upstream — this is the first layer of proposal 018. Precondition is that the proposal's §4 seam is frozen/approved (it is: the proposal's status line marks it approved for implementation). The Alembic chain builds on migration `fa66b2f3aee6` (`0025_transaction_details`) — the current, single Alembic head (verified via `alembic heads` → `fa66b2f3aee6 (head)`, no branch point).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § "Layer 1 — Database" (B-1…B-6), § "3. Non-Goals" (B-6 scope boundary), § 4 (frozen seam), § "Design decisions (settled)" (D-9), § "Rollback", § "Execution & verification" step 1 |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-db.md` |
| Sibling layer impl docs | `docs/implementations/018-client-portal-integration-be.md` (Backend), `docs/implementations/018-client-portal-integration-fe.md` (client-frontend), `docs/implementations/018-client-portal-integration-admin-fe.md` (admin-frontend) |
| Builds on | Migration `fa66b2f3aee6` (0025_transaction_details) — current head. No upstream layer (this is Layer 1 of 4). |

---

## 2. Branch & session contract

- **Branch:** `client-portal-integration-db`, cut from parent `client-portal-integration` (captured via `git rev-parse --abbrev-ref HEAD` at session start — confirmed the current branch).
- **Isolation:** implementable in a separate session on its own branch, in parallel with the BE/FE/admin-FE layer branches, provided the preconditions below hold. Shares state with sibling layers only through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] Migration `fa66b2f3aee6` (0025_transaction_details) is the current Alembic head on `main`/the parent branch (`alembic heads` → `fa66b2f3aee6 (head)`).
  - [ ] The frozen seam in the proposal §4.1/§4.2 is agreed — §7 below is a verbatim copy, not a negotiation with a sibling layer.
- **Read-first inventory:**
  - `api-backend/app/models/users.py` — `ClientProfile` (B-2 target; column order, index convention). Also the B-6 target: seven nullable RM relationship-management columns, added immediately after `occupation`.
  - `api-backend/app/models/onboarding.py` — `OnboardingDocument` (B-4 target column, already exists as nullable), and the file where the new `ClientTicket` model + `TicketKind`/`TicketStatus` enums are added (B-1), following the exact `SAEnum(..., native_enum=False, length=N, values_callable=lambda e: [m.value for m in e])` convention already used by every enum column in this file (`OnboardingKind`, `OnboardingStatus`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`).
  - `api-backend/app/models/pc.py` — `Model` (B-5 target column, alongside `model_size`).
  - `api-backend/app/models/post_trade_allocation.py` — `ClientPortfolio` (B-3: documented invariant, no schema change).
  - `api-backend/app/libs/onboarding/compliance_doc_config.py` — confirms the exact `doc_type` key (`"investment_policy_statement"`) used in the B-4 backfill's `WHERE` clause.
  - `api-backend/alembic/versions/fa66b2f3aee6_0025_transaction_details.py` — confirms the current head and the required `down_revision` for the new migration.
  - `api-backend/alembic/versions/e183474e6b91_0018_client_onboarding.py` — precedent for a migration that both creates tables and includes a data-touching self-assertion (`_require` helper) — the closest prior art for this layer's mixed create+backfill revision.
  - `api-backend/alembic/versions/a4d8e2f6b391_0024_onboarding_document_upload_tracking.py`, `9c4a1e7d2b3f_0023_allotment_redemption_expected_cash_out.py` — precedent for small additive `op.add_column` revisions (docstring style, `Union[str, Sequence[str], None]` typing).
- **Hand-off / exit signal:** DB-1 through DB-6 committed on `client-portal-integration-db`; the single new Alembic revision applies cleanly (`upgrade`/`downgrade`/`upgrade`) on top of `fa66b2f3aee6` against a scratch DB; unit tests (§8) green; PR opened against `client-portal-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- ORM style: SQLAlchemy 2.0 `Mapped`/`mapped_column`, as used throughout `api-backend/app/models/*.py`.
- Enum columns are **never** `native_enum=True`. Every string-backed enum column in this codebase follows one fixed shape: `SAEnum(<PyEnum>, native_enum=False, length=<N>, values_callable=lambda e: [m.value for m in e])`. This persists/reads by enum **value** (lowercase strings — `"new"`, `"allotment"`, …), not member name, matching the convention documented inline on `User.portal` (`app/models/users.py:38-47`) and repeated verbatim on `OnboardingKind`, `OnboardingStatus`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`. `TicketKind`/`TicketStatus` (DB-1) follow this exactly — deviating here is the specific mistake this codebase's own comments warn against.
- Migration-file columns for an enum are plain `sa.String(<N>)`, never `sa.Enum(...)` — the ORM layer owns the enum type; the migration only owns the underlying `VARCHAR`. Every existing enum-backed table (`client_onboardings.kind/status`, `onboarding_documents.status`, `client_allotment_redemptions.kind/status`) follows this split, and DB-1 (`client_tickets.kind/status`) does too.
- New tables/columns are added to the domain-relevant existing model file, immediately after the table/section they relate to, rather than a new module — `onboarding.py` already owns `client_onboardings`/`onboarding_documents`/`client_allotment_redemptions`/`transaction_details`/`client_events`; `client_tickets` (a client-raised request, adjacent in concept to both `client_allotment_redemptions` and `client_events`) is appended to the same file, at the end, in its own commented section mirroring the existing `# --------- DB-N — <table> ---------` headers.
- Migrations live under `api-backend/alembic/versions/`, one file per revision, named `<revision>_<NNNN>_<slug>.py`.
- **Revision IDs are random hex, never hand-invented.** Generated for this layer with:
  ```bash
  python -c "import secrets; print(secrets.token_hex(6))"
  ```
  → `a9317a31b484` (used below).
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be `"fa66b2f3aee6"` — the current, sole Alembic head. Verify with `alembic heads` before authoring the revision file; if a sibling branch has since added a new head, rebase against that instead of guessing.
- **Money/quantity precision:** `Numeric(28, 10)` is the house convention for any currency or multiplier value (`client_allotment_redemptions.multiplier`, `models.model_size`, `transaction_details.settlement_amount`, …). `client_tickets.amount`/`.multiplier` and `models.model_limit` follow it.
- **Data-mutating migrations self-assert.** A revision that writes to an existing table's rows (not just adds a nullable column) includes a pre- and/or post-condition check that raises `RuntimeError` rather than leaving a half-migrated schema — the pattern established in `e183474e6b91` (0018)'s `_require` helper. This revision's B-4 backfill uses the same pattern.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** DB-1…DB-6 are six logically-scoped changes, but they share exactly one Alembic revision (per the proposal's summary: "B-1, B-2, B-4, B-5 and B-6 land in **one** Alembic revision") plus one independent, code-only documentation change (DB-3). The revision is authored and reviewed as a single commit; DB-3 (a comment, no schema/behavior change) can be its own commit and is fully independent of it.
- **Every unit is independently revertible.** DB-3 reverts alone (it is a comment). Within the single migration, `downgrade()` reverses every one of DB-1/DB-2/DB-4/DB-5/DB-6 in one step — see §9 for why they are not split into separate revisions (the proposal treats them as one deploy unit).
- **Additive & backward-compatible first.** DB-1, DB-2, DB-5, DB-6 are pure additive schema (`CREATE TABLE`, nullable `ADD COLUMN`s — nine of them total across DB-2/DB-5/DB-6). DB-4 is additive in the sense that it only ever moves a column from `NULL` to a value on rows matching a narrow, already-`NULL` filter — no existing non-NULL value is ever touched. The branch is deployable (migratable) at every commit.
- **Gates before merge** (must pass in CI, in this order): `lint → format → type-check → unit tests (§8) → build`. Exact commands for this layer (confirmed present in `api-backend/pyproject.toml`: `[tool.ruff]` — note `exclude = ["alembic", ".venv", "pc_storage"]`, so the migration file itself is not ruff-checked; `[tool.pytest.ini_options]`; `[tool.mypy]` — note `exclude = "alembic"`, same carve-out):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
  The model-file changes (`app/models/*.py`) are fully covered by all four gates; the migration file itself is covered by `pytest -q` (§8) only, per the `pyproject.toml` excludes above — this is the existing house convention, not a gap introduced here.
- **No secrets, no manual steps in the merge path.** Applying the migration to the live `portal` DB is a human-owned gate, called out in the execution schedule and in the proposal's own "Human gate(s)" — never silently baked into a unit or run against `portal` from an agent session.
- **Reversibility documented** (§9): additive-up; the down-step is lossy for `client_tickets` and the two new columns' values — documented honestly, not hidden.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
api-backend/app/models/users.py                     # MODIFY: ClientProfile += occupation (B-2), += 7 RM relationship-management columns (B-6)
api-backend/app/models/onboarding.py                # MODIFY: += TicketKind, TicketStatus, ClientTicket (B-1)
api-backend/app/models/pc.py                         # MODIFY: Model += model_limit (B-5)
api-backend/app/models/post_trade_allocation.py      # MODIFY: ClientPortfolio += invariant comment, no schema change (B-3)
api-backend/alembic/versions/
  fa66b2f3aee6_0025_transaction_details.py             # existing head, unchanged
  a9317a31b484_0026_client_portal_integration.py         # NEW — this layer's single revision (B-1, B-2, B-4, B-5)
```

**Dependency direction:** the new Alembic revision depends only on `fa66b2f3aee6` (down_revision). `ClientTicket` has one-directional FKs to `users.id`, `users.firebase_uid`, and `models.id` — none of those tables need a reciprocal ORM `relationship()` for this proposal's scope; the Backend layer looks up tickets by `user_id` / `assigned_rm_uid` filters, not via traversal. `ClientProfile.occupation` and `Model.model_limit` are leaf columns with no dependents. The B-4 backfill reads/writes `onboarding_documents` only, using its own existing columns (`reviewed_at`, `created_at`, `doc_type`, `status`, `expires_at`) — it adds no new column.

**External seams:** creates `client_tickets`; widens `client_profiles` by nine nullable columns total (`occupation`, `date_of_birth` + the seven B-6 relationship-management fields) and `models` by one nullable column; backfills `onboarding_documents.expires_at` on a narrow, already-NULL slice of rows; documents (no code) the `client_portfolios` missing-row invariant. Exposes the seam-relevant surfaces (`client_tickets`, `occupation`, `date_of_birth`, `model_limit`, the `expires_at` backfill) to the Backend layer per the frozen seam (§7) — **B-6's seven columns are explicitly NOT part of that seam** (see DB-6 below), and **`model_limit` is part of the seam as a read-only, permanently-`NULL`-for-now field** (no writer anywhere in this proposal — see DB-5 below and proposal Non-Goals). Reads nothing from Backend/Frontend.

---

## 5. Modules (level 2 of 3)

### 5.1 `client_profiles model` (`app/models/users.py`)
- **Responsibility:** ORM definition of `client_profiles` — widened to carry the client's occupation and date of birth (both client-facing, DB-2) and, separately, seven RM-only relationship-management fields (not client-facing, DB-6).
- **Files:** `api-backend/app/models/users.py`.
- **Public surface:** `ClientProfile.occupation`/`.date_of_birth` — imported by the Backend layer's `ClientProfileDTO` projection; `date_of_birth` is read-only end-to-end (D-11) — imported for the GET projection only, never accepted on the PATCH path. `ClientProfile.anniversary`/`.spouse_name`/`.children`/`.personal_interests`/`.communication_preferences`/`.gift_hospitality_preferences`/`.relationship_notes` — **no current public surface**; per proposal B-6/Non-Goals, these are storage only in this proposal and must not be added to `ClientProfileDTO`, `ClientProfilePatch`, or any client-facing projection. A future RM-facing proposal is the only sanctioned consumer.
- **Owns features:** DB-2, DB-6.

### 5.2 `onboarding models` (`app/models/onboarding.py`)
- **Responsibility:** ORM definitions for onboarding-adjacent tables — extended with the client-raised-ticket table and its two enums.
- **Files:** `api-backend/app/models/onboarding.py`.
- **Public surface:** `TicketKind`, `TicketStatus`, `ClientTicket` — imported by the Backend layer's `client_portal` package (router/service/repository/schemas) for both the `/client/tickets` and `/rm/tickets*` routes.
- **Owns features:** DB-1.

### 5.3 `pc models` (`app/models/pc.py`)
- **Responsibility:** ORM definitions for PC-workspace tables — `Model` widened with an independent, PC-authored business cap.
- **Files:** `api-backend/app/models/pc.py`.
- **Public surface:** `Model.model_limit` — imported by the Backend layer's `client_portal` package (`RecommendedModelDTO`/`PositionDTO` projections) **only**. Per proposal Non-Goals, the existing `trade_models` package (`ModelCreate`/`ModelUpdate`/`ModelOut`) is untouched by this proposal — `model_limit` is not added to it, and no Backend or admin-frontend work exists anywhere to write this column.
- **Owns features:** DB-5.

### 5.4 `post_trade_allocation models` (`app/models/post_trade_allocation.py`)
- **Responsibility:** ORM definitions for allocation/portfolio tables — no schema change in this layer, but the `client_portfolios` missing-row invariant is now written down where the model lives, not only in the proposal.
- **Files:** `api-backend/app/models/post_trade_allocation.py`.
- **Public surface:** unchanged (`ClientPortfolio` gains a docstring/comment only).
- **Owns features:** DB-3.

### 5.5 `alembic migration` (`api-backend/alembic/versions/`)
- **Responsibility:** the single schema-and-data migration revision that brings a live/scratch DB from `fa66b2f3aee6` to include `client_tickets`, `client_profiles.occupation` + the seven B-6 columns, `models.model_limit`, and the `onboarding_documents.expires_at` backfill.
- **Files:** `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`.
- **Public surface:** `upgrade()` / `downgrade()`, `revision = "a9317a31b484"`, `down_revision = "fa66b2f3aee6"`.
- **Owns features:** DB-1, DB-2, DB-4, DB-5, DB-6.

---

## 6. Features (level 3 of 3 — the work units)

### DB-1 — Create `client_tickets` table + `TicketKind`/`TicketStatus` enums (Yes — user req.)

- **Proposal ref:** § "Layer 1 — Database" B-1; § 4.1 (frozen seam — `TicketKind`, `TicketStatus`, `client_tickets` column map)
- **Module:** 5.2 `onboarding models`, 5.5 `alembic migration`
- **Files:** `modify: api-backend/app/models/onboarding.py`, `modify (same revision file as DB-2/DB-4/DB-5): api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`
- **Dependencies:** none — parallel-safe within this layer; shares an Alembic revision with DB-2/DB-4/DB-5 (see §9 for why).

**Contract (required code — ORM):**

```python
# app/models/onboarding.py — appended at the end of the file, in its own
# section mirroring the existing "# --------- DB-N — <table> ---------" headers

# ---------------------------------------------------------------------------
# DB-1 (proposal 018) — client_tickets
# ---------------------------------------------------------------------------


class TicketKind(str, enum.Enum):
    ALLOTMENT = "allotment"
    REDEMPTION = "redemption"
    OTHER = "other"


class TicketStatus(str, enum.Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    REPLIED = "replied"
    CLOSED = "closed"
    DECLINED = "declined"


class ClientTicket(Base):
    __tablename__ = "client_tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    # Denormalised snapshot of client_profiles.assigned_rm_uid taken at raise
    # time -- deliberately NOT a live FK lookup. client_profiles.assigned_rm_uid
    # can be reassigned; an inbox must not silently move a historical ticket
    # to a different RM when that happens (proposal 018, B-1). NULL when the
    # client had no RM assigned at raise time.
    assigned_rm_uid: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("users.firebase_uid"), nullable=True
    )
    reference: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    kind: Mapped[TicketKind] = mapped_column(
        SAEnum(
            TicketKind,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[TicketStatus] = mapped_column(
        SAEnum(
            TicketStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=TicketStatus.NEW.value,
    )
    model_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=True
    )
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    multiplier: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="USD")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    responded_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    response_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_client_tickets_rm_status", "assigned_rm_uid", "status"),
    )
```

No new imports are required in `onboarding.py` — `String`, `Text`, `Numeric`, `DateTime`, `ForeignKey`, `Uuid`, `Index`, `SAEnum`, `func`, `Decimal`, `uuid`, `enum`, and `datetime` are already imported for the file's existing tables.

**Contract (required code — Alembic revision, `client_tickets` portion):**

```python
op.create_table(
    "client_tickets",
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
    sa.Column(
        "assigned_rm_uid",
        sa.String(length=128),
        sa.ForeignKey("users.firebase_uid"),
        nullable=True,
    ),
    sa.Column("reference", sa.String(length=32), nullable=False, unique=True),
    sa.Column("kind", sa.String(length=16), nullable=False),
    sa.Column("status", sa.String(length=16), nullable=False, server_default="new"),
    sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=True),
    sa.Column("subject", sa.String(length=255), nullable=True),
    sa.Column("category", sa.String(length=64), nullable=True),
    sa.Column("amount", sa.Numeric(precision=28, scale=10), nullable=True),
    sa.Column("multiplier", sa.Numeric(precision=28, scale=10), nullable=True),
    sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
    sa.Column("message", sa.Text(), nullable=False),
    sa.Column("responded_by", sa.String(length=128), nullable=True),
    sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("response_note", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    ),
)
op.create_index("ix_client_tickets_user_id", "client_tickets", ["user_id"])
op.create_index("ix_client_tickets_rm_status", "client_tickets", ["assigned_rm_uid", "status"])
```

**Behavior / invariants:**
- `kind`/`status` persist as the lowercase string **values** (`"allotment"`, `"new"`, …), never the Python member names — the `values_callable` convention; a round-trip through the ORM must read back the same string that was written.
- `reference` is `UNIQUE` + `NOT NULL` — the Backend layer generates it (`"REQ-" + uuid hex[:6].upper()`) before insert; a collision raises `IntegrityError` (astronomically unlikely at this hex length, same risk profile as `client_allotment_redemptions.reference`).
- `model_id` is nullable — `NULL` for `kind == OTHER`; the Backend layer enforces "required unless OTHER" as a Pydantic validator (Backend C-11), not a DB constraint, matching the house pattern of app-level cross-field validation.
- Exactly two indexes exist on this table: `ix_client_tickets_user_id` (single column, backs the client's own "my requests" query) and `ix_client_tickets_rm_status` (composite, backs the RM inbox's only query shape — filter by `assigned_rm_uid`, optionally narrow by `status`). No other index is added.
- Purely additive — no existing table, column, row, or constraint is touched by this unit.

**Done when:** `alembic upgrade head` creates `client_tickets` with the 18 columns/types/nullability above, the three FKs (`users.id`, `users.firebase_uid`, `models.id`), the `reference` UNIQUE constraint, and both indexes; a round-trip insert/read through the `ClientTicket` ORM class returns `kind`/`status` as the exact lowercase value strings; `alembic downgrade -1` drops the table entirely.

---

### DB-2 — `client_profiles.occupation` + `.date_of_birth` nullable columns (Accepted)

- **Proposal ref:** § "Layer 1 — Database" B-2; § 4.1 (`ClientProfileDTO.occupation`/`.date_of_birth`, `ClientProfilePatch.occupation`); § "Design decisions (settled)" D-11 (why `date_of_birth` is read-only)
- **Module:** 5.1 `client_profiles model`, 5.5 `alembic migration`
- **Files:** `modify: api-backend/app/models/users.py`, `modify (same revision as DB-1/DB-4/DB-5/DB-6): api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`
- **Dependencies:** none — parallel-safe.

**Contract (required code — ORM):**

```python
# app/models/users.py — ClientProfile, added immediately after ib_account
# (DB-6's seven columns land immediately after date_of_birth — see DB-6 below)

    ib_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)  # proposal 018, B-2
    # Read-only on the wire (D-11) -- present on ClientProfileDTO, deliberately
    # absent from ClientProfilePatch; a client cannot self-edit a fact
    # Compliance has already verified against an identity document.
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)  # proposal 018, B-2
```

`date` must be added to the existing `from datetime import datetime` import (→ `from datetime import date, datetime`), and `Date` to the existing `from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, String, Text, Uuid, func` import (→ adds `Date`). DB-6 (below) needs the same two names — since DB-2 lands first in file order, DB-6's contract does not repeat this import edit; it is done once, here.

**Contract (required code — Alembic revision):**

```python
op.add_column(
    "client_profiles",
    sa.Column("occupation", sa.String(length=255), nullable=True),
)
op.add_column(
    "client_profiles",
    sa.Column("date_of_birth", sa.Date(), nullable=True),
)
```

**Behavior / invariants:**
- Purely additive; existing rows read `NULL` for both columns → the Frontend renders `—`, per proposal B-2.
- **No `company` column is added anywhere** — an earlier draft of this proposal included one; it was reverted by the user, and the final proposal explicitly states "Company is dropped entirely — no column, no DTO field, no form input." This unit adds `occupation` and `date_of_birth` only.
- Neither column carries an index — both are display/edit fields, never filtered or joined on (unlike `ib_account`, which is indexed because the allocation-matrix path looks accounts up by it).
- `date_of_birth` is a plain `Date` (no time component, no timezone) — a birth date has neither.
- **`date_of_birth` is read-only at the Backend layer, not at this one.** The DB layer places no constraint preventing a write to this column — `ClientProfilePatch`'s exclusion of it (§7, per D-11) is an application-layer rule, enforced by the Backend layer's schema (`extra="forbid"` → 422), not a DB trigger or check constraint. This unit's job is only to provide the nullable column.

**Done when:** `alembic upgrade head` adds `client_profiles.occupation` as `VARCHAR(255) NULL` and `client_profiles.date_of_birth` as `DATE NULL`; every pre-existing row reads `NULL` for both; `alembic downgrade -1` drops both columns (any values entered between upgrade and downgrade are lost — see §9).

---

### DB-3 — Document the `client_portfolios` missing-row invariant (Yes)

- **Proposal ref:** § "Layer 1 — Database" B-3
- **Module:** 5.4 `post_trade_allocation models`
- **Files:** `modify: api-backend/app/models/post_trade_allocation.py`
- **Dependencies:** none — parallel-safe; no migration, no schema change, independently revertible from DB-1/DB-2/DB-4/DB-5/DB-6's shared revision.

**Contract (required code — documentation comment, no schema change):**

```python
# app/models/post_trade_allocation.py — comment added immediately above
# the existing ClientPortfolio class; no column, index, or constraint changes.

# Invariant (proposal 018, B-3): a row here is NOT guaranteed to exist for
# every client. Rows are seeded at intake by 014 C-9
# (app/libs/onboarding/repository.py); clients onboarded before that flow
# has none. The Backend layer MUST treat a missing row as
# cash_deposit = amount_in_trade = previous_amount_in_trade = 0,
# updated_at = None -- never a 404. Backfilling zero rows for pre-existing
# clients is explicitly rejected: it would write rows the intake flow itself
# expects to create, and would misrepresent "never onboarded through 014"
# as "onboarded with a zero balance".
class ClientPortfolio(Base):
    __tablename__ = "client_portfolios"
```

**Behavior / invariants:**
- No schema object (table, column, index, constraint) changes. This unit is documentation only, placed where a future reader of the model file — not just the proposal — will see it.
- The invariant itself is enforced by the **Backend** layer (its `GET /api/client/portfolio` must special-case a missing row rather than 404 or crash); this DB-layer unit's job is only to record the fact and its rationale next to the table it concerns, so the Backend layer's implementation doc (§7.2 "assumes from the other side") can point back at a durable source.
- `client_portfolios` is never backfilled with zero-rows by this or any DB-layer unit.

**Done when:** the comment is present verbatim above `ClientPortfolio` in `app/models/post_trade_allocation.py`; `git diff` for this unit touches no schema-affecting line (no `mapped_column`, no `__table_args__`, no migration file).

---

### DB-4 — Backfill `onboarding_documents.expires_at` for already-verified IPS rows (Yes)

- **Proposal ref:** § "Layer 1 — Database" B-4 (4-step migration plan); § "Design decisions (settled)" — Open questions, Resolved, "Backfill baseline (was Q-1)"
- **Module:** 5.5 `alembic migration`
- **Files:** `modify (same revision as DB-1/DB-2/DB-5): api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`. No model file changes — `OnboardingDocument.expires_at` already exists (`app/models/onboarding.py:164`, nullable, added by revision `e183474e6b91`/0018); this unit only ever writes row **data**, never a schema object.
- **Dependencies:** **Backend C-6** (the `set_verdict` write path that starts writing `expires_at` for future verdicts) must land **with or before** this migration is applied to any shared DB — per the proposal's own migration-plan step 1: "Backend C-6 must be deployed with or before this revision, otherwise newly-verified documents still get no `expires_at` and the backfill is a one-time patch over a permanent hole." This is a **deploy-ordering precondition** on the Backend layer's work, not something this DB-layer unit implements — the DB layer does not write `set_verdict`.

**Contract (required code — Alembic revision):**

```python
# Step 2 of the proposal's migration plan, verbatim SQL:
op.execute(
    "UPDATE onboarding_documents "
    "SET expires_at = COALESCE(reviewed_at, created_at) + INTERVAL 365 DAY "
    "WHERE doc_type = 'investment_policy_statement' "
    "AND status = 'verified' AND expires_at IS NULL"
)

# Downgrade — step 4 of the proposal's migration plan, verbatim SQL:
op.execute(
    "UPDATE onboarding_documents SET expires_at = NULL "
    "WHERE doc_type = 'investment_policy_statement'"
)
```

**Behavior / invariants (the proposal's 4-step plan, restated for this unit):**
1. **Deploy-order precondition:** Backend C-6 ships with or before this revision (see Dependencies above) — otherwise the backfill is a one-time patch over a hole that immediately reopens for every newly-verified document.
2. The `UPDATE` anchors each backfilled row to its **true review date** — `COALESCE(reviewed_at, created_at) + 365 days` — not `NOW()`. There is no amnesty/`NOW()`-based variant. Per the proposal's "Open questions → Resolved → Backfill baseline (was Q-1)": `onboarding_documents` was introduced by revision `e183474e6b91` (0018, proposal 013) on 2026-07-19, nine days before this proposal (2026-07-28), so **every currently-verified row was reviewed within that nine-day window** — nothing is old enough to land inside the renewal scheduler's 30-day lookahead on day one. Cited, not re-derived: **the backfill triggers zero renewals on the next scheduler tick.** This is also restated in the proposal's human-gate note ("B-4's backfill lands every existing verified row ~356–365 days out").
3. Rows in any status other than `verified` keep `expires_at = NULL` — an unverified document has no review clock to start. The `WHERE` clause's `AND status = 'verified'` is what enforces this; it is not a separate step.
4. **Down is exact.** The column held `NULL` on every row before this revision (B-4's own premise: "nothing in the codebase ever writes it" today), so `UPDATE … SET expires_at = NULL WHERE doc_type = 'investment_policy_statement'` is a lossless, exact reversal — `reviewed_at` itself is never read from or written to by the downgrade.
- Rows for any other `doc_type` are never touched by either the upgrade or the downgrade — the migration includes a self-assertion (below) that aborts if this is ever violated.
- This is the **only** row-data mutation in the revision; DB-1/DB-2/DB-5 are schema-only (`CREATE TABLE` / `ADD COLUMN`).

**Contract (required code — self-assertions, house convention per `e183474e6b91`/0018):**

```python
def _require(condition: bool, message: str) -> None:
    """Abort the migration rather than leave a half-migrated schema
    (house convention — see e183474e6b91 / 0018_client_onboarding)."""
    if not condition:
        raise RuntimeError(f"0026 self-assertion failed: {message}")


# --- inside upgrade(), before any DDL: -------------------------------------
conn = op.get_bind()
pre_nonnull = conn.execute(
    sa.text("SELECT COUNT(*) FROM onboarding_documents WHERE expires_at IS NOT NULL")
).scalar()
_require(
    pre_nonnull == 0,
    "expires_at was expected NULL on every existing row before the B-4 backfill",
)

# --- inside upgrade(), immediately after the UPDATE: -----------------------
other_touched = conn.execute(
    sa.text(
        "SELECT COUNT(*) FROM onboarding_documents "
        "WHERE doc_type != 'investment_policy_statement' AND expires_at IS NOT NULL"
    )
).scalar()
_require(
    other_touched == 0,
    "backfill wrote expires_at on a doc_type other than investment_policy_statement",
)
backfilled = conn.execute(
    sa.text(
        "SELECT COUNT(*) FROM onboarding_documents "
        "WHERE doc_type = 'investment_policy_statement' AND expires_at IS NOT NULL"
    )
).scalar()
verified_ips_total = conn.execute(
    sa.text(
        "SELECT COUNT(*) FROM onboarding_documents "
        "WHERE doc_type = 'investment_policy_statement' AND status = 'verified'"
    )
).scalar()
_require(
    backfilled == verified_ips_total,
    "backfill did not cover every verified investment_policy_statement row",
)
```

**Done when:** on a scratch DB seeded per the proposal's Execution & verification step 1 (three synthetic IPS rows: verified-recently, verified-over-a-year-ago, not-yet-verified), `alembic upgrade head` sets `expires_at` to `reviewed_at/created_at + 365d` on the two verified rows and leaves it `NULL` on the not-yet-verified row; `alembic downgrade -1` returns all three to `NULL` exactly; no row of any other `doc_type` or `status` is touched in either direction.

---

### DB-5 — `models.model_limit` nullable column (Yes — user req.)

- **Proposal ref:** § "Layer 1 — Database" B-5; § 4.1 (`PositionDTO.model_limit`, `RecommendedModelDTO.model_limit`); § "3. Non-Goals" ("No `model_limit` authoring logic, API, or admin UI"); § "Design decisions (settled)" D-9
- **Module:** 5.3 `pc models`, 5.5 `alembic migration`
- **Files:** `modify: api-backend/app/models/pc.py`, `modify (same revision as DB-1/DB-2/DB-4/DB-6): api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`
- **Dependencies:** none. **This unit has no downstream writer, deliberately** — there is no Backend or admin-frontend unit anywhere in this proposal (in any layer's impl doc) that populates this column. This is not a missing dependency to chase; it is the scope boundary stated in the proposal's Non-Goals.

**Contract (required code — ORM):**

```python
# app/models/pc.py — Model, added immediately after model_size

    model_size: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    # Risk-management business cap on the model — deliberately NOT derived
    # from model_size. model_size prices ONE UNIT and is load-bearing
    # allocation-matrix arithmetic (SUM(cs.multiplier * m.model_size), frozen
    # into allocation_model_snapshots at confirm time); model_limit is an
    # unrelated business fact that merely shares a currency unit (D-9,
    # proposal 018 B-5). PLACEHOLDER COLUMN ONLY (proposal 018 Non-Goals): no
    # form, no route, no service write path exists for this anywhere in the
    # codebase as of this proposal -- the exact rule for setting it is
    # pending a risk-management SOP from stakeholders. Stays NULL forever
    # until a future, separate proposal builds an authoring path.
    model_limit: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    category: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
```

**Contract (required code — Alembic revision):**

```python
op.add_column(
    "models",
    sa.Column("model_limit", sa.Numeric(precision=28, scale=10), nullable=True),
)
```

**Behavior / invariants:**
- Purely additive; every existing `models` row reads `NULL` after upgrade. **No backfill** — the value this column will eventually hold is defined by a risk-management SOP that does not exist yet, so there is nothing to infer even in principle. This is a stronger statement than DB-4's "nobody can infer it for existing clients" — here nobody could infer it for a *newly created* model either, because the rule itself is undefined.
- `model_limit` is **not** referenced by, and must not change the output of, the existing allocation-matrix fund query (`app/libs/allocation_matrix/repository.py:180`, `COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund`) — that query selects `model_size` only. Adding a sibling nullable column to the same table cannot alter a query that never selects `SELECT *` and never joins on it; §8 pins this with an explicit before/after-migration query-equality test per the proposal's Execution & verification step 1 ("B-5 is verified by asserting the existing allocation-matrix fund query is byte-identical before and after").
- `model_limit` participates in no calculation anywhere in this layer or in the frozen seam beyond being echoed as-is (`PositionDTO.model_limit`, `RecommendedModelDTO.model_limit`) — both of which read `NULL` on every row for the lifetime of this proposal.
- **No PC/admin exposure of any kind.** `app/libs/trade_models/{schemas.py,router.py,service.py}` (`ModelCreate`/`ModelUpdate`/`ModelOut`, the PC model routes) are untouched by this proposal. A reviewer finding `model_limit` referenced in any of those files, or in `admin-frontend/components/pc/model-management/*`, or in `admin-frontend/lib/pc/types.ts`, should treat it as a scope violation against this proposal, not a completion of DB-5.

**Done when:** `alembic upgrade head` adds `models.model_limit` as `NUMERIC(28,10) NULL`; every pre-existing row reads `NULL`; the allocation-matrix fund query's generated SQL and result set are byte-identical before and after the migration on the same fixture data; `alembic downgrade -1` drops the column (there is nothing to lose — no code path in this proposal ever writes a non-NULL value to it); `rg "model_limit"` across `app/libs/trade_models/**` and `admin-frontend/**` returns nothing (proves no premature authoring surface was built).

---

### DB-6 — Seven nullable RM relationship-management columns on `client_profiles` (Yes — user req.)

- **Proposal ref:** § "Layer 1 — Database" B-6; § "3. Non-Goals" ("No RM relationship-management API/UI") — **this unit is DB-only; it is not part of the frozen seam (§7) and adds nothing to §4.1**
- **Module:** 5.1 `client_profiles model`, 5.5 `alembic migration`
- **Files:** `modify: api-backend/app/models/users.py`, `modify (same revision as DB-1/DB-2/DB-4/DB-5): api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py`
- **Dependencies:** none — parallel-safe.

**Contract (required code — ORM):**

```python
# app/models/users.py — ClientProfile, added immediately after date_of_birth (DB-2)

    # RM relationship-management notes -- free text, all nullable, no business
    # logic reads these. anniversary is a plain Date (recurring by month/day,
    # not tied to a specific year's event); the rest are Text since they're
    # free-form (e.g. "children" is names AND ages together, not a list).
    # DB-only (proposal 018, B-6): NOT on ClientProfileDTO/ClientProfilePatch
    # or any client-facing surface -- a client must never read or write their
    # own RM's notes about them. Exposing these is a future, separate proposal.
    anniversary: Mapped[date | None] = mapped_column(Date, nullable=True)
    spouse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    children: Mapped[str | None] = mapped_column(Text, nullable=True)
    personal_interests: Mapped[str | None] = mapped_column(Text, nullable=True)
    communication_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    gift_hospitality_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    relationship_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`date`/`Date` are already imported by DB-2's `date_of_birth` column (above) — no further import change needed here. `String`/`Text` are already imported.

**Contract (required code — Alembic revision):**

```python
op.add_column("client_profiles", sa.Column("anniversary", sa.Date(), nullable=True))
op.add_column("client_profiles", sa.Column("spouse_name", sa.String(length=255), nullable=True))
op.add_column("client_profiles", sa.Column("children", sa.Text(), nullable=True))
op.add_column("client_profiles", sa.Column("personal_interests", sa.Text(), nullable=True))
op.add_column(
    "client_profiles", sa.Column("communication_preferences", sa.Text(), nullable=True)
)
op.add_column(
    "client_profiles", sa.Column("gift_hospitality_preferences", sa.Text(), nullable=True)
)
op.add_column("client_profiles", sa.Column("relationship_notes", sa.Text(), nullable=True))
```

Downgrade drops the same seven columns, in reverse order, as a sibling block inside the same revision's `downgrade()` alongside DB-1/DB-2/DB-4/DB-5's reversal.

**Behavior / invariants:**
- Purely additive; existing rows read `NULL` for all seven columns → any future consumer must render that as an empty/absent state, never a placeholder value. **No backfill** — none of these seven facts can be inferred for an existing client.
- No index on any of the seven columns — none is filtered, joined, or searched on by anything in this proposal.
- **This unit's data must never cross into the frozen seam (§7).** `ClientProfileDTO`, `ClientProfilePatch`, and every other DTO in §4.1 are unchanged by DB-6 — a Backend-layer session reading only this doc's §7 will not see these columns, and that is correct: they are not part of what this proposal's Backend layer builds. A reviewer finding any of these seven column names inside a schema, route, or test belonging to the Backend/Frontend layers of *this* proposal should treat it as a scope violation, not a completion.
- `children` is deliberately a single free-text column, not a related table or a JSON list — proposal B-6 is explicit that no structured modeling is wanted here ("names and ages together, free text — not a list/relation").

**Done when:** `alembic upgrade head` adds all seven columns to `client_profiles` with the exact types/nullability above; every pre-existing row reads `NULL` on all seven; `alembic downgrade -1` drops all seven cleanly; `rg` for any of the seven column names outside `app/models/users.py` and this migration file returns nothing (proves no premature seam leakage).

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

#### 4.1 The wire contract

All routes are mounted under `/api`. All `/client/*` routes take **no subject id** — the subject is `get_current_client_user`. All `/rm/*` routes require `Action.CLIENT_VIEW` (existing dependency) and are scoped to `client_profiles.assigned_rm_uid == caller.firebase_uid`, except `ADMIN`, which sees all.

```python
# ---------- Profile ----------
GET   /api/client/profile                       -> ClientProfileDTO          {200, 401, 404}
PATCH /api/client/profile                       -> ClientProfileDTO          {200, 401, 422}

class RmContactDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None                 # admin_profiles.phone_number

class ClientProfileDTO(BaseModel):
    name: str | None                  # client_profiles.name
    email: str | None                 # users.email          (read-only)
    phone: str | None                 # client_profiles.primary_phone (read-only)
    occupation: str | None            # client_profiles.occupation  (NEW, DB B-2)
    date_of_birth: date | None        # client_profiles.date_of_birth (NEW, DB B-2, read-only — see D-11)
    address: str | None               # client_profiles.address
    country_of_residence: str | None
    ib_account: str | None
    client_ref: str                   # "MEGA-0481", formatted from user_id (existing helper)
    assigned_rm: RmContactDTO | None

class ClientProfilePatch(BaseModel):  # every field optional; unset = unchanged
    name: str | None = None
    occupation: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    # email / phone / date_of_birth are NOT patchable here — 422 if present.

# ---------- Portfolio ----------
GET /api/client/portfolio                       -> PortfolioDTO              {200, 401}
GET /api/client/portfolio/history?months=6      -> list[HistoryPointDTO]     {200, 401, 422}

class PositionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str                   # models.name
    units: float                      # client_subscriptions.multiplier
    amount: float                     # units * models.model_size
    model_limit: float | None         # models.model_limit  (NEW column, DB B-5)
    #                                 ^ a DISTINCT attribute, not model_size:
    #                                   model_size prices a unit, model_limit caps the model.
    ib_account: str | None            # client_profiles.ib_account (per-client, NOT per-model)

class PortfolioDTO(BaseModel):
    cash_deposit: float               # client_portfolios.cash_deposit        (0 if no row)
    amount_in_trade: float            # client_portfolios.amount_in_trade
    previous_amount_in_trade: float
    total_value: float                # cash_deposit + amount_in_trade
    change_amount: float              # amount_in_trade - previous_amount_in_trade
    change_pct: float | None          # None when previous == 0 (no divide-by-zero)
    updated_at: datetime | None
    positions: list[PositionDTO]      # one per client_subscriptions row, name-sorted

class HistoryPointDTO(BaseModel):
    month: str                        # "YYYY-MM" — one point per CALENDAR MONTH, not per run
    total: float                      # cumulative amount_in_trade at month end
    per_model: dict[str, float]       # model_name -> cumulative allocated at month end
    # Every month in the window is present, including months with no allocation
    # run: those carry the previous month's cumulative forward (a flat segment,
    # never a gap). Same key set in `per_model` on every point, so the chart's
    # series count is stable across the window.

# ---------- Models ----------
GET /api/client/models/recommended              -> list[RecommendedModelDTO] {200, 401}
GET /api/client/models/{model_id}/material      -> file stream               {200, 401, 404}

class RecommendedModelDTO(BaseModel):
    model_id: uuid.UUID
    name: str
    category: list[str] | None        # models.category (JSON) — kept: a real model attribute
    model_limit: float | None         # models.model_limit (NEW column, DB B-5)
    subscription_redemption: str | None
    description: str | None
    has_material: bool                # a model_materials row exists
    # NOTE: no country, no sector, no risk_level, no min_investment — none exist as columns.

# ---------- Documents (KYC + firm-issued files) ----------
GET  /api/client/kyc                            -> KycPanelDTO               {200, 401}
POST /api/client/kyc/{doc_type}   (multipart)   -> DocumentDTO               {200, 401, 403, 409, 413, 415}
# 403 = upload window not yet open (Backend C-8). 409 = the existing
# OnboardingService guards (cycle not editable / doc not re-uploadable), raised
# by the shared method, not re-implemented here.
GET  /api/client/documents/{scope}              -> list[StoredFileDTO]       {200, 401, 422}
GET  /api/client/documents/{scope}/download?key=-> file stream               {200, 401, 403, 404}
# scope ∈ {"legal", "statements"}; 422 on any other value.

class KycPanelDTO(BaseModel):
    overall: Literal["due", "processing", "verified"]   # derived, see Backend C-9
    documents: list[DocumentDTO]      # REUSED VERBATIM from app/libs/onboarding/schemas.py
    next_review_at: datetime | None   # the periodic doc's expires_at; None if never verified
    # --- renewal upload window (panel-level, not per-document: exactly one doc
    # --- is periodic today, so this does not need to be a per-row shape) -------
    renewal_doc_type: str | None      # "investment_policy_statement", or None if no periodic doc
    upload_opens_at: datetime | None  # expires_at - CLIENT_UPLOAD_WINDOW_DAYS
    can_upload: bool                  # server-computed; the FE never recomputes this
    upload_blocked_reason: Literal[
        "window_not_open", "in_review", "cycle_not_editable", "no_cycle"
    ] | None                          # None iff can_upload is True

class StoredFileDTO(BaseModel):
    key: str                          # opaque storage key; the ONLY thing the FE echoes back
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None              # legal scope: immediate sub-folder name; statements: None
    period: str | None                # statements scope: "YYYY-MM" parsed from a leading
    #                                   date token in the filename, else None -> the FE falls
    #                                   back to `modified_at`. This is the ONLY contract the
    #                                   future EoM generator has to honour (D-7).

# ---------- Requests & tickets (client side) ----------
GET  /api/client/requests                       -> list[ClientRequestDTO]    {200, 401}
POST /api/client/tickets                        -> ClientRequestDTO          {201, 401, 422}

class TicketKind(str, Enum):      ALLOTMENT="allotment"; REDEMPTION="redemption"; OTHER="other"
class TicketStatus(str, Enum):    NEW="new"; IN_PROGRESS="in_progress"; REPLIED="replied"; \
                                  CLOSED="closed"; DECLINED="declined"

class RaiseTicketReq(BaseModel):
    kind: TicketKind
    model_id: uuid.UUID | None = None     # required when kind != OTHER (422 otherwise)
    subject: str | None = None            # required when kind == OTHER (422 otherwise)
    category: str | None = None           # free text, OTHER only
    amount: Decimal | None = None
    multiplier: Decimal | None = None
    currency: str = "USD"
    message: str

class ClientRequestDTO(BaseModel):
    """One merged row for the client's request history. `source` tells the FE
    which table it came from; both render in the same table."""
    source: Literal["ticket", "allotment"]
    ref: str                          # tickets: "REQ-3F9A2C"; allotments: existing `reference`
    kind: TicketKind                  # allotment rows map AllotRdmpKind -> TicketKind
    subject: str                      # tickets: subject or model_name; allotments: model_name
    model_name: str | None
    amount: float | None              # None renders as the existing "—"
    created_at: datetime
    status: TicketStatus              # allotment rows map via Backend C-12's table

# ---------- Tickets (RM side) ----------
GET  /api/rm/tickets                            -> list[RmTicketDTO]         {200, 401, 403}
GET  /api/rm/tickets/{ref}                      -> RmTicketDTO               {200, 401, 403, 404}
POST /api/rm/tickets/{ref}/status               -> RmTicketDTO               {200, 401, 403, 404, 409}

class RmTicketStatusReq(BaseModel):
    status: TicketStatus
    note: str | None = None           # persisted to client_tickets.response_note

class RmTicketDTO(BaseModel):
    ref: str
    client_id: uuid.UUID
    client: str                       # client_profiles.name
    contact: str | None               # client_profiles.authorized_person
    email: str | None                 # users.email
    account: str | None               # client_profiles.ib_account
    model: str | None
    kind: TicketKind
    currency: str
    amount: float | None
    multiplier: float | None
    notional: float | None            # amount * multiplier; None when either is None
    subject: str | None
    message: str
    status: TicketStatus
    created_at: datetime
    responded_by: str | None
    responded_at: datetime | None
    response_note: str | None
```

**Field-name ↔ column-name map (non-obvious pairs only)**

| Wire | Column |
|---|---|
| `units` | `client_subscriptions.multiplier` |
| `model_limit` | `models.model_limit` (**not** `model_size` — see DB B-5) |
| `amount` (position) | *derived* `client_subscriptions.multiplier * models.model_size` |
| `total_value` | *derived* `client_portfolios.cash_deposit + .amount_in_trade` |
| `ref` (ticket) | `client_tickets.reference` |
| `client_ref` | *derived* from `users.id` (existing onboarding formatter) |

**Error envelope:** unchanged — FastAPI `{"detail": "..."}`; `client-frontend/lib/api/*` already unwraps `detail`.

#### 4.2 Per-layer obligations against the seam

| Layer | Contributes | Assumes |
|---|---|---|
| Database | `client_tickets` with the exact `TicketKind`/`TicketStatus` value sets in §4.1; `client_profiles.occupation`/`.date_of_birth` and `models.model_limit` nullable columns | Backend never writes a status outside the 5 values; a ticket's `assigned_rm_uid` is a snapshot and may go stale |
| Backend | Every route above at its exact path, DTO, and status codes; all derivations (`total_value`, `amount`, `notional`, status maps) computed server-side | DB B-1/B-2 present; `client_portfolios` row may be **absent** for pre-014 clients → serve zeros, never 404 |
| Frontend (client) | Consumes the DTOs verbatim; renders `None`/`null` as the existing `—`; performs no arithmetic beyond formatting | Backend returns DTOs exactly as in §4.1; money arrives as a `float`, formatting is FE-side |
| Frontend (admin) | `RequestTickets.tsx` and its detail page consume `RmTicketDTO`; status actions POST `RmTicketStatusReq` | Backend enforces RM scoping; `ref` is URL-safe and stable |

#### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or a dated, initialled addendum in this file.
- Every impl doc's §7 is re-copied in the same change set — the seam never lives in only one place.

### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:**
  - `client_tickets` (DB-1), persisting `TicketKind`/`TicketStatus` with **exactly** the 3 and 5 values enumerated in §4.1's `class TicketKind`/`class TicketStatus` blocks — no extra value, no renamed value.
  - `client_profiles.occupation` + `.date_of_birth` (DB-2), the storage behind `ClientProfileDTO.occupation`/`.date_of_birth` / `ClientProfilePatch.occupation` (note: `date_of_birth` is intentionally absent from `ClientProfilePatch` — read-only, per D-11).
  - `models.model_limit` (DB-5), the storage behind `PositionDTO.model_limit` / `RecommendedModelDTO.model_limit` — a distinct column from `model_size`, per the seam's own inline comment ("a DISTINCT attribute, not model_size"). **Unlike every other seam-facing column in this doc, it ships with no writer anywhere** — see DB-5's own "no PC/admin exposure" invariant and the proposal's Non-Goals. The seam still names it (it's a real, readable field) but it will read `NULL` for the lifetime of this proposal.
  - The `client_portfolios` missing-row **fact** (DB-3, documented not coded) that backs the seam's own "Assumes" cell for the Backend layer: `client_portfolios.cash_deposit` etc. read "(0 if no row)" in `PortfolioDTO`'s field comments — that "(0 if no row)" is the Backend layer's obligation, and DB-3 is where the DB layer records that the row can, in fact, be absent.
  - The `onboarding_documents.expires_at` backfill (DB-4), which is not itself part of §4.1's wire contract but is a precondition for `KycPanelDTO.next_review_at` / `upload_opens_at` ever being non-`None` for an already-verified client.
  - **DB-6 contributes nothing to the seam.** Its seven columns exist on `client_profiles` but are deliberately excluded from §4.1 — proposal B-6/Non-Goals. Listed here only so a reader of this doc's §7 knows the omission is intentional, not a gap.
- **What this layer assumes from the other side:**
  - Backend never writes `client_tickets.status` to a value outside the 5 named in §4.1 (`new`/`in_progress`/`replied`/`closed`/`declined`) — the DB layer enforces the enum's shape via `SAEnum(..., values_callable=...)` on the ORM side, but nothing at the SQL level (the migration column is a plain `VARCHAR(16)`) stops an arbitrary string being written outside the ORM; the seam's "Assumes" row makes this the Backend layer's responsibility, not a DB constraint this layer adds.
  - A ticket's `assigned_rm_uid` is a snapshot and may go stale (an RM reassignment does not retroactively move historical tickets) — the Backend layer must not "fix" this by re-deriving `assigned_rm_uid` from the live `client_profiles.assigned_rm_uid` at read time.
  - **No layer populates `model_limit` in this proposal.** This is not "Backend's job, out of scope for this layer" (as an earlier draft framed it) — there is no Backend, admin-frontend, or any other unit anywhere in the four impl docs that writes this column. The DB layer provides the nullable column; every layer reads it as permanently `NULL` until a future, separate proposal (informed by a risk-management SOP) adds a writer.
  - `client_portfolios` row may be absent for pre-014 clients; the Backend layer serves zeros, never a 404, per DB-3's documented invariant.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (run from `api-backend/`).
- **Fixtures / seed:** an isolated, disposable test/scratch database (in-memory SQLite or a throwaway MySQL/MariaDB schema), created and torn down by the test fixture. **Invariant: tests in this layer NEVER connect to, migrate, or write to the live `portal` database.**
- **Isolation:** hermetic, no shared external state; safe to run in parallel in CI.
- **Layer isolation (critical):** tests import only from `api-backend/app/models/*.py`, the new Alembic revision module, and Alembic/SQLAlchemy test tooling. No Backend service/router code or Frontend code is imported or assumed present. Where a test needs to reason about the Backend layer's obligations (e.g. "the allocation-matrix fund query is unaffected"), it re-runs the **existing** query text against the scratch DB directly — it does not import `app.libs.allocation_matrix`'s service/router layer, only the SQL/repository-level query already covered by this layer's read-first inventory.
- **Test location:** `api-backend/tests/` (git-ignored), mirroring `app/models/*.py` and the migration path.
- **Commit policy:** tests are never committed. `tests/` is git-ignored.
- **Code generation:** concrete test code is written by the `test-gen` skill (arg: `lite` | `standard` | `thorough`) from the goals below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | Migration creates `client_tickets` with exact columns/FKs/indexes; `kind`/`status` persist as lowercase enum values; `reference` UNIQUE is enforced; downgrade drops the table cleanly | none |
| DB-2 | `client_profiles.occupation`/`.date_of_birth` added nullable; existing rows read `NULL`; downgrade drops both cleanly | none |
| DB-3 | The invariant comment is present above `ClientPortfolio`; no schema/behavior change results from this unit | none |
| DB-4 | Backfill sets `expires_at` correctly on verified-recently / verified-over-a-year-ago rows, leaves it `NULL` on a not-yet-verified row; no other `doc_type`/`status` is touched; downgrade nulls it back exactly | none |
| DB-5 | `models.model_limit` added nullable; existing rows read `NULL`; the allocation-matrix fund query's SQL text and result set are byte-identical before/after; downgrade drops it cleanly; static check confirms no `model_limit` reference in `trade_models`/admin-frontend | none |
| DB-6 | Seven `client_profiles` columns added nullable; existing rows read `NULL`; downgrade drops all seven cleanly; none of the seven names leaks into any seam/DTO/route in this proposal | none |

### 8.3 Test goals (per unit)

#### DB-1
- **Positive:** running `alembic upgrade head` against a scratch DB stamped at `fa66b2f3aee6` creates `client_tickets` with all 18 columns, the three FKs (`users.id`, `users.firebase_uid`, `models.id`), the `reference` UNIQUE constraint, and both indexes (`ix_client_tickets_user_id`, `ix_client_tickets_rm_status`). Inserting one row through the `ClientTicket` ORM class for each of the 3 `TicketKind` values and each of the 5 `TicketStatus` values round-trips: reading the row back yields the exact same lowercase string in the raw column (queried via `sa.text`, bypassing the ORM's enum coercion) as the enum member's `.value` — this is the specific "bitten before" convention the codebase's own comments call out for `values_callable`.
- **Negative:** inserting a second row with a duplicate `reference` raises `IntegrityError`; inserting a row with a non-existent `user_id`/`model_id`/`assigned_rm_uid` raises `IntegrityError` (FK violation); omitting `message` (NOT NULL) raises an error at flush/commit time.
- **Invariants:** `alembic downgrade -1` then `alembic upgrade head` again is idempotent (schema ends identical); no pre-existing table is touched; `alembic history` shows one linear chain with no branch point; the two named indexes exist and no unexpected third index is created.
- **Seam mocks:** none.

#### DB-2
- **Positive:** `alembic upgrade head` adds `client_profiles.occupation` as `VARCHAR(255) NULL` and `.date_of_birth` as `DATE NULL`; a row inserted before the migration (via a pre-migration fixture insert) reads `NULL` for both after upgrade; a new row can set and read back an arbitrary string for `occupation` and an arbitrary `date` for `date_of_birth`.
- **Negative:** none beyond the standard nullable-column case — there is no DB-level constraint to violate. (The Backend layer's 422-on-patch behavior for `date_of_birth` is that layer's test, not this one's — this unit proves only that the column accepts a write when written directly, which the read-only rule depends on being possible at the ORM/DB level even though the Backend route forbids it.)
- **Invariants:** the migration does not alter `client_profiles.id`, `.user_id`, or any other existing column's type/nullability/default; `alembic downgrade -1` drops both `occupation` and `date_of_birth` and leaves every other column untouched.
- **Seam mocks:** none.

#### DB-3
- **Positive:** a `grep`/AST-level check confirms the invariant comment text is present immediately above `class ClientPortfolio(Base):` in `app/models/post_trade_allocation.py`.
- **Negative:** none — there is no runtime behavior to break.
- **Invariants:** the `ClientPortfolio` table's columns, indexes, and constraints are byte-identical before and after this unit's commit (a schema-diff check against the pre-commit state proves no accidental schema drift was introduced alongside the comment).
- **Seam mocks:** none.

#### DB-4
- **Positive:** seed three synthetic `onboarding_documents` rows on the scratch DB per the proposal's Execution & verification step 1 — (a) `doc_type='investment_policy_statement', status='verified', reviewed_at=<2 days ago>`, (b) `doc_type='investment_policy_statement', status='verified', reviewed_at=<400 days ago>` (synthetic — no such row exists in real data today, per B-4's own observation that `onboarding_documents` is only 9 days old at proposal time), (c) `doc_type='investment_policy_statement', status='not_started', reviewed_at=NULL`. After `alembic upgrade head`: row (a)'s `expires_at` equals `reviewed_at + 365 days` exactly; row (b)'s `expires_at` equals its `reviewed_at + 365 days` exactly (already in the past — the backfill does not special-case this, per the proposal's "no bucketing/count-gating is needed" reasoning); row (c)'s `expires_at` stays `NULL`.
- **Negative:** a fourth seeded row with a different `doc_type` (e.g. `'passport'`) at `status='verified'` must **not** receive an `expires_at` value — proves the `WHERE doc_type = 'investment_policy_statement'` filter, not just the `status='verified'` filter, is load-bearing. A fifth row already carrying a non-NULL `expires_at` before migration (simulating a hypothetical future re-run) must be left untouched by the `expires_at IS NULL` guard — proves the backfill is not destructively idempotent-by-overwrite.
- **Invariants:** `alembic downgrade -1` sets `expires_at` back to `NULL` on every `investment_policy_statement` row, including rows (a) and (b), and leaves row (c) and the off-doc-type row exactly as they were; running upgrade → downgrade → upgrade produces the same `expires_at` values as the first upgrade (the backfill is not order-dependent given the same starting data).
- **Seam mocks:** none — this unit does not depend on Backend C-6's code being present on this branch; it only documents the deploy-order **precondition** on C-6 landing with-or-before this migration in the target environment, which is an execution-schedule concern, not a test-double concern.

#### DB-5
- **Positive:** `alembic upgrade head` adds `models.model_limit` as `NUMERIC(28,10) NULL`; a pre-existing `models` row reads `NULL` for it after upgrade; a value set directly at the ORM/DB level (proving the column itself works, independent of the fact that nothing in the product ever sets it) can be set and read back as an arbitrary `Decimal`.
- **Negative:** none beyond the standard nullable-column case.
- **Invariants:** seed a `client_subscriptions` + `models` fixture matching the shape the allocation-matrix fund query reads (`app/libs/allocation_matrix/repository.py:180`, `COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund`); capture the query's compiled SQL text and its result rows **before** the migration; re-run the identical query **after** the migration on the same fixture; assert both the compiled SQL text and the result rows are byte-identical — proving the new sibling column changes nothing about a query that never selects it. This directly operationalizes the proposal's Execution & verification step 1 clause: "B-5 is verified by asserting the existing allocation-matrix fund query is byte-identical before and after (it must not reference `model_limit`)." Additionally: a static `rg "model_limit"` sweep of `app/libs/trade_models/**` and (if the admin-frontend repo is checked out alongside) `admin-frontend/**` returns zero hits — proving no authoring surface was built, per this proposal's explicit scope boundary.
- **Seam mocks:** none.

#### DB-6
- **Positive:** `alembic upgrade head` adds all seven columns (`anniversary`, `spouse_name`, `children`, `personal_interests`, `communication_preferences`, `gift_hospitality_preferences`, `relationship_notes`) to `client_profiles` with the exact types/nullability in DB-6's contract; a pre-existing row reads `NULL` on all seven after upgrade; a row can set and read back an arbitrary value for each (a `date` for `anniversary`, arbitrary strings for the rest).
- **Negative:** none beyond the standard nullable-column case — there is no constraint to violate.
- **Invariants:** the migration does not alter `client_profiles.id`, `.user_id`, `.occupation`, or any other existing column's type/nullability/default; `alembic downgrade -1` drops all seven columns and leaves every other column untouched. A static check (`rg` for each of the seven column names across `api-backend/app/libs/**`, `client-frontend/**`, `admin-frontend/**`, excluding this model file and migration) returns zero hits — proving no seam/DTO/route in this proposal has picked them up, per the "Non-goal, stated explicitly" clause in proposal B-6.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit / PR hand-off (§3.2). Tests are git-ignored and never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in this layer (the four model-file diffs and the migration's `upgrade`/`downgrade` bodies).
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + precondition/invariant check per unit) — six small, low-branching units; `thorough` is not warranted, except DB-4 already gets its edge cases spelled out explicitly above because the proposal's own Execution & verification step 1 calls them out by name (synthetic over-a-year-ago row, off-doc-type row).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] DB-1 through DB-6 committed on `client-portal-integration-db`; each commit left the branch green. DB-1/DB-2/DB-4/DB-5/DB-6 share one Alembic revision commit (they are the proposal's single deploy unit); DB-3 is a separate, independent commit (a documentation comment, no migration).
- [ ] DB-6's scope boundary held: none of its seven column names appears in §7, in any DTO, or in any Backend/Frontend code touched by this proposal.
- [ ] §8 unit tests all pass against a scratch/ephemeral DB — never against the live `portal` DB; CI gate (§3.2) green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, **not** against the BE/FE/admin-FE layers' branches (which are not visible here).
- [ ] New migration's `down_revision` is confirmed `"fa66b2f3aee6"` by inspection of the revision file.
- [ ] `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` round-trips clean on a scratch DB.
- [ ] PR opened against `client-portal-integration`; human owns the merge and owns the separate, explicit step of applying the migration to the live `portal` DB (per the proposal's own human-gate: "no behavioural sign-off is needed beyond the schema itself" for this migration, but the DB-safety standing rule for *any* schema change on a live database still applies).

**Rollback:**
- **DB-3** reverts cleanly with a branch revert — it is a comment; there is no persisted state.
- **DB-1, DB-2, DB-6 are additive-up, lossy-down**; **DB-5 is additive-up and exact-down** (a difference worth stating precisely): `alembic downgrade -1` drops `client_tickets` in its entirety (losing every ticket raised since the upgrade, including RM responses — if a rollback is needed after tickets exist, the human dumps `client_tickets` first), and drops `client_profiles.occupation`/`.date_of_birth` and the seven DB-6 columns (losing any values entered in any of them). `models.model_limit` is also dropped on downgrade, but per DB-5's own scope boundary — no writer exists anywhere in this proposal — there is nothing to lose: every row reads `NULL` for it at every point between upgrade and downgrade. The *upgrade* itself is additive and touches no existing row.
- **DB-4 is exact, not lossy, on its own terms** — the column held `NULL` on every row before this revision, so nulling it back on downgrade loses nothing that existed pre-upgrade. However, per the proposal's own Rollback section, **any onboarding cycle the renewal scheduler has since reopened as a consequence of a backfilled `expires_at` stays reopened** (`kind=renewal`, `status=pending_review`) — the down-migration does not and must not attempt to un-reopen a renewal; that is a Backend/RM-side state change this DB-layer rollback correctly leaves alone (per the proposal: "doing so automatically would be worse than leaving it for an RM to resolve").
- Files written to `STORAGE_ROOT` (legal/statement documents, client KYC uploads) are never touched by this layer's rollback in any direction — this layer owns no storage-adapter code.
