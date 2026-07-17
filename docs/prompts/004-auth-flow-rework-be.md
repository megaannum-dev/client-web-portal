# 004 — Authentication Flow Rework · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/004-auth-flow-rework-be.md` (waves) over `docs/implementations/004-auth-flow-rework-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `rework-authentication-module-be` — cut from parent `rework-authentication-module`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/004-auth-flow-rework-be.md` | *what* to build (`BE-1`…`BE-25` + contracts) |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-be.md` | *what order* (8 waves + W-final, gates, collision protocol) |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4 (design), § 5 (API surface), § 7 (resolutions), § 8 (verification) | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/004-auth-flow-rework-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (once): this file → impl doc § 1-3 (identity, branch contract, conventions) → impl doc § 7 (frozen seam) → schedule doc § 1-4 (wave graph). Do **not** read all 25 feature bodies up front — pull each unit's § 6 section per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):**
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`rework-authentication-module`) — do not guess.
- **Confirm branch state before dispatching anything:**
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or it has been cut from `${PARENT_BRANCH}`).
  - No other prompt session is dispatching on this branch.
  - Alembic head on the branch this was cut from is `d06ece9f47be` (0016) — if newer, re-verify against the impl doc's assumptions before proceeding.
- **No worktrees.** Do not run `git worktree add`.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."
- **Cross-layer note:** this layer's `BE-9` (status-gate wiring) needs the Database layer's migration + `assert_can_authenticate` merged before it can be exercised against a **real** DB. All other units, including `BE-9`'s own code, can be developed and unit-tested against the frozen seam (impl doc § 7) without waiting on the DB layer's branch. Do not block the whole session on the DB layer — only flag `BE-9`'s live-DB exercise as pending if the DB layer hasn't merged yet.

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 004. Your job is to:

1. Read the impl doc and schedule doc once (§ 1 read order).
2. Walk the schedule's 8-wave graph:
   - **W1:** `BE-1`, `BE-9`, `BE-11`, `BE-19`, `BE-20`, `BE-22` (roots — no intra-layer predecessor)
   - **W2:** `BE-2`, `BE-4`
   - **W3:** `BE-3`, `BE-12`, `BE-15`, `BE-25` (`BE-25` is Recommend-tier/optional — see § 6)
   - **W4:** `BE-13`, `BE-14`, `BE-16`, `BE-21`, `BE-23`
   - **W5:** `BE-17`, `BE-18`, `BE-24`
   - **W6:** `BE-6`, `BE-7` (the kill-switch pair — do not advance to this wave before W1-W5 are fully committed and green; the schedule doc's dependency graph is the authority, this list is a convenience summary)
   - **W7:** `BE-5`, `BE-10`
   - **W8:** `BE-8`
   - **W-final:** validation + test agents
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in § 7. Each sub-agent implements exactly one feature.
4. **Check schedule § 7 for same-wave file collisions before dispatching each wave** — two known ones: W1's `BE-20`/`BE-22` both touch `api-backend/app/core/config.py`; W5's `BE-17`/`BE-24` both touch `api-backend/app/main.py`. Serialize those two pairs within their wave (dispatch one, wait for its commit, then dispatch the other) rather than firing both in the same parallel batch. Re-check the schedule doc directly — this prompt is a summary, not the source of truth.
5. Wait for the whole wave to commit; run the wave gate from schedule § 6. If red, stop and report — do not attempt cross-wave fixes.
6. After the last feature wave (W8) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule § 8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (version per `api-backend/.venv/`; no explicit pin in `pyproject.toml`) |
| Env activation | `api-backend/.venv/Scripts/activate` (Windows) — do not use system Python, it has no project deps |
| Package manager | `pip` (`api-backend/requirements.txt`) |
| Migration tool | N/A for this layer — the DB layer owns migrations; this layer only reads columns the DB layer adds |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash also available (Git Bash / POSIX sh) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`rework-authentication-module`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering:** `router` (HTTP/validation, `require_action` gating) → `service` (business rules, cross-system orchestration, the one transaction boundary) → `repository` (persistence only — no `HTTPException`, no Firebase calls). Matches the existing `app/libs/users/` and `app/libs/clients/` split.
- **Module layout:** `app/libs/<feature>/{router,service,repository}.py` + `app/schemas/<feature>.py`, mounted in `main.py` under `/api`. New modules: `app/libs/identity/`, `app/libs/staff/`, `app/libs/dev/`, `app/cli/`.
- **`UserOut` is frozen** (`firebase_uid`, `email`, `role`) — no unit changes its shape.
- **RBAC is action-based, never role-string-based at the route:** every new mutating route is gated with `require_action(Action.<X>)`; authority is the route, never a request-body field.
- **Coercion convention:** tolerate `str` at the boundary, coerce to the enum member before persistence (see existing "E-2 coercion" pattern in `app/libs/users/repository.py`).
- **Additive & backward-compatible first:** the new provisioning surfaces (client onboarding, staff enrollment, bootstrap, dev-reg) land *before* the kill-switch units that delete the old create branches — this is why W6 (`BE-6`/`BE-7`) comes after W1-W5, not because of raw file dependency.
- **Frozen seam:** the cross-layer contract in proposal § 4 / impl doc § 7 is fixed — it names the DB layer's three new columns and the `assert_can_authenticate(user, db)` signature this layer's `BE-9` wires in. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is hard-forbidden in this session, for the orchestrator and every sub-agent.
- **No worktrees.** `git worktree add` is hard-forbidden.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`.** File lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** Report the failure and wait for the human; do not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/app/libs/`, `api-backend/app/schemas/`, `api-backend/app/cli/`, `api-backend/app/main.py`, `api-backend/app/core/config.py`. It must **not** touch `api-backend/app/models/users.py` (that's the DB layer) or any file under `client-frontend/`/`admin-frontend/`. If a unit seems to require it, the impl doc is wrong — stop and report.
- **`BE-25` (identity-drift-report) is Recommend-tier, not required for this layer's DoD.** Dispatch it in W3 if the human wants it built this pass; skip it without blocking any other wave if not — its absence does not fail the layer's Definition of Done (impl doc § 9).
- **Tests live in `api-backend/tests/`.** Mirror the source path; never co-locate next to source.
- **Tests are NEVER committed.** `tests/` is git-ignored; sub-agents write and run tests but never stage or commit them.
- **Known same-wave file collisions (schedule § 7) — serialize, do not parallel-dispatch:** W1's `BE-20` + `BE-22` (both touch `app/core/config.py`); W5's `BE-17` + `BE-24` (both touch `app/main.py`).

---

## 7. Delegation model — the sub-agent brief template

**Test harness state:** the impl doc § 8.3 has test goals for all 25 units, but `test-gen` has **not** been run yet for this layer (no `tests` entry in the pipeline state file as of this prompt's authoring). **Before dispatching W1**, the orchestrator must invoke `test-gen thorough` against `docs/implementations/004-auth-flow-rework-be.md` (chosen level per impl doc § 8.4 — the density of edge-case traps A1-A4 warrants it) to generate concrete test files into `api-backend/tests/`.

Once tests exist, each sub-agent is told: make your unit's generated tests pass without editing test files. A red test is either a real bug in your implementation or a wrong § 8.3 goal — in the latter case, stop and flag it to the human; do not rewrite the test to make it pass. **Exception:** `BE-9`'s tests mock the DB layer's `assert_can_authenticate` per the frozen seam (impl doc § 7) rather than requiring a live migrated DB — only its end-to-end/live-DB exercise waits on the DB layer merging.

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — **except** the two flagged collisions above (`BE-20`/`BE-22` in W1; `BE-17`/`BE-24` in W5), which must be serialized within their wave per schedule § 7's rebase-discipline protocol. Across waves, always wait for the previous wave's commits + gate before dispatching the next.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 004.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python via api-backend/.venv/Scripts/activate
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: router -> service -> repository. No business logic in routers; no
  HTTPException/Firebase calls in repositories.
- Module layout: app/libs/<feature>/{router,service,repository}.py + app/schemas/<feature>.py.
- UserOut is frozen (firebase_uid, email, role) — do not change its shape.
- RBAC is action-based (require_action(Action.<X>)) — authority is the route, never
  a request-body field.
- Coercion convention: tolerate str at the boundary, coerce to enum before persistence.
- Additive & backward-compatible first.
- Frozen seam (impl doc § 7) is fixed — stop and report on any apparent conflict.

TASK:
- Feature ID: <e.g. BE-13>
- Spec: read `docs/implementations/004-auth-flow-rework-be.md` § 6 <unit ID>. That
  section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc § 7 if this unit touches it (e.g. BE-9 consuming
   assert_can_authenticate, or any unit reading the DB layer's status/is_active columns).
3. Implement the contract from impl doc § 6 <unit ID>.
4. If test-gen has already generated tests for this unit in api-backend/tests/, make
   them pass without editing test files.
5. Run the layer's CI gate command: ruff check . && ruff format --check . && mypy app && pytest -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — tests/ is git-ignored on every layer.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message
   (or the message specified in the impl doc unit, if any).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing api-backend/app/models/users.py (Database layer's file) or anything under
  client-frontend/ or admin-frontend/.
- Reading the schedule doc or other unit specs — you own exactly <unit ID>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W8 (`BE-8`)'s gate is green. Use schedule doc § 8.1 (validation) and § 8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from § 7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
invoke test-gen thorough on docs/implementations/004-auth-flow-rework-be.md

for wave in [W1, W2, W3, W4, W5, W6, W7, W8]:
    for unit in wave.units:
        # Known collisions: W1 BE-20/BE-22 on config.py; W5 BE-17/BE-24 on main.py — serialize these two pairs.
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit

dispatch W-final (validation + test) in parallel
if either fails: STOP, report, do not open PR
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `BE-1` through `BE-24` each have a commit on `${LAYER_BRANCH}` (`BE-25` optional — see § 6).
- [ ] Every wave gate (schedule § 6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] No code path in this layer creates a `users` row from a bearer token alone, in any settings combination.
- [ ] `UserOut` unchanged.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
