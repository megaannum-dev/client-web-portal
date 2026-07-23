# 016 — Allotment & Redemption Integration · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/016-allotment-redemption-integration-be.md` (the impl doc). This file does not restate the spec — it references unit IDs and orders their execution.
> Layer: **Backend** — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `allotment-redemption-integration-be` — cut from `allotment-redemption-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/016-allotment-redemption-integration-be.md` |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 2 — Backend" |
| Sibling layer schedules | `docs/execution-schedules/016-allotment-redemption-integration-db.md`, `docs/execution-schedules/016-allotment-redemption-integration-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/016-allotment-redemption-integration-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-5` (definitions live in the impl doc §6 — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] DB layer migration (`down_revision = "deb8fd8a60b6"`) applied/merged — widens `AllotRdmpStatus` (+ `awaiting_pc`/`awaiting_co`/`approved`/`rejected`) and adds `reject_reason`/`decided_by`/`decided_at`/`emergent` columns to `client_allotment_redemptions`. This is intra-repo schema state this layer assumes, per impl doc §2 — not a wait-on-sibling-schedule.
- [ ] The seam in impl doc §7 (proposal §4.1/§4.2) is agreed and frozen.
- [ ] Layer branch `allotment-redemption-integration-be` cut from `allotment-redemption-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the DB or FE layer schedules. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one — except that the DB migration itself (not its schedule) must already be applied, per the precondition above.

**Exit signal:** every unit BE-1…BE-5 committed on the layer branch, the W-final validation and test wave green, PR opened against `allotment-redemption-integration`. The orchestrator does not push, does not merge — the human owns that.

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two BE-* units. No edge references a DB-* or FE-* unit.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root: new routes + RBAC gates + request/response DTOs |
| `BE-2` | `BE-1` | service method needs `SubmitAllotmentReq` schema + route to be shippable |
| `BE-3` | `BE-1`, `BE-2` | reuses `create_allotment`'s widened signature introduced by BE-2 |
| `BE-4` | `BE-3` | operates on rows BE-3 creates (`awaiting_pc`/`awaiting_co` transitions) — **per impl doc's stated dependency line** |
| `BE-5` | `BE-3`, `BE-4` | **per impl doc's stated dependency line** ("shares `_execute_redemption_approval`") |

**⚠ Note — impl-doc dependency direction for BE-4/BE-5 is inverted from the actual code reference.** The impl doc states `BE-4: Dependencies: BE-3` and `BE-5: Dependencies: BE-3, BE-4`, implying BE-4 can be committed strictly before BE-5. But BE-4's contract code (`pc_decide_redemption`) calls `self._execute_redemption_approval(row, decided_by=decided_by)` — and `_execute_redemption_approval` is only *defined* in BE-5's contract block. If BE-4 were committed alone, `mypy app` would fail (`OnboardingService has no attribute _execute_redemption_approval`), violating the impl doc's own §3.2 "leaves the branch green" rule. This schedule does **not** silently add a reverse edge (`BE-4 → BE-5`) or rewrite the impl doc's stated dependencies. Instead, per §4/§7 below, BE-4 and BE-5 are placed in the **same wave (W4)** and committed as one atomic pair — this resolves the ordering problem without altering the impl doc's declared dependency lines. **A human should reconcile the impl doc's BE-4/BE-5 `Dependencies:` lines against this note** before the next revision of that doc.

**Graph invariants:**
- No cycles (BE-4/BE-5's mutual reference is handled as same-wave/same-commit-unit below, not as a graph cycle).
- Every edge is between BE-* units.
- An edge means "must be committed before the dependent starts."
- Absence of an edge = safe to run in parallel.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1` | no (single unit) | — |
| W2 | `BE-2` | no (single unit) | W1 committed |
| W3 | `BE-3` | no (single unit) | W2 committed |
| W4 | `BE-4`, `BE-5` | **no — combined/atomic pair, not independently parallel** (see §7) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

W1–W3 are single-unit waves (each is a strict prerequisite for the next per impl doc's stated deps); W4 combines BE-4 and BE-5 into one atomic delivery per the note in §3.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave (W4: as one combined delivery, see §7)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against allotment-redemption-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl §6.BE-1 — new routes + RBAC gates + request/response DTOs | `api-backend/app/libs/onboarding/router.py`, `api-backend/app/libs/onboarding/schemas.py` | commit exists on layer branch |

**Barrier before W2:** BE-1 committed AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6.BE-2 — allotment submit service method | `api-backend/app/libs/onboarding/service.py`, `api-backend/app/libs/onboarding/repository.py` | commit exists on layer branch |

**Barrier before W3:** BE-2 committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl §6.BE-3 — redemption submit service method | `api-backend/app/libs/onboarding/service.py` | commit exists on layer branch |

**Barrier before W4:** BE-3 committed AND wave-gate checks pass.

### Wave W4 (combined atomic pair — see §7)
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-4` | impl §6.BE-4 — PC decide service method | `api-backend/app/libs/onboarding/service.py` | commit exists on layer branch, references a committed `_execute_redemption_approval` |
| `BE-5` | impl §6.BE-5 — CO decide service method + `shift_portfolio_for_redemption` | `api-backend/app/libs/onboarding/service.py`, `api-backend/app/libs/onboarding/repository.py` | commit exists on layer branch |

**Barrier before W-final:** both BE-4 and BE-5 committed (as one commit or two tightly-sequenced commits per §7) AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint** — `ruff check .` (from `api-backend/`)
2. **Format check** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point)

**Human gates:**
- [ ] none within this layer's own waves — fully automated to PR. (The DB migration's live-DB apply is a precondition checked once in §2, not a per-wave human gate here.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W4 | `api-backend/app/libs/onboarding/service.py` | `BE-4, BE-5` | **Not independently parallel — combined atomic delivery.** BE-4's `pc_decide_redemption` calls `_execute_redemption_approval`, which is only defined in BE-5's contract block (see §3 note). Resolve by committing `_execute_redemption_approval` (BE-5's helper) and `shift_portfolio_for_redemption` (BE-5's repository method) **first** within W4, then `pc_decide_redemption` (BE-4) and `co_decide_redemption` (BE-5) referencing it — as either one combined commit covering both units, or two tightly-sequenced commits within this same wave with no barrier between them. Do **not** split BE-4 and BE-5 across two waves. |

Waves W1–W3 each contain a single unit — no in-wave collisions to resolve there. `service.py` is touched across W2/W3/W4 (BE-2, BE-3, BE-4/BE-5) but never by two units in the *same* wave except the BE-4/BE-5 pair above, so no other cross-wave rebase concern beyond normal sequential wave progression.

**Rebase discipline within W4** (if BE-4/BE-5 are dispatched as two sequenced commits rather than one combined commit):
1. The agent committing `pc_decide_redemption`/`co_decide_redemption` waits until the `_execute_redemption_approval`/`shift_portfolio_for_redemption` commit is on the layer branch.
2. It runs `git pull --rebase` (against the layer branch, not `main`), re-reads `service.py`/`repository.py`, then edits.
3. If the rebase conflicts, it resolves, re-runs unit tests, then commits. It does not push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] Every unit ID BE-1…BE-5 has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (`router.py`, `schemas.py`, `service.py`, `repository.py` all modified as specified; no new modules created).
- [ ] All 4 routes are registered: `POST /rm/allotment`, `POST /rm/redemption`, `POST /pc/redemptions/{allotment_id}/decide`, `POST /co/redemptions/{allotment_id}/decide` — no path collision with existing `/rm/*`, `/pc/*`, `/compliance/*` routes.
- [ ] RBAC gates correct per route: `CLIENT_VIEW` (submit routes), `ALLOTMENT_ACKNOWLEDGE` (PC decide), `ONBOARDING_REVIEW` (CO decide).
- [ ] `OnboardingService` exposes `submit_allotment`, `submit_redemption`, `pc_decide_redemption`, `co_decide_redemption`, and `_execute_redemption_approval` resolves (no dangling reference).
- [ ] No dangling references to removed symbols; imports resolve.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q` (from `api-backend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does not modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- Do not open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-6`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.
- **Impl-doc dependency correction:** if the human reconciles the BE-4/BE-5 `Dependencies:` inversion flagged in §3 by editing the impl doc, this schedule's §3/§4/§7 notes should be re-checked but the wave structure (BE-4+BE-5 combined in W4) remains correct regardless of which direction the impl doc ultimately states, since the two units share a genuine same-file code dependency either way.

---

## 10. Definition of done

- [ ] Waves W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `allotment-redemption-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
