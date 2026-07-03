# 007 — PC Workspace Refactor: Layer 1 (Database) — Orchestrator Prompt

> **Layer constraint:** This prompt covers **Layer 1 (Database) only.**
> No backend service code, no router code, no frontend changes.
>
> **Branch constraint:** All work is on the **current git branch**.
> Before spawning any sub-agent, run `git rev-parse --abbrev-ref HEAD` to capture
> the working branch name and pass it to every sub-agent prompt.
> Do not create other branches. Do not switch branches. Do not push.
>
> **Proposal reference:** `api-backend/docs/proposals/007-2026-06-30-pc-workspace-refactor.md`
> Layer 1 section is the authoritative source for every decision. When a detail
> below conflicts with the proposal, the proposal wins. When the proposal is silent,
> use the existing ORM/migration conventions.

---

## Role

You are the **orchestrator** for this implementation. You do not write code
yourself. You delegate every unit of work to a sub-agent via the `Agent` tool,
collect results, verify success, and sequence the next batch. When a sub-agent
fails you diagnose the output and either retry with a corrected prompt or raise
the issue to the user.

**First action:** Run `git rev-parse --abbrev-ref HEAD` and store the result as
`WORKING_BRANCH`. Include this branch name in every sub-agent prompt so they
commit to the correct branch.

---

## Environment

| Variable | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\` |
| Backend root | `api-backend\` (relative to repo root) |
| Python venv | `api-backend\.venv\` — activate: `api-backend\.venv\Scripts\activate` |
| Alembic binary | `api-backend\.venv\Scripts\alembic.exe` — always run from `api-backend\` |
| Migration dir | `api-backend\alembic\versions\` |
| ORM models dir | `api-backend\app\models\` |
| DB URL env var | `DATABASE_URL` (the app reads this; do NOT use `SQLALCHEMY_DATABASE_URI`) |
| Primary shell | PowerShell; Bash also available for POSIX-style commands |
| OS | Windows 11 |

All absolute paths in sub-agent prompts must use Windows backslash form,
e.g. `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\api-backend\app\models\pc.py`.

---

## Features

### Feature B-6 — UUID migration fix (`0008_pc_workspace.py`)

**Proposal ref:** Proposal § B-6.

**Problem:** Migration `e5f6a7b8c9d0_0008_pc_workspace.py` declares all UUID PK
and FK columns as `sa.String(36)`. The ORM models use `Uuid(native_uuid=False)`.
Both render as `CHAR(36)` in MySQL/MariaDB today, but Alembic autogenerate diffs
against them. Fix the migration to match the ORM.

**File to touch:**
```
api-backend\alembic\versions\e5f6a7b8c9d0_0008_pc_workspace.py
```

**Exact change — add import and replace every UUID column type:**

1. Add `from sqlalchemy.dialects import mysql as _mysql` import, **or** use
   `sa.Uuid(native_uuid=False)` directly (SQLAlchemy 2.x ships `Uuid` in
   `sqlalchemy` directly — use `sa.Uuid(native_uuid=False)`).

2. Replace **every** `sa.String(36)` that is a PK or FK UUID column with
   `sa.Uuid(native_uuid=False)`. The affected columns are:

   - `models.id`
   - `model_materials.id`, `model_materials.model_id`
   - `model_changes.id`, `model_changes.model_id`
   - `client_subscriptions.user_id`, `client_subscriptions.model_id`
   - `allocation_periods.id`
   - `allocation_model_snapshots.period_id`, `allocation_model_snapshots.user_id`,
     `allocation_model_snapshots.model_id`

   The non-UUID `sa.String(...)` columns (`name`, `label`, `version`, etc.) are
   unchanged.

3. No `downgrade()` change needed — the type renders identically at the DB level.

**No data migration. No new migration file.**

**Sub-agent commit protocol:** read the file first, apply the surgical edits,
then:
```
git add api-backend\alembic\versions\e5f6a7b8c9d0_0008_pc_workspace.py
git commit -m "fix(db): normalize 0008 PC UUID PK/FK columns to sa.Uuid(native_uuid=False) (B-6)"
```

---

### Feature B-5 — ORM precision types (`pc.py`)

**Proposal ref:** Proposal § B-5.

**Problem:** Three ORM classes in `pc.py` have `Mapped[float]` annotations over
`Numeric(28, 10)` DB columns. SQLAlchemy returns `Decimal` for `Numeric` columns;
using `float` causes quiet precision loss in `multiplier × model_size` arithmetic.

**File to touch:**
```
api-backend\app\models\pc.py
```

**Exact changes — three classes, three fields:**

1. `ClientSubscription.multiplier` — change:
   ```python
   multiplier: Mapped[float] = mapped_column(
       Numeric(28, 10), nullable=False, server_default="1"
   )
   ```
   to:
   ```python
   multiplier: Mapped[Decimal] = mapped_column(
       Numeric(28, 10), nullable=False, server_default="1"
   )
   ```

2. `AllocationModelSnapshot.multiplier` — change `Mapped[float]` to
   `Mapped[Decimal]`.

3. `AllocationModelSnapshot.model_size` — change `Mapped[float | None]` to
   `Mapped[Decimal | None]`.

4. `Model.model_size` — change `Mapped[float | None]` to `Mapped[Decimal | None]`.

5. Add `from decimal import Decimal` to the imports at the top of `pc.py` (it is
   not currently imported there — check before adding).

**No migration needed.**

**Sub-agent commit protocol:**
```
git add api-backend\app\models\pc.py
git commit -m "fix(db): fix ORM Mapped[float] -> Mapped[Decimal] for Numeric(28,10) columns (B-5)"
```

---

### Feature B-1b — Models prospectus fields (`pc.py` + migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-1b.

**File to touch:**
```
api-backend\app\models\pc.py
```

**Exact ORM change — add 8 columns to `Model` class** (after the existing
`updated_at` column, before `__table_args__`):

```python
description:   Mapped[str | None]      = mapped_column(Text, nullable=True)
underlyings:   Mapped[str | None]      = mapped_column(Text, nullable=True)
risk:          Mapped[str | None]      = mapped_column(Text, nullable=True)
liquidity:     Mapped[str | None]      = mapped_column(String(255), nullable=True)
reporting:     Mapped[str | None]      = mapped_column(String(255), nullable=True)
nav_perf:      Mapped[str | None]      = mapped_column(String(255), nullable=True)
mgmt_fee:      Mapped[Decimal | None]  = mapped_column(Numeric(9, 6), nullable=True)
incentive_fee: Mapped[Decimal | None]  = mapped_column(Numeric(9, 6), nullable=True)
```

`Text` is already imported at the top of `pc.py` — verify before adding. If
`Decimal` is not already imported (it will be added by B-5 if B-5 runs first; if
running in parallel, add it yourself and the merge will dedup). Add `Text` to the
existing SQLAlchemy import line if missing.

**Migration DDL chunk:** Do NOT write a new migration file. Instead write the ADD
COLUMN statements to a holding file at:
```
api-backend\alembic\versions\_0009_chunk_b1b.py
```
with this exact content (Python dict, not an Alembic revision — the migration
assembler agent will import it):

```python
# _0009_chunk_b1b.py — B-1b DDL fragment, assembled into 0009 by the migration agent
ADD_COLUMNS = """
ALTER TABLE models ADD COLUMN description TEXT NULL;
ALTER TABLE models ADD COLUMN underlyings TEXT NULL;
ALTER TABLE models ADD COLUMN risk TEXT NULL;
ALTER TABLE models ADD COLUMN liquidity VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN reporting VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN nav_perf VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN mgmt_fee NUMERIC(9,6) NULL;
ALTER TABLE models ADD COLUMN incentive_fee NUMERIC(9,6) NULL;
"""
```

**Sub-agent commit protocol:**
```
git add api-backend\app\models\pc.py
git add api-backend\alembic\versions\_0009_chunk_b1b.py
git commit -m "feat(db): add 8 prospectus/fee columns to Model ORM + B-1b DDL chunk (B-1b)"
```

---

### Feature B-2 — Materials versioning column (`pc.py` + migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-2.

**File to touch:**
```
api-backend\app\models\pc.py
```

**Exact ORM change — add one column to `ModelMaterial` class** (after `version`,
before `size_bytes`):

```python
version_no: Mapped[int] = mapped_column(
    sa.Integer(),   # use Integer, not BigInteger
    nullable=False,
    server_default="0",
)
```

Use `Integer` from SQLAlchemy. Check whether `Integer` is already imported in
`pc.py`; add it to the import list if missing (the current import line is
`from sqlalchemy import (BigInteger, DateTime, Enum as SAEnum, ForeignKey, Index,
JSON, Numeric, String, UniqueConstraint, Uuid, func,)`).

**Migration DDL chunk:** Write to:
```
api-backend\alembic\versions\_0009_chunk_b2.py
```

```python
# _0009_chunk_b2.py — B-2 DDL fragment
ADD_COLUMNS = """
ALTER TABLE model_materials ADD COLUMN version_no INT NOT NULL DEFAULT 0;
UPDATE model_materials SET version_no = COALESCE(CAST(SUBSTR(version, 2) AS UNSIGNED), 0);
"""
```

Note: `SUBSTR(version, 2)` strips the leading `v` from strings like `v1`, `v2`.
`CAST(... AS UNSIGNED)` is MySQL/MariaDB syntax; if the target DB is SQLite use
`CAST(... AS INTEGER)` instead — the migration assembler agent should pick the
right dialect. Add a comment noting the dialect sensitivity.

**Sub-agent commit protocol:**
```
git add api-backend\app\models\pc.py
git add api-backend\alembic\versions\_0009_chunk_b2.py
git commit -m "feat(db): add version_no INT to ModelMaterial ORM + B-2 DDL chunk (B-2)"
```

---

### Feature B-3 — Model symbols table (`pc.py` + migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-3.

**File to touch:**
```
api-backend\app\models\pc.py
```

**Exact ORM change — add new class `ModelSymbol`** at the bottom of `pc.py`
(after `AllocationModelSnapshot`):

```python
# ---------------------------------------------------------------------------
# DB-new — model_symbols
# ---------------------------------------------------------------------------


class ModelSymbol(Base):
    __tablename__ = "model_symbols"

    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, primary_key=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
```

`Decimal` must be imported (handled by B-5 or B-1b; add if missing).

**Migration DDL chunk:** Write to:
```
api-backend\alembic\versions\_0009_chunk_b3.py
```

```python
# _0009_chunk_b3.py — B-3 DDL fragment
CREATE_TABLE = """
CREATE TABLE model_symbols (
    model_id CHAR(36) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    weight NUMERIC(28,10) NULL,
    PRIMARY KEY (model_id, symbol),
    CONSTRAINT fk_model_symbols_model FOREIGN KEY (model_id)
        REFERENCES models(id) ON DELETE CASCADE
);
"""
```

**Sub-agent commit protocol:**
```
git add api-backend\app\models\pc.py
git add api-backend\alembic\versions\_0009_chunk_b3.py
git commit -m "feat(db): add ModelSymbol ORM + model_symbols table DDL chunk (B-3)"
```

---

### Feature B-4 — Allocation period models table (`pc.py` + migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-4 (Option 1 — normalize).

**File to touch:**
```
api-backend\app\models\pc.py
```

**Exact ORM changes:**

1. **Add new class `AllocationPeriodModel`** at the bottom of `pc.py` (after
   `ModelSymbol` if B-3 has run, otherwise after `AllocationModelSnapshot`):

```python
# ---------------------------------------------------------------------------
# DB-new — allocation_period_models  (B-4: normalize model_size out of snapshots)
# ---------------------------------------------------------------------------


class AllocationPeriodModel(Base):
    __tablename__ = "allocation_period_models"

    period_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("allocation_periods.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_size: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
```

2. **Remove `model_size` from `AllocationModelSnapshot`** — delete the line:
   ```python
   model_size: Mapped[float | None] = mapped_column(Numeric(28, 10), nullable=True)
   ```
   (Note: B-5 will change this to `Mapped[Decimal | None]` if run first — either
   way, the column is removed here.)

**Migration DDL chunk:** Write to:
```
api-backend\alembic\versions\_0009_chunk_b4.py
```

```python
# _0009_chunk_b4.py — B-4 DDL fragment
CREATE_TABLE = """
CREATE TABLE allocation_period_models (
    period_id CHAR(36) NOT NULL,
    model_id CHAR(36) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    model_size NUMERIC(28,10) NOT NULL,
    PRIMARY KEY (period_id, model_id),
    CONSTRAINT fk_apm_period FOREIGN KEY (period_id)
        REFERENCES allocation_periods(id) ON DELETE CASCADE,
    CONSTRAINT fk_apm_model FOREIGN KEY (model_id)
        REFERENCES models(id) ON DELETE CASCADE
);
"""
DROP_COLUMN = """
ALTER TABLE allocation_model_snapshots DROP COLUMN model_size;
"""
BACKFILL = """
INSERT INTO allocation_period_models (period_id, model_id, model_name, model_size)
SELECT DISTINCT
    ams.period_id,
    ams.model_id,
    m.name          AS model_name,
    ams.model_size  AS model_size
FROM allocation_model_snapshots ams
JOIN models m ON m.id = ams.model_id
WHERE ams.model_size IS NOT NULL;
"""
```

**Downgrade DDL:** The assembler agent should restore `model_size` on
`allocation_model_snapshots` and drop `allocation_period_models`.

**Sub-agent commit protocol:**
```
git add api-backend\app\models\pc.py
git add api-backend\alembic\versions\_0009_chunk_b4.py
git commit -m "feat(db): add AllocationPeriodModel ORM + normalize model_size out of snapshots (B-4)"
```

---

### Feature B-9 — Performance indexes (migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-9.

**No ORM change.** Indexes are expressed in `__table_args__` via code, but since
we are not touching the ORM for these tables in other features that affect
`__table_args__`, add them in the migration only and note that the ORM should be
updated in a follow-up (or the migration assembler agent can add them).

**Migration DDL chunk:** Write to:
```
api-backend\alembic\versions\_0009_chunk_b9.py
```

```python
# _0009_chunk_b9.py — B-9 index fragment
CREATE_INDEXES = """
CREATE INDEX ix_allocation_model_snapshots_user_period
    ON allocation_model_snapshots (user_id, period_id);
CREATE INDEX ix_model_changes_model_id_created_at
    ON model_changes (model_id, created_at DESC);
"""
DROP_INDEXES = """
DROP INDEX ix_allocation_model_snapshots_user_period
    ON allocation_model_snapshots;
DROP INDEX ix_model_changes_model_id_created_at
    ON model_changes;
"""
```

**Sub-agent commit protocol:**
```
git add api-backend\alembic\versions\_0009_chunk_b9.py
git commit -m "feat(db): add composite indexes on allocation_model_snapshots + model_changes (B-9)"
```

---

### Feature B-1 — IB staging split (`reconciliation.py` + migration 0009 DDL chunk)

**Proposal ref:** Proposal § B-1.

**File to touch:**
```
api-backend\app\models\reconciliation.py
```

**Overview:** Replace the two parallel abstract mixins `_ActivityRow` and
`_TradeConfirmRow` (and their concrete classes `IBActivity` / `IBTrade`) with a
single canonical mixin `_TradeRow` and three concrete classes `Order`, `Trade`,
`SymbolSummary`. The canonical column set is the **TCF (`_TradeConfirmRow`) schema**
— it is the target.

**Step 1 — Read the file first.** The current `reconciliation.py` has:
- `_ActivityRow` mixin (AF schema, ~89 columns including `ibOrderID`, `ibExecID`,
  `tradePrice`, `tradeMoney`, `ibCommission`, `ibCommissionCurrency`,
  `settleDateTarget`, `taxes`, `transactionID` etc.)
- `IBActivity(Base, _ActivityRow)` with `__tablename__ = "ib_activity"` and
  index `ix_ib_activity_ibOrderID`
- `_TradeConfirmRow` mixin (TCF schema, ~91 columns using `orderID`, `execID`,
  `price`, `amount`, `commission`, `commissionCurrency`, `settleDate`, `tax`,
  `tradeID` etc.)
- `IBTrade(Base, _TradeConfirmRow)` with `__tablename__ = "ib_trades"` and
  index `ix_ib_trades_orderID`

**Step 2 — Write the new `reconciliation.py`.** The file must contain exactly:

```python
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Numeric, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class _TradeRow:
    """Canonical single-source mixin for IB Flex Trade Confirmation (TCF) rows.

    Column set is the TCF schema from the former _TradeConfirmRow. Applied to
    Order, Trade, and SymbolSummary. Replaces the parallel _ActivityRow /
    _TradeConfirmRow pair (~700 LOC removed).

    Conventions: UUID PK via Uuid(native_uuid=False), server_default=func.now(),
    camelCase attribute names == DB column names (no name= remapping), all source
    columns nullable.
    """

    __abstract__ = True

    # --- Infrastructure -------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )

    # --- Numeric -> Numeric(28, 10), nullable (24 columns) -------------------
    accruedInt: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    brokerClearingCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    brokerExecutionCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    commission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    fineness: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    multiplier: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    netCash: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    netCashWithBillable: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    origTradePrice: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    otherCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    otherTax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    principalAdjustFactor: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    proceeds: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    salesTax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    strike: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyClearingCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyExecutionCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyRegulatoryCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tradeCharge: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)

    # --- Date YYYYMMDD -> String(8), nullable (7 columns) --------------------
    fromDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    toDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    origTradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reportDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    settleDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # --- Datetime YYYYMMDD;HHMMSS -> String(20), nullable (3 columns) --------
    whenGenerated: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dateTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    orderTime: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Free text -> Text, nullable (2 columns) -----------------------------
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Everything else -> String(255), nullable (46 columns) ---------------
    accountId: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acctAlias: Mapped[str | None] = mapped_column(String(255), nullable=True)
    allocatedTo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assetCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blockID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brokerageOrderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buySell: Mapped[str | None] = mapped_column(String(255), nullable=True)
    clearingFirmID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commissionCurrency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commodityType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cusip: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deliveryType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    execID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extExecID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isAPIOrder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issuerCountryCode: Mapped[str | None] = mapped_column(String(255), nullable=True)
    levelOfDetail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    listingExchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderReference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origTradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period: Mapped[str | None] = mapped_column(String(255), nullable=True)
    positionActionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    putCall: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rfqID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityIDType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serialNumber: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    traderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transactionType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingConid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingListingExchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingSecurityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingSymbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    volatilityOrderLink: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Ingestion metadata ---------------------------------------------------
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Order(Base, _TradeRow):
    """IB ORDER-level rows (levelOfDetail='ORDER'), split from ib_activity + ib_trades."""

    __tablename__ = "orders"

    __table_args__ = (
        UniqueConstraint("orderID", name="uq_orders_orderID"),
    )


class Trade(Base, _TradeRow):
    """IB EXECUTION-level rows (levelOfDetail='EXECUTION'), split from ib_activity + ib_trades."""

    __tablename__ = "trades"

    __table_args__ = (
        Index("ix_trades_orderID", "orderID"),
        UniqueConstraint("execID", name="uq_trades_execID"),
    )


class SymbolSummary(Base, _TradeRow):
    """Higher-level rollup rows by symbol, populated by the ingest pipeline."""

    __tablename__ = "symbol_summaries"

    __table_args__ = (
        Index("ix_symbol_summaries_symbol", "symbol"),
        UniqueConstraint("symbol", "tradeDate", name="uq_symbol_summaries_symbol_date"),
    )
```

**Migration DDL chunk:** Write to:
```
api-backend\alembic\versions\_0009_chunk_b1.py
```

The data-preserving plan (from the proposal):
1. CREATE the three new tables using the TCF column set.
2. Backfill `trades` from `ib_trades WHERE levelOfDetail = 'EXECUTION'`.
3. Backfill `orders` from `ib_trades WHERE levelOfDetail = 'ORDER'`.
4. Backfill `trades` from `ib_activity WHERE levelOfDetail = 'EXECUTION'`
   using the AF→TCF alias table below.
5. Backfill `orders` from `ib_activity WHERE levelOfDetail = 'ORDER'`
   using the AF→TCF alias table.
6. DROP `ib_activity` and `ib_trades`.

**AF→TCF column alias table** (all other matching-name columns are copied
directly; AF-only columns listed in the proposal are dropped silently):

| Source (AF / ib_activity) | Target (TCF / new tables) |
|---|---|
| `ibOrderID` | `orderID` |
| `ibExecID` | `execID` |
| `tradePrice` | `price` |
| `tradeMoney` | `amount` |
| `ibCommission` | `commission` |
| `ibCommissionCurrency` | `commissionCurrency` |
| `settleDateTarget` | `settleDate` |
| `taxes` | `tax` |
| `transactionID` | `tradeID` |

AF-only columns dropped (not present in TCF and not aliased):
`changeInPrice`, `changeInQuantity`, `closePrice`, `cost`, `fifoPnlRealized`,
`fxRateToBase`, `initialInvestment`, `mtmPnl`, `holdingPeriodDateTime`,
`openDateTime`, `whenRealized`, `whenReopened`, `origTransactionID`,
`relatedTradeID`, `relatedTransactionID`, `positionActionID`, `rtn`, `traderID`.

Write `_0009_chunk_b1.py` as a Python file containing the raw SQL strings (not
yet an Alembic revision — the assembler agent constructs the revision):

```python
# _0009_chunk_b1.py — B-1 DDL fragment (data-preserving IB staging split)
#
# Column names matching between ib_activity (AF) and TCF target tables:
# accountId, acctAlias, assetCategory, brokerageOrderID, buySell, clearingFirmID,
# commodityType, conid, currency, cusip, deliveryType, exchange, extExecID, figi,
# isAPIOrder, isin, issuerCountryCode, levelOfDetail, listingExchange, model,
# orderReference, orderType, origTradeDate, origTradeID, period, putCall,
# securityID, securityIDType, serialNumber, subCategory, symbol, tradeDate,
# tradeID, transactionType, underlyingConid, underlyingListingExchange,
# underlyingSecurityID, underlyingSymbol, volatilityOrderLink,
# accruedInt, fineness, multiplier, netCash, origTradePrice, principalAdjustFactor,
# proceeds, quantity, strike, weight, description, issuer,
# fromDate, toDate, expiry, reportDate, whenGenerated, dateTime, orderTime,
# ingested_at
#
# AF columns aliased to TCF names: ibOrderID->orderID, ibExecID->execID,
#   tradePrice->price, tradeMoney->amount, ibCommission->commission,
#   ibCommissionCurrency->commissionCurrency, settleDateTarget->settleDate,
#   taxes->tax, transactionID->tradeID
#
# AF-only columns dropped (logged at runtime): changeInPrice, changeInQuantity,
#   closePrice, cost, fifoPnlRealized, fxRateToBase, initialInvestment, mtmPnl,
#   holdingPeriodDateTime, openDateTime, whenRealized, whenReopened,
#   origTransactionID, relatedTradeID, relatedTransactionID, positionActionID,
#   rtn, traderID

# TCF-only columns not in AF (will be NULL for AF-backfilled rows):
#   brokerClearingCommission, brokerExecutionCommission, otherCommission, otherTax,
#   salesTax, thirdPartyClearingCommission, thirdPartyExecutionCommission,
#   thirdPartyRegulatoryCommission, tradeCharge, netCashWithBillable,
#   allocatedTo, blockID, code, commissionCurrency (aliased from AF), execID
#   (aliased from AF), price (aliased from AF), amount (aliased from AF),
#   commission (aliased from AF), settleDate (aliased from AF), tax (aliased from AF),
#   orderID (aliased from AF), rfqID, positionActionID (AF-only → dropped)

SHARED_COLS = (
    "accountId", "acctAlias", "assetCategory", "brokerageOrderID", "buySell",
    "clearingFirmID", "commodityType", "conid", "currency", "cusip",
    "deliveryType", "exchange", "extExecID", "figi", "isAPIOrder", "isin",
    "issuerCountryCode", "levelOfDetail", "listingExchange", "model",
    "orderReference", "orderType", "origTradeDate", "origTradeID", "period",
    "putCall", "securityID", "securityIDType", "serialNumber", "subCategory",
    "symbol", "tradeDate", "transactionType", "underlyingConid",
    "underlyingListingExchange", "underlyingSecurityID", "underlyingSymbol",
    "volatilityOrderLink", "accruedInt", "fineness", "multiplier", "netCash",
    "origTradePrice", "principalAdjustFactor", "proceeds", "quantity", "strike",
    "weight", "description", "issuer", "fromDate", "toDate", "expiry",
    "reportDate", "whenGenerated", "dateTime", "orderTime", "ingested_at",
)
```

The assembler agent will construct the full SQL from this metadata. Include the
downgrade logic: re-CREATE `ib_activity` and `ib_trades` from `orders` and `trades`
(reversing the split with AF aliased column names).

**Sub-agent commit protocol:**
```
git add api-backend\app\models\reconciliation.py
git add api-backend\alembic\versions\_0009_chunk_b1.py
git commit -m "refactor(db): consolidate reconciliation mixins into _TradeRow; add Order/Trade/SymbolSummary ORM (B-1)"
```

---

### Feature MIGRATION-ASSEMBLER — Assemble migration 0009

**This feature runs AFTER all ORM sub-agents have committed.**

**Purpose:** Collect the DDL chunks written by B-1, B-1b, B-2, B-3, B-4, and B-9,
then write the complete Alembic revision `0009_pc_workspace_db_refactor.py`.

**File to create:**
```
api-backend\alembic\versions\f1a2b3c4d5e6_0009_pc_workspace_db_refactor.py
```

(The revision hex `f1a2b3c4d5e6` is a placeholder — use a newly generated 12-hex
UUID prefix that does not collide with existing revisions. List
`api-backend\alembic\versions\` before writing to confirm no collision.)

**Revision header:**
```python
"""0009 pc workspace db refactor — IB staging split, models prospectus fields,
materials versioning, model symbols, allocation period models, precision types,
composite indexes.

Revision ID: f1a2b3c4d5e6   (replace with actual generated hex)
Revises: e5f6a7b8c9d0
Create Date: 2026-06-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"   # replace
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None
```

**`upgrade()` function must execute the following in order:**

1. **B-1 step 1 — CREATE orders, trades, symbol_summaries** (all columns from the
   `_TradeRow` mixin above; use `sa.Uuid(native_uuid=False)` for the `id` PK; use
   `sa.Numeric(28,10)` for Decimal columns, `sa.String(N)` for String columns,
   `sa.Text()` for Text columns, `sa.DateTime(timezone=True)` for datetime).
   Add indexes:
   - `CREATE UNIQUE INDEX uq_orders_orderID ON orders (orderID)`
   - `CREATE INDEX ix_trades_orderID ON trades (orderID)`
   - `CREATE UNIQUE INDEX uq_trades_execID ON trades (execID)`
   - `CREATE INDEX ix_symbol_summaries_symbol ON symbol_summaries (symbol)`
   - `CREATE UNIQUE INDEX uq_symbol_summaries_symbol_date ON symbol_summaries (symbol, tradeDate)`

2. **B-1 step 2-5 — Backfill data** using `op.execute()` with raw SQL:
   ```sql
   -- From ib_trades (TCF) — direct copy, no aliasing
   INSERT INTO trades (<all TCF cols>)
   SELECT <same cols> FROM ib_trades WHERE levelOfDetail = 'EXECUTION';

   INSERT INTO orders (<all TCF cols>)
   SELECT <same cols> FROM ib_trades WHERE levelOfDetail = 'ORDER';

   -- From ib_activity (AF) — aliased columns
   INSERT INTO trades (<TCF col names>)
   SELECT <AF col names with aliases> FROM ib_activity WHERE levelOfDetail = 'EXECUTION';

   INSERT INTO orders (<TCF col names>)
   SELECT <AF col names with aliases> FROM ib_activity WHERE levelOfDetail = 'ORDER';
   ```
   Use the alias table from B-1 above. NULL-fill TCF-only columns not present in
   AF (`brokerClearingCommission`, `brokerExecutionCommission`, `otherCommission`,
   `otherTax`, `salesTax`, `thirdPartyClearingCommission`,
   `thirdPartyExecutionCommission`, `thirdPartyRegulatoryCommission`,
   `tradeCharge`, `netCashWithBillable`, `allocatedTo`, `blockID`, `code`,
   `rfqID`).
   For `tradeID` in the AF→orders/trades backfill: the AF column is
   `transactionID` → target `tradeID`.

3. **B-1 step 6 — Drop old tables:**
   ```python
   op.drop_table("ib_activity")
   op.drop_table("ib_trades")
   ```

4. **B-1b — ADD 8 columns to models:**
   ```python
   op.add_column("models", sa.Column("description", sa.Text(), nullable=True))
   op.add_column("models", sa.Column("underlyings", sa.Text(), nullable=True))
   op.add_column("models", sa.Column("risk", sa.Text(), nullable=True))
   op.add_column("models", sa.Column("liquidity", sa.String(255), nullable=True))
   op.add_column("models", sa.Column("reporting", sa.String(255), nullable=True))
   op.add_column("models", sa.Column("nav_perf", sa.String(255), nullable=True))
   op.add_column("models", sa.Column("mgmt_fee", sa.Numeric(9, 6), nullable=True))
   op.add_column("models", sa.Column("incentive_fee", sa.Numeric(9, 6), nullable=True))
   ```

5. **B-2 — ADD version_no to model_materials and backfill:**
   ```python
   op.add_column(
       "model_materials",
       sa.Column("version_no", sa.Integer(), nullable=False, server_default="0"),
   )
   op.execute(
       "UPDATE model_materials "
       "SET version_no = COALESCE(CAST(SUBSTR(version, 2) AS UNSIGNED), 0)"
   )
   ```
   Note: `CAST(... AS UNSIGNED)` is MySQL/MariaDB. If targeting SQLite use
   `CAST(... AS INTEGER)`. Add an inline comment noting the dialect.

6. **B-3 — CREATE model_symbols:**
   ```python
   op.create_table(
       "model_symbols",
       sa.Column("model_id", sa.Uuid(native_uuid=False),
                 sa.ForeignKey("models.id", ondelete="CASCADE"), primary_key=True),
       sa.Column("symbol", sa.String(32), nullable=False, primary_key=True),
       sa.Column("weight", sa.Numeric(28, 10), nullable=True),
   )
   ```

7. **B-4 — CREATE allocation_period_models, backfill, DROP model_size column:**
   ```python
   op.create_table(
       "allocation_period_models",
       sa.Column("period_id", sa.Uuid(native_uuid=False),
                 sa.ForeignKey("allocation_periods.id", ondelete="CASCADE"),
                 primary_key=True),
       sa.Column("model_id", sa.Uuid(native_uuid=False),
                 sa.ForeignKey("models.id", ondelete="CASCADE"),
                 primary_key=True),
       sa.Column("model_name", sa.String(255), nullable=False),
       sa.Column("model_size", sa.Numeric(28, 10), nullable=False),
   )
   op.execute(
       "INSERT INTO allocation_period_models (period_id, model_id, model_name, model_size) "
       "SELECT DISTINCT ams.period_id, ams.model_id, m.name, ams.model_size "
       "FROM allocation_model_snapshots ams "
       "JOIN models m ON m.id = ams.model_id "
       "WHERE ams.model_size IS NOT NULL"
   )
   op.drop_column("allocation_model_snapshots", "model_size")
   ```

8. **B-9 — CREATE composite indexes:**
   ```python
   op.create_index(
       "ix_allocation_model_snapshots_user_period",
       "allocation_model_snapshots", ["user_id", "period_id"]
   )
   op.create_index(
       "ix_model_changes_model_id_created_at",
       "model_changes", ["model_id", "created_at"],
   )
   ```

**`downgrade()` function must reverse in FK-safe order:**

1. Drop B-9 indexes.
2. Restore `model_size` on `allocation_model_snapshots`; backfill from
   `allocation_period_models`; drop `allocation_period_models`.
3. Drop `model_symbols`.
4. Drop `version_no` from `model_materials`.
5. Drop 8 columns from `models` (B-1b).
6. Re-CREATE `ib_activity` and `ib_trades` with their original schemas (copy the
   column definitions from migrations 0006 / 0007 or directly from the original
   `_ActivityRow` / `_TradeConfirmRow` schema above — all columns, same types).
   Backfill:
   - `ib_trades` from `trades UNION ALL orders` (TCF columns direct copy).
   - `ib_activity` from `trades UNION ALL orders` using reverse aliases:
     `orderID→ibOrderID`, `execID→ibExecID`, `price→tradePrice`, `amount→tradeMoney`,
     `commission→ibCommission`, `commissionCurrency→ibCommissionCurrency`,
     `settleDate→settleDateTarget`, `tax→taxes`, `tradeID→transactionID`.
     Set AF-only columns to NULL.
7. Drop `orders`, `trades`, `symbol_summaries`.

After writing the file, delete the staging chunk files:
```
api-backend\alembic\versions\_0009_chunk_b1.py
api-backend\alembic\versions\_0009_chunk_b1b.py
api-backend\alembic\versions\_0009_chunk_b2.py
api-backend\alembic\versions\_0009_chunk_b3.py
api-backend\alembic\versions\_0009_chunk_b4.py
api-backend\alembic\versions\_0009_chunk_b9.py
```

**Sub-agent commit protocol:**
```
git add api-backend\alembic\versions\
git commit -m "feat(db): add migration 0009 PC workspace DB refactor (B-1/B-1b/B-2/B-3/B-4/B-9)"
```

---

## Execution Plan

### Phase 1 — Parallel (no inter-feature dependencies)

Send all six of these as a **single `Agent` tool call message** (multiple Agent
tool use blocks in one message) so they run concurrently:

| Agent | Feature | Files |
|---|---|---|
| Agent A | B-6 (UUID migration fix) | `0008_pc_workspace.py` only |
| Agent B | B-5 (ORM precision types) | `pc.py` only |
| Agent C | B-1b (prospectus fields) | `pc.py` + `_0009_chunk_b1b.py` |
| Agent D | B-2 (materials versioning) | `pc.py` + `_0009_chunk_b2.py` |
| Agent E | B-3 (model symbols table) | `pc.py` + `_0009_chunk_b3.py` |
| Agent F | B-4 (allocation period models) | `pc.py` + `_0009_chunk_b4.py` |

**Important for Agents B, C, D, E, F:** All five touch `pc.py`. Each must do a
surgical, non-overlapping edit. Before writing, each agent should read the current
`pc.py` (which may already include changes from a sibling agent if one commits
first). Use git pull/rebase if needed to avoid conflicts. If a conflict is
detected on commit, the agent should:
1. `git stash` its changes.
2. `git pull --rebase origin <WORKING_BRANCH>` (use the branch name captured at startup).
3. `git stash pop`.
4. Re-read `pc.py` to verify no overlap.
5. Re-commit.

**Simultaneously, run:**

| Agent | Feature | Files |
|---|---|---|
| Agent G | B-1 (IB staging split) | `reconciliation.py` + `_0009_chunk_b1.py` |
| Agent H | B-9 (performance indexes) | `_0009_chunk_b9.py` only |

B-1 (Agent G) touches only `reconciliation.py` — no conflict with Agents B–F.
B-9 (Agent H) writes a new file only — no conflict with anyone.

### Phase 2 — Sequential (wait for ALL Phase 1 agents to succeed)

After all Phase 1 commits are on the branch, run one agent:

| Agent | Feature | Files |
|---|---|---|
| Agent M | MIGRATION-ASSEMBLER | `f1a2b3c4d5e6_0009_*.py` (new) + delete chunk files |

Agent M reads all six chunk files, reads the current state of `pc.py` and
`reconciliation.py` to cross-check column names, then writes the complete
Alembic revision and deletes the staging chunks in one commit.

### Phase 3 — Sequential (after Phase 2 succeeds)

Run two final agents in parallel:

| Agent | Role |
|---|---|
| Agent V | Validation agent |
| Agent T | Testing agent |

---

## Sub-Agent Commit Protocol

Every sub-agent must follow this protocol exactly:

1. **Read all files to be modified first** before making any changes. Use the
   Read tool on each absolute path.
2. **Make surgical edits** — never rewrite an entire file unless the feature
   description says to do so (only B-1 / reconciliation.py is a full rewrite).
3. **Stage only the files this feature touches:**
   ```
   git add <file1> <file2> ...
   ```
   Never use `git add -A` or `git add .`.
4. **Commit with the message given in the feature's commit protocol section.**
5. **Verify the commit succeeded** with `git log --oneline -3`.
6. **Handle conflicts** per the pc.py conflict protocol in Phase 1 above.
7. **Do not push** — the orchestrator pushes after validation passes.

---

## Validation and Testing

### Validation Agent

Run after Phase 2 (MIGRATION-ASSEMBLER) completes.

**Working directory:** `api-backend\` (all commands run from here).
**Activate venv:** `api-backend\.venv\Scripts\activate` (PowerShell) or
`source api-backend/.venv/Scripts/activate` (Bash).

**Step 1 — Alembic upgrade:**
```powershell
cd "C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\api-backend"
.\.venv\Scripts\alembic.exe upgrade head
```
Expected: zero errors. Any `FAILED` or Python traceback = failure; report the
full output and stop.

**Step 2 — Alembic downgrade:**
```powershell
.\.venv\Scripts\alembic.exe downgrade -1
```
Expected: completes cleanly (exit code 0). The downgrade reverses 0009 and leaves
0008 as head.

**Step 3 — Re-upgrade** (confirm upgrade is idempotent after a downgrade):
```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

**Step 4 — ORM import check:**
```powershell
.\.venv\Scripts\python.exe -c "from app.models.pc import Model, ModelMaterial, ModelChange, ClientSubscription, AllocationPeriod, AllocationModelSnapshot, ModelSymbol, AllocationPeriodModel; from app.models.reconciliation import Order, Trade, SymbolSummary; print('ORM import OK')"
```
Expected output: `ORM import OK`. Any `ImportError` or `AttributeError` = failure.

**Step 5 — Report.** Report PASS/FAIL for each step with the exact command output.
If all four pass, report `ALL VALIDATION STEPS PASSED`.

### Testing Agent

Run concurrently with the Validation Agent (Phase 3).

**Step 1 — Locate test files referencing old table/class names:**
Search `api-backend\tests\` for any of: `IBActivity`, `IBTrade`, `ib_activity`,
`ib_trades`, `reconciliation`. List each file path and the matching line numbers.

**Step 2 — Verify new class imports:**
```powershell
cd "C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\api-backend"
.\.venv\Scripts\python.exe -c "
from app.models.pc import ModelSymbol, AllocationPeriodModel
from app.models.reconciliation import Order, Trade, SymbolSummary
print('New ORM classes import OK')
print('Order table:', Order.__tablename__)
print('Trade table:', Trade.__tablename__)
print('SymbolSummary table:', SymbolSummary.__tablename__)
print('ModelSymbol table:', ModelSymbol.__tablename__)
print('AllocationPeriodModel table:', AllocationPeriodModel.__tablename__)
"
```
Expected: all five table names printed correctly.

**Step 3 — Report.** Output:
- The list of test files that reference old names (these need updating in a
  follow-up task — do NOT change them here).
- PASS/FAIL for Step 2.
- A summary note that `reconciliation.py` exports `Order`, `Trade`, `SymbolSummary`
  and any caller importing `IBActivity` or `IBTrade` must be updated.

---

## Final Notes for the Orchestrator

- If any Phase 1 sub-agent fails, fix it before proceeding to Phase 2. A broken
  chunk file will cause the assembler to produce an invalid migration.
- If the MIGRATION-ASSEMBLER agent fails on the `alembic upgrade head` step
  (which it should test inline before committing), the orchestrator should ask
  it to diagnose and fix the migration before committing.
- The validation agent runs `upgrade head` and `downgrade -1` against the live
  development database. Confirm `DATABASE_URL` is set correctly in the environment
  or `.env` file at `api-backend\.env` before running the validation agent.
- Do NOT push to the remote. Stop after both the validation and testing agents
  report success. Leave pushing to the human.
