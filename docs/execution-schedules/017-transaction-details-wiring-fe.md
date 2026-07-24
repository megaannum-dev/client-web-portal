# 017 — Transaction Details Wiring · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/017-transaction-details-wiring-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `transaction-details-wiring-fe` — cut from the current/parent branch `transaction-details-wiring` and merged back into it (human owns the merge). See [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/017-transaction-details-wiring-fe.md` |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 3 — Frontend" |
| Sibling layer schedules | `docs/execution-schedules/017-transaction-details-wiring-db.md` (Database), `docs/execution-schedules/017-transaction-details-wiring-be.md` (Backend) |
| Prompt (dispatch harness) | `docs/prompts/017-transaction-details-wiring-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-5` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green: the frozen seam in proposal §4 is agreed and unchanged (impl §7 is a verbatim copy); no live-DB or live-Backend dependency required — this layer builds and unit-tests green against seam mocks alone.
- [ ] Layer branch `transaction-details-wiring-fe` cut from parent `transaction-details-wiring` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on the Database or Backend layer schedules. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `transaction-details-wiring` — the human decides the merge order, and no schedule step here assumes one.

**Exit signal (what this run produces):** every unit in §3 committed on `transaction-details-wiring-fe`, the final validation wave green, PR opened against `transaction-details-wiring`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two FE-* units in this layer's impl doc. No edge references a Database or Backend unit ID — cross-layer coupling is resolved by the proposal's frozen seam (impl §7), which this layer builds against directly.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — widens `AllotRdmptDTO` and adds `TransactionDetailRequest`/`TransactionDetailDTO`; no other unit's types to build on |
| `FE-2` | `FE-1` | `server/rm/index.ts`'s `fileTransactionDetail`/`getTransactionDetail` and `actions.ts`'s wrappers import `TransactionDetailRequest`/`TransactionDetailDTO` from FE-1 |
| `FE-3` | `FE-1` | `allotmentToTxnRow` appends `dto.has_transaction_detail`, which only exists on `AllotRdmptDTO` once FE-1 lands |
| `FE-4` | `FE-1` | `TransactionDetailModal`'s `details` prop is typed `TransactionDetailDTO \| null`, defined in FE-1 |
| `FE-5` | `FE-2`, `FE-3`, `FE-4` | `SubscriptionAccordion` calls the FE-2 server actions, reads the FE-3 12th `TxnRow` element (`row[11]`), and renders the FE-4 dual-mode modal — all three must be in place first |

**Graph invariants:**
- No cycles.
- Every edge is between FE-* units.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel: FE-2, FE-3, FE-4 have no edges between each other.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1` | no (single unit) | — |
| W2 | `FE-2`, `FE-3`, `FE-4` | yes (3 units, 3 parallel dispatches) | W1 committed |
| W3 | `FE-5` | no (single unit) | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against transaction-details-wiring
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6.FE-1 — add `TransactionDetailRequest`/`TransactionDetailDTO`, widen `AllotRdmptDTO` with `has_transaction_detail: boolean` | `admin-frontend/lib/onboarding/types.ts` | commit exists on layer branch |

**Barrier before W2:** the row above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6.FE-2 — `ENDPOINTS.RM.TRANSACTION_DETAIL`, `fileTransactionDetail`/`getTransactionDetail` in `server/rm`, server-action wrappers in `actions.ts` | `admin-frontend/server/endpoints.ts`, `admin-frontend/server/rm/index.ts`, `admin-frontend/app/(roles)/rm/model-subscription/actions.ts` | commit exists on layer branch |
| `FE-3` | impl §6.FE-3 — widen `TxnRow` to a 12-tuple, `allotmentToTxnRow` appends `has_transaction_detail` | `admin-frontend/lib/mock/rm-data.ts`, `admin-frontend/lib/rm/subscriptions.ts` | commit exists on layer branch |
| `FE-4` | impl §6.FE-4 — `TransactionDetailModal` dual-mode (`mode`, `details`, `loading` props; view-only rendering) | `admin-frontend/components/rm/TransactionDetailModal.tsx` | commit exists on layer branch |

**Barrier before W3:** all three rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6.FE-5 — wire `SubscriptionAccordion` to the FE-2 actions, fetch+view-mode on click, drop ephemeral `filled` state, thread `onTransactionDetailFiled` up to `page.tsx` | `admin-frontend/components/rm/SubscriptionAccordion.tsx` (impl §6.FE-5 also notes a one-line prop-wiring touch to `app/(roles)/rm/model-subscription/page.tsx`) | commit exists on layer branch |

**Barrier before W-final:** the row above must show a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint** — `npx next lint` (from `admin-frontend/`)
2. **Type-check** — `npx tsc --noEmit` (from `admin-frontend/`)
3. **Unit tests** — `npx vitest run` (from `admin-frontend/`) — impl doc §8; only tests for units already committed need pass at this point
4. **Build / import smoke** — covered by the type-check + lint above; no separate build step required for this layer

**Human gates:**
- [x] none — fully automated to PR, per impl doc §2/§9 (this layer builds and tests entirely against seam mocks; live-Backend verification is a post-merge manual step, not a wave gate)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none found |

W2's three units (`FE-2`, `FE-3`, `FE-4`) touch six files across three disjoint groups — `server/endpoints.ts` + `server/rm/index.ts` + `actions.ts` (FE-2 only), `lib/mock/rm-data.ts` + `lib/rm/subscriptions.ts` (FE-3 only), `components/rm/TransactionDetailModal.tsx` (FE-4 only) — no file appears under more than one unit. **The map is empty; all three W2 units are truly parallel-safe.** W1 and W3 are single-unit waves, so no intra-wave collision is possible there by construction.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `FE-1` … `FE-5` has at least one commit on `transaction-details-wiring-fe`.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (modified as specified; no unlisted file touched).
- [ ] Public surface (impl §5 modules) matches impl doc — `TransactionDetailRequest`/`TransactionDetailDTO`/widened `AllotRdmptDTO` (5.1), `fileTransactionDetail`/`getTransactionDetail` (5.2), widened `TxnRow` (5.3), `TransactionDetailModal`'s `mode`/`details`/`loading` props (5.4), `SubscriptionAccordion`'s `onTransactionDetailFiled` prop (5.5) — imports resolve, no dangling references to removed symbols (in particular, the ephemeral `filled` state and its `TransactionDetails`-shaped `useState` per impl §6.FE-5 are gone).
- [ ] No `any` types added.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8.1: `npx vitest run` (from `admin-frontend/`).
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

- [ ] Every wave W1, W2, W3 committed on `transaction-details-wiring-fe`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `transaction-details-wiring`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
