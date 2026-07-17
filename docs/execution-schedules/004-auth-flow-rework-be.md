# 004 — Authentication Flow Rework · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/004-auth-flow-rework-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `rework-authentication-module-be` — cut from `rework-authentication-module` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/004-auth-flow-rework-be.md` |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4 (design), § 6 (migration/status-gate activation note), § 5 (API surface) |
| Sibling layer schedule | `docs/execution-schedules/004-auth-flow-rework-db.md` (Database — being written in parallel; provides `assert_can_authenticate` + the three status/audit columns this layer's BE-9 consumes) |
| Prompt (dispatch harness) | `docs/prompts/004-auth-flow-rework-be.md` (path reserved, not yet authored) |

**Unit ID space this schedule sequences:** `BE-1 … BE-25` (definitions live in the impl doc — do not restate them here).

**Note on the proposal citation:** the task briefing that produced this schedule referred to "proposal § 11's two hard rules." The proposal `docs/proposals/004-2026-06-11-auth-flow-rework.md` has only 9 numbered sections (ends at § 9 "Relationship to 003") — there is no § 11. The two ordering rules this schedule encodes (kill-switch after onboarding/bootstrap exist; dev-bypass after dev-registration + dev seed exist) are real constraints, but they are sourced from the **impl doc**, not a proposal § 11: impl doc § 3.2 ("Additive & backward-compatible first... BE-11–BE-24 land *before* BE-6/BE-7/BE-8/BE-10") and § 9 rollback section (naming BE-6/BE-7/BE-10 as the kill-switch group), plus the proposal § 6 note "the status gate must not be enforced until this migration is applied." Flagged here rather than silently fixed.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc § 2 preconditions green: Alembic head `d06ece9f47be` (0016) on the branch this is cut from; the frozen seam in impl doc § 7 agreed verbatim against the proposal.
- [ ] Layer branch `rework-authentication-module-be` cut from `rework-authentication-module` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.
- [ ] **Layer-specific precondition for BE-9 only** (not for the whole layer): the DB layer's migration adding `client_profiles.status`, `admin_profiles.is_active`, `users.authorized_by`, and its exported `assert_can_authenticate(user, db)` function at `api-backend/app/libs/auth/status.py` (per `docs/execution-schedules/004-auth-flow-rework-db.md` and impl doc § 7.2), must be merged **before BE-9's wiring is exercised against a real DB**. BE-1 through BE-8, BE-9's *code* (against a faked seam), and BE-11 through BE-25 do not need this — impl doc § 8.1 fakes `assert_can_authenticate` for all unit tests in this layer.

**Layer independence.** This schedule does **not** wait on the DB layer's schedule to complete. The cross-layer seam is frozen in the proposal and re-pinned in impl doc § 7; the DB layer may run before, after, or concurrent with this one. The one exception is the real-DB integration exercise of BE-9 noted above, which is a precondition on that specific unit's live verification, not on this schedule's dispatch order.

**Exit signal (what this run produces):** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against `rework-authentication-module`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two Backend units. No edge references a DB-layer or Frontend-layer unit ID.

**Cross-layer dependency found in the impl doc (flagged, not fixed here):** BE-9's own `Dependencies:` line in the impl doc names *the DB layer's migration* as its predecessor ("the DB layer's migration ... must be merged before this unit is exercised against a real DB"). That is a cross-layer precondition, not an intra-layer DAG edge — it is carried in § 2 above, and BE-9 has **no intra-layer predecessor** in the graph below (it is a root; only its live-DB exercise is gated externally).

**Synthetic edges added by this schedule (not literally spelled out as a `Dependencies:` field in the impl doc, but required by impl doc § 3.2 / § 9's kill-switch ordering rule):** the kill-switch group BE-6/BE-7/BE-10 must not be scheduled before the onboarding (client + staff) and bootstrap surfaces exist and are committed, or there is an interim state with no account birth path. The impl doc states this ordering as a narrative principle in § 3.2 ("Additive & backward-compatible first ... this ordering detail is stated here only as a dependency fact per unit; the actual merge/wave sequencing is the execution schedule's job") — it is this schedule's job to turn it into edges. Rows marked **(added)** below are those synthetic edges.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root — `FirebaseIdentityService` core, reuses existing `_init_firebase` |
| `BE-2` | `BE-1` | `ensure_identity` is added to the class BE-1 defines |
| `BE-3` | `BE-1`, `BE-2` | dev-stub overrides `create_user`/`generate_invite_link` from BE-1, reasons about the adopt path from BE-2 |
| `BE-4` | `BE-1` | DI provider wraps the class BE-1 defines |
| `BE-5` | `BE-6` | routes call `login_and_bind`, defined by BE-6 |
| `BE-6` | `BE-9`; `BE-13`, `BE-17`, `BE-21` **(added)** | impl doc: calls `assert_can_authenticate` wired by BE-9. Added: kill-switch ordering rule — must not land before client onboarding (BE-13), staff enrollment (BE-17), and bootstrap seed (BE-21) exist, or no account birth path remains once the create-branch is deleted |
| `BE-7` | `BE-13`, `BE-17`, `BE-21` **(added)** | same kill-switch ordering rule as BE-6 (this unit deletes the auto-create branch in `_resolve_user`); its dev-bypass half degrades to a 403 rather than breaking if BE-21/BE-24 aren't live yet (impl doc "Done when"), so no hard edge to BE-24 is needed here — that stricter requirement is carried by BE-10 |
| `BE-8` | `BE-5` | same file (`router.py`), same commit is fine per impl doc — sequenced as a dependent for clarity |
| `BE-9` | — | root (intra-layer) — its only predecessor is the DB layer's migration, a cross-layer precondition tracked in § 2, not a DAG edge here |
| `BE-10` | `BE-7` (same code region, restated dependency set), `BE-21`, `BE-24` | impl doc: explicit stricter dependency — dev-bypass must not resolve until the dev seed (BE-21) and `/api/dev/register` (BE-24) both exist |
| `BE-11` | — | root — additive to the existing `ClientRepository` |
| `BE-12` | `BE-2`, `BE-4`, `BE-11` | calls `ensure_identity` (BE-2) via the DI provider (BE-4); persists via BE-11's method |
| `BE-13` | `BE-12` | route wraps `ClientService.onboard` |
| `BE-14` | `BE-12` | impl doc: exists so `assert_is_rm` (introduced in BE-12) has a second caller |
| `BE-15` | `BE-2`, `BE-4` | `StaffService.enroll` calls `ensure_identity` via the DI provider |
| `BE-16` | `BE-15` | extends the `StaffService`/`StaffRepository` BE-15 creates |
| `BE-17` | `BE-15`, `BE-16` | routes wrap `enroll` (BE-15) and `update` (BE-16) |
| `BE-18` | `BE-16` | the role-change capability it removes is provably reachable via BE-16's `StaffService.update` first |
| `BE-19` | — | root — independent extension of `/me` |
| `BE-20` | — | root — new `Settings` fields only |
| `BE-21` | `BE-15`, `BE-20` | reuses `StaffRepository.create_with_profile`/`count_active_admins` (BE-15) and reads the new settings fields (BE-20) |
| `BE-22` | — | root — independent config default + startup assertion |
| `BE-23` | `BE-12`, `BE-15` | builds rows via `ClientRepository`/`StaffRepository` primitives introduced by BE-12/BE-15 |
| `BE-24` | `BE-23`, `BE-22` | route wraps `dev_register` (BE-23); mount condition reads `settings.dev_mode` (BE-22) |
| `BE-25` | `BE-1`, `BE-2` | classifier reasons over identities created/adopted via BE-1/BE-2's surface |

**Graph invariants:**
- No cycles (verified by the topological sort in § 4).
- Every edge is between two Backend units.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1, BE-9, BE-11, BE-19, BE-20, BE-22` | yes (6 units, 6 parallel dispatches) | — |
| W2 | `BE-2, BE-4` | yes | W1 committed |
| W3 | `BE-3, BE-12, BE-15, BE-25` | yes | W2 committed |
| W4 | `BE-13, BE-14, BE-16, BE-21, BE-23` | yes | W3 committed |
| W5 | `BE-17, BE-18, BE-24` | yes | W4 committed |
| W6 | `BE-6, BE-7` | yes | W5 committed |
| W7 | `BE-5, BE-10` | yes | W6 committed |
| W8 | `BE-8` | no (single unit) | W7 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W8 committed |

**Wave-sequencing decision, stated explicitly:** W6 (the kill-switch group, BE-6/BE-7) is deliberately held until after W1–W5 have landed the three named provisioning surfaces (`POST /api/rm/clients` in W4, `POST /api/admin/staff` in W5, the bootstrap CLI in W4) — this is the schedule's application of impl doc § 3.2's ordering principle and § 9's kill-switch identification, turned into a hard wave barrier rather than left as prose. BE-10, which carries the dev-bypass's stricter dependency (BE-21 + BE-24, both landed by W5) plus same-code ordering after BE-7 (W6), falls out naturally to W7 — one wave after the code region it shares with BE-7 is committed.

**BE-25 note:** BE-25 is Recommend-tier and explicitly excluded from impl doc § 9's Definition of Done ("BE-25 ... is Recommend-tier and **not required** for this layer's DoD — build it only if drift is observed in practice"). It is still scheduled here (W3, since it only depends on BE-1/BE-2) because it is a real work unit if built, but a run that stops before W3 completes BE-25 specifically has still satisfied the layer's DoD as long as BE-1 through BE-24 are done.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W6, W7, W8, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against rework-authentication-module
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | impl § 6 BE-1 — `FirebaseIdentityService` core | create `app/libs/identity/service.py` | commit exists on layer branch |
| `BE-9` | impl § 6 BE-9 — wire status gate into shared deps | modify `app/libs/auth/deps.py` | commit exists on layer branch |
| `BE-11` | impl § 6 BE-11 — extend `ClientRepository` with onboarding writes | modify `api-backend/app/libs/clients/repository.py` | commit exists on layer branch |
| `BE-19` | impl § 6 BE-19 — extend `PATCH /users/me` to benign fields | modify `app/libs/users/router.py`, `app/libs/users/service.py`, `app/schemas/users.py` | commit exists on layer branch |
| `BE-20` | impl § 6 BE-20 — bootstrap CLI settings | modify `api-backend/app/core/config.py` | commit exists on layer branch |
| `BE-22` | impl § 6 BE-22 — dev-mode secure default + fail-closed startup assertion | modify `api-backend/app/core/config.py`, `api-backend/app/main.py` | commit exists on layer branch |

**Shared-file note for this wave:** see § 7 — `BE-20` and `BE-22` both touch `app/core/config.py`; serialize per § 7's protocol.

**Barrier before W2:** all rows above must show a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | impl § 6 BE-2 — `ensure_identity` idempotency primitive | modify `app/libs/identity/service.py` | commit exists on layer branch |
| `BE-4` | impl § 6 BE-4 — identity DI provider + fake seam | create `app/libs/identity/deps.py` | commit exists on layer branch |

**Barrier before W3:** both rows above committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | impl § 6 BE-3 — dev/offline stub behavior | modify `app/libs/identity/service.py` | commit exists on layer branch |
| `BE-12` | impl § 6 BE-12 — `assert_is_rm` + `ClientService.onboard` | modify `api-backend/app/libs/clients/service.py` | commit exists on layer branch |
| `BE-15` | impl § 6 BE-15 — `StaffService.enroll` | create `app/libs/staff/repository.py`, `app/libs/staff/service.py` | commit exists on layer branch |
| `BE-25` | impl § 6 BE-25 — on-demand identity-drift report (Recommend) | create `app/libs/identity/drift.py`, `app/cli/identity_drift.py` | commit exists on layer branch (optional per § 4 note — DoD does not require it) |

**Barrier before W4:** all rows above committed AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-13` | impl § 6 BE-13 — `POST /api/rm/clients` route | modify `api-backend/app/libs/clients/router.py`, `.../schemas.py`, `api-backend/app/main.py` | commit exists on layer branch |
| `BE-14` | impl § 6 BE-14 — `assigned_rm_uid` reassignment helper (Recommend) | modify `api-backend/app/libs/clients/repository.py` | commit exists on layer branch |
| `BE-16` | impl § 6 BE-16 — `StaffService.update` with last-ADMIN TOCTOU guard | modify `app/libs/staff/repository.py`, `app/libs/staff/service.py` | commit exists on layer branch |
| `BE-21` | impl § 6 BE-21 — idempotent bootstrap seed (incl. dev-user) | create `app/cli/bootstrap_admin.py` | commit exists on layer branch |
| `BE-23` | impl § 6 BE-23 — dev-only self-registration service | create `app/libs/dev/service.py`, `app/schemas/dev.py` | commit exists on layer branch |

**Barrier before W5:** all rows above committed AND wave-gate checks pass.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-17` | impl § 6 BE-17 — staff router: enroll + update | create `app/libs/staff/router.py`, `app/schemas/staff.py`; modify `api-backend/app/main.py` | commit exists on layer branch |
| `BE-18` | impl § 6 BE-18 — remove `PATCH /users/{uid}/role` | modify `api-backend/app/libs/users/router.py` | commit exists on layer branch |
| `BE-24` | impl § 6 BE-24 — `POST /api/dev/register` route, mounted iff `dev_mode` | create `app/libs/dev/router.py`; modify `api-backend/app/main.py` | commit exists on layer branch |

**Shared-file note for this wave:** see § 7 — `BE-17` and `BE-24` both touch `app/main.py`; serialize per § 7's protocol.

**Barrier before W6:** all rows above committed AND wave-gate checks pass.

### Wave W6
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-6` | impl § 6 BE-6 — `login_and_bind` replaces `login_or_register` (kill-switch: deletes the create branch) | modify `app/libs/auth/service.py` | commit exists on layer branch |
| `BE-7` | impl § 6 BE-7 — `_resolve_user` binds only, no auto-create (kill-switch: deletes the auto-create branch) | modify `app/libs/auth/deps.py` | commit exists on layer branch |

**Barrier before W7:** all rows above committed AND wave-gate checks pass. This barrier is the kill-switch activation point — after it, there is no `login_or_register`/auto-create fallback left in the codebase.

### Wave W7
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-5` | impl § 6 BE-5 — split portal-scoped auth routes | modify `app/libs/auth/router.py` | commit exists on layer branch |
| `BE-10` | impl § 6 BE-10 — dev-bypass binds-only (verification of the BE-7 code region now that BE-21/BE-24 are live) | modify `app/libs/auth/deps.py` (same function BE-7 edited) | commit exists on layer branch |

**Barrier before W8:** both rows above committed AND wave-gate checks pass.

### Wave W8
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-8` | impl § 6 BE-8 — retire `/auth/register` + prune body-trust | modify `app/libs/auth/router.py`, `app/schemas/auth.py` | commit exists on layer branch |

**Barrier before W-final:** row above committed AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `ruff check . && ruff format --check .`
2. **Type-check** — `mypy app`
3. **Unit tests** — `pytest -q` (impl doc § 8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `pytest -q` also serves this role here (impl doc names no separate import-smoke command beyond the combined gate below); at minimum the app must import cleanly (`python -c "import app.main"`).

Combined, per impl doc § 3.2 (verified against `api-backend/pyproject.toml`'s real `[tool.ruff]`/`[tool.ruff.lint]`/`[tool.pytest.ini_options]`/`[tool.mypy]` config):
```bash
ruff check . && ruff format --check . && mypy app && pytest -q
```

**Human gates** (call these out explicitly — a wave cannot advance past them without human sign-off):
- [ ] None of W1–W8 require a live-DB migration apply — this layer's own tests fake `assert_can_authenticate` throughout (impl doc § 8.1). The one live-DB dependency (BE-9's real-database exercise) is a precondition tracked in § 2, satisfied whenever the DB layer's migration lands — it does not gate any wave *barrier* in this schedule, only BE-9's own end-to-end verification against a real environment, which the human/DB-layer schedule owns.
- [ ] Fully automated to PR otherwise.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of § 5 "Files touched" per wave; flags any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `api-backend/app/core/config.py` | `BE-20, BE-22` | serialize: dispatch `BE-20` first (adds `bootstrap_admin_email`/`bootstrap_admin_name`), then `BE-22` after `BE-20` commits (still within W1) — `BE-22` edits the same file to flip `dev_mode` default and add `app_env` |
| W5 | `api-backend/app/main.py` | `BE-17, BE-24` | serialize: dispatch `BE-17` first (mounts the staff router), then `BE-24` after `BE-17` commits (still within W5) — `BE-24` adds the conditional dev-router mount to the same file |

**If the map is empty for a wave, all its units are truly parallel-safe.** This holds for W2, W3, W4, W6, W7, W8.

**Rebase discipline within a wave** (when serializing on a shared file):
1. Contending agent B (e.g. `BE-22` or `BE-24`) waits until A's commit (`BE-20` or `BE-17`) is on the layer branch.
2. B runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If B's rebase conflicts, B resolves, re-runs unit tests, then commits. B **does not push**.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc § 6 / § 9:
- [ ] Every unit ID `BE-1` … `BE-24` has at least one commit on the layer branch (`BE-25` optional per § 4 note).
- [ ] Every "Files" entry from impl § 6 matches the actual working-tree state (created/modified/deleted as specified).
- [ ] Public surface (impl § 5 modules) matches impl doc — imports resolve, no dangling references to removed symbols (e.g. no remaining import of the deleted `login_or_register`, no remaining `PATCH /users/{uid}/role` route).
- [ ] No route count regression: `POST /api/auth/register` and `POST /api/auth/login` (old unified) both return `404`; `POST /api/auth/client/login`, `POST /api/auth/admin/login`, `POST /api/rm/clients`, `POST /api/admin/staff`, `PATCH /api/admin/staff/{uid}`, and (iff `dev_mode`) `POST /api/dev/register` all exist.
- [ ] `UserOut` shape unchanged (`firebase_uid`, `email`, `role`).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8: `pytest -q` (target: `api-backend/tests/`, `thorough` `test-gen` tier per impl doc § 8.4, with `BE-12`/`BE-15`/`BE-16` held to 100% branch coverage on their guard logic).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-26`), then extend § 3/§ 4/§ 5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's § 7 seam (cross-layer contract) suspends this run — the DB layer must acknowledge the seam change before this schedule resumes.
- **Kill-switch barrier is non-negotiable:** W6 (BE-6/BE-7) must not be reordered earlier than W5's completion under any change to this schedule, without also re-verifying that a birth path (client onboarding, staff enrollment, or bootstrap) already exists on the branch — this is the one ordering rule this schedule treats as load-bearing beyond simple dependency satisfaction.

---

## 10. Definition of done

- [ ] Every wave W1…W8 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `rework-authentication-module`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
