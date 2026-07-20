# 013 — Client Onboarding Integration · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/013-client-onboarding-integration-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-onboarding-integration-be` — cut from `client-onboarding-integration` and merged back into it (human owns the merge).
> Worktrees: **allowed, temporarily, only within a wave to resolve a same-file collision** — an override for this dispatch. Not exercised in this layer: §7 confirms no wave in this schedule has two units writing the same file, so every wave already runs fully parallel in the main working tree with no worktree needed.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/013-client-onboarding-integration-be.md` |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/013-client-onboarding-integration-db.md`, `docs/execution-schedules/013-client-onboarding-integration-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/013-client-onboarding-integration-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-8` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events` tables + `client_subscriptions.mgmt_fee_override`/`incentive_fee_override` columns applied to the working DB (DB layer's `0018` migration — impl doc §2). This is intra-repo/environment state, not "the DB schedule has run" — the migration only needs to be *applied to the working DB*, which can happen via a scratch DB before the DB layer branch even merges.
- [ ] The frozen seam (impl doc §7, proposal §4, including the 2026-07-20 widening — D-9) is agreed.
- [ ] Layer branch `client-onboarding-integration-be` cut from `client-onboarding-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Database or Frontend schedules' branches to merge — only on the migration's schema being applied to whatever DB this layer's tests run against.

**Exit signal:** every unit BE-1..BE-8 committed on the layer branch, all 14 routes reachable and RBAC-gated, the final validation/test wave green, PR opened against `client-onboarding-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| BE-1 | — | root — `schemas.py`, the wire-facing DTOs |
| BE-2 | — | root — `compliance_doc_config.py`, the required-doc config |
| BE-3 | BE-2 | `repository.py` seeds `onboarding_documents` rows from `REQUIRED_DOCS` (BE-2) |
| BE-4 | — | root — RBAC actions in `app/libs/auth/actions.py` |
| BE-5 | BE-1, BE-2, BE-3 | `service.py`'s `OnboardingService` imports the DTOs (BE-1), the doc config (BE-2), and calls the repository (BE-3) |
| BE-6 | BE-1, BE-4, BE-5 | `router.py` imports DTOs (BE-1) for response models, gates routes with the new RBAC actions (BE-4), and calls `OnboardingService` (BE-5) |
| BE-7 | BE-3, BE-5 | `scheduler.py`'s `_trigger_due_renewals` calls the repository (BE-3) and `OnboardingService.reopen_for_renewal` (BE-5) |
| BE-8 | BE-6, BE-7 | `main.py` wiring mounts the router (BE-6) and registers the scheduler (BE-7) |

**Graph invariants:**
- No cycles.
- Every edge is between units in this layer only.
- Absence of an edge = safe to run in parallel.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1, BE-2, BE-4` | yes (3 parallel dispatches — different files) | — |
| W2 | `BE-3` | n/a (single unit) | W1 committed |
| W3 | `BE-5` | n/a (single unit) | W2 committed |
| W4 | `BE-6, BE-7` | yes (2 parallel dispatches — different files) | W3 committed |
| W5 | `BE-8` | n/a (single unit) | W4 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W5 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-onboarding-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| BE-1 | impl §6.BE-1 — `schemas.py`: wire-facing DTOs | `create: api-backend/app/libs/onboarding/schemas.py` | commit exists on layer branch |
| BE-2 | impl §6.BE-2 — `compliance_doc_config.py`: required-doc config | `create: api-backend/app/libs/onboarding/compliance_doc_config.py` | commit exists on layer branch |
| BE-4 | impl §6.BE-4 — RBAC actions | `modify: api-backend/app/libs/auth/actions.py` | commit exists on layer branch |

**Barrier before W2:** all three rows above committed AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-3 | impl §6.BE-3 — `repository.py`: `OnboardingRepository` | `create: api-backend/app/libs/onboarding/repository.py` | commit exists on layer branch |

**Barrier before W3:** BE-3 committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-5 | impl §6.BE-5 — `service.py`: `OnboardingService` — state machine + atomic approve (incl. the widened C-7 DTO-assembly joins and the agg-before/after + `ONBOARDING_SETTLEMENT_DAYS` compute logic) | `create: api-backend/app/libs/onboarding/service.py` | commit exists on layer branch |

**Barrier before W4:** BE-5 committed AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-6 | impl §6.BE-6 — `router.py`: 14 role-prefixed routes | `create: api-backend/app/libs/onboarding/router.py` | commit exists on layer branch |
| BE-7 | impl §6.BE-7 — `scheduler.py`: renewal-trigger background job | `create: api-backend/app/libs/onboarding/scheduler.py` | commit exists on layer branch |

**Barrier before W5:** both rows above committed AND wave-gate checks pass.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-8 | impl §6.BE-8 — wire into `main.py` | `modify: api-backend/app/main.py` | commit exists on layer branch; app imports cleanly with router mounted + scheduler registered |

**Barrier before W-final:** BE-8 committed AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check . && ruff format --check .`
2. **Type-check** — `cd api-backend && mypy app`
3. **Unit tests** — `cd api-backend && pytest -q` (impl doc §8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `python -c "import app.main"` (from `api-backend/`) — catches import cycles between the new `onboarding` package and existing `auth`/`clients`/`pc` modules early, especially after W4/W5.

**Human gates:**
- [ ] Running the `0018` migration against a live DB is a human-owned gate, called out by the Database layer's schedule — not repeated here.
- [ ] Running the renewal scheduler (BE-7) against production data is a human-owned decision (env var `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS`/settlement config tuning) — the schedule only verifies `_trigger_due_renewals` unit-tested in isolation, not run against live data.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | none | — | Every unit in every wave touches a distinct file (`schemas.py`, `compliance_doc_config.py`, `auth/actions.py`, `repository.py`, `service.py`, `router.py`, `scheduler.py`, `main.py`) — no wave has two units writing the same file. |

**If the map is empty for a wave, all its units are truly parallel-safe** — true for every wave in this layer.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID BE-1..BE-8 has at least one commit on the layer branch.
- [ ] `app/libs/onboarding/` contains exactly `router.py`, `service.py`, `repository.py`, `schemas.py`, `compliance_doc_config.py`, `scheduler.py` — matches impl §4 target layout.
- [ ] `OnboardingDTO`/`AllotRdmptDTO` in `schemas.py` carry every widened field per the proposal's current §4.1 (D-9) — `client_ref`, `primary_phone`, `address`, `country_of_residence`, `id_type`, `id_number`, `ibhk_account`, `sw_account`, `mgmt_fee`, `incentive_fee` on `OnboardingDTO`; `agg_before`, `agg_after`, `expected_cash_in` on `AllotRdmptDTO`. `SubscriptionDTO`/`ClientEventDTO` remain byte-identical to the original (unwidened) seam.
- [ ] Route count: exactly 14 new routes mounted under `/api/rm`, `/api/compliance`, `/api/pc`, `/api/client` (impl §6.BE-6 / proposal Layer 2-D) — 0 existing routes changed.
- [ ] `ROLE_ACTIONS[COMPLIANCE]` and `ROLE_ACTIONS[PC]` are non-empty (BE-4); `ADMIN` still inherits all actions.
- [ ] `main.py` mounts the onboarding router and registers/cancels the onboarding scheduler alongside the two existing schedulers (BE-8).
- [ ] No dangling references to removed symbols; imports resolve cleanly.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `cd api-backend && pytest -q`.
- Specifically confirms the two named scenarios from the proposal's Execution & verification step 2 pass:
  - A full cycle walked twice (approve initial → trigger renewal → approve renewal) leaves exactly one `client_allotment_redemptions` row for that client.
  - A second insert attempt with the same `source_onboarding_id` raises a DB integrity error.
- Confirms the widened fields: `agg_before` is read before the `client_subscriptions` upsert (ordering invariant), `ONBOARDING_SETTLEMENT_DAYS` env override is honored, and `OnboardingDTO`'s joined/resolved fields (phone/address/country/assigned_rm/client_ref) populate correctly.
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
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W5 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-onboarding-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
