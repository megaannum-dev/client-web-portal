# 017 — Transaction Details Wiring · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/017-transaction-details-wiring-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `transaction-details-wiring-be` — cut from `transaction-details-wiring` and merged back into it (human owns the merge). See [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/017-transaction-details-wiring-be.md` |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 2 — Backend" |
| Sibling layer schedules | `docs/execution-schedules/017-transaction-details-wiring-db.md`, `docs/execution-schedules/017-transaction-details-wiring-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/017-transaction-details-wiring-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-4` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green — DB migration creating `transaction_details` (1:1 FK+UNIQUE to `client_allotment_redemptions`) is applied to the target DB, or merged to the parent branch this layer branches from.
- [ ] Layer branch `transaction-details-wiring-be` cut from `transaction-details-wiring` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in the impl doc's §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `transaction-details-wiring` — the human decides the merge order, and no schedule step here assumes one.

**Exit signal (what this run produces):** every unit in §3 committed on the layer branch, the final validation wave green, PR opened against `transaction-details-wiring`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge in this graph is between two work units in the BE impl doc. No edge references a sibling layer's unit ID — the DB layer's migration is a §2 precondition, not a graph edge.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root — new routes + request/response DTOs; impl doc states "none — parallel-safe with BE-2/BE-3's internals" |
| `BE-2` | `BE-1` | impl doc: "BE-1 (schemas/route exist)" — service method is invoked by BE-1's routes and consumes `TransactionDetailRequest`/`TransactionDetailDTO` |
| `BE-3` | `BE-1`, `BE-2` | impl doc: "BE-1 (route exists), BE-2 (reuses `repo.get_transaction_detail` and `_transaction_detail_to_dto`)" |
| `BE-4` | — (impl doc's `Dependencies:` line reads "none") | impl doc's own prose calls BE-4 "purely additive on top of BE-1..BE-3's committed state" — see flag below |

**Graph invariants:**
- No cycles.
- Every edge is between units in this same layer.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel — subject to the file-collision protocol in §7, which may still serialize or re-wave a formally-independent unit.

**Note on BE-4:** the impl doc's formal `Dependencies:` line for BE-4 says "none," but its own prose in the same section describes it as building "on top of BE-1..BE-3's committed state," and its files (`schemas.py`, `service.py`) are touched by every other unit in this layer. No dependency edge is added here (the `Dependencies:` line governs the DAG per this schedule's rule), but §7 below places BE-4 in its own trailing wave to resolve the resulting file collisions without inventing an edge. This inconsistency (formal "none" vs. descriptive "on top of") is worth flagging back to the impl doc's author — see final report.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1` | no (single unit) | — |
| W2 | `BE-2` | no (single unit) | W1 committed |
| W3 | `BE-3` | no (single unit) | W2 committed |
| W4 | `BE-4` | no (single unit) | W3 committed |
| **W5 (W-final)** | Validation + Test | yes (two dispatches) | W4 committed |

No wave has more than one unit: `BE-2`→`BE-1` and `BE-3`→`BE-1`,`BE-2` force strict sequencing for three of the four units, and `BE-4` — though formally dependency-free — shares both its files (`schemas.py`, `service.py`) with every unit in W1–W3, so it is placed in its own trailing wave per the §7 collision protocol rather than merged into an earlier wave.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against transaction-details-wiring
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl §6 BE-1 — new routes + request/response DTOs | `api-backend/app/libs/onboarding/router.py`, `api-backend/app/libs/onboarding/schemas.py` | commit exists on layer branch |

**Barrier before W2:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6 BE-2 — transaction-detail filing service method | `api-backend/app/libs/onboarding/service.py`, `api-backend/app/libs/onboarding/repository.py` | commit exists on layer branch |

**Barrier before W3:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl §6 BE-3 — transaction-detail retrieval service method | `api-backend/app/libs/onboarding/service.py` | commit exists on layer branch |

**Barrier before W4:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-4` | impl §6 BE-4 — widen `AllotRdmptDTO` with `has_transaction_detail` | `api-backend/app/libs/onboarding/schemas.py`, `api-backend/app/libs/onboarding/service.py` | commit exists on layer branch |

**Barrier before W5:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `ruff check . && ruff format --check .` (from `api-backend/`)
2. **Type-check** — `mypy app` (from `api-backend/`)
3. **Unit tests** — `pytest -q` (from `api-backend/`) — impl doc §8: only tests for units already committed need pass at this point
4. **Build / import smoke** — `python -c "import app.main"` (or equivalent app-import check) from `api-backend/`

**Human gates:**
- [ ] none — fully automated to PR. Impl doc §3.2/§9 states explicitly: "No human gate exists in this layer alone — the DB migration's live-DB apply is the schedule's gate, not this doc's." That gate belongs to the DB layer's own schedule, not this one.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | `schemas.py` | `BE-1` (W1), `BE-4` (W4) | no collision — different waves; resolved by placing `BE-4` in its own trailing wave (§4) rather than co-waving with `BE-1` |
| — | `service.py` | `BE-2` (W2), `BE-3` (W3), `BE-4` (W4) | no collision — three different waves; each wave's barrier (§6) guarantees the prior unit's edit to `service.py` is committed before the next unit's agent re-reads the file |

**The map is empty for every wave as scheduled** — each of W1–W4 carries exactly one unit, so no two units ever write the same file within the same wave. No serialization-within-a-wave step is needed; the strict single-unit-per-wave sequencing already forces file edits to `schemas.py`/`service.py`/`router.py`/`repository.py` to land one at a time.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `BE-1`..`BE-4` has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state: `router.py` (+2 routes), `schemas.py` (+2 DTOs, `AllotRdmptDTO` widened), `service.py` (+2 methods, `_allotment_to_dto` widened), `repository.py` (+2 methods).
- [ ] Public surface (impl §5.1) matches impl doc — `OnboardingService.file_transaction_detail`/`.get_transaction_detail` importable and callable; no dangling references to removed symbols.
- [ ] Route count on `onboarding` router increased by exactly 2 (`POST`/`GET` `/rm/allotments/{allotment_id}/transaction-detail`); no existing route's path or response model changed except `AllotRdmptDTO` gaining `has_transaction_detail: bool = False`.

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
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-5`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `transaction-details-wiring`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
