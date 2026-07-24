# 017 — Transaction Details Wiring · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/017-transaction-details-wiring-db.md` (the impl doc). This file does not restate the spec — it references unit IDs and orders their execution.
> Layer: Database — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `transaction-details-wiring-db` — cut from parent `transaction-details-wiring` and merged back into it (human owns the merge).
> Worktrees: none. All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/017-transaction-details-wiring-db.md` |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 1 — Database" |
| Sibling layer schedules | `docs/execution-schedules/017-transaction-details-wiring-be.md`, `docs/execution-schedules/017-transaction-details-wiring-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/017-transaction-details-wiring-db.md` |

**Unit ID space this schedule sequences:** `DB-1` only (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Migration `a4d8e2f6b391` (0024_onboarding_document_upload_tracking) is the current Alembic head on the parent branch (`alembic heads` → `a4d8e2f6b391 (head)`) — impl doc §2.
- [ ] The frozen seam in proposal § 4.1/4.2 is agreed — impl doc §7 is a verbatim copy, not open for renegotiation here.
- [ ] Layer branch `transaction-details-wiring-db` cut from `transaction-details-wiring` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the BE or FE layer schedules. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `transaction-details-wiring` — the human decides the merge order.

**Exit signal:** DB-1 committed on the layer branch, the W-final validation and test agents both PASS, PR opened against `transaction-details-wiring`. The orchestrator does not push, does not merge, and does not apply the migration to the live `portal` DB — the human owns all three.

---

## 3. Dependency graph (intra-layer only)

This layer has exactly one unit. There is no graph to sort.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — the only unit in this layer (impl doc §6: "Dependencies: none — parallel-safe; this is the only DB unit in this layer") |

**Graph invariants:** no cycles (trivially — one node); no cross-layer edges.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1` | n/a (single unit, single dispatch) | — |
| **W-final** | Validation + Test | yes (two dispatches) | W1 committed |

### Algorithm (pseudocode)

```
dispatch DB-1 to its own agent
wait for DB-1 to commit (barrier)
run wave gate checks (§6) — if red, STOP and report; do not advance
dispatch W-final (validation agent + test agent, in parallel)
wait for both to report
if both PASS: open PR against transaction-details-wiring
else: STOP and report failures — do not open PR
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-1` | impl §6 DB-1 — create `transaction_details` table (model class + Alembic revision) | `modify: api-backend/app/models/onboarding.py`, `create: api-backend/alembic/versions/<new_hex>_0025_transaction_details.py` | commit exists on layer branch |

**Barrier before W-final:** the row above must show a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of W1, run in order — a failure blocks W-final:

1. **Lint** — `ruff check .` (run from `api-backend/`)
2. **Format** — `ruff format --check .` (run from `api-backend/`)
3. **Type-check** — `mypy app` (run from `api-backend/`)
4. **Unit tests** — `pytest -q` (run from `api-backend/`; impl doc §8 — DB-1's tests only, since it is the only committed unit)

Combined per impl doc §3.2: `ruff check . && ruff format --check . && mypy app && pytest -q`

**Human gates:**
- [ ] Applying the new migration to the live `portal` DB is human-owned and explicitly **NOT** part of this schedule's automated gates — no wave in this schedule runs `alembic upgrade` against `portal`; all migration exercise happens against a scratch/ephemeral DB (impl doc §8.1).

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:** empty — DB-1 is the only unit in this layer, so there is no contention.

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | n/a — single-unit layer |

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] `DB-1` has a commit on the layer branch.
- [ ] `api-backend/app/models/onboarding.py` contains the new `TransactionDetail` class per impl §6, immediately after `ClientAllotmentRedemption`.
- [ ] `api-backend/alembic/versions/<new_hex>_0025_transaction_details.py` exists, with `down_revision = "a4d8e2f6b391"`.
- [ ] `alembic history` shows a single linear head (no branch point).
- [ ] Public surface (`TransactionDetail`) matches impl doc §5.1 — importable, no dangling references.
- [ ] Impl doc §7 seam table matches the proposal verbatim (checked against the proposal on the parent branch, not against BE/FE branches).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs `pytest -q` from `api-backend/` (impl doc §8.1) against a scratch/ephemeral DB only — never against `portal`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does not modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- Do not open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (add a new unit, e.g. `DB-2`, to the impl doc first).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** A red gate at W1 or W-final halts the algorithm; no fix-forward within the same wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `DB-2`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (the frozen seam) suspends this run — the BE and FE layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Wave W1 (`DB-1`) committed on `transaction-details-wiring-db`; wave gate (§6) green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `transaction-details-wiring`.
- [ ] Orchestrator has not pushed, force-pushed, merged, opened worktrees, or applied the migration to the live `portal` DB. Hand-off complete.
