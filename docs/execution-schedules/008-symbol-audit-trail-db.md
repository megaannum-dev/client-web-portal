# 008 — Distinctive Symbols Column · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/008-symbol-audit-trail-db.md` (the impl doc). Does not restate the spec — orders unit IDs.
> Layer: Database — one layer per file.
> Branch: `distinctive-symbol-sections-db` — cut from `distinctive-symbol-sections`, merged back (human owns merge).
> Worktrees: **none.** All work in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/008-symbol-audit-trail-db.md` |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/008-symbol-audit-trail-be.md`, `docs/execution-schedules/008-symbol-audit-trail-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/008-symbol-audit-trail-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-3` (definitions in the impl doc).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl §2 preconditions green: Alembic head is `2366f5c2d9bd` on the parent branch.
- [ ] Branch `distinctive-symbol-sections-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** Runs on its own branch; does not wait on BE/FE. Seam frozen in proposal §4 / impl §7.

**Exit signal:** DB-1..DB-3 committed on the layer branch; W-final green; PR opened against the parent branch. Orchestrator does **not** push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — adds `active` to `ModelSymbol` (ORM) |
| `DB-2` | — | root — adds `ModelSymbolAudit` + `SymbolAuditOp` (ORM) |
| `DB-3` | `DB-1`, `DB-2` | migration DDL/backfill targets the shapes DB-1 & DB-2 define |

**Graph invariants:** acyclic; all edges intra-layer; an edge = "committed before dependent starts."

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1`, `DB-2` | **serialized** (shared file — see §7) | — |
| W2 | `DB-3` | single unit | W1 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W2 committed |

### Algorithm
```
for wave in [W1, W2, W_final]:
    dispatch units (W1 serialized on pc.py; W2 single)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-1` | impl §6.DB-1 — `active` column | `api-backend/app/models/pc.py` | commit on layer branch |
| `DB-2` | impl §6.DB-2 — audit table + enum | `api-backend/app/models/pc.py` | commit on layer branch |

**Barrier before W2:** both committed AND §6 gate passes. DB-1 and DB-2 both edit `pc.py` → **serialize** (§7).

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-3` | impl §6.DB-3 — Alembic `0013` create + backfill | `api-backend/alembic/versions/<hash>_0013_symbol_audit.py` (new) | commit on layer branch |

**Barrier before W-final:** DB-3 committed AND §6 gate passes.

---

## 6. Wave gates (barriers between waves)

Run in order at each wave boundary (from impl §3.2). No lint/type tooling committed in `api-backend`.

1. **Model import smoke** — `cd api-backend && .venv/Scripts/python.exe -c "import app.models.pc"`
2. **Migration up/down** (W2 onward only) — `.venv/Scripts/alembic.exe upgrade head && .venv/Scripts/alembic.exe downgrade -1 && .venv/Scripts/alembic.exe upgrade head`
3. **Backfill count check** (W2) — `model_symbol_audit` (op='added') row count == `model_symbols` row count on a dev-DB copy.

**Human gates:**
- [ ] **none for the branch** — migration is validated up/down against a **dev-DB copy** here. Applying to the **live** DB is a proposal-level human gate that happens at merge/deploy, outside this schedule.

---

## 7. Shared-file / collision protocol (no worktrees)

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `api-backend/app/models/pc.py` | `DB-1`, `DB-2` | **serialize:** dispatch `DB-1` first; after it commits, `DB-2` runs `git pull --rebase` (layer branch), re-reads `pc.py`, then edits. Both additive, no logical conflict. |

W2 has one unit — no contention.

**Rebase discipline:** contending agent waits for the prior commit, `git pull --rebase` against the layer branch, re-reads the file, edits, re-runs the gate, commits. No push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent
- [ ] DB-1..DB-3 each have ≥1 commit on the layer branch.
- [ ] `pc.py` has `ModelSymbol.active` (after `weight`, per impl §3.1 ordering) + `ModelSymbolAudit` + `SymbolAuditOp`; no weight columns on the audit table.
- [ ] Migration head advanced to `0013`; FK on `model_symbol_audit` targets `models` (not `model_symbols`).
- [ ] `import app.models.pc` resolves.

Reports **PASS** or failures with file + line.

### 8.2 Test agent
- Runs impl §8 checks: `import app.models.pc` + the DB-1/DB-2 pytest (if runner present) + migration up/down on a dev-DB copy.
- Reports pass/fail; does not modify code.

### 8.3 W-final gate
Both agents **PASS** → open PR. Else report every failure; no PR.

---

## 9. Change protocol (mid-run)
- Red gate → stop at that wave.
- New unit → add to impl doc (`DB-4`…) first, then extend §3/§4/§5 here.
- Seam edit → suspend; proposal §4 changes first.

---

## 10. Definition of done
- [ ] W1, W2 committed; each gate green.
- [ ] W-final validation: PASS.
- [ ] W-final test: PASS.
- [ ] PR opened against parent branch.
- [ ] No push/merge/worktree. Hand-off complete.
