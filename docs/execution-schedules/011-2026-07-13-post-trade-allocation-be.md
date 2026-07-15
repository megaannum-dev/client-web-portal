# 011 — Post-Trade Allocation · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` (the impl doc). This file does not restate the spec.
> Layer: Backend — **one layer per file.**
> Branch: `post-trade-allocation-integration-be` — cut from parent `post-trade-allocation-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md`, `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/011-2026-07-13-post-trade-allocation-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-8` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green — the DB-layer objects (`post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, `orders.allocated_run_id`) already exist per the frozen seam (this is a schema-shape precondition, not "the DB schedule has run" — this layer builds against the seam, not against the sibling branch's progress).
- [ ] `allocation_periods` / `allocation_model_snapshots` / `allocation_period_models` (006/007) hold at least one confirmed period in the dev DB used for tests.
- [ ] Impl doc §7 seam is a verbatim copy of the proposal's §4.1 — checked before dispatch.
- [ ] Layer branch `post-trade-allocation-integration-be` cut from `post-trade-allocation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Database or Frontend schedules. The seam is frozen in the proposal and re-pinned in impl doc §7; the sibling layers may run before, after, or concurrent with this one.

**Exit signal:** every unit in §3 committed on `post-trade-allocation-integration-be`, W-final green, PR opened against `post-trade-allocation-integration`. The orchestrator does not push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root — scaffolds the package (`__init__.py`, `router.py`, `service.py`, `repository.py`, `scheduler.py`, `app/schemas/post_trade_allocation.py`) and mounts an initially route-less router in `main.py` |
| `BE-2` | `BE-1` | repository file lives in the module dir `BE-1` creates |
| `BE-3` | `BE-2` | service's `run()` calls the repository methods `BE-2` defines |
| `BE-4` | — | root — edits only `app/libs/auth/actions.py`; no dependency on the new package |
| `BE-5` | — | root — fills the schema stubs `BE-1` scaffolded; no dependency on repository/service |
| `BE-6` | `BE-2`, `BE-5` | GET-path assembly reads via the repository (`BE-2`) and returns the DTOs `BE-5` defines |
| `BE-7` | `BE-3`, `BE-4`, `BE-5`, `BE-6` | router wires the run route (`BE-3`), the action guards (`BE-4`), the schemas (`BE-5`), and the GET routes (`BE-6`) — cannot be written before all four exist |
| `BE-8` | `BE-3` | scheduler calls `service.run(trigger=SCHEDULED, ...)`, defined by `BE-3` |

**Graph invariants:** no cycles; all edges intra-Backend. `BE-4` and `BE-5` are true roots independent of `BE-1`/`BE-2`/`BE-3` — safe to run in the same wave as `BE-1`, subject to the shared-file resolution in §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1`, `BE-4`, `BE-5` | yes; `BE-1`/`BE-5` serialize on a shared file (§7) | — |
| W2 | `BE-2` | no (single unit) | W1 committed |
| W3 | `BE-3`, `BE-6` | yes in principle; serialize on a shared file (§7) | W2 committed |
| W4 | `BE-7`, `BE-8` | yes in principle; serialize on a shared file (§7) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl §6 BE-1 — package scaffold + mount points | `create: app/libs/post_trade_allocation/__init__.py`, `create: app/libs/post_trade_allocation/router.py`, `create: app/libs/post_trade_allocation/service.py`, `create: app/libs/post_trade_allocation/repository.py`, `create: app/libs/post_trade_allocation/scheduler.py`, `create: app/schemas/post_trade_allocation.py`, `modify: app/main.py` | commit exists on layer branch |
| `BE-4` | impl §6 BE-4 — `MOBO` authorization actions | `modify: app/libs/auth/actions.py` | commit exists on layer branch |
| `BE-5` | impl §6 BE-5 — response schemas (`PostTradeAllocationView` DTO) | `create: app/schemas/post_trade_allocation.py` | commit exists on layer branch |

**Barrier before W2:** all three rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6 BE-2 — `PostTradeAllocationRepository` | `modify: app/libs/post_trade_allocation/repository.py` | commit exists on layer branch |

**Barrier before W3:** row above shows a commit AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl §6 BE-3 — `PostTradeAllocationService.run()`, the 5-step run | `modify: app/libs/post_trade_allocation/service.py` | commit exists on layer branch |
| `BE-6` | impl §6 BE-6 — `PostTradeAllocationService` GET-path assembly | `modify: app/libs/post_trade_allocation/service.py` | commit exists on layer branch |

**Barrier before W4:** both rows above show a commit AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-7` | impl §6 BE-7 — router + route table + mount | `modify: app/libs/post_trade_allocation/router.py`, `modify: app/main.py` | commit exists on layer branch |
| `BE-8` | impl §6 BE-8 — env-var-gated scheduler | `modify: app/libs/post_trade_allocation/scheduler.py`, `modify: app/main.py` | commit exists on layer branch |

**Barrier before W-final:** both rows above show a commit AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check app/libs/post_trade_allocation app/schemas/post_trade_allocation.py && ruff format --check app/libs/post_trade_allocation app/schemas/post_trade_allocation.py`
2. **Type-check** — `cd api-backend && mypy app/libs/post_trade_allocation app/schemas/post_trade_allocation.py`
3. **Unit tests** — `cd api-backend && pytest -q tests/libs/post_trade_allocation` (impl doc §8 — only tests for units already committed need pass at this point; e.g. after W1, only `BE-1`/`BE-4`/`BE-5` tests are expected to exist and pass)
4. **Build / import smoke** — `cd api-backend && python -c "from app.main import app"`

**Human gates:**
- [ ] none — fully automated to PR. This layer only requires the DB objects to already exist (§2 preconditions); the live-DB migration itself is the Database schedule's human gate, not this one's.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `app/schemas/post_trade_allocation.py` | `BE-1`, `BE-5` | serialize: dispatch `BE-1` first (creates the file with placeholder stubs as part of the package scaffold), then `BE-5` after `BE-1`'s commit (fills in the real DTOs) — still within W1. |
| W3 | `app/libs/post_trade_allocation/service.py` | `BE-3`, `BE-6` | serialize: dispatch `BE-3` first (the `run()` method), then `BE-6` after `BE-3`'s commit (the GET-path assembly methods) — both add methods to the same class file; order is arbitrary but must be sequential, not simultaneous. |
| W4 | `app/main.py` | `BE-7`, `BE-8` | serialize: dispatch `BE-7` first (router mount line), then `BE-8` after `BE-7`'s commit (lifespan scheduler registration line) — independent lines in the same file. |

**Rebase discipline for each collision above:**
1. The second-dispatched unit waits until the first's commit is on the layer branch.
2. It runs `git pull --rebase` (against the layer branch, not `main`), re-reads the shared file, then makes its edit.
3. If the rebase conflicts, it resolves, re-runs its unit tests, then commits. It does not push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `BE-1`..`BE-8` has at least one commit on `post-trade-allocation-integration-be`.
- [ ] `app/libs/post_trade_allocation/{__init__,router,service,repository,scheduler}.py` and `app/schemas/post_trade_allocation.py` all exist; `app/main.py` mounts the router at `/api` and registers the scheduler in the lifespan.
- [ ] `Action.POST_TRADE_ALLOCATION_VIEW` / `Action.POST_TRADE_ALLOCATION_RUN` exist and are granted to `AdminRole.MOBO`; `AdminRole.ADMIN` remains `set(Action)` unedited.
- [ ] All three routes (`GET /api/mobo/post-trade-allocation`, `GET .../runs`, `POST .../run`) resolve in OpenAPI and are guarded by the documented actions.
- [ ] `PostTradeAllocationService.run()` never calls `abs()` on `proceeds` and never sums `amount` in place of `proceeds` (D-3 safety check — grep the committed `service.py`).
- [ ] No existing route, existing `Action` value, or existing file outside `app/libs/post_trade_allocation/`, `app/schemas/post_trade_allocation.py`, `app/libs/auth/actions.py`, and `app/main.py` was modified.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q tests/libs/post_trade_allocation` (from `api-backend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `BE-9`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — the Database and Frontend layers must acknowledge the seam change (via the proposal) before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `post-trade-allocation-integration-be`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `post-trade-allocation-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
