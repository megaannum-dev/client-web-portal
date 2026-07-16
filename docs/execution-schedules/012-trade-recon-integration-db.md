# 012 — Trade Reconciliation · Execution Schedule — Layer: Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/012-trade-recon-integration-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Database — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `trade-reconciliation-integration-db` — cut from `trade-reconciliation-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/012-trade-recon-integration-db.md` |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/012-trade-recon-integration-be.md`, `docs/execution-schedules/012-trade-recon-integration-fe.md` (predicted paths — not yet generated) |
| Prompt (dispatch harness) | `docs/prompts/012-trade-recon-integration-db.md` (predicted path — not yet generated) |

**Unit ID space this schedule sequences:** `DB-1 … DB-4` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `alembic heads` on the target DB reports `29a586aaf08b` (impl doc § 2).
- [ ] The frozen seam in the proposal (§ 4) is agreed — impl doc § 7 is a verbatim copy, not a renegotiation.
- [ ] Layer branch `trade-reconciliation-integration-db` cut from `trade-reconciliation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc § 7; the BE and FE layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `trade-reconciliation-integration` — the human decides the merge order.

**Exit signal (what this run produces):** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against `trade-reconciliation-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two `DB-*` units. No edge references a sibling layer's unit ID.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root; `recon_sessions` table, no dependency on other new tables |
| `DB-2` | `DB-1` | `algotrade_orders.session_id` FKs `recon_sessions.id` (impl doc § 6, DB-2 "Dependencies") |
| `DB-3` | `DB-2` | `algotrade_executions.order_id` FKs `algotrade_orders.id` (impl doc § 6, DB-3 "Dependencies") |
| `DB-4` | `DB-1`, `DB-2`, `DB-3` | migration's `op.create_table` calls require all three ORM classes defined first (impl doc § 6, DB-4 "Dependencies") |

**Note on the impl doc's DB-1 dependency text:** impl doc § 6 describes DB-1 as "parallel-safe with DB-2/DB-3 at the model-file level," but DB-2's own Dependencies line names DB-1, and DB-3's names DB-2 — so the graph is a strict chain regardless of the parallel-safe framing on DB-1. This schedule follows the stricter, individually-stated per-unit Dependencies lines (see § 7 for how this interacts with the shared-file collision).

**Graph invariants:**
- No cycles — DB-1 → DB-2 → DB-3 → DB-4 is a linear chain.
- All edges intra-layer; no cross-layer edge was found or invented.
- Absence of an edge = safe to run in parallel — not applicable here; every unit has exactly one predecessor (or three, for DB-4).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1` | no (single unit) | — |
| W2 | `DB-2` | no (single unit) | W1 committed |
| W3 | `DB-3` | no (single unit) | W2 committed |
| W4 | `DB-4` | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

The DAG is a strict chain (each unit depends on the immediate predecessor, and DB-4 on all three), so no wave contains more than one unit — there is no available parallelism within this layer.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
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
| `DB-1` | impl § 6, DB-1 — `recon_sessions` table | `create: api-backend/app/models/recon.py` | commit exists on layer branch |

**Barrier before W2:** row above shows a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-2` | impl § 6, DB-2 — `algotrade_orders` table | `modify: api-backend/app/models/recon.py` | commit exists on layer branch |

**Barrier before W3:** row above shows a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-3` | impl § 6, DB-3 — `algotrade_executions` table | `modify: api-backend/app/models/recon.py` | commit exists on layer branch |

**Barrier before W4:** row above shows a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-4` | impl § 6, DB-4 — migration creating all three tables | `create: api-backend/alembic/versions/<hash>_0015_trade_reconciliation.py` | commit exists on layer branch; also update `api-backend/app/models/__init__.py` re-export block per impl doc § 3.1 |

**Barrier before W-final:** row above shows a commit on the layer branch AND wave-gate checks (§ 6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave (W1–W4), run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check . && ruff format --check .`
2. **Type-check** — `cd api-backend && mypy app`
3. **Unit tests** — `cd api-backend && pytest -q` (impl doc § 8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `cd api-backend && python -c "import app.models"` (confirms `app/models/__init__.py` re-exports resolve and `Base.metadata` picks up new classes)

**Human gates:**
- [ ] none — fully automated to PR. (The proposal's two human gates — synthesizer-into-IB-import-path cutover, and FE cutover to `main` — both belong to the BE and FE layers, not this one; proposal "Execution & verification" section names no DB-layer-specific human gate, e.g. no requirement to apply this migration to a shared/staging DB before PR.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1–W3 | `api-backend/app/models/recon.py` | `DB-1, DB-2, DB-3` | not a same-wave collision: § 3's dependency chain (DB-2 depends on DB-1, DB-3 depends on DB-2) already places each unit in its own wave, so edits to `recon.py` are strictly sequential across W1 → W2 → W3, one commit at a time. No worktree, no in-wave serialization needed — the topological sort itself resolves the collision. |

**If the map is empty for a wave, all its units are truly parallel-safe** — true for every wave here, since each wave contains exactly one unit.

**Rebase discipline within a wave:** not applicable — no wave in this schedule has more than one unit, so no intra-wave rebase is required. (Standard practice still applies across waves: each wave's agent starts from the layer branch tip after the prior wave's commit lands.)

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc § 6 / § 9:
- [ ] Every unit ID `DB-1`…`DB-4` has at least one commit on the layer branch.
- [ ] `api-backend/app/models/recon.py` contains `ReconSession`, `AlgoTradeOrder`, `AlgoTradeExecution`, `SourceKind` exactly as specified in impl doc § 6.
- [ ] `api-backend/app/models/__init__.py` re-exports the four new symbols.
- [ ] `api-backend/alembic/versions/<hash>_0015_trade_reconciliation.py` exists, `down_revision = "29a586aaf08b"`.
- [ ] No existing model file (`reconciliation.py`, `pc.py`, `post_trade_allocation.py`, `users.py`) was modified (impl doc § 3.1 constraint).
- [ ] Migration head after upgrade matches the new revision; `alembic downgrade -1` returns to `29a586aaf08b` cleanly.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8: `cd api-backend && pytest -q`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

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
- [ ] PR opened against `trade-reconciliation-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
