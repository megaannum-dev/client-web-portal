# 008 — Distinctive Symbols Column · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/008-symbol-audit-trail-be.md` (the impl doc). Does not restate the spec — orders unit IDs.
> Layer: Backend — one layer per file.
> Branch: `distinctive-symbol-sections-be` — cut from `distinctive-symbol-sections`, merged back (human owns merge).
> Worktrees: **none.** All work in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/008-symbol-audit-trail-be.md` |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/008-symbol-audit-trail-db.md`, `docs/execution-schedules/008-symbol-audit-trail-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/008-symbol-audit-trail-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-5` (definitions in the impl doc).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl §2 preconditions green: `model_symbols.active` + `model_symbol_audit` exist in the target dev DB (DB migration applied).
- [ ] Branch `distinctive-symbol-sections-be` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** Runs on its own branch; does not wait on DB/FE *schedules*. It does require the DB *migration applied to its dev DB* (intra-repo state, per impl §2) — not a dependency on the `-db` branch's schedule progress. Seam frozen in proposal §4 / impl §7.

**Exit signal:** BE-1..BE-5 committed; both `ponytail:` markers deleted; W-final green; PR opened against parent branch. Orchestrator does **not** push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root — `_log_symbol` helper + audit in create/edit; deletes the markers |
| `BE-2` | `BE-1` | fine-grained methods call `_log_symbol` |
| `BE-3` | — | root — DTOs (`SymbolOut.active`, `SymbolAuditOut`, request bodies) |
| `BE-4` | `BE-1` | `create_model` seeding uses `_log_symbol` |
| `BE-5` | `BE-2`, `BE-3` | routes call BE-2 service methods and return BE-3 DTOs |

**Graph invariants:** acyclic; all edges intra-layer; an edge = "committed before dependent starts."

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1`, `BE-3` | yes (different files) | — |
| W2 | `BE-2`, `BE-4` | **serialized** (shared file — see §7) | W1 committed |
| W3 | `BE-5` | single unit | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm
```
for wave in [W1, W2, W3, W_final]:
    dispatch units (W1 parallel; W2 serialized on service.py; W3 single)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-1` | impl §6.BE-1 — audit helper + create/edit diff; delete markers | `api-backend/app/libs/trade_models/service.py` | commit on layer branch |
| `BE-3` | impl §6.BE-3 — DTOs | `api-backend/app/libs/trade_models/schemas.py` | commit on layer branch |

**Barrier before W2:** both committed AND §6 gate passes. Different files → truly parallel.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6.BE-2 — `add_symbol`/`set_symbol_active`/`remove_symbol`/`list_symbol_audit` | `api-backend/app/libs/trade_models/service.py` | commit on layer branch |
| `BE-4` | impl §6.BE-4 — `create_model` seeds initial universe | `api-backend/app/libs/trade_models/service.py` | commit on layer branch |

**Barrier before W3:** both committed AND §6 gate passes. Both edit `service.py` → **serialize** (§7).

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-5` | impl §6.BE-5 — symbol sub-resource routes + `symbol_audit` include | `api-backend/app/libs/trade_models/router.py` | commit on layer branch |

**Barrier before W-final:** BE-5 committed AND §6 gate passes.

---

## 6. Wave gates (barriers between waves)

Run in order at each wave boundary (from impl §3.2). No lint/type tooling committed in `api-backend`.

1. **Import smoke** — `cd api-backend && .venv/Scripts/python.exe -c "import app.main"`
2. **Unit tests** — `.venv/Scripts/python.exe -m pytest -q app/libs/trade_models` (only tests for units already committed need pass at that wave; if no runner is configured, this gate is the manual §8 checks in the impl doc).

**Human gates:**
- [ ] none — fully automated to PR.

---

## 7. Shared-file / collision protocol (no worktrees)

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `api-backend/app/libs/trade_models/service.py` | `BE-2`, `BE-4` | **serialize:** dispatch `BE-2` first; after it commits, `BE-4` runs `git pull --rebase` (layer branch), re-reads `service.py`, then edits. |

W1 (`service.py` vs `schemas.py`) and W3 (single unit) have no contention. Note `BE-1` (W1) and `BE-2`/`BE-4` (W2) all touch `service.py` but are in **different waves**, so the barrier serializes them — no in-wave collision.

**Rebase discipline:** contending agent waits for the prior commit, `git pull --rebase` against the layer branch, re-reads the file, edits, re-runs the gate, commits. No push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent
- [ ] BE-1..BE-5 each have ≥1 commit on the layer branch.
- [ ] Both `ponytail:` markers (`service.py:103`, `:142` pre-edit) are gone.
- [ ] Route surface: exactly the 3 new symbol routes registered (`POST`/`PATCH`/`DELETE` under `/models/{id}/symbols`), each guarded by `MODEL_MANAGE`; `get_model` honours `include=symbol_audit`.
- [ ] `import app.main` resolves; no dangling imports.

Reports **PASS** or failures with file + line.

### 8.2 Test agent
- Runs impl §8 suite: `.venv/Scripts/python.exe -m pytest -q app/libs/trade_models` (or the manual §8 checks).
- Reports pass/fail counts + first failing traceback frame; does not modify code.

### 8.3 W-final gate
Both agents **PASS** → open PR. Else report every failure; no PR.

---

## 9. Change protocol (mid-run)
- Red gate → stop at that wave.
- New unit → add to impl doc (`BE-6`…) first, then extend §3/§4/§5 here.
- Seam edit → suspend; proposal §4 changes first.

---

## 10. Definition of done
- [ ] W1, W2, W3 committed; each gate green.
- [ ] W-final validation: PASS.
- [ ] W-final test: PASS.
- [ ] PR opened against parent branch.
- [ ] No push/merge/worktree. Hand-off complete.
