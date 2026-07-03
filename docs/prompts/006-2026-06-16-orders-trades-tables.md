# 006 — Execution Prompt: `orders` & `trades` Tables + One-Time CSV Import (IB Flex Activity)

**Date:** 2026-06-16
**Nature:** **Additive schema migration + one-time bulk data import into the live dev MariaDB.** Two new tables are created and populated from the two sample CSVs. No existing table is altered or touched. The CSVs are throwaway samples — this is a one-time load, NOT a permanent ingestion pipeline.
**Branch:** `db/orders-trades-006` (already cut from current `main`, sitting at tip `8d22e61`).

---

## Goal

1. Create two MariaDB tables — **`orders`** and **`trades`** — with **identical schemas** (all 89 source columns + infra columns).
2. Run the migration against the **live dev MariaDB** (`portal-mariadb`) to create the tables.
3. **One-time bulk import**: load `..._activity_Order.csv` → `orders`, `..._activity_Trade.csv` → `trades`.

---

## Context

The IB Flex "Activity" export produces two files with an **identical 89-column header** (verified):

- `..._activity_Order.csv` — rows where `levelOfDetail = ORDER` (one row per order). 348 data rows in the sample.
- `..._activity_Trade.csv` — rows where `levelOfDetail = EXECUTION` (one row per fill). 454 data rows in the sample.

### Order ↔ executions linkage

**`ibOrderID`** ties executions to their parent order. Verified against the sample:

| File | `ibOrderID` | `quantity` |
|---|---|---|
| Order | `470751732` | 200 |
| Trade (execution 1) | `470751732` | 120 |
| Trade (execution 2) | `470751732` | 80 |

i.e. `trades.ibOrderID = orders.ibOrderID` retrieves every execution that constitutes an order (120 + 80 = 200). Already part of the 89 columns — no new column needed, but **index it** on both tables (`VARCHAR(255)`; the Trade file's value is sometimes a dotted token, sometimes numeric — never assume integer).

---

## Decisions (locked — do not re-litigate)

- **D-A — Shared schema, defined once.** Both tables get the identical column set via one SQLAlchemy abstract mixin (`_ActivityRow`). The concrete `Order`/`Trade` models add nothing but `__tablename__` (+ the `ibOrderID` index). Schema drift is structurally impossible.
- **D-B — Typed columns** per Appendix A.
- **D-C — IB date/datetime fields kept as raw `String`** (NOT `Date`/`DateTime`). Rationale: the source is dirty (`expiry` appears as `N/A`, others as `--`/empty), the format is non-ISO (`YYYYMMDD` / `YYYYMMDD;HHMMSS`), and the timezone is unknown. Raw string is lossless and the import won't choke. Zero-padded strings still sort/range correctly. (Typed/derived date columns can be added later if a real ingestion layer is built.)
- **D-D — Surrogate PK.** `id` = `CHAR(32)` UUID (`Uuid(native_uuid=False)`, `default=uuid.uuid4`) — repo convention from migration 0003. CSV rows have no reliable single natural key (`transactionID`/`tradeID` are blank at the ORDER level).
- **D-E — Ingestion metadata.** `ingested_at` `DateTime(timezone=True)`, `server_default=func.now()`.
- **D-F — All 89 source columns nullable.** Samples contain many empty fields; ORDER vs EXECUTION rows populate different subsets.
- **D-G — Two linear migrations:** `0004` creates `orders`, `0005` creates `trades` (`0005.down_revision = 0004`). Do NOT create two migrations both pointing at `0003` (that branches Alembic history).
- **D-H — Import: empty cell → `NULL`.** Every empty CSV value (`""`) is imported as SQL `NULL`, for both string and numeric columns. Non-empty numeric strings are inserted as-is (MariaDB coerces to `Numeric`).
- **D-I — Import: truncate-then-load.** Each importer `TRUNCATE`s ONLY its own target table (`orders` or `trades`) before loading, so re-running yields exactly the CSV contents with no duplicates. It must NEVER touch any other table.
- **D-J — One-time throwaway importer.** A small parametrized script under `scripts/`, stdlib-only (`csv`, no pandas). Do NOT wire it into the Dockerfile, the API, or app startup.

**Environment facts (verified 2026-06-16):**
- Live DB: container `portal-mariadb`, healthy, host port `3306`. URL from settings: `mysql+pymysql://portal:portalsecret@localhost:3306/portal`. `.env` does not override `database_url`.
- Current Alembic head: `0003` = `8f2a1c9d4b6e` → `0004.down_revision = "8f2a1c9d4b6e"`.
- Models live in `app/models/`, exported via `app/models/__init__.py`, imported in `alembic/env.py`.
- Tooling: project `.venv` — `.venv/Scripts/python.exe`, `ruff`, `mypy`; migrations via `.venv/Scripts/python.exe -m alembic`.
- CSV source paths:
  - `C:\Users\JohnQin\Desktop\Trade Reconciliation Function\Sample Data\2026-06-06_activity_Order.csv`
  - `C:\Users\JohnQin\Desktop\Trade Reconciliation Function\Sample Data\2026-06-06_activity_Trade.csv`
- The test suite builds the schema via `create_all` on **SQLite** and does not run MariaDB migrations — keep models dialect-neutral (`sa.Numeric`, `sa.String`, `sa.Text`, `Uuid(native_uuid=False)`).

---

## Safety

- Backup the live DB before STAGE 2 (table creation) — a `mysqldump` of `portal` (or the existing `0002`/`0003` backup routine) is sufficient; the change is additive but always have a restore point.
- The migration is **additive only** (`create_table` / `drop_table` on the two NEW tables). It must not `ALTER`/`DROP` any existing table.
- The importer's `TRUNCATE` is scoped to its single target table. If any gate is red, stop and report — do not improvise around a failed assertion.

---

## Task split (one sub-agent per table)

### Subtask A — `orders` (run FIRST; owns the shared mixin + shared importer)

1. **Create `app/models/reconciliation.py`**: `_ActivityRow` abstract mixin (`__abstract__ = True`) declaring `id`, the 89 source columns (Appendix A), `ingested_at`; then `class Order(Base, _ActivityRow): __tablename__ = "orders"` with `__table_args__ = (Index("ix_orders_ibOrderID", "ibOrderID"),)`.
2. **Register** `Order` and `_ActivityRow` in `app/models/__init__.py`; add `import app.models.reconciliation  # noqa: F401` to `alembic/env.py`.
3. **Author migration** `alembic/versions/<rev>_0004_orders_table.py`, `down_revision = "8f2a1c9d4b6e"`. `upgrade()` = `op.create_table("orders", ...)` (all columns + the `ibOrderID` index); `downgrade()` = `op.drop_table("orders")`.
4. **Author the shared one-time importer** `scripts/import_activity_csv/run.py` (+ `__init__.py`), stdlib-only, parametrized by `--csv <path>` and `--table {orders,trades}`:
   - `csv.DictReader`; convert every `""` value → `None`.
   - For each row build the insert mapping from the DictReader keys (camelCase keys map 1:1 to the camelCase DB columns); set `id = uuid.uuid4().hex`; let `ingested_at` default.
   - `TRUNCATE TABLE <table>` first (D-I), then bulk `INSERT` (executemany / SQLAlchemy core `insert`) inside one transaction.
   - Print rows-read and rows-inserted; assert they match.
5. **Static gate:** `.venv/Scripts/ruff.exe format` + `ruff check` + `mypy app` clean (modulo the pre-existing `firebase_admin` stub); SQLite `create_all` builds `orders`.
6. **Live STAGE — orders:** backup DB → `.venv/Scripts/python.exe -m alembic upgrade head` (creates `orders`) → run importer for `Order.csv` into `orders`.
7. **Verify:** `SELECT COUNT(*) FROM orders` == 348 (sample); spot-check a known `ibOrderID` row. Report counts and stop.

### Subtask B — `trades` (run AFTER A; reuses the mixin + importer)

1. **Add** `class Trade(Base, _ActivityRow): __tablename__ = "trades"` to `app/models/reconciliation.py` with `__table_args__ = (Index("ix_trades_ibOrderID", "ibOrderID"),)`. Reuse `_ActivityRow` unchanged — do NOT redefine any column.
2. **Register** `Trade` in `app/models/__init__.py`.
3. **Author migration** `alembic/versions/<rev>_0005_trades_table.py`, `down_revision = "<0004 rev id from Subtask A>"`. Same `create_table`/`drop_table` shape for `trades`.
4. **Reuse** the Subtask A importer as-is (no changes; it is table-parametrized).
5. **Static gate:** same as Gate A, now covering `trades`; confirm `orders` and `trades` column defs are identical (single mixin source).
6. **Live STAGE — trades:** `.venv/Scripts/python.exe -m alembic upgrade head` (creates `trades`) → run importer for `Trade.csv` into `trades`.
7. **Verify:** `SELECT COUNT(*) FROM trades` == 454 (sample); spot-check that `SELECT COUNT(*) FROM trades WHERE ibOrderID = '470751732'` == 2 and their quantities sum to 200. Report counts and stop.

---

## Appendix A — Canonical column mapping (89 source columns)

DB column names = **exact camelCase source names** (so `csv.DictReader` keys map 1:1 to columns). If Python attributes are snake_case, pass `name="ibOrderID"` etc. to `mapped_column`; the index target references the DB column name `ibOrderID`.

**`sa.Numeric(28, 10)`, nullable (22 columns):**
`accruedInt, changeInPrice, changeInQuantity, closePrice, cost, fifoPnlRealized, fineness, fxRateToBase, ibCommission, initialInvestment, mtmPnl, multiplier, netCash, origTradePrice, principalAdjustFactor, proceeds, quantity, strike, taxes, tradeMoney, tradePrice, weight`

**Date `YYYYMMDD` → `sa.String(8)`, nullable (7 columns):**
`fromDate, toDate, expiry, origTradeDate, reportDate, settleDateTarget, tradeDate`

**Datetime `YYYYMMDD;HHMMSS` → `sa.String(20)`, nullable (7 columns):**
`whenGenerated, dateTime, holdingPeriodDateTime, openDateTime, orderTime, whenRealized, whenReopened`

**Free text → `sa.Text`, nullable (3 columns):**
`description, issuer, notes`

**`sa.String(255)`, nullable (50 columns):**
`accountId, period, acctAlias, assetCategory, brokerageOrderID, buySell, clearingFirmID, commodityType, conid, currency, cusip, deliveryType, exchOrderId, exchange, extExecID, figi, ibCommissionCurrency, ibExecID, ibOrderID, isAPIOrder, isin, issuerCountryCode, levelOfDetail, listingExchange, model, openCloseIndicator, orderReference, orderType, origOrderID, origTradeID, origTransactionID, positionActionID, putCall, relatedTradeID, relatedTransactionID, rtn, securityID, securityIDType, serialNumber, subCategory, symbol, tradeID, traderID, transactionID, transactionType, underlyingConid, underlyingListingExchange, underlyingSecurityID, underlyingSymbol, volatilityOrderLink`

**Infrastructure columns (added, not from CSV):**
- `id` — `Uuid(native_uuid=False)`, `primary_key=True`, `default=uuid.uuid4`
- `ingested_at` — `DateTime(timezone=True)`, `server_default=func.now()`

**Index:** `ibOrderID` on each table (`ix_orders_ibOrderID` / `ix_trades_ibOrderID`).

Total: 89 source + `id` + `ingested_at` = **91 columns** per table.

---

## Out of scope (do NOT do)

- No permanent ingestion pipeline / API endpoint / app-startup hook — the importer is a one-time throwaway script.
- No `Date`/`DateTime` casting of the IB date strings this round (kept raw — D-C).
- No FK between `trades` and `orders` (the link is the soft `ibOrderID` join; orders may be absent for a given execution batch).
- No `ALTER`/`DROP` of any existing table; the importer's `TRUNCATE` targets only its own new table.
