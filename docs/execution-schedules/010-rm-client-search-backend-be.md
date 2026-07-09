# 010 — RM Client Book: Live Search Against `client_profiles` · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/010-rm-client-search-backend-be.md` (the impl doc). This file does not restate the spec.
> Layer: Backend — **one layer per file.**
> Branch: `searchbar-client-book-be` — cut from parent `searchbar-client-book` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/010-rm-client-search-backend-be.md` |
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 1 — Backend |
| Sibling layer schedules | `docs/execution-schedules/010-rm-client-search-backend-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/010-rm-client-search-backend-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-4` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Alembic history at or beyond revision `c9e2f4a7b183` (0011) — current `client_profiles` shape.
- [ ] `Action.CLIENT_VIEW` still granted to `AdminRole.RM` in `app/libs/auth/actions.py`.
- [ ] Impl doc §7 seam is a verbatim copy of the proposal's §4.1 — checked before dispatch.
- [ ] Layer branch `searchbar-client-book-be` cut from `searchbar-client-book` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Frontend schedule. The seam is frozen in the proposal and re-pinned in impl doc §7; the Frontend layer may run before, after, or concurrent with this one.

**Exit signal:** every unit in §3 committed on `searchbar-client-book-be`, W-final green, PR opened against `searchbar-client-book`. The orchestrator does not push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root — creates the module dir, `schemas.py`, and mounts an (initially route-less) router in `main.py` |
| `BE-2` | `BE-1` | repository file lives in the module dir `BE-1` creates |
| `BE-3` | `BE-1`, `BE-2` | service imports `ClientRepository`/`ClientRow` from `BE-2`; router imports the DTOs from `BE-1` |
| `BE-4` | `BE-1`, `BE-2`, `BE-3` | adds a method to `service.py` and a route to `router.py`, both created by `BE-3` — editing files that don't exist yet is not possible |

**Graph invariants:** no cycles; all edges intra-Backend; absence of an edge = safe to run in parallel (none here — the chain is fully linear because each unit edits or extends files the previous unit created).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1` | no (single unit) | — |
| W2 | `BE-2` | no (single unit) | W1 committed |
| W3 | `BE-3` | no (single unit) | W2 committed |
| W4 | `BE-4` | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

This layer's unit DAG is a strict chain (each unit both depends on and edits files touched by its predecessor), so every feature wave is single-unit. There is nothing to parallelize within the Backend layer itself — the parallelism in this proposal lives at the cross-layer level (Backend vs. Frontend schedules run independently).

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
| `BE-1` | impl §6 BE-1 — module scaffold & Pydantic schemas | `create: app/libs/clients/__init__.py`, `create: app/libs/clients/schemas.py`, `modify: app/main.py` | commit exists on layer branch |

**Barrier before W2:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6 BE-2 — repository: shared query builder with dual joins + scoping | `create: app/libs/clients/repository.py` | commit exists on layer branch |

**Barrier before W3:** row above shows a commit AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl §6 BE-3 — list endpoint `GET /rm/clients` | `create: app/libs/clients/service.py`, `create: app/libs/clients/router.py` | commit exists on layer branch |

**Barrier before W4:** row above shows a commit AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-4` | impl §6 BE-4 — detail endpoint `GET /rm/clients/{id}` | `modify: app/libs/clients/service.py`, `modify: app/libs/clients/router.py` | commit exists on layer branch |

**Barrier before W-final:** row above shows a commit AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `ruff check . && ruff format --check .`
2. **Type-check** — `mypy app`
3. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point; e.g. after W1, only the BE-1 tests in §8.3 are expected to exist and pass)
4. **Build / import smoke** — `python -c "from app.main import app"`

**Human gates:**
- [ ] none — fully automated to PR. No DB migration, no live cutover in this layer.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | not applicable — every wave in this schedule contains exactly one unit |

**The map is empty for every wave** — the linear dependency chain means no two units ever land in the same wave, so there is no same-wave file contention to resolve.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `BE-1`..`BE-4` has at least one commit on `searchbar-client-book-be`.
- [ ] `app/libs/clients/{__init__,schemas,repository,service,router}.py` all exist; `app/main.py` includes the router at prefix `/api`.
- [ ] `app.routes` includes `/api/rm/clients` and `/api/rm/clients/{client_id}` (per BE-1's mount + BE-3/BE-4's route registration).
- [ ] `ClientListItemOut` has exactly the 10 fields named in impl §7.1 (no extra, no missing, no renamed).
- [ ] No import of `app.libs.clients.*` from any pre-existing module (this layer's changes are purely additive — no existing route/service/model file is modified except the one-line `main.py` addition).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q` (from `api-backend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `BE-5`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — the Frontend layer must acknowledge the seam change (via the proposal) before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `searchbar-client-book-be`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `searchbar-client-book`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
