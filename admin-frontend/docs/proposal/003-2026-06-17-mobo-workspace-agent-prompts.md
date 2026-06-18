# 003 — MOBO Workspace Upgrade: Executable Agent Prompts

**Date:** 2026-06-17
**Refines:** [002 — Implementation & Orchestration Plan](./002-2026-06-17-mobo-workspace-implementation-plan.md)
**Use:** one prompt per sub-agent. Prepend §A (shared preamble) to each §B prompt. Launch per the waves in 002 §4.

---

## A. Shared preamble (prepend to EVERY agent prompt)

```
ROLE: You implement ONE feature of the MOBO workspace upgrade in admin-frontend (Next.js + React + TS + Tailwind). You have no prior chat context — everything you need is below.

READ FIRST (only what your task names):
- Plan: admin-frontend/docs/proposal/002-2026-06-17-mobo-workspace-implementation-plan.md (your commit + deps) and 001-...-mobo-workspace-upgrade.md §6 (data reality).
- New design source (JSX prototypes to port, mirror visuals exactly):
  C:\Users\JohnQin\AppData\Local\Temp\crm_extract\megaannum-crm\project\mobo-app\
  (if absent, re-extract C:\Users\JohnQin\Desktop\Megaannum CRM-handoff.zip)
- Backend models the types must mirror: api-backend/app/models/reconciliation.py (IBActivity/IBTrade; levelOfDetail=ORDER|EXECUTION).
- Reuse existing ported style: components/ui/{PageHeader,Button,Chip}, lib/icons, Tailwind tokens (var(--…), surface-*, on-surface, outline-variant…).

HARD RULES:
- Faithful port: DO NOT change layout/visuals/aesthetics. Match the existing admin-frontend porting idiom.
- Data flows ONLY through the C1 seam + types in lib/mobo/. A component/screen NEVER imports lib/mock directly.
- Domain types are named/shaped as backend Order/Execution (camelCase IB columns). UI shapes are DERIVED in the seam mapper, not hand-authored.
- DATA REALITY (only stored-IB data exists; no trader feed, no live IB fetch):
  · Populate the IB/stored column; render trader & fetched-IB columns as empty "awaiting source" — NOT as breaks.
  · Identifiers: real ibOrderID/orderID. No synthetic TRD-/CRM- refs.
  · Verdict is order-to-order spanning order + execution fields; an execution break propagates to the order.
  · Added fields: Settlement date, Currency, Asset class, Trade date (order-level); Trade ID (execution-level).
  · Drop FX-rate break. Reframe live-sync states (synced/stale/drift) as set-membership ("in Activity only"/"in Trade Confirms only"). Keep matched/break/missing.
  · Re-base comparison-implying counters (auto-match %, "CRM out of sync") to single-source counts.
- NO tests, NO lint/typecheck gating, NO validation files. Scope = admin-frontend/ only; don't touch api-backend or unrelated files.
- Finish by making EXACTLY ONE commit with the given message (end it with the Co-Authored-By trailer). DO NOT git push. DO NOT open a PR. DO NOT touch files outside your task.
```

---

## B. Agent prompts

### Wave 1

**`agent-types-seam` → C1**
```
TASK: Create the backend-aligned type layer + data-access seam (the contract every other agent binds to).
READ: design MoboData.jsx (RECON_TRADES shape), MoboShared.jsx (CompareField, INTEG, exec/leg shapes), MoboRecon.jsx (buildLegs → leg view model).
BUILD:
- lib/mobo/types.ts:
  · Domain: Order, Execution mirroring IBActivity/IBTrade columns (ibOrderID/orderID, buySell, quantity, tradePrice|price, netCash, settleDateTarget|settleDate, currency, assetCategory, tradeDate, tradeID, symbol, …). Optional fields where a column is source-specific.
  · View: ReconTrade with ti/ic legs, CompareField{k,iv,cv,d}, exec rows, match state (ok|brk|miss), integrity state (set-membership reframe), break-type vocab (NO FX-rate break).
- lib/mobo/reconciliation.ts:
  · A single provider, e.g. loadReconciliation(): returns view model. Returns a typed EMPTY stub for now (C2 wires the mock).
  · A domain→view mapper encoding: order-to-order+execution verdict, AF/TCF column coalescing, added fields, real identifiers, trader/fetched columns as empty "awaiting source".
GOAL: deleting lib/mock + pointing the provider at an API later requires ZERO edits here or in components.
COMMIT: feat(mobo): reconciliation domain types (backend-aligned) + data-access seam
```

**`agent-nav` → C6**
```
TASK: Collapsible role-group sidebar nav.
READ: design Shell.jsx (ROLE_GROUP/SHARED_PAGES, RoleGroup/SubItem/NavItem). Find the current admin-frontend sidebar component and port the pattern into it.
BUILD: MOBO group = Dashboard parent (click=navigate, chevron=toggle) + children "Trade Reconciliation", "Daily Exceptions"; "Monthly Reports" as a flat shared item below. Align label to the existing daily-exception-report route. Keep current visual tokens.
COMMIT: feat(mobo): collapsible role-group sidebar nav
```

### Wave 2 (after C1 landed)

**`agent-mock` → C2**
```
TASK: Purgeable mock dataset behind the seam.
READ: design MoboData.jsx (RECON_TRADES, EXCEPTIONS, FEEDS, EOD); C1 types in lib/mobo/types.ts.
BUILD: lib/mock/mobo-data.ts conforming EXACTLY to C1 domain types (header comment: "THROWAWAY MOCK — delete on API integration"). Wire it as the current source inside lib/mobo/reconciliation.ts (the ONLY import site of this module). Enrich EOD (executions, notional, books, matched-clean).
PURGE TEST: deleting this file + flipping the seam to an API must need no component/type edits.
COMMIT: feat(mobo): purgeable reconciliation mock dataset
```

**`agent-shared` → C3**
```
TASK: Execution + integrity triage primitives.
READ: design MoboShared.jsx; current components/mobo/Shared.tsx (keep CompareGrid/MetricStat/SegBar/richSub/Eyebrow).
BUILD into components/mobo/Shared.tsx: OrderExecBreakdown, ExecCompare, ExecRow, IntegrityDetail, IntegrityCompare, SyncMeta, INTEG config; extend TriageDetail to route integrity legs to IntegrityDetail and render the order/execution breakdown. Types from C1.
COMMIT: feat(mobo): execution + integrity triage primitives
```

**`agent-exceptions` → C5**
```
TASK: Rebuild Daily Exception Report.
READ: design MoboExceptions.jsx; current app/(roles)/mobo/daily-exception-report/page.tsx.
BUILD: trading-volume lead (trades / fills / notional); by-leg break tables DERIVED from the seam data (buildBreaks-style) so it matches the recon screen; all-clear state; month-progress; sign-off gated on zero open breaks. Data via C1 seam only.
COMMIT: feat(mobo): daily exception report (volume lead + derived break tables)
```

**`agent-dashboard` → C7**
```
TASK: Align dashboard figures to the reconciliation source.
READ: current app/(roles)/mobo/dashboard/page.tsx (already matches the design — no structural change).
BUILD: re-point summary figures/counters at the C1 seam so dashboard and recon never disagree; re-base comparison-implying values per data-reality rules.
COMMIT: feat(mobo): align dashboard figures to reconciliation source
```

### Wave 3 (after C3 landed)

**`agent-recon` → C4**
```
TASK: Rebuild Trade Reconciliation as the two-panel three-way screen.
READ: design MoboRecon.jsx; current app/(roles)/mobo/trade-reconciliation/page.tsx; C1 seam/types; C3 primitives.
BUILD: two side-by-side panels (Trader↔IB, IB↔CRM); click row → panels compress to a ~290px severity queue + slide-in triage; per-execution drill-down; dropdown filter (All/Matched/Breaks/Unmatched); order-to-order verdict (exec break → order breaks). Wire the stored-IB column via the seam; empty-state trader & fetched-IB columns; re-base counters. Data via C1 seam only.
COMMIT: feat(mobo): two-panel three-way trade reconciliation screen
```

---

## C. Orchestrator sequence

1. Branch `admin-frontend-mobo-workspace-upgrades`, scope admin-frontend/.
2. Wave 1: `agent-types-seam` ∥ `agent-nav` → land C1, C6.
3. Wave 2: `agent-mock` ∥ `agent-shared` ∥ `agent-exceptions` ∥ `agent-dashboard` → land C2, C3, C5, C7.
4. Wave 3: `agent-recon` → land C4.
5. Report commit list. **Stop — no push, no PR** (human does both).
