# 001 — MOBO Workspace Upgrade (admin-frontend)

**Date:** 2026-06-17
**Status:** Proposal (high-level) — not yet scheduled
**Scope:** Bring the admin-frontend MOBO workspace up to the new Claude-Design handoff (`megaannum-crm.zip` → `project/mobo-app/*`), section by section.
**Level:** Section/component intent and sequencing. Deliberately **not** an implementation spec — no per-line code.

---

## 1. Context

The admin-frontend already contains a **first-generation port** of the MOBO workspace (Dashboard, Trade Reconciliation, Daily Exception Report), built from an earlier version of the design. The new handoff is a **second-generation redesign** of the same three screens. This proposal audits the delta between what's shipped and what the new design specifies, and proposes the update per section.

Two sources were scanned in full:

- **Current:** `admin-frontend/app/(roles)/mobo/{dashboard,trade-reconciliation,daily-exception-report}/page.tsx`, `components/mobo/Shared.tsx`, `lib/mock/mobo-data.ts`.
- **New design:** `mobo-app/{MoboDashboard,MoboRecon,MoboExceptions,MoboShared,MoboData,Shell}.jsx`.

> **Critical caveat — data reality.** The new design tells a **three-way story** (`Trader → IB → MegaCRM`) with a **live-IB-vs-stored integrity** check. The backend today holds **only stored IB data** (`ib_activity` / `ib_trades`, storage-only staging tables); there is **no trader feed and no live IB fetch**. The reconciliation model we've agreed is **order-to-order, spanning both order-level and execution-level fields**. This proposal therefore separates the **visual/structural upgrade** (do now, design-faithful) from the **data wiring** (phased; two of the design's comparison columns have no source yet). See §6.

---

## 2. Audit summary — what changed, by section

| Section | Current state | New design | Delta size |
|---|---|---|---|
| **App shell / nav** | flat MOBO routes | collapsible role-group sidebar; role pages nested under the dashboard parent; "Monthly Reports" shared | Small |
| **Dashboard** | control-tower: 4 counters, today's recon, open-exceptions table, feeds & cutoffs, EOD card | **Essentially identical** | None / cosmetic |
| **Trade Reconciliation** | single two-way grid (Internal ATS ↔ IB API feed); order-level fields only; filter pills | **Two side-by-side three-way panels** (Trader↔IB, IB↔CRM); per-execution drill-down; data-integrity/sync leg; filter dropdown | **Major** |
| **Daily Exception Report** | static by-type rollup table + month-bar strip | **Trading-volume lead** (trades / fills / notional) + **by-leg break tables derived from the recon** + all-clear state + month-progress | **Major** |
| **Data layer** (`mobo-data.ts`) | two-way `RECON_LINES`; flat `EOD` | three-way `RECON_TRADES` (ti/ic legs, nested `execs`); enriched `EOD` (executions, notional, books); `INTEG` + break vocabulary | **Major** |
| **Shared components** (`Shared.tsx`) | `CompareGrid`, `TriageDetail` (order-level only) | adds `OrderExecBreakdown`, `ExecCompare`, `ExecRow`, `IntegrityDetail`, `IntegrityCompare`, `SyncMeta`, `INTEG`; `TriageDetail` routes to integrity view | **Major** |

**Bottom line:** Dashboard is done. The upgrade concentrates in **Trade Reconciliation**, **Daily Exception Report**, and the **data + shared-component layers** that both depend on.

---

## 3. Proposed updates — by section

### 3.1 App shell / navigation (Small)
Adopt the new collapsible role-group sidebar pattern: the MOBO group (Dashboard parent + "Trade Reconciliation", "Daily Exceptions" children) collapses, with "Monthly Reports" as a shared page below. Align the nav label "Daily Exceptions" with the existing `daily-exception-report` route. Low risk; do alongside the page work or fold into an existing nav refactor.

### 3.2 Dashboard (None / cosmetic)
No structural change required — the current page already matches the new design. Only re-point its summary figures at the same data source the recon screen uses, so the dashboard and recon never disagree. No redesign.

### 3.3 Trade Reconciliation (Major — the centrepiece)
Replace the single two-way grid with the new **two-panel** layout and **triage** interaction:

- **Resting state:** two side-by-side match panels — **Trader vs IB** (trade match) and **IB vs CRM** (data-integrity/sync check) — each a list of order rows with a match/break/missing gutter glyph.
- **Focused state:** clicking a row compresses the panels into a severity queue (≈290px) and slides in the triage panel — unchanged interaction model, but the triage now carries the **order-level field comparison plus the per-execution breakdown** (`OrderExecBreakdown`).
- **Order-to-order with executions:** each row is one order; the verdict is **derived** from order-level fields **and** its executions (an execution break propagates up). This replaces the current hand-set, order-only state.
- **Filter:** dropdown menu (All / Matched / Breaks / Unmatched) replacing the resting filter pills.
- **Summary counters & legend:** adopt the new set, but re-label per §6 (the "CRM out of sync" / auto-match figures imply comparisons we can't compute yet).

### 3.4 Daily Exception Report (Major)
Re-shape the report artifact to the new design:

- **Lead with trading volume** — trades reconciled (matched/total), executions/fills with avg-per-order, notional traded.
- **Broken records by where the break occurred** — two derived tables (Trader↔IB, IB↔CRM), each row a broken record pulled straight from the reconciliation legs, so the report and the recon screen are always consistent. This replaces the static "by type" rollup.
- **All-clear state** when zero exceptions; **month-progress** toward the Monthly Report; sign-off gated on zero open breaks (kept).
- Because the rows are **derived from the recon data**, this section can't ship before the recon data model (§3.5) lands.

### 3.5 Data layer — `lib/mock/mobo-data.ts` (Major, foundational)
Upgrade the shapes the two screens read:

- `RECON_LINES` (two-way) → `RECON_TRADES` (three records per trade; `ti`/`ic` legs; nested `execs`).
- Add the `INTEG` state vocabulary and the break-type vocabulary.
- Enrich `EOD` (executions, notional, books, matched-clean).
- Fold in the **agreed added fields**: Settlement date, Currency, Asset class, Trade date (order-level) and **Trade ID (execution-level)** — see §6.
- This is the **first thing to build**; everything else depends on it.

### 3.6 Shared components — `components/mobo/Shared.tsx` (Major)
Port the new primitives the design relies on: `OrderExecBreakdown`, `ExecCompare`, `ExecRow` (per-execution comparison), `IntegrityDetail` + `IntegrityCompare` + `SyncMeta` (the integrity leg), and the `INTEG` config. Extend `TriageDetail` to route integrity legs to `IntegrityDetail` and to render the order/execution breakdown. `CompareGrid`, `MetricStat`, `SegBar`, `richSub`, `Eyebrow` carry over.

---

## 4. Dependency order (high level)

1. **Data layer** (`mobo-data.ts`) — the shared foundation.
2. **Shared components** (`Shared.tsx`) — the new triage/exec/integrity primitives.
3. **Trade Reconciliation** page — consumes 1 + 2.
4. **Daily Exception Report** page — derives from 1 (+ recon legs).
5. **Shell/nav** + **Dashboard data re-point** — independent, any time.

---

## 5. Design-fidelity constraint (non-negotiable)

Per standing direction: **do not change the design, layout, or aesthetics.** This is a faithful port of the new mockups. All decisions below about data are about **what populates the components**, never about altering the components' look or structure.

---

## 6. Data reality — what's backable now vs blocked

The new design assumes four data identities. Only one exists today.

| Design identity | Backed by | Status |
|---|---|---|
| **Stored IB data** | `ib_activity` + `ib_trades` (order + execution rows, joined on `ibOrderID`/`orderID`) | ✅ Available |
| **IB-settled side** (left panel) | stored IB data | ✅ Available (same source) |
| **Trader blotter** (left panel, left side) | — no trader/OMS feed | ❌ No source |
| **Fetched / live IB** (right panel, left side) | — no live IB API | ❌ No source |

**Implications for the upgrade (recommended approach):**

- **Port the full design now** (structure + visuals), but **wire only the stored-IB column** with real data. Render the trader and fetched-IB columns with the components' existing empty/"no record" states — framed as *awaiting source*, **not** as breaks. Absence of a second source must not paint the book red.
- **Re-base the summary counters** that imply a comparison we can't run (auto-match %, "CRM out of sync", Trader↔IB breaks) onto single-source counts (orders stored, executions, notional, distinct accounts) until the comparison sources exist.
- **Break vocabulary:** keep Quantity / Price / Net-amount / Settlement / Commission / Missing-one-side. **FX-rate break is blocked** — `ib_trades` (TCF) has no FX column. The **live-sync integrity model** (synced/stale/drift + fetch/sync timeline) has no backend basis; two of its states survive as relabelled set-membership outcomes ("in Activity only" / "in Trade Confirms only").
- **Identifiers:** use the real IB order key (`ibOrderID`/`orderID`); drop the synthetic `TRD-`/`CRM-` refs.
- **Added fields** bind to: Settlement date (`settleDateTarget`/`settleDate`), Currency (`currency`), Asset class (`assetCategory`), Trade date (`tradeDate`) — order-level; **Trade ID (`tradeID`) — execution-level** (blank at ORDER level in IB Flex, so it surfaces per-execution).
- **Dates** are raw strings, timezone unknown — format client-side; don't imply a confirmed tz.

This keeps the UI design intact and **forward-compatible**: the trader and fetched-IB columns light up automatically once those feeds exist, with no further redesign.

---

## 7. Open decisions (for the human)

1. **Mock vs live data.** Ship the upgrade on the design's mock data first (fastest, fully design-faithful), then swap the stored-IB column to live `ib_activity`/`ib_trades` via an API? Or wire live data from the start? (No reconcile API/Pydantic schema exists yet — that's a separate backend task.)
2. **How to present the two unbacked columns.** Empty-state "awaiting source" (recommended) vs hiding the trader/fetched columns until their feeds exist vs an interim single-source view.
3. **Scope of this PR.** All four work items together, or land the data + shared-component foundation first and the two pages in a follow-up?

---

## 8. Out of scope

- Backend reconcile API / Pydantic schema / endpoint (none exists; separate effort).
- A trader/OMS feed or a live IB fetch pipeline (the two missing data sources).
- Monthly Reports screen (shared page; not part of this MOBO upgrade).
- Any change to `ib_activity`/`ib_trades` schema (storage-only; untouched).
