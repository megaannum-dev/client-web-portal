# 012 — Trade Reconciliation · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/012-trade-recon-integration-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `trade-reconciliation-integration-fe` — cut from `trade-reconciliation-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/012-trade-recon-integration-fe.md` |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/012-trade-recon-integration-db.md`, `docs/execution-schedules/012-trade-recon-integration-be.md` |
| Prompt (dispatch harness) | `docs/prompts/012-trade-recon-integration-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green: frozen seam (impl §7) agreed and matches proposal §4 verbatim; `NEXT_PUBLIC_API_BASE_URL` / `id_token` cookie flow already working for other MOBO screens.
- [ ] Backend layer's `GET /api/mobo/reconciliation` route reachable on the target API base URL — this is a **contract precondition** (impl doc header, impl §2), not a same-layer DAG edge and not "the Backend branch has merged." FE-1 through FE-4 can be built and unit-tested against a mocked `apiClient` before this is true; it only gates the human-verification step in §6 below.
- [ ] Layer branch `trade-reconciliation-integration-fe` cut from `trade-reconciliation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on the DB or BE layer schedules. The cross-layer seam is frozen in the proposal §4 and re-pinned in impl doc §7; those layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `trade-reconciliation-integration` — the human decides the merge order.

**Exit signal (what this run produces):** every unit FE-1…FE-6 committed on the layer branch, the final validation wave green, PR opened against `trade-reconciliation-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two FE-* units. No edge references a DB-* or BE-* unit ID; the Backend contract is a precondition (§2), not a DAG edge.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — new endpoint constant + server fetch function, no FE dependency |
| `FE-4` | — | root — pure mapper + type rewrite, independent of the fetch plumbing |
| `FE-2` | `FE-1` | `actions.ts` imports `getReconciliation` from `server/mobo` (added by FE-1) |
| `FE-3` | `FE-2`, `FE-4` | hook calls `getFlow` (FE-2) and `mapDtoToReconciliationFlow` (FE-4) |
| `FE-5` | `FE-3` | `page.tsx` imports `useReconciliationFlow` (FE-3) |
| `FE-6` | `FE-4`, `FE-5` | mock deletion requires nothing still imports it — `flow-types.ts`/`reconciliation-flow.ts` (FE-4) and `page.tsx` (FE-5) must no longer reference `mobo-flow-data.ts` |

**Graph invariants:**
- No cycles.
- Every edge is FE→FE only.
- An edge means "must be committed before the dependent starts."
- Absence of an edge = safe to run in parallel (FE-1 and FE-4 have no edge between them).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-4` | yes (2 parallel dispatches) | — |
| W2 | `FE-2` | no (1 unit) | W1 committed |
| W3 | `FE-3` | no (1 unit) | W2 committed |
| W4 | `FE-5` | no (1 unit) | W3 committed |
| W5 | `FE-6` | no (1 unit) | W4 committed + human gate (§6) |
| **W-final** | Validation + Test | yes (two dispatches) | W5 committed |

The chain `FE-1 → FE-2 → FE-3 → FE-5 → FE-6` is 5 units deep; `FE-4` folds into W1 (no dependency on FE-1) and is consumed by W3. Five feature waves is the minimum the DAG allows — no further collapsing is possible without violating an edge.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
    if wave == W4: hold for human sign-off (§6) before dispatching W5
open PR against trade-reconciliation-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 — endpoint + server fetch function | `admin-frontend/server/endpoints.ts`, `admin-frontend/server/mobo/index.ts` | commit exists on layer branch |
| `FE-4` | impl §6 FE-4 — rewrite mapper, remove scenario plumbing | `admin-frontend/lib/mobo/reconciliation-flow.ts`, `admin-frontend/lib/mobo/flow-types.ts` | commit exists on layer branch |

**Barrier before W2:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 — server action boundary | `admin-frontend/app/(roles)/mobo/trade-reconciliation/actions.ts` (create) | commit exists on layer branch |

**Barrier before W3:** commit exists AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 — `useReconciliationFlow` hook | `admin-frontend/hooks/api/useReconciliationFlow.ts` (create) | commit exists on layer branch |

**Barrier before W4:** commit exists AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6 FE-5 — cutover `page.tsx` to the hook + loading/error states | `admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx` | commit exists on layer branch |

**Barrier before W5:** commit exists, wave-gate checks pass, **and** the human verification gate in §6 is signed off (page confirmed rendering against a live seeded Backend endpoint with the same visual as the mock — impl doc §9 / proposal Execution & verification §3(c)). W5 deletes the mock fallback, so this confirmation must land before that safety net is removed.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-6` | impl §6 FE-6 — delete the mock | `admin-frontend/lib/mock/mobo-flow-data.ts` (delete) | commit exists on layer branch |

**Barrier before W-final:** commit exists AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd admin-frontend && npx next lint`
2. **Type-check** — `cd admin-frontend && npx tsc --noEmit`
3. **Unit tests** — `cd admin-frontend && npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `cd admin-frontend && npx next lint` (covered above) — no separate build step is required mid-run; the full `next build` runs once as part of W-final (§8).

Combined, per-wave one-liner: `cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint`.

**Human gates** (a wave cannot advance past them without human sign-off):
- [ ] **Before W5 (mock deletion) dispatches:** human confirms the FE-5 page renders against a live seeded Backend endpoint with the same visual as today's mock (proposal's Execution & verification §3(c); impl doc §9). This is the only human gate in this layer — everything else is fully automated to PR.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none found |

Checked explicitly: W1 is the only wave with more than one unit (`FE-1`, `FE-4`). `FE-1` touches `server/endpoints.ts` and `server/mobo/index.ts`; `FE-4` touches `lib/mobo/reconciliation-flow.ts` and `lib/mobo/flow-types.ts` — disjoint file sets, no overlap. No other unit in the impl doc's §6 Files lists touches either of `FE-1`'s or `FE-4`'s files. All other waves are single-unit by construction.

**The map is empty for every wave — all units are parallel-safe within their wave.**

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `FE-1`…`FE-6` has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified/deleted as specified).
- [ ] Public surface (impl §5 modules) matches impl doc — imports resolve, no dangling references to removed symbols.
- [ ] `git grep mobo-flow-data` and `git grep RcScenarioKey` both return zero hits (impl doc §9).
- [ ] No `any` types added (Frontend-layer invariant).
- [ ] `pnpm --filter admin-frontend build` (or `cd admin-frontend && npx next build`) passes.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `cd admin-frontend && npx vitest run`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `FE-7`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (frozen seam) suspends this run — the Backend layer must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W5 committed on the layer branch; each wave gate green.
- [ ] Human verification gate (§6) signed off before W5 dispatched.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `trade-reconciliation-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
