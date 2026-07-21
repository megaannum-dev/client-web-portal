# 013 — Client Onboarding Integration · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/013-client-onboarding-integration-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-onboarding-integration-fe` — cut from `client-onboarding-integration` and merged back into it (human owns the merge).
> Worktrees: **allowed, temporarily, only within a wave to resolve a same-file collision** (see §7) — an override for this dispatch, in place of pure in-wave serialization, to maximize parallelization. Outside of Wave W3's `mappers.ts` collision, all work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/013-client-onboarding-integration-fe.md` |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/013-client-onboarding-integration-db.md`, `docs/execution-schedules/013-client-onboarding-integration-be.md` |
| Prompt (dispatch harness) | `docs/prompts/013-client-onboarding-integration-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-9` (definitions live in the impl doc — do not restate them here). Units span two apps: `admin-frontend` (FE-1..FE-5, FE-9) and `client-frontend` (FE-6..FE-8).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] The frozen seam (impl doc §7, proposal §4, including the 2026-07-20 widening — D-9, admin-portal only) is agreed.
- [ ] admin-frontend's cookie-based `apiClient`/`apiClientFormData` (`server/api-client.ts`) already works for other admin screens — no new auth plumbing needed.
- [ ] client-frontend's `useAuth().getIdToken()` Bearer flow already works for other client screens — no new auth plumbing needed.
- [ ] Layer branch `client-onboarding-integration-fe` cut from `client-onboarding-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule builds against the wire contract (impl §7) and can be developed against a mocked `apiClient`/`fetch` response before the Backend layer branch merges — it does not wait on the Backend or Database schedules.

**Exit signal:** every unit FE-1..FE-9 committed on the layer branch, both apps' gates green, the final validation/test wave green, PR opened against `client-onboarding-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| FE-1 | — | root — admin-frontend types + server fetch functions |
| FE-2 | FE-1 | server action boundaries (`actions.ts` × 3) call the fetch functions FE-1 defines |
| FE-3 | FE-2, FE-9 | RM board wiring calls the FE-2 action boundary; the Start Onboarding modal's submit uses FE-9's fee-string→decimal conversion |
| FE-4 | FE-2 | Compliance wiring calls the FE-2 action boundary |
| FE-5 | FE-2 | PC allotments wiring calls the FE-2 action boundary |
| FE-6 | — | root — client-frontend data-access module (separate app, separate auth convention from FE-1) |
| FE-7 | FE-6 | client Portfolio wiring calls FE-6's fetch functions |
| FE-8 | FE-6 | client Events wiring calls FE-6's fetch functions |
| FE-9 | — | root — fee string→decimal conversion helper, consumed by FE-3 |

**Graph invariants:**
- No cycles.
- Every edge is between units in this layer only.
- Absence of an edge = safe to run in parallel, subject to the shared-file protocol in §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1, FE-6, FE-9` | yes (3 parallel dispatches — different files, different apps) | — |
| W2 | `FE-2, FE-7, FE-8` | yes (3 parallel dispatches — different files, different apps) | W1 committed |
| W3 | `FE-3, FE-4, FE-5` | serialized on one shared file (see §7) | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches, one per app) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-onboarding-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| FE-1 | impl §6.FE-1 — types + server fetch functions | `create: admin-frontend/lib/onboarding/types.ts`, `create: admin-frontend/server/onboarding/index.ts`, `modify: admin-frontend/server/endpoints.ts` | commit exists on layer branch |
| FE-6 | impl §6.FE-6 — client-frontend data-access module | `create: client-frontend/lib/api/onboarding.ts` | commit exists on layer branch |
| FE-9 | impl §6.FE-9 — fee string→decimal conversion | `modify: admin-frontend/components/rm/OnboardingModal.tsx` (or `create: admin-frontend/lib/onboarding/fee.ts`) | commit exists on layer branch |

**Barrier before W2:** all three rows above committed AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| FE-2 | impl §6.FE-2 — server action boundaries | `create: admin-frontend/app/(roles)/rm/onboarding-renewal/actions.ts`, `create: admin-frontend/app/(roles)/compliance/review/actions.ts`, `create: admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts` | commit exists on layer branch |
| FE-7 | impl §6.FE-7 — wire client Portfolio page | `create: client-frontend/lib/hooks/useSubscriptions.ts`, `modify: client-frontend/app/(dashboard)/portfolio/page.tsx`, `modify: client-frontend/lib/mock/data.ts` | commit exists on layer branch |
| FE-8 | impl §6.FE-8 — wire client Events page | `create: client-frontend/lib/hooks/useOnboardingEvents.ts`, `modify: client-frontend/app/(dashboard)/events/page.tsx` | commit exists on layer branch |

**Barrier before W3:** all three rows above committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| FE-3 | impl §6.FE-3 — wire RM board + modal + submit + doc upload | `create: admin-frontend/hooks/api/useOnboardingBoard.ts`, `create/modify: admin-frontend/lib/onboarding/mappers.ts` (board half), `modify: admin-frontend/components/rm/OnboardingBoard.tsx`, `modify: admin-frontend/components/rm/OnboardingModal.tsx`, `modify: admin-frontend/lib/mock/rm-data.ts` | commit exists on layer branch |
| FE-4 | impl §6.FE-4 — wire Compliance review + verdict + decide + download | `create: admin-frontend/hooks/api/useComplianceQueue.ts`, `create/modify: admin-frontend/lib/onboarding/mappers.ts` (compliance half), `modify: admin-frontend/app/(roles)/compliance/review/page.tsx`, `modify: admin-frontend/components/compliance/review/ObDetailPanel.tsx`, `modify: admin-frontend/components/compliance/review/RejectModal.tsx`, `modify: admin-frontend/lib/compliance/mock.ts` | commit exists on layer branch |
| FE-5 | impl §6.FE-5 — wire PC allotments + acknowledge | `create: admin-frontend/hooks/api/useAllotments.ts`, `create/modify: admin-frontend/lib/onboarding/mappers.ts` (PC half), `modify: admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `modify: admin-frontend/components/pc/allotment-redemption/AllotDetailPanel.tsx`, `modify: admin-frontend/lib/pc/allotment-redemption-mock.ts` | commit exists on layer branch |

**Serialization within this wave (shared file, see §7):** all three units append their own "half" to `admin-frontend/lib/onboarding/mappers.ts`. Dispatch order: FE-4 (compliance half) → FE-5 (PC half) → FE-3 (board half). Order is arbitrary (no logical dependency between the three halves) but must be sequential, not concurrent, against that one file.

**Barrier before W-final:** all three rows above committed AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave. Run both apps' gates whenever a wave touches both (W1, W2); run only the touched app's gate when a wave is single-app (W3 is admin-frontend only):

1. **Lint / format** — `cd admin-frontend && npx next lint` and/or `cd client-frontend && npx next lint` (whichever app the wave touched).
2. **Type-check** — `cd admin-frontend && npx tsc --noEmit` and/or `cd client-frontend && npx tsc --noEmit`.
3. **Unit tests** — `cd admin-frontend && npx vitest run` and/or `cd client-frontend && npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point).
4. **Build smoke** — `cd admin-frontend && npx next build` and/or `cd client-frontend && npx next build` — confirms no broken import after a page cutover.

**Human gates:**
- [ ] None — this layer is fully automated to PR. A live-backend visual confirmation in the browser (matching the proposal's Execution & verification step 3) is a *recommended* manual check before merge but is not a blocking gate in this schedule — the human may add one before merging the PR.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W3 | `admin-frontend/lib/onboarding/mappers.ts` | `FE-3, FE-4, FE-5` | **worktree override (this dispatch):** run all three concurrently, each in its own temporary worktree, instead of serializing. Each appends a distinct "half" (board/compliance/PC) to the same file, so merges are conflict-free append operations as long as they land in a fixed order. |
| W1, W2 | none | — | every other unit in W1/W2 touches files unique to itself; admin-frontend units (FE-1/FE-2/FE-9) and client-frontend units (FE-6/FE-7/FE-8) are in different apps entirely, so no cross-app collision is possible — no worktree needed |

**Worktree mechanics for Wave W3** (see the prompt doc for the exact commands — this schedule states the protocol, not the shell commands):
1. Before dispatch, the orchestrator creates three temporary worktrees off the current tip of `client-onboarding-integration-fe`, one per unit (FE-3, FE-4, FE-5).
2. Each sub-agent works entirely inside its own worktree — including running that worktree's own `npm install`/dependency setup if the worktree doesn't share `node_modules` with the main tree (see the prompt doc's Windows-specific guidance on this) — and commits its unit there.
3. As each worktree's commit completes, the orchestrator merges it back onto the layer branch **in a fixed order: FE-4 (compliance half) → FE-5 (PC half) → FE-3 (board half)** — matching the original serialization order, so `mappers.ts` accumulates its three sections deterministically regardless of which worktree actually finishes first. If a later merge conflicts (unexpected, since each unit appends to a distinct section), the orchestrator resolves it directly on the layer branch before proceeding.
4. Every temporary worktree is removed immediately after its merge lands — none survives past Wave W3's barrier.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID FE-1..FE-9 has at least one commit on the layer branch.
- [ ] `admin-frontend/lib/onboarding/types.ts`'s `OnboardingDTO`/`AllotRdmptDTO` interfaces carry every widened field per the proposal's current §4.1 (D-9): `client_ref`, `primary_phone`, `address`, `country_of_residence`, `id_type`, `id_number`, `ibhk_account`, `sw_account`, `mgmt_fee`, `incentive_fee` on `OnboardingDTO`; `agg_before`, `agg_after`, `expected_cash_in` on `AllotRdmptDTO`.
- [ ] `SubscriptionDTO` (client Portfolio) remains **unwidened** — no `symbol`/`country`/`sector`/`amount`/`modelLimit` fields added anywhere in the codebase for this proposal; confirm via grep that the Portfolio mapper's degraded fields are documented, not silently dropped.
- [ ] `ClientEventDTO` stays `id`/`category`/`title`/`body`/`created_at`; the Events page's icon/level/action-label chrome is a frontend-only static `category -> styling` lookup, not a new DTO field.
- [ ] All four page layouts are visually unchanged (no design/layout change per the proposal's standing constraint) — components' JSX structure diffs only in data source, not markup/classNames.
- [ ] `admin-frontend/lib/mock/rm-data.ts`, `admin-frontend/lib/compliance/mock.ts`, `admin-frontend/lib/pc/allotment-redemption-mock.ts` no longer export the deleted mock constants the pages used to import (`KYC_COLS`, `CO_ONBOARDING`, `AR_ALLOTMENTS_SEED`, etc.) — confirmed via grep for stale imports.
- [ ] No `any` types added.
- [ ] No dangling references to removed symbols; imports resolve in both apps.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8, both apps:
  - `cd admin-frontend && npx vitest run`
  - `cd client-frontend && npx vitest run`
- Confirms: DTO/view mapping tests for RM/Compliance/PC assert direct field pass-through (no `"—"` placeholder assertions for the now-widened fields); the Portfolio mapper's test asserts its DTO mapping stays exactly as originally scoped; the fee string→decimal conversion (FE-9) is covered.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `FE-10`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W3 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-onboarding-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
