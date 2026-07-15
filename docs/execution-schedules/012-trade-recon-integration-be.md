# 012 — Trade Reconciliation · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/012-trade-recon-integration-be.md` (the impl doc). This file does not restate the spec — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `trade-reconciliation-integration-be` — cut from `trade-reconciliation-integration` and merged back into it (human owns the merge).
> Worktrees: none. All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/012-trade-recon-integration-be.md` |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/012-trade-recon-integration-db.md`, `docs/execution-schedules/012-trade-recon-integration-fe.md` (predicted paths) |
| Prompt (dispatch harness) | `docs/prompts/012-trade-recon-integration-be.md` (predicted path) |

**Unit ID space this schedule sequences:** `BE-1 … BE-9` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] DB layer's three tables (`recon_sessions`, `algotrade_orders`, `algotrade_executions`) applied to the working DB (impl doc § 2 — an intra-repo-state precondition, not "DB layer's schedule/PR has run").
- [ ] The frozen seam (impl doc § 7) is agreed and matches the proposal § 4 verbatim.
- [ ] Layer branch `trade-reconciliation-integration-be` cut from `trade-reconciliation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in the impl doc's § 7; the FE and DB layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order.

**Exit signal:** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against `trade-reconciliation-integration`. The orchestrator does not push, does not merge — the human owns that.

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two BE-* units. No edge references a DB-* or FE-* unit ID; the DB layer's tables are covered as an entry precondition (§ 2), not a DAG edge.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root |
| `BE-2` | — | root |
| `BE-3` | — | root |
| `BE-4` | — | root |
| `BE-5` | — | root |
| `BE-6` | — | root |
| `BE-8` | — | root — impl doc's own § 6 note says the listed "BE-2" dependency is for module-grouping clarity only (`synth.py` imports `SourceKind` from `app/models/recon.py`, not from BE-2's `dtos.py`); no functional import edge exists, so treated as a root unit here |
| `BE-7` | `BE-2`, `BE-3`, `BE-4`, `BE-5`, `BE-6` | engine imports the DTOs, formatters, and all three adapters directly |
| `BE-9` | `BE-1`, `BE-4`, `BE-5`, `BE-6`, `BE-7` | router gate needs `Action.RECON_VIEW` (BE-1); presenter re-queries via the three adapters (BE-4/5/6) and calls `reconcile()` (BE-7) |

**Graph invariants:**
- No cycles.
- Every edge is between two BE-* units.
- An edge means "must be committed before the dependent starts."
- Absence of an edge = safe to run in parallel.

**Note for the human report:** no Dependencies line in the impl doc pointed at a sibling layer's unit ID — the DAG above is fully intra-layer as required.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1, BE-2, BE-3, BE-4, BE-5, BE-6, BE-8` | yes (7 units, 7 parallel dispatches) | — |
| W2 | `BE-7` | yes (1 unit) | W1 committed |
| W3 | `BE-9` | yes (1 unit) | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against trade-reconciliation-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl § 6 BE-1 | `modify: api-backend/app/libs/auth/actions.py` | commit exists on layer branch |
| `BE-2` | impl § 6 BE-2 | `create: api-backend/app/libs/reconciliation/dtos.py` | commit exists on layer branch |
| `BE-3` | impl § 6 BE-3 | `create: api-backend/app/libs/reconciliation/formatting.py` | commit exists on layer branch |
| `BE-4` | impl § 6 BE-4 | `create: api-backend/app/libs/reconciliation/adapters/__init__.py`, `create: api-backend/app/libs/reconciliation/adapters/algotrade.py` | commit exists on layer branch |
| `BE-5` | impl § 6 BE-5 | `create: api-backend/app/libs/reconciliation/adapters/ib.py` | commit exists on layer branch |
| `BE-6` | impl § 6 BE-6 | `create: api-backend/app/libs/reconciliation/adapters/crm.py` | commit exists on layer branch |
| `BE-8` | impl § 6 BE-8 | `create: api-backend/app/libs/reconciliation/algotrade/__init__.py`, `create: api-backend/app/libs/reconciliation/algotrade/synth.py`, `modify: api-backend/app/libs/post_trade_allocation/service.py` | commit exists on layer branch — **committed-on-branch only; see § 6 human gate before this code's hook path is ever exercised against a production Flex-import run** |

**Barrier before W2:** all rows above must show a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-7` | impl § 6 BE-7 | `create: api-backend/app/libs/reconciliation/engine.py` | commit exists on layer branch |

**Barrier before W3:** row above must show a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-9` | impl § 6 BE-9 | `create: api-backend/app/schemas/reconciliation.py`, `create: api-backend/app/libs/reconciliation/router.py`, `create: api-backend/app/libs/reconciliation/presenter.py`, `modify: api-backend/app/main.py` | commit exists on layer branch |

**Barrier before W-final:** row above must show a commit on the layer branch AND wave-gate checks (§ 6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave (W1, W2, W3), run in order from `api-backend/` — a failure blocks the next wave:

1. **Lint** — `ruff check .`
2. **Format** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl doc § 8 — only tests for units already committed need pass at this point)

**Human gates:**
- [ ] **Production synthesizer sign-off.** BE-8 (`synth.py` + its hook into `PostTradeAllocationService.run()`) is committed on the layer branch during W1 like any other unit — that commit alone only changes code on a branch, it does not execute anything. Per the proposal's Execution & verification section and impl doc § 3.2/§ 9, a human must sign off **before this hook path is ever exercised against a real, production IB Flex-import run** (i.e., before/at the point this branch's merged code is deployed and allowed to process live data). This schedule's own W1→W2 gate does not require that sign-off (no production run happens during this schedule); the sign-off is a precondition on the deployment that follows the human-owned merge in § 10, not a step this algorithm can automate. Do not treat BE-8's branch commit as authorization to run it live.
- [ ] No other human gates — the remainder of this run is fully automated to PR.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of § 5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none found — every file in every wave's file list is touched by exactly one unit |

**The map is empty for every wave — all units within each wave are truly parallel-safe.** Checked systematically: `actions.py` (BE-1 only), `dtos.py` (BE-2 only), `formatting.py` (BE-3 only), `adapters/__init__.py` + `adapters/algotrade.py` (BE-4 only), `adapters/ib.py` (BE-5 only), `adapters/crm.py` (BE-6 only), `algotrade/__init__.py` + `algotrade/synth.py` + `post_trade_allocation/service.py` (BE-8 only — no other unit touches `post_trade_allocation/service.py`), `engine.py` (BE-7 only, W2 solo), `schemas/reconciliation.py` + `reconciliation/router.py` + `reconciliation/presenter.py` + `main.py` (BE-9 only, W3 solo — no other unit touches `main.py`).

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc § 6 / § 9:
- [ ] Every unit ID `BE-1`…`BE-9` in § 3 has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl § 6 matches the actual working-tree state (created/modified as specified — no deletions expected).
- [ ] Public surface (impl § 5 modules) matches impl doc — imports resolve, no dangling references.
- [ ] `git grep synth` (production code only, excluding tests) returns exactly one import site (impl doc § 9 acceptance criterion).
- [ ] Route count: exactly one new route registered (`GET /api/mobo/reconciliation`) and no existing routes modified.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8, from `api-backend/`: `ruff check . && ruff format --check . && mypy app && pytest -q`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does not modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- Do not open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see § 9 change protocol).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-10`), then extend § 3/§ 4/§ 5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's § 7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Wave W1 (`BE-1, BE-2, BE-3, BE-4, BE-5, BE-6, BE-8`), W2 (`BE-7`), W3 (`BE-9`) each committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `trade-reconciliation-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
- [ ] Production synthesizer human gate (§ 6) remains outstanding and explicitly flagged to the human at hand-off — it is a post-merge/deployment gate, not satisfied by this schedule's completion.
