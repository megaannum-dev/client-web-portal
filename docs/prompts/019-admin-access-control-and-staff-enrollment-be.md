# 019 — Admin Access Control & Staff Enrollment · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md` (waves) over `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `<parent-branch>-be` — cut from the parent branch this session finds itself on at start. This prompt captures the actual parent branch live; it does not hardcode it.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` | *what* to build (unit IDs `BE-1`…`BE-22` + contracts) |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md` | *what order* (7 feature waves + W-final, gates, collision protocol) |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` | *why* + frozen cross-layer seam (§ 4) |
| This prompt | `docs/prompts/019-admin-access-control-and-staff-enrollment-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph, preconditions, dependency edges). Do **not** read every feature body (§6, `BE-1`…`BE-22`) up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name live — never hardcode it.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's own branch contract (impl doc §2 names the parent explicitly) rather than guessing. Sanity-check in prose only: the expected parent branch is an `admin-pages-backend-proposal-*`-style name — if `PARENT_BRANCH` looks nothing like that, stop and ask before proceeding.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Entry precondition — this layer is NOT standalone-safe against an un-migrated DB.** Alembic revision `0028_admin_access_control` (four tables, four columns, the 55-row `page_access` seed) must already be applied to the target database before Wave 1 dispatches. This is deliberate, not a bug surface: proposal C-2 removes the `ROLE_ACTIONS` fallback outright, so from unit `BE-5` onward an un-migrated DB makes every guarded admin route answer 403 — for every role, including ADMIN. That is the specified fail-closed behavior (impl doc D-9), not something to route around.
  - Verify by query, not assumption: run `.\.venv\Scripts\alembic.exe current` from `api-backend/` and confirm the revision shown is `0028_admin_access_control` (or its actual head hash).
  - **If it is not applied: STOP and report to the human. Do not proceed, do not attempt to apply it yourself.** Applying the migration is the Database layer's job, on the Database layer's branch. This session must not touch DB-layer files or run its migrations — it only reads the current DB state.
- **Firebase phase 0 (proposal § Execution, phase 0) is a separate, softer prerequisite.** It gates only *real* mail sending — the Trigger Email extension configured and the dead service-account key rotated. Units `BE-13`, `BE-14`, `BE-17`, `BE-20` can be implemented and unit-tested in full with the mailer and Firebase identity calls mocked; nothing in this layer's waves is blocked by phase 0 being incomplete. It matters for one specific thing — see §3 step 3 and §8 — and if it is not done in this session's environment, that is reported, not worked around.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 019. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Verify the migration precondition (§2) before dispatching anything. If it fails, stop here — this is a hard gate on the whole run, not a wave gate.
3. Invoke `test-gen thorough` on `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` **before dispatching Wave 1** — see §7.1's TEST HARNESS block for why this layer earned `thorough` rather than a lighter level.
4. Walk the schedule's wave graph (schedule §4): 7 feature waves, then W-final.
5. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
6. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
7. **At the Wave 2 barrier specifically:** run the Q-5 reporting checkpoint (schedule §4) before advancing to Wave 3. `BE-13` decides whether Firebase's password-reset link works over a passwordless identity or whether the email-link fallback is in use — an outcome that determines the Frontend layer's scope. Confirm the dated outcome line has been written into impl doc §6 `BE-13`'s named outcome slot (or, if Firebase phase 0 is incomplete and the decider could not run, confirm that absence is recorded there instead). This is a **reporting obligation, not a dependency edge** — Wave 3 dispatches either way — but do not let the run continue past Wave 2 without doing it, and call it out by name in your final report: the Frontend layer's own scheduling cannot proceed until this line exists.
8. Advance through the remaining waves.
9. After Wave 7 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
10. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\.claude\worktrees\admin-pages-backend-proposal-f0c9fc` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv-managed — the system Python has no project dependencies installed) |
| Env activation / tool invocation | **Do NOT use bare `python`/`pytest`/`ruff`/`mypy`/`alembic`.** Always invoke the venv's own executables, from `api-backend/`: `.\.venv\Scripts\python.exe -m pytest`, `.\.venv\Scripts\ruff.exe`, `.\.venv\Scripts\mypy.exe`, `.\.venv\Scripts\alembic.exe`. A prior session lost 11 commands to this before discovering it — do not repeat that. |
| Package manager | pip (venv already provisioned) |
| DB URL env var | `DATABASE_URL` — **not** `SQLALCHEMY_DATABASE_URL` (silently ignored by `app/core/config.py`). Local default: `mysql+pymysql://portal:portalsecret@localhost:3306/portal`. |
| Migration precondition (checked, not run, by this session) | `0028_admin_access_control` must already be applied — verify via `.\.venv\Scripts\alembic.exe current` from `api-backend/`; see §2. This session never runs `alembic upgrade`/`downgrade` — that is the Database layer's action on the Database layer's branch. |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| CI gate command (verified present in `api-backend/pyproject.toml`: `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]`) | `.\.venv\Scripts\ruff.exe check .` then `.\.venv\Scripts\ruff.exe format --check .` then `.\.venv\Scripts\mypy.exe app` then `.\.venv\Scripts\python.exe -m pytest -q` — chained as schedule §6 states: `ruff check . && ruff format --check . && mypy app && pytest -q` (adjusted to the venv-qualified executables above). |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1 — do not paraphrase:

- **Layering:** "`router → service → repository → app/models/*`, exactly as `app/libs/onboarding/`, `app/libs/client_portal/` and `app/libs/staff/` already do. A router does dependency resolution and response-model wiring only; a service owns every derivation, every guard **and the transaction boundary** (`self.repo.db.commit()` / `.rollback()` live in the service, never in the repository — see `StaffRepository.create_with_profile`'s docstring); a repository issues one query shape and returns ORM rows or plain row tuples, never a DTO."
- **Module dependency direction (proposal § Layer 2 A, binding):** "`auth.deps → access.resolver → access.repository`. `access` must **not** import `staff`; `staff` **may** import `access` (to write enrollment-time overrides). **Nothing inside `access` imports `auth.deps`** — that would cycle. The resolver therefore takes a `User` and a `Session` as plain arguments, never a FastAPI dependency."
- **Error envelope:** "unchanged — `HTTPException(status_code, "message")` → FastAPI's `{"detail": "..."}`. The one structured body in this layer is C-5's 409, which passes a dict as `detail` (`{"detail": {"detail": "matrix_changed_since_read", "published": {...}}}` on the wire) exactly as § 7.1 specifies."
- **Additive & backward-compatible first** (impl doc §3.2 CI/CD): prefer additive changes; the only removals (`ROLE_ACTIONS`, `_DEFAULT_PASSWORD`, `app/libs/dev/`, `Settings.dev_mode`, `StaffOut.invite_link`) are scheduled as their own late units so the branch stays deployable at every commit — with the single deliberate exception that `BE-5` flips authorisation to the DB and therefore requires the migration from the commit that lands it (D-9's fail-closed rule).
- **Frozen seam:** the cross-layer contract in proposal § 4 is fixed and re-pinned verbatim in impl doc § 7. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report. This includes the Database layer's migration files: the migration precondition (§2) is verified here, never applied here.
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/` (mirroring the source path per impl doc §8.1), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored on every layer; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not a branch artifact).
- **Backend layer — no preview-server restriction applies.** (That guardrail is Frontend-only, where a dev/preview server must not be started; there is no Backend equivalent — this layer's verification is the CI gate command in §4, nothing more.)

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Before Wave 1 — test-gen must run first:** the pipeline state for this layer has no `tests` entry yet, meaning `test-gen` has not been run against this impl doc. Per impl doc §8.4, the chosen level is **`thorough`** — not `lite` or `standard` — because this layer is the authorisation component of the whole product: a wrong `PAGE_ACTIONS` cell or a missed precedence branch silently grants or silently revokes access, and both classes of bug are invisible on the happy path. The layer additionally carries a compensating-delete saga (`BE-17`, staff enrollment's rollback-on-partial-failure) and a money-adjacent, irreversible ownership handover (`BE-19`, which re-points a client's book and open tickets and is explicitly not undone on reactivation). The edge, boundary and parametrized test classes `thorough` adds — expired-vs-unexpired overrides, `NONE`-override precedence, receiver-validation classes, open-vs-terminal ticket splits, empty-table fail-closed behavior — are exactly where this layer's risk lives, not the happy path. **Invoke `test-gen thorough` on `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` before dispatching Wave 1.** Only after that completes does fan-out begin.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 019.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Tool invocation: .\.venv\Scripts\python.exe -m pytest / .\.venv\Scripts\ruff.exe / .\.venv\Scripts\mypy.exe
  — never bare python/pytest/ruff/mypy, the system interpreter has no project dependencies.
- Shell: PowerShell primary; Bash tool also available
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS (read before writing any test code):
- test-gen thorough has already been run against docs/implementations/019-admin-access-control-and-staff-enrollment-be.md
  before your dispatch (orchestrator step). Generated test files live under api-backend/tests/
  (mirroring the source path per impl doc §8.1, e.g. tests/libs/access/, tests/libs/staff/).
- Your job for <UNIT-ID> is to make its generated test(s) pass WITHOUT editing the test files.
- A red generated test is either a real bug in your implementation, or a sign the impl doc's
  §8.3 goal for <UNIT-ID> is itself wrong. If you believe it's the latter: STOP and report —
  do not rewrite the test to make it pass.
- If no generated test exists yet for <UNIT-ID>, write the unit test(s) from impl doc §8.3
  <UNIT-ID> yourself into api-backend/tests/ (mirror the source path; never co-locate next to source).
- If <UNIT-ID> is one of BE-13/BE-14/BE-17/BE-20 (mailer/Firebase-identity touching units): the
  mailer and Firebase identity calls are mocked per impl doc §8.1 (`unittest.mock`/`monkeypatch`) for
  every test except BE-13's one marked real-Firebase decider (`@pytest.mark.firebase`, deselected
  from the default run). You do not need a live Firebase project to implement or unit-test this unit.

INVARIANTS (hold at every step):
<paste the four invariant lines from §5 of this prompt verbatim>

TASK:
- Feature ID: <e.g. BE-3>
- Spec: read `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` §6 <BE-3>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5 per-wave table):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">, per schedule §3.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-3>.
4. Make this unit's tests pass per the TEST HARNESS block above.
5. Run the layer's CI gate command from api-backend/:
   .\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\python.exe -m pytest -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the `tests/` dir is git-ignored;
   tests stay local.
7. Commit with the message from impl doc §6 <BE-3> (or a one-line
   `<type>(<scope>): <summary> (<UNIT-ID>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (client-frontend/, admin-frontend/, or the Database
  layer's migration files under api-backend/alembic/).
- Running `alembic upgrade`/`downgrade` yourself — the migration precondition is checked by the
  orchestrator, never applied by this layer.
- Editing generated test files to force a pass.
- Reading the schedule doc or other unit specs — you own exactly <BE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after Wave 7's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants + the test-harness note).

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read schedule doc §1-4

verify migration precondition (§2): .\.venv\Scripts\alembic.exe current shows 0028_admin_access_control
  — if not applied: STOP, report to human, exit. Do not apply it, do not touch DB-layer files.

capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

invoke test-gen thorough on docs/implementations/019-admin-access-control-and-staff-enrollment-be.md   # before Wave 1

for wave in schedule.waves + [W_final]:      # 7 feature waves per schedule §4, then W-final
    for unit in wave.units:
        # Same-file collisions in this wave? Serialize per schedule §7.
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
    if this was the Wave 2 barrier:
        run the Q-5 reporting checkpoint (schedule §4): confirm impl doc §6 BE-13's outcome
        slot is filled (dated one-liner) or its absence is explicitly recorded because Firebase
        phase 0 is outstanding. Report the outcome either way — this gates the Frontend
        layer's own scheduling, not this run's wave order.
open PR against PARENT_BRANCH
report: units committed, gate summary, Q-5 checkpoint outcome, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Migration precondition (`0028_admin_access_control`) verified applied before Wave 1 — or the run stopped and reported instead of proceeding.
- [ ] `test-gen thorough` invoked against the impl doc before Wave 1 dispatch.
- [ ] Every unit `BE-1`…`BE-22` in impl doc §6 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] The Q-5 reporting checkpoint executed at the Wave 2 barrier; impl doc §6 `BE-13`'s outcome slot is filled (or its absence explicitly recorded), and the Frontend-layer scheduling dependency on that line is stated in the final report.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or applied/touched a Database-layer migration.
- [ ] Final report delivered: units committed, gate summaries, Q-5 checkpoint outcome, PR URL.
