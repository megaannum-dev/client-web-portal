# 004 — PC Workspace: Implementation & Orchestration Plan

**Date:** 2026-06-24
**Source design:** Claude Design handoff — `megaannum-crm/project/pc/pc-app/PC Workspace.html` and its imports
(`Primitives.jsx`, `PCData.jsx`, `Shell.jsx`, `ModelManagement.jsx`, `AllocationMatrix.jsx`, `PCApp.jsx`).
**Branch:** `pc-workspace-frontend-pages` (current)
**Precedent:** mirrors [002 — MOBO Workspace Upgrade](./002-2026-06-17-mobo-workspace-implementation-plan.md). Same ground rules.

---

## Ground rules (inherited from 002)

1. **One commit per concrete feature.** Six implementation commits (F1–F6) + a validation pass (F7). Each commit is self-contained and compiles on its own.
2. **Agents commit; the human pushes & opens the PR.** Sub-agents author and commit their feature only. **No `git push`, no PR creation.**
3. **Design is untouched.** Faithful pixel port of the prototype; only *what populates* the components changes (mock → seam → API later).
4. **Scope is `admin-frontend/` only.** Do not touch `api-backend/`, `client-frontend/`, or unrelated files.
5. Each commit message ends with the trailer:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```

## Architecture principles (load-bearing)

### Modular, purgeable mock data — behind a seam
- Mock data lives in **one isolated module** (`lib/mock/pc-data.ts`), marked throwaway. **No component or screen imports the mock directly.**
- All data reaches the UI through **data-access seams** (`lib/pc/models.ts`, `lib/pc/allocation.ts`). Today the seams read the mock; tomorrow they call the backend — a one-file change.
- **Purge test:** deleting `lib/mock/pc-data.ts` and re-pointing the seams at the API must require **zero edits to components or types**.

### Types are the permanent layer
- `lib/pc/types.ts` holds backend-aligned domain types (`Model`, `Material`, `ChangeEntry`, `AllocationModel`, `AllocationClient`, `Allocation`, `Period`). Field names track the eventual backend columns. Screens depend on **types + seam signatures only** — never on the mock.

## Scope (faithful to the prototype)

- **PC role group home → Model Management** (the prototype has no PC dashboard; it lands on Model Management). Children: **Model Management** + **Allocation Matrix**. Monthly Reports remains a shared page (already built).
- Routes: `/pc/model-management`, `/pc/allocation-matrix`.

## Commit decomposition

| # | Commit | Primary file(s) | Depends on |
|---|---|---|---|
| **F1** | `feat(pc): model + allocation domain types, data-access seams & fee math` | `lib/pc/types.ts`, `lib/pc/models.ts`, `lib/pc/allocation.ts`, `lib/icons.ts` (icon additions) | — |
| **F2** | `feat(pc): purgeable model-book + allocation mock dataset` | `lib/mock/pc-data.ts` | F1 |
| **F3** | `feat(pc): shared workspace primitives (status/ticks/version/modal/fee calc)` | `components/pc/Shared.tsx` | F1 |
| **F4** | `feat(pc): model management screen (card grid + table, detail, create/edit, fee calc)` | `app/(roles)/pc/model-management/page.tsx` | F1, F3 |
| **F5** | `feat(pc): allocation matrix screen (period picker, units/% toggle, detail, edit, lock)` | `app/(roles)/pc/allocation-matrix/page.tsx` | F1, F3 |
| **F6** | `feat(pc): role group nav, layout & role guard` | `app/(roles)/pc/layout.tsx`, `components/sidebar/SidebarNav.tsx` | — |
| **F7** | validation pass (+ fix commit if needed) | — | F1–F6 |

**Why F1/F2 are separate:** F1 is the permanent type + seam layer; F2 is the purgeable mock. The mock must be deletable as its own unit and the seam flippable to the API without reopening F1.

## Execution

Sequential sub-agents (commits land in dependency order on one shared branch). Each agent: implements faithfully → self-reviews for redundancy/optimal design → typechecks → commits its single feature. After F1–F6, a validation agent verifies against the prototype and the purge test, dispatching a fix agent if anything fails.
