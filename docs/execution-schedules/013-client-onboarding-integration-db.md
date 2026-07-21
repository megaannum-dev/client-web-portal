# 013 — Client Onboarding Integration · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/013-client-onboarding-integration-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Database — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-onboarding-integration-db` — cut from `client-onboarding-integration` and merged back into it (human owns the merge).
> Worktrees: **allowed, temporarily, only within a wave to resolve a same-file collision** (see §7) — an override for this dispatch, in place of pure in-wave serialization, to maximize parallelization. Outside of that narrow case, all work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/013-client-onboarding-integration-db.md` |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/013-client-onboarding-integration-be.md`, `docs/execution-schedules/013-client-onboarding-integration-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/013-client-onboarding-integration-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-7` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `alembic heads` on the target DB reports `817926e7604a` (impl doc §2).
- [ ] The frozen seam (impl doc §7, proposal §4) is agreed — not renegotiated on this branch.
- [ ] Layer branch `client-onboarding-integration-db` cut from `client-onboarding-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Backend or Frontend schedules. The cross-layer seam is frozen in the proposal and re-pinned in this layer's impl doc §7; sibling layers may run before, after, or concurrent with this one.

**Exit signal:** every unit DB-1..DB-7 committed on the layer branch, `alembic upgrade head` / `downgrade -1` both verified clean on a scratch DB, the final validation/test wave green, PR opened against `client-onboarding-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| DB-1 | — | root — creates `api-backend/app/models/onboarding.py` with `ClientOnboarding` + enums |
| DB-2 | DB-1 | `OnboardingDocument.onboarding_id` FKs `client_onboardings.id`; also appends to the same file DB-1 created |
| DB-3 | DB-1 | `ClientAllotmentRedemption.source_onboarding_id` FKs `client_onboardings.id`; also appends to the same file |
| DB-4 | — | `ClientEvent` FKs only `users.id` (already-merged table) — no logical dependency on DB-1, but shares `onboarding.py` with DB-2/DB-3 (see §7 shared-file resolution: sequenced after them) |
| DB-5 | — | additive columns on the already-merged, existing `client_subscriptions` table (`api-backend/app/models/pc.py`) — independent of everything in `onboarding.py` |
| DB-6 | DB-1, DB-2, DB-3, DB-4, DB-5 | migration DDL must match every model class it creates; `client_onboardings` must be created before `onboarding_documents`/`client_allotment_redemptions` in the DDL |
| DB-7 | DB-1, DB-2, DB-3, DB-4 | re-exports every new class/enum from `onboarding.py` in `app/models/__init__.py` — needs all four defined first |

**Graph invariants:**
- No cycles.
- Every edge is between units in this layer only.
- Absence of an edge = safe to run in parallel, subject to the shared-file protocol in §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1, DB-5` | yes (2 parallel dispatches — different files) | — |
| W2 | `DB-2, DB-3` | serialized (shared file `onboarding.py` — see §7) | W1 committed |
| W3 | `DB-4` | n/a (single unit) | W2 committed (shared-file ordering, not a logical FK dependency) |
| W4 | `DB-6, DB-7` | yes (2 parallel dispatches — different files) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

> **Superseded for this dispatch — worktree override.** The table above is the pure in-wave-serialization DAG. This run instead uses the worktree override in §7, which collapses W2+W3 into a single 3-way-parallel wave (each unit in its own temporary worktree). See §7 for the revised 3-wave schedule (W1 → W2{DB-2,DB-3,DB-4 parallel} → W3{DB-6,DB-7}) that this dispatch actually follows.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
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
| DB-1 | impl §6.DB-1 — `client_onboardings` table + `OnboardingStatus`/`OnboardingKind` enums | `create: api-backend/app/models/onboarding.py` | commit exists on layer branch |
| DB-5 | impl §6.DB-5 — `client_subscriptions` fee-override columns | `modify: api-backend/app/models/pc.py` (`ClientSubscription` only) | commit exists on layer branch |

**Barrier before W2:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-2 | impl §6.DB-2 — `onboarding_documents` table + `DocStatus` enum | `modify: api-backend/app/models/onboarding.py` | commit exists on layer branch |
| DB-3 | impl §6.DB-3 — `client_allotment_redemptions` table + `AllotRdmpStatus`/`AllotRdmpKind` enums | `modify: api-backend/app/models/onboarding.py` | commit exists on layer branch |

**Serialization within this wave (shared file, see §7):** dispatch DB-2 first, wait for its commit, then dispatch DB-3 against the updated file. Both still count as "Wave W2" — the barrier to W3 only requires both committed.

**Barrier before W3:** both rows above committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-4 | impl §6.DB-4 — `client_events` table | `modify: api-backend/app/models/onboarding.py` | commit exists on layer branch |

**Barrier before W4:** DB-4 committed AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| DB-6 | impl §6.DB-6 — Migration `0018_client_onboarding` | `create: api-backend/alembic/versions/<hash>_0018_client_onboarding.py` | `alembic upgrade head` / `downgrade -1` both verified clean on a scratch DB |
| DB-7 | impl §6.DB-7 — re-export new models | `modify: api-backend/app/models/__init__.py` | commit exists on layer branch |

**Barrier before W-final:** both rows above committed AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check . && ruff format --check .`
2. **Type-check** — `cd api-backend && mypy app`
3. **Unit tests** — `cd api-backend && pytest -q` (impl doc §8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `python -c "import app.models"` (from `api-backend/`) — confirms no import cycle across the new `onboarding.py` classes and the modified `pc.py`/`__init__.py`.

**Human gates:**
- [ ] Applying the `0018` migration to any shared/staging/live DB is a human-owned gate (per [[git_workflow_human_owns_main]]) — not part of this schedule's automated waves. The schedule only verifies `upgrade head`/`downgrade -1` against a disposable scratch DB.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `api-backend/app/models/onboarding.py` | `DB-2, DB-3` | **worktree override (this dispatch):** since DB-2 and DB-3 have no dependency on each other (both depend only on DB-1), collapse them into the SAME wave as DB-4 and run all three concurrently, each in its own temporary worktree, merging back sequentially — see the merged Wave W2 below. This replaces the pure-serialization fallback with parallel-then-merge. |
| W4 | none | `DB-6, DB-7` touch different files (migration file vs. `__init__.py`) | fully parallel-safe, no worktree needed |

**Revised wave merge (worktree override supersedes the W2/W3 split above):** because DB-2, DB-3, and DB-4 all become eligible the moment DB-1 is committed (DB-4 has no logical dependency on DB-1/DB-2/DB-3 at all), and the only obstacle to running all three in parallel was the shared file `onboarding.py`, the worktree override collapses the former W2+W3 into one wave, **W2**, of three concurrent worktree-isolated dispatches. §4's wave table is superseded as follows for this dispatch:

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1, DB-5` | yes | — |
| W2 | `DB-2, DB-3, DB-4` | yes — **each in its own temporary worktree**, merged back sequentially in unit-ID order (DB-2 → DB-3 → DB-4) once each finishes | W1 committed |
| W3 | `DB-6, DB-7` | yes (no worktree needed — different files) | W2 committed (all three merges landed on the layer branch) |
| W-final | Validation + Test | yes | W3 committed |

**Worktree mechanics for Wave W2** (see the prompt doc for the exact commands — this schedule states the protocol, not the shell commands):
1. Before dispatch, the orchestrator creates three temporary worktrees off the current tip of `client-onboarding-integration-db`, one per unit (DB-2, DB-3, DB-4).
2. Each sub-agent works entirely inside its own worktree, commits its unit there — it never touches the main working tree.
3. As each worktree's commit completes, the orchestrator merges (fast-forward or a trivial merge — no conflicts expected, since each unit appends a distinct class to the end of the same file) that commit back onto the layer branch **in unit-ID order**: DB-2 first, then DB-3, then DB-4. If a later merge conflicts against an earlier one (e.g. both appended at the same line), the orchestrator resolves the conflict directly on the layer branch (not inside a worktree) before proceeding to the next merge.
4. Every temporary worktree is removed immediately after its merge lands — none survives past Wave W2's barrier.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID DB-1..DB-7 has at least one commit on the layer branch.
- [ ] `api-backend/app/models/onboarding.py` contains `ClientOnboarding`, `OnboardingDocument`, `ClientAllotmentRedemption`, `ClientEvent` and the five new enums (`OnboardingStatus`, `OnboardingKind`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`) — matches impl §6 DB-1..DB-4 exactly, including the widened `id_type`/`id_number` (DB-1) and `agg_before`/`agg_after`/`expected_cash_in` (DB-3) columns.
- [ ] `api-backend/app/models/pc.py`'s `ClientSubscription` gained exactly `mgmt_fee_override`/`incentive_fee_override` — no other class in that file touched.
- [ ] `api-backend/app/models/__init__.py` re-exports every new class/enum (DB-7).
- [ ] Migration `0018`'s `down_revision` is `817926e7604a`; `upgrade()`/`downgrade()` are both present and symmetric (downgrade drops exactly what upgrade creates).
- [ ] No dangling references to removed symbols; no `B-6`/`Model.country`/`Model.sector` content anywhere (explicitly rejected scope — see proposal D-9).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `cd api-backend && pytest -q`.
- Additionally verifies: `alembic upgrade head` then `alembic downgrade -1` both succeed clean against a disposable scratch DB (impl doc §9 rollback claim).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `DB-8`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-onboarding-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
