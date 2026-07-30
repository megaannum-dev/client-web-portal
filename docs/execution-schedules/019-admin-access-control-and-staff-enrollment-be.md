# 019 — Admin Access Control & Staff Enrollment · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-be` — cut from the parent branch `claude/admin-pages-backend-proposal-f0c9fc` and merged back into it (**the human owns the merge**).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 2 — Backend" |
| Sibling layer schedules | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md`, `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/019-admin-access-control-and-staff-enrollment-be.md` (does not exist yet — intended path) |

**Unit ID space this schedule sequences:** `BE-1 … BE-22` (definitions live in the impl doc — do not restate them here). `BE-22` (proposal C-12/D-16 — splits the unsafe VIEW-bucket actions this schedule's own §6 gate flagged as an open ruling) was added to the impl doc mid-run and folded in below; see §3/§5/§7/§8.1.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] **Alembic revision `0028_admin_access_control` is applied to the target/working database** (four tables, four columns, the 55-row `page_access` seed). This is the layer's one **hard** precondition, checked before W1 dispatches, not a sibling-branch dependency: it is intra-repo/environment state. Reason it is hard rather than soft — proposal C-2 deletes the `ROLE_ACTIONS` fallback outright, so from `BE-5` onward this layer **fails closed**: against an un-migrated DB every guarded admin route answers 403, for every role including ADMIN. That is the specified behaviour (D-9), not a defect to work around by re-adding a fallback. Verify by query, not by assumption, before dispatching.
- [ ] Impl doc §2's remaining preconditions green: the frozen seam (§7) is agreed; the Python env is the repo venv `api-backend\.venv\` (the system Python has no dependencies — use `.\.venv\Scripts\python.exe`, `.\.venv\Scripts\pytest.exe`).
- [ ] Firebase **phase 0** status recorded (Trigger Email extension configured **and** the dead service-account key rotated). This is a **human** prerequisite and is *not* required to dispatch any wave — every unit and every hermetic §8 test runs under the `firebase_auth_disabled` bypass with faked `auth`/Firestore. It **is** required for the one non-hermetic deliverable, `BE-13`'s marked Q-5 decider (§4, W2 checkpoint), and for any real end-to-end mail exercise of `BE-13`/`BE-14`/`BE-17`/`BE-20`. **No wave may silently assume a live Firebase project exists** — if phase 0 is not done, waves still run, and the W2 checkpoint reports the decider as *not run*.
- [ ] Layer branch `claude/admin-pages-backend-proposal-f0c9fc-be` cut from the parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order, and no schedule step here assumes one. The applied-migration precondition above is a statement about the *database*, never about the DB layer's branch.

**Exit signal (what this run produces):** every unit `BE-1 … BE-21` committed on the layer branch, the final validation wave green, the Q-5 outcome line written into impl §6 `BE-13`, PR opened against the parent branch. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two `BE-*` units. No edge references a `DB-*` or `FE-*` id: the cross-layer contract is the frozen seam in impl §7, not a schedule edge. Where an impl `Dependencies:` line names DB-layer artefacts (the `0028` migration, `app/models/access.py`), that is carried as the §2 entry precondition, **not** as a graph edge.

Edges follow impl §3.1's layering (`router → service → repository → models`; `auth.deps → access.resolver → access.repository`; `staff → access` one-way) and are taken verbatim from each unit's own `Dependencies:` field — none invented, none dropped.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root: the `*_MANAGE` → `*_WRITE` rename. **Revert-coupled** (impl §3.2): it is a whole-branch vocabulary change every later unit is written in, so it must land first and cannot be reverted alone |
| `BE-2` | `BE-1` | the `PAGE_ACTIONS` map is written in the new `*_WRITE` member names |
| `BE-22` | `BE-1`, `BE-2` | (added mid-run, proposal C-12/D-16) needs the renamed action baseline in `actions.py` (`BE-1`) and amends the `PAGE_ACTIONS` map `BE-2` builds — splits `ALLOTMENT_ACKNOWLEDGE`/`CLIENT_VIEW` off the VIEW bucket of `pc.allotment-redemption`, repoints the two mutating routes it wrongly guarded |
| `BE-3` | `BE-2` | repository is keyed on the page registry `BE-2` introduces |
| `BE-4` | `BE-2`, `BE-3` | resolver imports `PAGE_ACTIONS`/`PAGE_IDS`/`PAGELESS_ACTIONS` and calls `AccessRepository` |
| `BE-5` | `BE-2`, `BE-3`, `BE-4` | **revert-coupled** (impl §3.2): the DB-backed `require_action` calls `actions_for` and cannot exist — or be reverted to — without the pages/repository/resolver units in place. Also the unit that makes the §2 migration precondition bite |
| `BE-6` | `BE-4` | `_user_out` calls `grants_for` |
| `BE-7` | — | root: one timestamp write in `login_and_bind`; the column is a precondition, not a unit |
| `BE-8` | `BE-2`, `BE-3`, `BE-5` | service reads via `AccessRepository`, DTOs validate against `PAGE_IDS`, routes are guarded by the rewritten `require_action` |
| `BE-9` | `BE-8` | extends the `access` service/router `BE-8` creates |
| `BE-10` | `BE-8` | extends the `access` schemas/service/router `BE-8` creates |
| `BE-11` | `BE-8` | extends the `access` schemas/service/router `BE-8` creates |
| `BE-12` | — | root: delete `_DEFAULT_PASSWORD`; one-line change in `identity.service` |
| `BE-13` | `BE-12` | the link is generated against a passwordless identity — that is what makes the Q-5 fallback question real |
| `BE-14` | `BE-13` | the mailer sends the link `generate_set_password_link` returns |
| `BE-15` | `BE-1` | staff DTOs are written in the new role/action vocabulary |
| `BE-16` | `BE-15` | the directory route's `response_model` is `BE-15`'s rebuilt `StaffOut` |
| `BE-17` | `BE-13`, `BE-14`, `BE-15` | `enroll` generates the link, queues the mail after commit, and takes `BE-15`'s `StaffEnrollIn`/`StaffOverrideIn` |
| `BE-18` | `BE-13`, `BE-14`, `BE-15` | the re-send route mints a fresh link, queues mail, and returns `BE-15`'s `LinkSentOut` |
| `BE-19` | `BE-15`, `BE-16` | consumes `BE-15`'s widened `StaffUpdateIn`/`StaffUpdatePatch` and `BE-16`'s `count_book` + `OPEN_TICKET_STATUSES` |
| `BE-20` | `BE-13`, `BE-14` | post-commit client email uses the renamed link method and the mailer |
| `BE-21` | — | root: pure contraction (delete `app/libs/dev/**`, `app/schemas/dev.py`, `Settings.dev_mode`, the conditional mount). Scheduled late per impl §3.2 so the branch stays deployable at every commit, and so its `app/main.py` edit does not contend with `BE-8`'s mount |

**Graph invariants:**
- No cycles — verified: every edge points from a lower-numbered dependency set to its dependent, and the longest chain is `BE-1 → BE-2 → BE-3 → BE-4 → BE-5 → BE-8 → BE-9|BE-10|BE-11` (7 links).
- Every edge is between two `BE-*` units in this layer.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel, **subject to §7's shared-file map**.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1`, `BE-7`, `BE-12` | yes (3 parallel dispatches) | — |
| W2 | `BE-2`, `BE-13`, `BE-15` | yes (3) | W1 committed |
| W3 | `BE-3`, `BE-14`, `BE-16`, `BE-22` | yes (4) | W2 committed |
| W4 | `BE-4`, `BE-20`, **`BE-17` → `BE-18` → `BE-19` (serialized, §7)** | partly (3 parallel tracks; the staff track is a 3-unit chain) | W3 committed |
| W5 | `BE-5`, `BE-6` | yes (2) | W4 committed |
| W6 | `BE-8` | single unit | W5 committed |
| W7 | `BE-21`, **`BE-9` → `BE-10` → `BE-11` (serialized, §7)** | partly (2 tracks) | W6 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W7 committed |

Seven feature waves is the DAG's minimum — it equals the length of the `BE-1 → … → BE-9` critical chain. W1 is as wide as the edges allow: `BE-1`, `BE-7` and `BE-12` are the only three units with no stated dependency other than `BE-21`, which is deliberately parked in W7 (impl §3.2's late-contraction rule, and it keeps `app/main.py` uncontended).

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W6, W7, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
      -- except units marked serialized in §7: dispatch in the stated order,
         each waiting for the previous one's commit, still inside this wave
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
    if wave == W2: run the Q-5 reporting checkpoint (below) before advancing
open PR against parent branch
```

**Q-5 reporting checkpoint — end of W2 (load-bearing beyond this layer).** `BE-13` owns the decision of whether Firebase's `generate_password_reset_link` works against a passwordless identity, or whether the email-link sign-in fallback is in use. Its outcome **gates the Frontend layer's scope** (the fallback branch adds a set-password landing form the FE does not have today). At the W2 barrier, therefore:

- [ ] The marked decider (`BE-13`'s non-hermetic test, deselected from `pytest -q` by `-m "not firebase"`) has been run **once** against a real Firebase project, and its outcome is written back into impl §6 `BE-13`'s outcome slot as a dated one-liner.
- [ ] If Firebase **phase 0** is not complete, the decider cannot run: record that explicitly in the checkpoint report ("decider not run — phase 0 outstanding"). W3 still dispatches; the **Frontend layer stays un-schedulable** until the line exists.
- [ ] Either way, report the outcome (or its absence) to the human at the W2 barrier. This is a **reporting obligation, not a dependency edge** — no unit in W3–W7 waits on it, and nothing cross-layer is encoded in §3.

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl §6 BE-1 | modify `app/libs/auth/actions.py`; modify `app/libs/clients/router.py`, `app/libs/allocation_matrix/router.py`, `app/libs/staff/router.py`, `app/libs/onboarding/router.py`, `app/libs/trade_models/router.py`, `app/libs/trade_models/test_router_symbols.py` | commit exists on layer branch; unit's own "Done when" in impl §6 BE-1 satisfied |
| `BE-7` | impl §6 BE-7 | modify `app/libs/auth/service.py` | commit exists on layer branch; impl §6 BE-7 "Done when" satisfied |
| `BE-12` | impl §6 BE-12 | modify `app/libs/identity/service.py` | commit exists on layer branch; impl §6 BE-12 "Done when" satisfied |

**Barrier before W2:** all rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl §6 BE-2 | create `app/libs/access/__init__.py`, `app/libs/access/pages.py` | commit exists; impl §6 BE-2 "Done when" satisfied |
| `BE-13` | impl §6 BE-13 | modify `app/libs/identity/service.py`, `app/libs/staff/service.py`, `app/libs/clients/service.py`, `app/cli/bootstrap_admin.py` | commit exists; impl §6 BE-13 "Done when" satisfied — **plus** the Q-5 outcome line written into impl §6 BE-13, or its absence reported (§4 checkpoint) |
| `BE-15` | impl §6 BE-15 | modify `app/schemas/staff.py` | commit exists; impl §6 BE-15 "Done when" satisfied |

**Barrier before W3:** commits present, §6 gate green, **and the §4 Q-5 reporting checkpoint executed**.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl §6 BE-3 | create `app/libs/access/repository.py` | commit exists; impl §6 BE-3 "Done when" satisfied |
| `BE-14` | impl §6 BE-14 | create `app/libs/identity/mailer.py` | commit exists; impl §6 BE-14 "Done when" satisfied |
| `BE-16` | impl §6 BE-16 | modify `app/libs/staff/repository.py`, `app/libs/staff/service.py`, `app/libs/staff/router.py` | commit exists; impl §6 BE-16 "Done when" satisfied |
| `BE-22` | impl §6 BE-22 (C-12/D-16 — added mid-run, widened mid-run) | modify `app/libs/auth/actions.py` (add `Action.ALLOTMENT_VIEW`), `app/libs/access/pages.py` (amend `pc.allotment-redemption`'s `PAGE_ACTIONS` entry), `app/libs/onboarding/router.py` (repoint `GET /pc/allotments`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/allotments/{id}/transaction-detail` — 4 guard repoints total, `CLIENT_VIEW`→`CLIENT_WRITE` on the latter three), `app/libs/client_portal/router.py` (repoint `POST /rm/tickets/{ref}/status`'s guard) | commit exists; impl §6 BE-22 "Done when" satisfied |

**Barrier before W4:** commits present, §6 gate green.

### Wave W4
Three independent tracks. Track C is **serialized** — see §7 (three units share `app/libs/staff/{service,router}.py`).

| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-4` (track A) | impl §6 BE-4 | create `app/libs/access/resolver.py` | commit exists; impl §6 BE-4 "Done when" satisfied |
| `BE-20` (track B) | impl §6 BE-20 | modify `app/libs/onboarding/service.py`, `app/libs/onboarding/router.py` | commit exists; impl §6 BE-20 "Done when" satisfied |
| `BE-17` (track C, 1st) | impl §6 BE-17 | modify `app/libs/staff/service.py`, `app/libs/staff/repository.py`, `app/libs/staff/router.py` | commit exists; impl §6 BE-17 "Done when" satisfied |
| `BE-18` (track C, 2nd — after `BE-17` commits) | impl §6 BE-18 | modify `app/libs/staff/service.py`, `app/libs/staff/router.py` | commit exists; impl §6 BE-18 "Done when" satisfied |
| `BE-19` (track C, 3rd — after `BE-18` commits) | impl §6 BE-19 | modify `app/libs/staff/service.py`, `app/libs/staff/repository.py`, `app/libs/staff/router.py` (response model only) | commit exists; impl §6 BE-19 "Done when" satisfied, **including** the last-active-ADMIN non-regression case |

**Barrier before W5:** all five rows committed, §6 gate green.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-5` | impl §6 BE-5 | modify `app/libs/auth/deps.py`, `app/libs/auth/actions.py` | commit exists; impl §6 BE-5 "Done when" satisfied. **From this commit on, the branch requires the §2 applied migration** — an un-migrated DB now 403s every guarded route (intended, D-9) |
| `BE-6` | impl §6 BE-6 | modify `app/schemas/users.py`, `app/libs/auth/router.py` | commit exists; impl §6 BE-6 "Done when" satisfied |

**Barrier before W6:** both committed, §6 gate green.

### Wave W6
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-8` | impl §6 BE-8 | create `app/libs/access/schemas.py`, `app/libs/access/service.py`, `app/libs/access/router.py`; modify `app/main.py` | commit exists; impl §6 BE-8 "Done when" satisfied |

**Barrier before W7:** committed, §6 gate green.

### Wave W7
Two tracks. Track B is **serialized** — see §7 (three units share `app/libs/access/{service,router,schemas}.py`).

| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-21` (track A) | impl §6 BE-21 | delete `app/libs/dev/router.py`, `app/libs/dev/service.py`, `app/libs/dev/__init__.py`, `app/schemas/dev.py`; modify `app/core/config.py`, `app/main.py` | commit exists; impl §6 BE-21 "Done when" satisfied |
| `BE-9` (track B, 1st) | impl §6 BE-9 | modify `app/libs/access/service.py`, `app/libs/access/router.py` | commit exists; impl §6 BE-9 "Done when" satisfied |
| `BE-10` (track B, 2nd — after `BE-9` commits) | impl §6 BE-10 | modify `app/libs/access/schemas.py`, `app/libs/access/service.py`, `app/libs/access/router.py` | commit exists; impl §6 BE-10 "Done when" satisfied |
| `BE-11` (track B, 3rd — after `BE-10` commits) | impl §6 BE-11 | modify `app/libs/access/schemas.py`, `app/libs/access/service.py`, `app/libs/access/router.py` | commit exists; impl §6 BE-11 "Done when" satisfied |

**Barrier before W-final:** all four rows committed, §6 gate green.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run **from `api-backend/`** using the repo venv (`api-backend\.venv\Scripts\`) — a failure blocks the next wave. Impl §3.2's gate, in its stated order:

1. **Lint** — `ruff check .`
2. **Format** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl §8; only tests for units already committed need pass at this point. The non-hermetic `BE-13` decider is marked `firebase` and deselected — run it once, deliberately, at the §4 W2 checkpoint)

The whole gate as one command (impl §3.2, verbatim):

```
ruff check . && ruff format --check . && mypy app && pytest -q
```

**Import smoke** is covered by `pytest -q` (`testpaths = ["app","tests"]` imports the app) and, from W6 onward, by `BE-8`/`BE-21`'s own app-startup assertions. No separate build step exists for this layer.

**Human gates:**
- [ ] **Blocks the whole run (checked once, §2):** `0028_admin_access_control` applied to the working database. Not a wave gate — an entry precondition, and the only thing that keeps `BE-5` onward from 403-ing everything.
- [ ] **Blocks only the §4 W2 checkpoint, not any wave:** proposal phase 0 — Firebase Trigger Email extension configured **and** the dead service-account key rotated. Anything that actually sends mail or signs with the key needs it: `BE-13`'s marked decider, and any real end-to-end exercise of `BE-13`/`BE-14`/`BE-17`/`BE-20`. All hermetic tests and every unit's code path run without it via `firebase_auth_disabled` + faked `auth`/Firestore. If it is outstanding, waves proceed and the checkpoint reports the decider as not run.
- [ ] **Downstream of the PR, human-owned, outside this schedule:** proposal phase 4 (apply the migration + seed to the **live** DB, role-by-role seed review) and phase 5 (cross-layer smoke on a live backend, which sends real invitation mail). Neither blocks a wave here; both are named so no wave is mistaken for them.
- [ ] impl §6 `BE-2`'s open ruling (the `ALLOTMENT_ACKNOWLEDGE` / `CLIENT_VIEW` VIEW-bucket conflict) is **resolved by `BE-22`** (proposal C-12/D-16), added to this schedule in W3 — no longer an open item to surface at PR time. `BE-22`'s "Done when" plus the §8.1 no-VIEW-guards-a-mutation invariant close it.

---

## 7. Shared-file / collision protocol (no worktrees)

All work happens in one working tree on one branch, so two units in the **same wave** writing the same file collide. Every wave's "Files touched" union was intersected pairwise; the result is below. **No worktree is opened** — that is banned for this schedule.

**Shared-file map** (files listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | — | — | **checked, none.** `BE-1` (`auth/actions.py` + 5 routers + one in-tree test file), `BE-7` (`auth/service.py`), `BE-12` (`identity/service.py`) are pairwise disjoint. Note `BE-1` touches `staff/router.py` and `onboarding/router.py`, which no other W1 unit does |
| W2 | — | — | **checked, none.** `BE-2` (new `access/` files), `BE-13` (`identity/service.py`, `staff/service.py`, `clients/service.py`, `cli/bootstrap_admin.py`), `BE-15` (`schemas/staff.py`) are pairwise disjoint |
| W3 | — | — | **checked, none.** `BE-3` (new `access/repository.py`), `BE-14` (new `identity/mailer.py`), `BE-16` (`staff/{repository,service,router}.py`), `BE-22` (`auth/actions.py`, `access/pages.py`, `onboarding/router.py`, `client_portal/router.py`) are pairwise disjoint — `client_portal/router.py` is a file no other unit in this layer touches at all, and `auth/actions.py`/`access/pages.py`/`onboarding/router.py` are each written once before this wave (by `BE-1` W1, `BE-2` W2, `BE-1` W1 respectively) and not again until after it (`auth/actions.py` next by `BE-5` in W5; `onboarding/router.py` next by `BE-20` in W4) — different waves, sequential by construction, no same-wave collision |
| W4 | `app/libs/staff/service.py` | `BE-17`, `BE-18`, `BE-19` | **serialize within W4:** dispatch `BE-17`, then `BE-18` after `BE-17` commits, then `BE-19` after `BE-18` commits. Order rationale: `BE-17` extends `enroll` and adds the three `create_with_profile` parameters (largest surface, other two build beside it); `BE-18` appends one method + one route; `BE-19` rewrites `update`'s guard order last, so it rebases onto a settled file rather than being rebased onto |
| W4 | `app/libs/staff/router.py` | `BE-17`, `BE-18`, `BE-19` | same serialization — three route additions/edits on one router module, applied in the order above |
| W4 | `app/libs/staff/repository.py` | `BE-17`, `BE-19` | same serialization; `BE-19`'s two set-based `UPDATE` helpers land after `BE-17`'s `create_with_profile` change |
| W4 | — (tracks A, B) | `BE-4`, `BE-20` | **checked, no collision** with each other or with the staff track: `access/resolver.py` (new) and `onboarding/{service,router}.py` |
| W5 | — | — | **checked, none.** `BE-5` (`auth/deps.py`, `auth/actions.py`), `BE-6` (`schemas/users.py`, `auth/router.py`) are disjoint. `auth/actions.py` is also `BE-1`'s file, but `BE-1` is W1 — different wave, sequential by construction |
| W6 | — | — | single unit (`BE-8`); nothing to contend. `app/main.py` is touched here and again by `BE-21` in W7 — different waves, so sequential; this is why `BE-21` is parked in W7 rather than W1 |
| W7 | `app/libs/access/service.py` | `BE-9`, `BE-10`, `BE-11` | **serialize within W7:** `BE-9`, then `BE-10`, then `BE-11`. Order rationale: `BE-9` completes the matrix surface `BE-8` opened (publish beside read), `BE-10` adds the overrides surface, `BE-11` the audit read — each appends to the file rather than rewriting the previous one |
| W7 | `app/libs/access/router.py` | `BE-9`, `BE-10`, `BE-11` | same serialization |
| W7 | `app/libs/access/schemas.py` | `BE-10`, `BE-11` | same serialization (`BE-9` does not touch schemas) |
| W7 | — (track A) | `BE-21` | **checked, no collision** with track B: `libs/dev/**`, `schemas/dev.py`, `core/config.py`, `main.py` — none of which any of `BE-9`/`BE-10`/`BE-11` touches. Truly parallel with the serialized chain |

**An "—" row above means the intersection was computed and came out empty, not that the wave was skipped.** W1, W2, W3 and W5 are genuinely fully parallel.

**Rebase discipline within a wave** (when serializing on a shared file):
1. Contending agent B waits until A's commit is on the layer branch.
2. B runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If B's rebase conflicts, B resolves, re-runs unit tests, then commits. B **does not push**.

---

## 8. Final Validation & Test wave (W-final)

Dispatches after W7 is committed and its gate passed. Two agents run in parallel: one validates static properties of the finished layer, the other runs the full test suite from impl §8. This wave is required.

### 8.1 Validation agent

Verifies static properties of the finished layer against impl §6 / §9:
- [ ] Every unit ID in §3 (`BE-1 … BE-21`) has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created / modified / deleted as specified) — including the deletions: `app/libs/dev/{router,service,__init__}.py` and `app/schemas/dev.py` do not exist.
- [ ] Public surface (impl §5 modules) matches the impl doc — imports resolve, and **no import of a deleted module remains**: nothing imports `app.libs.dev`, `app.schemas.dev`, `ROLE_ACTIONS`, `get_actions_for_role`, or `generate_invite_link`.
- [ ] **Route surface matches impl §6 / §7.2 § D exactly:** the 10 admin routes at their specified paths — `GET`/`POST /api/admin/staff`, `PATCH /api/admin/staff/{uid}`, `POST /api/admin/staff/{uid}/set-password-link`, `GET`/`PUT /api/admin/access/matrix`, `GET`/`POST /api/admin/access/overrides`, `DELETE /api/admin/access/overrides/{id}`, `GET /api/admin/audit` — plus the extended `GET /api/auth/me` and both `POST /api/auth/{client,admin}/login`. Exactly one route removed: `POST /api/dev/register` → 404. No route added beyond this list.
- [ ] **Every "Dead code purged" backend grep returns nothing**, run over `api-backend/`: `ROLE_ACTIONS`, `get_actions_for_role`, `12345678`, `dev_mode`, `dev_register`, `invite_link`, `_MANAGE`.
- [ ] `Settings` has no `dev_mode` field; the production fail-closed check still trips on `firebase_auth_disabled` alone.
- [ ] `rg "lru_cache|cachetools|_CACHE" app/libs/access/` returns nothing (impl BE-4: no resolver cache); `rg "commit\(|rollback\(" app/libs/access/repository.py` returns nothing (impl BE-3: repository never commits).
- [ ] **No VIEW-bucket action in `PAGE_ACTIONS` guards a mutating route outside its own page's EDIT bucket** (impl BE-22 / proposal C-12/D-16 — this is the property BE-22 establishes, not just a unit-level test for it). Check: for every page's VIEW bucket, every `Action` member in it is verified against the actual `require_action(...)` guards in the routers — none of them appears on a `POST`/`PATCH`/`DELETE` route unless that same action also appears in that page's own EDIT bucket. Concretely, `ALLOTMENT_ACKNOWLEDGE` and `CLIENT_VIEW` must no longer sit in any VIEW bucket once `BE-22` lands (they are replaced there by `BE-22`'s new `ALLOTMENT_VIEW` / the existing read-only guard), and `GET /pc/allotments` plus `POST /rm/tickets/{ref}/status` must be guarded consistently with that split.
- [ ] Impl §6 `BE-13`'s Q-5 outcome line is present (or its absence is explicitly reported with phase 0 named as the reason). Impl §7 matches the proposal's frozen seam verbatim, checked against the proposal on the parent branch — **not** against sibling branches.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl §8, from `api-backend/`: `pytest -q`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code. (Per impl §8.1 `tests/` is git-ignored and never staged; the marked `firebase` decider stays deselected here — it is the §4 W2 checkpoint's job, run once.)

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see §9).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (as `BE-22`, `BE-23`, …), then extend §3/§4/§5/§7 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl §7 (the cross-layer seam) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.
- **`BE-5` is the point of no return for the environment.** Once it is committed, the branch cannot be exercised against an un-migrated DB (403 everywhere, by design). If the §2 migration precondition turns out false mid-run, stop before W5 and report; do not re-add a fallback.
- **`BE-1` and `BE-5` are not individually revertible** (impl §3.2). A mid-run revert of either takes its dependents with it: `BE-1` is the branch-wide vocabulary every later unit is written in; `BE-5` requires `BE-2`/`BE-3`/`BE-4` to remain present.

---

## 10. Definition of done

- [ ] Every wave W1…W7 committed on the layer branch; each wave gate green.
- [ ] The §4 Q-5 reporting checkpoint executed at the W2 barrier, and its outcome (or explicit non-run) reported to the human and written into impl §6 `BE-13`.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `claude/admin-pages-backend-proposal-f0c9fc`, stating the applied-migration precondition in its description (impl §6 `BE-2`'s open ruling is closed by `BE-22`, no longer PR-description material).
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
