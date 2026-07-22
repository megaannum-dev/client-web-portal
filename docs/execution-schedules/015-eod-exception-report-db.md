# 015 — End-of-Day Exception Report · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/015-eod-exception-report-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: Database — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `<parent-branch>-db` — cut from the current/parent branch and merged back into it (human owns the merge). See `templates/implementation_details.md` §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/015-eod-exception-report-db.md` |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/015-eod-exception-report-be.md`, `docs/execution-schedules/015-eod-exception-report-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/015-eod-exception-report-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-4` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Alembic head `b1c2d3e4f5a6` applied to the working DB (impl doc §2).
- [ ] The frozen seam (impl doc §7) is agreed and matches the proposal § 4 verbatim.
- [ ] Layer branch `<parent-branch>-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Backend or Frontend schedules. The cross-layer seam is frozen in the proposal and re-pinned in this layer's impl doc §7; those layers may run before, after, or concurrent with this one.

**Exit signal:** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against the parent branch. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| DB-1 | — | root — creates `app/models/eod.py` with `EodRecord`/`EodStatus`/`EodOutcome` |
| DB-2 | DB-1 | adds `EodBreakRecord`/`EodLeg` to the same file, FKs `EodRecord.id` |
| DB-3 | DB-1, DB-2 | `app/models/__init__.py` re-export requires both classes to exist |
| DB-4 | DB-1, DB-2, DB-3 | migration's `op.create_table` calls must match the finished model classes, including the registered re-export |

**Graph invariants:** no cycles; this is a strictly linear chain (each unit both builds on and shares a file with its predecessor) — no parallelism is possible within this layer, matching the impl doc's own note that DB-1/DB-2 land in one file and DB-4 needs all three prior units done first.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | DB-1 | no (single unit) | — |
| W2 | DB-2 | no (single unit) | W1 committed |
| W3 | DB-3 | no (single unit) | W2 committed |
| W4 | DB-4 | no (single unit) | W3 committed |
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
| DB-1 | impl §6.DB-1 — `eod_records` header table | `create: api-backend/app/models/eod.py` | commit exists on layer branch |

**Barrier before W2:** the row above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-2 | impl §6.DB-2 — `eod_break_records` frozen-snapshot table | `modify: api-backend/app/models/eod.py` | commit exists on layer branch |

**Barrier before W3:** as above.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-3 | impl §6.DB-3 — `app/models/__init__.py` re-export | `modify: api-backend/app/models/__init__.py` | commit exists on layer branch |

**Barrier before W4:** as above.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-4 | impl §6.DB-4 — migration creating both tables | `create: api-backend/alembic/versions/<hash>_0020_eod_records.py` | commit exists on layer branch; `alembic upgrade head` / `downgrade -1` both verified on a scratch DB |

**Barrier before W-final:** as above.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check . && ruff format --check .`
2. **Type-check** — `cd api-backend && mypy app`
3. **Unit tests** — `cd api-backend && pytest -q` (impl doc § 8 — only tests for units already committed need pass at this point; W1-W3 have no runnable model-level tests until DB-2's `EodBreakRecord` exists for the cascade test, so W1/W2 gates are effectively lint+type-check only, with `pytest -q` passing vacuously)
4. **Build / import smoke** — `cd api-backend && python -c "import app.models.eod"` (W1+), `python -c "from app.models import EodRecord"` (W3+)

**Human gates:**
- [ ] none — fully automated to PR. (Applying the migration to a shared/staging DB, per the proposal's Execution & verification, is a deployment-time step that happens after this PR merges — not a gate within this schedule.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:** empty for every wave — DB-1/DB-2 touch the same file (`app/models/eod.py`) but land in **different waves** (W1, W2 respectively), so no same-wave collision occurs. DB-3/DB-4 each touch their own distinct file.

**If the map is empty for a wave, all its units are truly parallel-safe.** (Here, every wave has exactly one unit, so parallelism is moot regardless.)

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] DB-1 through DB-4 each have at least one commit on the layer branch.
- [ ] `api-backend/app/models/eod.py` defines `EodRecord`, `EodBreakRecord`, `EodStatus`, `EodLeg`, `EodOutcome` exactly as impl §6's contracts.
- [ ] `api-backend/app/models/__init__.py` re-exports all five names.
- [ ] `alembic heads` reports the new migration's revision as the sole head, chained from `b1c2d3e4f5a6`.
- [ ] `Base.metadata.tables` includes `"eod_records"` and `"eod_break_records"`.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8: `cd api-backend && pytest -q tests/models/test_eod.py`.
- Additionally verifies: `alembic upgrade head` then `alembic downgrade -1` both exit 0 against a scratch DB, and re-running `upgrade head` afterward is idempotent (impl § 8.3, DB-4).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see § 9 below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `DB-5`), then extend § 3/§ 4/§ 5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's § 7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against parent branch.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
