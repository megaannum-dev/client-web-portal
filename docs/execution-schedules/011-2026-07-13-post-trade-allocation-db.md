# 011 — Post-Trade Allocation · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` (the impl doc). This file does not restate the spec.
> Layer: Database — **one layer per file.**
> Branch: `post-trade-allocation-integration-db` — cut from parent `post-trade-allocation-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md`, `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/011-2026-07-13-post-trade-allocation-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-5` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Alembic history at head `350ce48e2f4d` (`0013_symbol_audit`) before this layer starts.
- [ ] Impl doc §7 seam is a verbatim copy of the proposal's §4.1 — checked before dispatch.
- [ ] Layer branch `post-trade-allocation-integration-db` cut from `post-trade-allocation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Backend or Frontend schedules. The seam is frozen in the proposal and re-pinned in impl doc §7; the sibling layers may run before, after, or concurrent with this one.

**Exit signal:** every unit in §3 committed on `post-trade-allocation-integration-db`, W-final green, PR opened against `post-trade-allocation-integration`. The orchestrator does not push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — creates `app/models/post_trade_allocation.py` with `post_trade_allocation_runs` + `RunStatus`/`RunTrigger` |
| `DB-2` | `DB-1` | `post_trade_allocations.run_id` FKs `post_trade_allocation_runs.id`, defined by DB-1 |
| `DB-3` | `DB-1` | `client_portfolios.last_run_id` FKs `post_trade_allocation_runs.id`, defined by DB-1 |
| `DB-4` | `DB-1` | `orders.allocated_run_id` FKs `post_trade_allocation_runs.id`, defined by DB-1 |
| `DB-5` | `DB-1`, `DB-2`, `DB-3`, `DB-4` | the migration materializes the exact shape all four model units define — cannot be authored before they land |

**Graph invariants:** no cycles; all edges intra-Database; `DB-2`, `DB-3`, `DB-4` share only the root dependency on `DB-1` and are otherwise independent of each other — safe to run in parallel, subject to the shared-file resolution in §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1` | no (single unit, root) | — |
| W2 | `DB-2`, `DB-3`, `DB-4` | yes in principle; `DB-2`/`DB-3` serialize on a shared file (§7) | W1 committed |
| W3 | `DB-5` | no (single unit) | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
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
| `DB-1` | impl §6 DB-1 — `post_trade_allocation_runs` table + `RunStatus`/`RunTrigger` enums | `create: api-backend/app/models/post_trade_allocation.py` | commit exists on layer branch |

**Barrier before W2:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-2` | impl §6 DB-2 — `post_trade_allocations` per-cell records, composite PK | `modify: api-backend/app/models/post_trade_allocation.py` | commit exists on layer branch |
| `DB-3` | impl §6 DB-3 — `client_portfolios` three-column balance | `modify: api-backend/app/models/post_trade_allocation.py` | commit exists on layer branch |
| `DB-4` | impl §6 DB-4 — `orders.allocated_run_id` idempotency marker | `modify: api-backend/app/models/reconciliation.py` | commit exists on layer branch |

**Barrier before W3:** all three rows above show a commit AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-5` | impl §6 DB-5 — Alembic revision `0014_post_trade_allocation` (create + backfill) | `create: api-backend/alembic/versions/<hash>_0014_post_trade_allocation.py`; `modify: api-backend/app/models/__init__.py`; `modify: api-backend/alembic/env.py` | commit exists on layer branch |

**Barrier before W-final:** row above shows a commit AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — n/a (impl doc §3.2: no lint/type config committed in `api-backend`).
2. **Type-check** — n/a (same note).
3. **Unit tests** — `cd api-backend && .venv/Scripts/python.exe -m pytest -q` if a test runner is present, else the in-memory-SQLite assertions from impl doc §8 (only tests for units already committed need pass at this point; e.g. after W1, only `DB-1`'s test is expected to exist and pass).
4. **Build / import smoke** — `cd api-backend && .venv/Scripts/python.exe -c "import app.models.post_trade_allocation"` (add `import app.models` after W3, once `__init__.py` is edited).

At the W3 boundary specifically, also run the migration round-trip from impl doc §3.2:
```bash
cd api-backend
.venv/Scripts/alembic.exe upgrade head
.venv/Scripts/alembic.exe downgrade -1
.venv/Scripts/alembic.exe upgrade head
```

**Human gates:**
- [ ] The live-DB migration apply (running `0014` against the live database, not just a dev copy) is called out in the impl doc §9/proposal as a human-owned cutover step — it happens **after** this schedule's W-final, outside this run. This schedule only requires `alembic upgrade head` / `downgrade -1` to round-trip clean on a dev-DB copy.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `api-backend/app/models/post_trade_allocation.py` | `DB-2`, `DB-3` | serialize: dispatch `DB-2` first, wait for its commit, then dispatch `DB-3` (still within W2) — both append a new class to the same file; `DB-4` (different file, `reconciliation.py`) runs fully in parallel with both. |

**All other waves' maps are empty** — `DB-1` and `DB-5` are single-unit waves with no contention.

**Rebase discipline for the W2 collision:**
1. `DB-3` waits until `DB-2`'s commit is on the layer branch.
2. `DB-3` runs `git pull --rebase` (against the layer branch, not `main`), re-reads `post_trade_allocation.py`, then appends its class after `DB-2`'s.
3. If `DB-3`'s rebase conflicts, `DB-3` resolves, re-runs its unit test, then commits. `DB-3` does not push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `DB-1`..`DB-5` has at least one commit on `post-trade-allocation-integration-db`.
- [ ] `app/models/post_trade_allocation.py` defines `PostTradeAllocationRun`, `PostTradeAllocation`, `ClientPortfolio`, `RunStatus`, `RunTrigger` exactly as impl §6 specifies (column set, composite PK on `post_trade_allocations`, signed `Numeric(28,10)` with no non-negative `CheckConstraint`).
- [ ] `Order` (in `reconciliation.py`) gains `allocated_run_id` — nullable, indexed, `ON DELETE SET NULL`.
- [ ] `app/models/__init__.py` exports the new classes; `alembic/env.py` imports the new module.
- [ ] `alembic heads` shows exactly one head after `0014` (no branch point).
- [ ] No existing column on `orders`, `models`, `allocation_periods`, `allocation_model_snapshots`, `allocation_period_models`, `client_profiles`, or `users` was altered or dropped — this layer is additive-only.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8 (in-memory-SQLite model tests) and the migration round-trip command from §6 above.
- Reports pass/fail counts and any failing test's first traceback frame or the first Alembic error.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `DB-6`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — the Backend and Frontend layers must acknowledge the seam change (via the proposal) before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W3 committed on `post-trade-allocation-integration-db`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `post-trade-allocation-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, applied the live-DB migration, or opened worktrees. Hand-off complete.
