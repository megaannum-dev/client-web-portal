# 002 — MOBO Workspace Upgrade: Implementation & Orchestration Plan

**Date:** 2026-06-17
**Refines:** [001 — MOBO Workspace Upgrade](./001-2026-06-17-mobo-workspace-upgrade.md)
**Branch:** `admin-frontend-mobo-workspace-upgrades` (current)
**Execution model:** parallel sub-agents in isolated worktrees → one commit per feature, landed in dependency order.

---

## Ground rules

1. **One commit per concrete feature.** The semantic grouping is fixed in §2 (seven commits). Each commit is self-contained and compiles on its own.
2. **Agents commit; the human pushes & opens the PR.** Sub-agents author and commit their feature only. **No `git push`, no PR creation.**
3. **No validation/testing units.** Per directive, all test/QA/verifier/lint-gate stages are **deconstructed and removed** — no test commits, no verifier agents, no validation wave. (See §6.)
4. **Design is untouched.** Faithful port of the new mockups; only *what populates* the components changes (the data-reality rules in [001 §6](./001-2026-06-17-mobo-workspace-upgrade.md#6-data-reality--whats-backable-now-vs-blocked)).
5. **Scope is `admin-frontend/` only.** Do not touch the unrelated `api-backend/firebase-client-web-portal.json` change or any backend file.

---

## 1. Architecture principles (drive the decomposition)

These two principles are **load-bearing** for the whole plan, because the backend API is coming soon and the mock must not be in the way.

### 1a. Modular, purgeable mock data — behind a seam
- Mock data lives in **one isolated module** (`lib/mock/`), clearly marked as throwaway. **No component, screen, or shared primitive imports the mock directly.**
- All data reaches the UI through a single **data-access seam** (a provider/loader module, e.g. `lib/mobo/reconciliation.ts` exposing something like `loadReconciliation()`). Today the seam reads the mock module; tomorrow it calls the backend API — **a one-file change**.
- **Purge test:** deleting the mock module and re-pointing the seam at the API must require **zero edits to components or types**. That is the acceptance bar for "purgeable."

### 1b. Types mirror the backend `Order` / `Execution` models
- Frontend **domain types are named and shaped to match the backend models to be implemented** (`Order`, `Execution`), with field names tracking the backend columns (`ibOrderID`/`orderID`, `quantity`, `tradePrice`/`price`, `settleDateTarget`/`settleDate`, `currency`, `assetCategory`, `tradeDate`, `tradeID`, `buySell`, `symbol`, …) per `api-backend/app/models/reconciliation.py` (`IBActivity` / `IBTrade`, `levelOfDetail = ORDER | EXECUTION`).
- The design's UI shapes (reconciliation legs, comparison fields, match state) are a **separate view layer** *derived* from the domain types by a mapper inside the seam — never hand-authored into components.
- Net: when the API lands, its payload deserializes straight into the domain types, the mapper produces the same view model, and the screens are untouched. **The type layer survives the mock; the mock does not survive the API.**

---

## 2. Commit decomposition (seven features)

| # | Commit | Primary file(s) | Depends on |
|---|---|---|---|
| **C1** | `feat(mobo): reconciliation domain types (backend-aligned) + data-access seam` | `lib/mobo/types.ts`, `lib/mobo/reconciliation.ts` (seam + domain→view mapper) | — |
| **C2** | `feat(mobo): purgeable reconciliation mock dataset` | `lib/mock/mobo-data.ts` (conforms to C1 types; wired as the seam's current source) | C1 |
| **C3** | `feat(mobo): execution + integrity triage primitives` | `components/mobo/Shared.tsx` | C1 |
| **C4** | `feat(mobo): two-panel three-way trade reconciliation screen` | `app/(roles)/mobo/trade-reconciliation/page.tsx` | C1, C3 |
| **C5** | `feat(mobo): daily exception report (volume lead + derived break tables)` | `app/(roles)/mobo/daily-exception-report/page.tsx` | C1 |
| **C6** | `feat(mobo): collapsible role-group sidebar nav` | sidebar/shell nav component(s) | — |
| **C7** | `feat(mobo): align dashboard figures to reconciliation source` | `app/(roles)/mobo/dashboard/page.tsx` | C1 |

Each commit message ends with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

**Why C1 and C2 are separate commits:** this is the structural expression of principle 1a/1b. C1 is the **permanent** type + seam layer; C2 is the **purgeable** mock. Splitting them means the mock is deletable as its own unit and the seam can be flipped to the API without reopening C1. Screens (C4/C5/C7) and primitives (C3) depend on **C1 only** (types + seam signature) — never on C2 — so they compile against the contract, not the data.

### What rides inside each commit (not separate commits)
- **Data-reality wiring** (stored-IB column populated; trader & fetched-IB columns empty-stated as *awaiting source*; re-based metrics; dropped FX-break and live-sync model; real `ibOrderID`/`orderID` identifiers; added fields) lives **inside** C1 (types/vocab/mapper) and C4/C5 (empty-states, re-based counters).
- **Order-to-order verdict derived from order + execution fields** lives inside C1 (domain shape + mapper) and C4 (rendering).
- **Added fields** — Settlement date, Currency, Asset class, Trade date (order-level) + **Trade ID (execution-level)** — are part of C1's domain types.

---

## 3. Dependency graph

```
C1 (types + seam) ──┬─→ C2 (purgeable mock, behind the seam)
                    ├─→ C3 (shared primitives) ──→ C4 (recon screen)
                    ├─→ C5 (exception report)
                    └─→ C7 (dashboard align)

C6 (sidebar nav) ── independent ──
```
*C2 (mock) is needed at **runtime** for screens to show data, but not for **compilation** — screens bind to C1's contract. C2 therefore lands early in Wave 2 but blocks nothing's authoring.*

---

## 4. Orchestration — three waves of parallel agents

Agents within a wave run **concurrently in isolated git worktrees** (disjoint files). After each wave the orchestrator **lands the wave's commits onto `admin-frontend-mobo-workspace-upgrades` in dependency order** (fast-forward / cherry-pick — one commit per feature, linear history, no merge commits, no push).

| Wave | Agents (parallel) | Commits | Gate |
|---|---|---|---|
| **Wave 1** | `agent-types-seam`, `agent-nav` | C1, C6 | none |
| **Wave 2** | `agent-mock`, `agent-shared`, `agent-exceptions`, `agent-dashboard` | C2, C3, C5, C7 | C1 landed |
| **Wave 3** | `agent-recon` | C4 | C3 landed |

**Landed commit order:** C1 → C6 → C2 → C3 → C5 → C7 → C4. Max concurrency: 4 (Wave 2).

---

## 5. Per-agent briefs (high level)

Standing constraints for every agent: **port the new design faithfully (no layout/aesthetic change); follow the data-reality rules in 001 §6; consume data only through the seam and types from C1 (never import the mock directly); commit exactly one feature; do not push; no tests.**

- **`agent-types-seam` → C1.** Author the backend-aligned domain types (`Order`, `Execution` mirroring `IBActivity`/`IBTrade` columns), the UI view types (reconciliation legs, comparison fields, match/integrity state, break vocab), and the **data-access seam** — a single provider function plus a domain→view mapper that encodes the order-to-order-with-executions verdict, the coalescing of AF/TCF column names, the added fields, real `ibOrderID`/`orderID` identifiers, and the data-reality reframing (drop FX-break, set-membership instead of live-sync). The seam returns a typed empty/stub until C2 is wired. This is the contract everything else binds to.

- **`agent-nav` → C6.** Collapsible role-group sidebar (MOBO group: Dashboard parent + Trade Reconciliation / Daily Exceptions children; Monthly Reports shared). Align nav label to the `daily-exception-report` route. Independent.

- **`agent-mock` → C2.** Build the **purgeable** mock dataset in `lib/mock/`, conforming exactly to C1's domain types, and wire it as the seam's current source. Mark the module clearly as throwaway; ensure the purge test holds (delete module + flip seam = no component/type edits).

- **`agent-shared` → C3.** Port the new triage primitives into `Shared.tsx` (`OrderExecBreakdown`, `ExecCompare`, `ExecRow`, `IntegrityDetail`, `IntegrityCompare`, `SyncMeta`, `INTEG`); extend `TriageDetail` to route integrity legs and render the order/execution breakdown. Types from C1.

- **`agent-exceptions` → C5.** Rebuild the Daily Exception Report: trading-volume lead, by-leg break tables **derived from the reconciliation data via the seam** (kept consistent with the recon screen), all-clear state, month-progress, sign-off gated on zero open breaks. Seam + types from C1.

- **`agent-dashboard` → C7.** Re-point dashboard figures at the seam so dashboard and recon never disagree. No structural redesign.

- **`agent-recon` → C4.** Rebuild Trade Reconciliation as the two-panel three-way layout with compress-to-queue + slide-in triage, per-execution drill-down, dropdown filter, and the order-to-order verdict (execution break propagates to the order). Wire the stored-IB column via the seam; empty-state the trader & fetched-IB columns; re-base comparison-implying counters. Consumes C1 + C3.

---

## 6. Excluded by directive: validation & testing

Intentionally **not** in this plan: unit/integration test files, a verifier/QA agent, a typecheck/lint gating stage, or a validation wave. No commit adds or modifies tests. Implementers may sanity-check that their own change compiles while authoring, but that is **not** a tracked unit, produces no commit, and gates nothing.

---

## 7. Orchestrator run sheet

1. Confirm branch `admin-frontend-mobo-workspace-upgrades`, work scoped to `admin-frontend/`.
2. **Wave 1:** launch `agent-types-seam` (C1) ∥ `agent-nav` (C6). Land C1, then C6.
3. **Wave 2:** launch `agent-mock` (C2) ∥ `agent-shared` (C3) ∥ `agent-exceptions` (C5) ∥ `agent-dashboard` (C7). Land C2 → C3 → C5 → C7.
4. **Wave 3:** launch `agent-recon` (C4). Land C4.
5. Report the final commit list. **Stop. Do not push.** Hand back to the human for push + PR.

---

## 8. Result handed to the human

Seven linear commits on `admin-frontend-mobo-workspace-upgrades`, nothing pushed:

```
feat(mobo): reconciliation domain types (backend-aligned) + data-access seam
feat(mobo): collapsible role-group sidebar nav
feat(mobo): purgeable reconciliation mock dataset
feat(mobo): execution + integrity triage primitives
feat(mobo): daily exception report (volume lead + derived break tables)
feat(mobo): align dashboard figures to reconciliation source
feat(mobo): two-panel three-way trade reconciliation screen
```

When the backend API arrives: delete `lib/mock/`, point the seam (C1) at the endpoint, deserialize into the `Order`/`Execution` domain types — **no component or type changes**. The human pushes the branch and opens the PR.
