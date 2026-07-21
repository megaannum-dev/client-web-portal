# 014 — Client Onboarding Follow-Up Fixes · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: [`docs/implementations/014-onboarding-follow-up-fixes-be.md`](../implementations/014-onboarding-follow-up-fixes-be.md) (the impl doc). This file does not restate the spec — it references unit IDs `BE-1`..`BE-9` and orders their execution.
> Proposal: [`docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md`](../proposals/014-2026-07-21-onboarding-follow-up-fixes.md) § Layer 1 — Backend
> Layer: **Backend**
> Sibling layer schedule: [`docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md`](014-onboarding-follow-up-fixes-fe.md)
> Prompt (dispatch harness): `docs/prompts/014-onboarding-follow-up-fixes-be.md`

<!-- OVERRIDE — branching convention (carried forward from both impl docs,
per explicit user instruction on this proposal): this is a fix/patch pass on
an already-in-progress branch, NOT a fresh feature build. There is no
`014-onboarding-follow-up-fixes-be` branch to cut, and no worktree — every
unit below commits directly to the CURRENT branch (`onboarding-subsystem-fixing`),
the SAME branch the sibling Frontend schedule also commits to. Wherever the
base template says "layer branch," "cut from parent," or "merge back," read it
as "the current branch, already checked out — no cut, no merge-back; the
final PR is opened from this one branch directly against `main`." -->
> Branch: `onboarding-subsystem-fixing` (current branch — **no `-be` branch is cut**). Every unit below commits directly here.
> Worktrees: **none** (unchanged from the base template — doubly true under this override, since there isn't even a separate layer branch to isolate).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/014-onboarding-follow-up-fixes-be.md` |
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` § Layer 1 — Backend |
| Sibling layer schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/014-onboarding-follow-up-fixes-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-9` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green: proposal 013 present on this branch (it already is); `client_portfolios`/`client_subscriptions`/`client_allotment_redemptions` tables exist and are migrated.
- [ ] Current branch is `onboarding-subsystem-fixing`, checked out, working tree clean.
- [ ] No other schedule (this one or the Frontend sibling) is actively dispatching a wave against this same working tree at this exact moment — see the cross-layer note below for why concurrent dispatch across the two schedules is otherwise fine.

**Layer independence, redefined for this override.** The base template's assumption — "sibling layers run on their own branches, merge order is the human's call" — does not hold here, because there is only one branch. What still holds: **no dependency edge in §3 below references a Frontend unit**, and this schedule's waves may be dispatched in any order relative to the Frontend schedule's waves *as far as git conflicts go*, because the two layers touch fully disjoint directories (`api-backend/**` here, `admin-frontend/**` there — confirmed in both impl docs' file lists, zero overlap). The one thing that **does** depend on ordering is **browser verification**: several Frontend units' "Done when" criteria require a real (not mocked) backend behind them — FE-3 needs `BE-2`/`BE-3`; FE-4 needs `BE-6`/`BE-7`; FE-5 needs `BE-8`; FE-6 needs `BE-9` (including its `amount` field). This is a **verification-order recommendation, not a commit dependency**: **run this Backend schedule's waves to completion before the Frontend schedule's W2/W3 attempt their browser checks**, so no Frontend "Done when" is ever verified against a stale/pre-`amount`-field Backend. Frontend's own commits may still land on the branch at any time — only the *browser verification step* needs the Backend units already in place.

**Exit signal (what this run produces):** every unit in §3 committed on `onboarding-subsystem-fixing`, the final validation wave green, PR opened from this branch against `main`. **The orchestrator does not push, does not merge — the human owns that**, per [[git_workflow_human_owns_main]].

---

## 3. Dependency graph (intra-layer only)

Every unit's impl-doc `Dependencies:` field reads **"none"** — `BE-1` through `BE-9` are logically independent (no unit's contract or behavior requires another's code to exist first).

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root |
| `BE-2` | — | root |
| `BE-3` | — | root |
| `BE-4` | — | root |
| `BE-5` | — | root |
| `BE-6` | — | root |
| `BE-7` | — | root |
| `BE-8` | — | root |
| `BE-9` | — | root |

**Graph invariants:** no cycles (trivially — no edges at all); every "dependency" mentioned in the impl doc's prose for BE-1/BE-3/BE-4/BE-6/BE-7/BE-8/BE-9 is a **shared-file** concern (several units edit `service.py`/`router.py`/`repository.py`/`schemas.py`), not a logical dependency — handled in §7, not here, per the skill's own rule that file contention is a scheduling concern, not a DAG edge.

---

## 4. Wave schedule (the topological sort)

The DAG is fully flat (9 roots, no edges) — topologically, everything could be "one wave." But §7 reveals that 8 of the 9 units contend on a small set of shared files (`onboarding/service.py`, `router.py`, `repository.py`, `schemas.py`), so genuine parallel dispatch is only safe for the one unit with no shared files at all (`BE-5`). The other eight are dispatched **serially, within the same wave**, in the order given in §5/§7 — still "Wave 1" in the topological sense (nothing here waits on a *committed* prior wave), just not concurrently *executed*.

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-5` ∥ (`BE-2` → `BE-1` → `BE-3` → `BE-4` → `BE-6` → `BE-7` → `BE-8` → `BE-9`) | partially — `BE-5` runs concurrently with the 8-unit chain; the chain itself is serial (shared-file contention, §7) | — |
| **W-final** | Validation + Test | yes (two dispatches) | W1 fully committed |

### Algorithm (pseudocode)

```
dispatch BE-5 to its own agent (file-disjoint from every other unit)
dispatch a single agent to run BE-2, BE-1, BE-3, BE-4, BE-6, BE-7, BE-8, BE-9 IN THAT ORDER,
    committing after each one (this is the serialization §7 requires)
wait for BOTH the BE-5 agent and the 8-unit chain to finish (barrier)
run wave gate checks (§6) — if red, STOP and report; do not advance
dispatch W-final (§8)
open PR against main
```

---

## 5. Per-wave delegation

### Wave W1

| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-5` | impl §6 BE-5 — default password on `create_user` | `api-backend/app/libs/identity/service.py` | commit exists on `onboarding-subsystem-fixing` |
| `BE-2` | impl §6 BE-2 — RM-scoped single-doc download route | `api-backend/app/libs/onboarding/router.py` | commit exists |
| `BE-1` | impl §6 BE-1 — status guard on `upload_document`/`submit` | `api-backend/app/libs/onboarding/service.py` | commit exists |
| `BE-3` | impl §6 BE-3 — "Download All" zip route + service method | `api-backend/app/libs/onboarding/service.py`, `.../router.py` | commit exists |
| `BE-4` | impl §6 BE-4 — per-client KYC storage subdirectory + root rename | `api-backend/app/libs/trade_models/storage.py`, `.../trade_models/service.py`, `api-backend/app/core/config.py`, `api-backend/docker-compose.yml`, `.../onboarding/repository.py`, `.../onboarding/service.py` | commit exists |
| `BE-6` | impl §6 BE-6 — resolve `authorized_by` uid → display name | `.../onboarding/repository.py`, `.../onboarding/schemas.py`, `.../onboarding/service.py`, `.../clients/repository.py`, `.../clients/schemas.py` | commit exists |
| `BE-7` | impl §6 BE-7 — client-detail endpoints (`id_type`/`id_number` join, by-client routes) | `.../clients/repository.py`, `.../clients/schemas.py`, `.../onboarding/router.py` | commit exists |
| `BE-8` | impl §6 BE-8 — Initial Cash Deposit AUM-floor + `client_portfolios` seeding | `.../onboarding/schemas.py`, `.../onboarding/service.py`, `.../onboarding/repository.py` | commit exists |
| `BE-9` | impl §6 BE-9 — Model Subscription read endpoints (incl. `amount` field) | `.../onboarding/schemas.py`, `.../onboarding/repository.py`, `.../onboarding/service.py`, `.../onboarding/router.py` | commit exists |

**Barrier before W-final:** every row above shows a commit on `onboarding-subsystem-fixing` AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of W1, run in order — a failure blocks W-final:

1. **Lint / format** — `ruff check . && ruff format --check .`
2. **Type-check** — `mypy app`
3. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point; since W1 is the only feature wave, this means all of BE-1..BE-9's tests)
4. **Build / import smoke** — `python -c "import app.main"` (or the repo's existing smoke-import check, if one already exists under `tests/`) — confirms no unit left a dangling import (e.g. BE-9's local `from app.libs.clients.repository import ClientRepository` inside `list_subscriptions` must actually resolve).

**Human gates:**
- [ ] none — fully automated to PR. (This proposal makes zero DB schema changes; the one manual, non-code step — BE-4's physical storage-root directory rename on each deployed environment — is a **deploy-time** action, not a merge-path gate, and is called out separately to whoever deploys this branch, not blocked on here.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched"; every file below is touched by ≥2 units in W1):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `api-backend/app/libs/onboarding/service.py` | `BE-1, BE-3, BE-4, BE-6, BE-8, BE-9` | serialize in the order `BE-1 → BE-3 → BE-4 → BE-6 → BE-8 → BE-9` (per §4's chain) — each commits before the next starts editing this file |
| W1 | `api-backend/app/libs/onboarding/router.py` | `BE-2, BE-3, BE-7, BE-9` | serialize in the order `BE-2 → BE-3 → BE-7 → BE-9` |
| W1 | `api-backend/app/libs/onboarding/repository.py` | `BE-4, BE-6, BE-8, BE-9` | serialize in the order `BE-4 → BE-6 → BE-8 → BE-9` |
| W1 | `api-backend/app/libs/onboarding/schemas.py` | `BE-6, BE-8, BE-9` | serialize in the order `BE-6 → BE-8 → BE-9` |
| W1 | `api-backend/app/libs/clients/repository.py` | `BE-6, BE-7` | serialize `BE-6 → BE-7` (both add a distinct alias pair to the same `_base_query()` — BE-7's edit should land on top of BE-6's, not the reverse, since BE-6 was chosen first in the overall chain) |
| W1 | `api-backend/app/libs/clients/schemas.py` | `BE-6, BE-7` | serialize `BE-6 → BE-7` (same reasoning) |

**Net effect:** because these six files' contention graphs overlap so heavily (`service.py` pulls in `BE-1/3/4/6/8/9`; `router.py` pulls in `BE-2/3/7/9`; etc.), the only fully-safe resolution is one **single total order** across all eight contending units, which is exactly the chain in §4: `BE-2 → BE-1 → BE-3 → BE-4 → BE-6 → BE-7 → BE-8 → BE-9`. `BE-5` (`identity/service.py` only) is the sole unit with **zero row in the table above** — it is genuinely parallel-safe with the rest.

**Rebase discipline within the chain:** each unit in the chain, before starting its edit, runs `git pull --rebase` against `onboarding-subsystem-fixing` (picking up the previous unit's just-landed commit), re-reads the file(s) it's about to touch, then edits and commits. If a rebase conflicts (unlikely, since each unit's diff targets different methods within the shared file), resolve, re-run that unit's own §8 tests, then commit.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] Every unit ID `BE-1`..`BE-9` has at least one commit on `onboarding-subsystem-fixing`.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (modified as specified; `BE-4`'s `docker-compose.yml`/`config.py` rename landed together, not partially).
- [ ] Public surface matches: `onboarding/router.py` exposes exactly the routes listed in impl §6/§7 (no route missing, no stray leftover route from an earlier draft); `FileStorage.save()`'s signature matches BE-4's contract exactly (`subdir` param present, `open()` signature unchanged).
- [ ] No dangling references: `BE-9`'s local `ClientRepository` import resolves; every RBAC `Action` referenced by a new route (`ONBOARDING_MANAGE`, `CLIENT_VIEW`) already exists in `app/libs/auth/actions.py` — no new `Action` was (incorrectly) added, matching the impl doc's explicit statement that none is needed.
- [ ] `ClientSubscriptionRowDTO` (BE-9) carries the `amount` field — this is the field the Frontend layer's FE-6 depends on; its absence would silently break FE-6's browser verification without a compile-time signal on this side.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `ruff check . && ruff format --check . && mypy app && pytest -q`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at W1/W-final.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (`BE-10`, …), then extend §3/§4/§5/§7 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (the frozen cross-layer contract, e.g. another field added to a DTO) suspends this run — the Frontend layer must acknowledge the seam change (its own §7 re-copied) before either schedule resumes past the point of that change. This already happened once, pre-execution: `ClientSubscriptionRowDTO.amount` was added to both impl docs' §7 before this schedule was written — no further mid-run seam change is anticipated, but if one occurs, treat it exactly like the `amount` addition was handled.

---

## 10. Definition of done

- [ ] W1 fully committed on `onboarding-subsystem-fixing` (the `BE-5` parallel unit and the 8-unit serialized chain both landed); wave gate (§6) green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened from `onboarding-subsystem-fixing` against `main`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
