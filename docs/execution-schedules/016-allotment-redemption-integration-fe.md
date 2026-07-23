# 016 — Allotment & Redemption Integration · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/016-allotment-redemption-integration-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `allotment-redemption-integration-fe` — cut from `allotment-redemption-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/016-allotment-redemption-integration-fe.md` |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 3 — Frontend" |
| Sibling layer schedules | `docs/execution-schedules/016-allotment-redemption-integration-db.md`, `docs/execution-schedules/016-allotment-redemption-integration-be.md` |
| Prompt (dispatch harness) | `docs/prompts/016-allotment-redemption-integration-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-7` (definitions live in the impl doc — do not restate them here). FE-6/FE-7 added by addendum 2026-07-23.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green: the frozen seam in proposal §4 is agreed and unchanged (impl §7 is a verbatim copy, not a negotiation); no live-DB or live-Backend dependency required — this layer compiles, type-checks, and unit-tests green against seam mocks alone.
- [ ] Layer branch `allotment-redemption-integration-fe` cut from `allotment-redemption-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** Per impl doc §1/§2, this layer's dependency on "the Backend layer's 4 new routes" is a **contract precondition, not a runtime one** — this layer is built entirely against the frozen seam (impl §7) and does not need Backend's code to exist or be merged. Only genuine end-to-end (cross-layer) testing — out of scope for this schedule — requires the Backend routes live. This schedule does **not** wait on the Backend or Database layer schedules to run, finish, or merge.

**Exit signal (what this run produces):** every unit in §3 committed on the layer branch, the final validation wave green, PR opened against `allotment-redemption-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two FE-* units in this layer's impl doc. No edge references a DB-* or BE-* unit — that coupling was resolved once, in the proposal's frozen seam (impl §7), and this layer builds against that contract.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — widens `AllotRdmpStatus` and adds the request DTO types every other unit imports |
| `FE-2` | `FE-1` | `submitAllotment`/`submitRedemption` server actions take `SubmitAllotmentReq`/`SubmitRedemptionReq` params introduced by FE-1 |
| `FE-3` | `FE-2` | modal's `handleSubmit` calls the `submitAllotment`/`submitRedemption` server actions introduced by FE-2 |
| `FE-4` | `FE-1` | `statusToChip` switches over the widened `AllotRdmpStatus` union introduced by FE-1 |
| `FE-5` | `FE-3` | dropdown props feed `context.clientId`/`context.modelId`, the fields FE-3 wired into `handleSubmit`'s payload construction |
| `FE-6` | `FE-1` | uses `RedemptionDecisionReq` type introduced by FE-1 |
| `FE-7` | `FE-6` | `decideRedemption` in the hook calls the `pcDecideRedemption` action introduced by FE-6; `RedemptionView` uses `AllotRdmpStatus` from FE-1 |

**Graph invariants:**
- No cycles.
- Every edge is between FE-* units only.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel: `FE-2` and `FE-4` share only the `FE-1` dependency and no edge exists between them → they are parallel-safe (see §7 for the file-disjointness check that confirms this holds in practice).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1` | no (single unit) | — |
| W2 | `FE-2`, `FE-4` | yes (2 units, 2 parallel dispatches) | W1 committed |
| W3 | `FE-3` | no (single unit) | W2 committed |
| W4 | `FE-5` | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |
| W5 | `FE-6` | no (single unit) | W-final passed (addendum) |
| W6 | `FE-7` | no (single unit) | W5 committed |
| **W-final-2** | Validation + Test | yes (two dispatches) | W6 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against allotment-redemption-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 — widen `AllotRdmpStatus` + add request DTOs | `admin-frontend/lib/onboarding/types.ts` | commit exists on layer branch |

**Barrier before W2:** FE-1 committed on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 — endpoints + API client + server actions | `admin-frontend/server/endpoints.ts`, `admin-frontend/server/rm/index.ts`, `admin-frontend/app/(roles)/rm/model-subscription/actions.ts` | commit exists on layer branch |
| `FE-4` | impl §6 FE-4 — status-aware chip mapping + D-5 rejected-row treatment | `admin-frontend/lib/rm/subscriptions.ts`, `admin-frontend/lib/mock/rm-data.ts`, `admin-frontend/components/rm/SubscriptionAccordion.tsx` | commit exists on layer branch |

**Barrier before W3:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 — wire modal submit + refetch | `admin-frontend/components/rm/SubscriptionFormModal.tsx`, `admin-frontend/components/rm/SubscriptionAccordion.tsx` (context plumbing only), `admin-frontend/hooks/api/useSubscriptions.ts`, `admin-frontend/app/(roles)/rm/model-subscription/page.tsx` | commit exists on layer branch |

**Barrier before W4:** FE-3 committed on the layer branch AND wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6 FE-5 — Recommend-tier: source new-subscription dropdowns from live data | `admin-frontend/components/rm/SubscriptionFormModal.tsx`, `admin-frontend/app/(roles)/rm/model-subscription/page.tsx` | commit exists on layer branch |

**Barrier before W-final:** FE-5 committed on the layer branch AND wave-gate checks (§6) pass.

### Wave W5 (Addendum 2026-07-23)
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-6` | impl §6 FE-6 — PC/CO decide endpoint constants + server functions + actions | `admin-frontend/server/endpoints.ts`, `admin-frontend/server/onboarding/index.ts`, `admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts`, `admin-frontend/app/(roles)/compliance/review/actions.ts` | commit exists on branch |

**Barrier before W6:** FE-6 committed AND wave-gate checks (§6) pass.

### Wave W6 (Addendum 2026-07-23)
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-7` | impl §6 FE-7 — wire PC redemptions tab to live data | `admin-frontend/lib/onboarding/types.ts`, `admin-frontend/lib/onboarding/mappers.ts`, `admin-frontend/hooks/api/useAllotments.ts`, `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `admin-frontend/components/pc/allotment-redemption/RedeemTable.tsx`, `admin-frontend/components/pc/allotment-redemption/RedeemDetailPanel.tsx`, `admin-frontend/components/pc/allotment-redemption/StatStrip.tsx` | commit exists on branch |

**Barrier before W-final-2:** FE-7 committed AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint** — `npx next lint`
2. **Type-check** — `npx tsc --noEmit`
3. **Unit tests** — `npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point)

(No separate "build/import smoke" step beyond the above — `tsc --noEmit` + `next lint` are the layer's build-time signal per impl doc §3.2; no additional command is specified there.)

**Human gates:**
- [ ] none — fully automated to PR. This layer has no live-DB or live-Backend dependency (impl §2); the only human step in the entire flow is the eventual PR merge, owned by the user per repo convention.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | — none — | `FE-2`, `FE-4` | **Verified disjoint.** FE-2 touches `server/endpoints.ts`, `server/rm/index.ts`, `actions.ts`; FE-4 touches `lib/rm/subscriptions.ts`, `lib/mock/rm-data.ts`, `components/rm/SubscriptionAccordion.tsx`. Zero file overlap — both units dispatch in true parallel within W2, no serialization needed. |

**W2's map is empty — all its units are truly parallel-safe.**

**Cross-wave same-file notes (not collisions — flagged for dispatch hygiene only):**

- `admin-frontend/components/rm/SubscriptionAccordion.tsx` is touched by `FE-4` in **W2** (chip-rendering edit) and again by `FE-3` in **W3** (context plumbing only — adding `modelId` to the constructed `SubscriptionModalContext`). This is a **cross-wave edit, not a same-wave collision** — W3 does not start until W2's barrier (§6) is green and FE-4's commit is on the layer branch. No resolution step is needed beyond the standard wave barrier, but the agent dispatched for FE-3 **must re-read `SubscriptionAccordion.tsx` fresh from the layer branch at W3 start** (not from a stale checkout taken before W2 committed), so it edits on top of FE-4's already-landed chip-mapping changes rather than a pre-W2 snapshot.
- `admin-frontend/components/rm/SubscriptionFormModal.tsx` and `admin-frontend/app/(roles)/rm/model-subscription/page.tsx` are touched by `FE-3` in **W3** and again by `FE-5` in **W4**. Same pattern: cross-wave, not same-wave — W4 does not start until W3's barrier is green. The agent dispatched for FE-5 must re-read both files fresh from the layer branch at W4 start, editing on top of FE-3's landed submit-wiring rather than a stale pre-W3 snapshot.

**Rebase discipline (applies to both cross-wave notes above, and to any future same-wave serialization):**
1. The later unit's agent waits until the earlier unit's commit is on the layer branch (guaranteed by the wave barrier itself for cross-wave cases).
2. It runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If its rebase conflicts, it resolves, re-runs unit tests, then commits. It **does not push**.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID FE-1..FE-5 has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state: `lib/onboarding/types.ts` (FE-1); `server/endpoints.ts`, `server/rm/index.ts`, `actions.ts` (FE-2); `SubscriptionFormModal.tsx`, `SubscriptionAccordion.tsx`, `useSubscriptions.ts`, `page.tsx` (FE-3); `lib/rm/subscriptions.ts`, `lib/mock/rm-data.ts`, `SubscriptionAccordion.tsx` (FE-4); `SubscriptionFormModal.tsx`, `page.tsx` (FE-5).
- [ ] Public surface matches impl doc §5: `AllotRdmpStatus`/`SubmitAllotmentReq`/`SubmitRedemptionReq`/`RedemptionDecisionReq`/`AllotRdmptDTO` (5.1); `submitAllotment`/`submitRedemption` (5.2); `onSuccess` prop + `refetch`/`invalidateClientAllotments` (5.3); `statusToChip` (5.4); `availableClients`/`availableModels` props (5.5) — imports resolve, no dangling references to removed symbols.
- [ ] No `any` types introduced anywhere in the changed files (Frontend-layer invariant).
- [ ] `npx tsc --noEmit` clean.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8.1: `npx vitest run`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `FE-6`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling (Database, Backend) layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `allotment-redemption-integration-fe`; each wave gate (§6: `npx next lint`, `npx tsc --noEmit`, `npx vitest run`) green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `allotment-redemption-integration`.
- [ ] (Addendum) Every wave W5…W6 committed; W-final-2 validation + test: PASS.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
