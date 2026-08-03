# 020 — Schema / Format Cleanup Refactor · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md` (waves) over `docs/implementations/020-schema-format-cleanup-refactor-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `schema-repository-refactor-bugfix-db` — cut from `schema-repository-refactor-bugfix`. This prompt captures the actual parent branch at session start (§2 below), and `schema-repository-refactor-bugfix` is that captured value as of this writing.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/020-schema-format-cleanup-refactor-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/020-schema-format-cleanup-refactor-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`schema-repository-refactor-bugfix`) rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - Alembic head on the target/scratch DB is `c72e91a4f6b3` (`0030_client_contact_logs`).
  - A scratch MySQL database is reachable via `DATABASE_URL` and is disposable.
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule §7 handles the one same-file collision (DB-2/DB-3/DB-5 sharing one revision file) by in-wave serialization.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 020. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (DB-1 alone) → W2 (DB-2, DB-3, DB-5 — **serialized**, not parallel, per schedule §7) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After DB-5 commits and the gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (version per `api-backend/.venv/pyvenv.cfg`) |
| Env activation | **No `source`/`activate` — invoke venv executables directly:** `.\.venv\Scripts\python.exe`, `.\.venv\Scripts\alembic.exe`, `.\.venv\Scripts\ruff.exe`, `.\.venv\Scripts\mypy.exe`. The system Python on PATH has none of the project's dependencies and will silently fail or error confusingly if invoked bare. |
| Package manager | pip (deps declared in `api-backend/pyproject.toml`, installed into `api-backend/.venv/`) |
| Migration tool | alembic; command `.\.venv\Scripts\alembic.exe upgrade head` (run from `api-backend/`) |
| DB URL env var | `DATABASE_URL` (creds `portal/portalsecret`; root creds `root/rootsecret` if schema-level access is needed) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Pre-conditions before any DDL.** MySQL DDL auto-commits and will not roll back with a later raise. Every revision asserts its pre-conditions via the house `_require(condition, message)` helper **before** the first `op.` call, never after.
- **Introspection over hard-coded names.** Engine-generated constraint names are looked up in `information_schema`, never guessed. Names this repo chose (`ux_client_profiles_user_id`, `fk_client_profiles_user`) may be used literally.
- **Drop order.** The foreign key is dropped before the index/unique constraint that backs it — never the reverse. This is DB-1's own fix; it must not be reintroduced anywhere else in `alembic/versions/`.
- **`ruff` and `mypy` exclude `alembic/`.** Migration files are not lint- or type-gated; the ORM edits in `app/models/*.py` **are**. Line length is 100.
- **Destructive steps last.** Any lossy/irreversible statement (a column drop, a spurious-override null-out) is the **last** statement in `upgrade()`, behind a human review of the logged row counts — never the first or middle statement.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/`**, mirroring the source path, and are **never committed** — `api-backend/.gitignore:28` already ignores `/tests/`. They are generated, run locally as a pre-hand-off gate, and never staged.
- **DB-2 and DB-3/DB-5 share one revision file.** Within W2, dispatches are **serialized**, not parallel — see schedule §7 and §7.1's rebase discipline below.
- **DB-2's row-count review is a human checkpoint.** Do not let DB-3 or DB-5 start editing the shared revision file until a human has reviewed DB-2's five logged row counts (impl §6 step 5).
- **DB-4 does not exist as a work unit** (withdrawn — proposal D-12). Do not invent one; do not attempt to drop `recon_sessions` or its composite FK on this branch.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. W1 is a single dispatch. W2's three units are dispatched **one at a time, in order DB-2 → DB-3 → DB-5**, each waiting for the previous commit before starting (schedule §7 rebase discipline) — this is the one wave in this layer that is NOT "all dispatches in a single message."

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 020.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python via .\.venv\Scripts\*.exe — never bare `python`/`alembic`/`pytest`.
- Shell: PowerShell primary; Bash tool also available.
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Pre-conditions asserted via `_require(...)` before any DDL — MySQL auto-commits DDL.
- Constraint/index names come from `information_schema` introspection, never hard-coded guesses (except the repo's own chosen names).
- Foreign key dropped before the index/unique constraint that backs it — never the reverse.
- `ruff`/`mypy` exclude `alembic/`; ORM edits in `app/models/*.py` ARE gated.
- Destructive/lossy statements are the LAST statements in `upgrade()`, behind a human review of logged row counts.
- The frozen seam (proposal §4) is fixed — if this unit's contract conflicts with it, STOP and report, do not diverge.

TEST HARNESS:
- `test-gen` has NOT yet been run for this layer. Before implementing this unit's
  tests, check whether the impl doc's §8.3 test goals for this unit already have
  generated test files under `api-backend/tests/`. If not, invoke the `test-gen`
  skill against `docs/implementations/020-schema-format-cleanup-refactor-db.md`
  at level `thorough` (impl §8.4's chosen level for this layer) BEFORE writing
  this unit's implementation, scoped to this unit's coverage-matrix row (impl §8.2).
- If a generated test for this unit already exists and is RED against your
  implementation, that is either a real bug in your implementation or a wrong
  §8.3 goal — stop and flag it. Do not edit the test to make it pass.
- Tests go into `api-backend/tests/`, mirroring the source path, and are NEVER
  staged or committed — `api-backend/.gitignore:28` already ignores them.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/020-schema-format-cleanup-refactor-db.md` §6 <DB-2>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <DB-2>.
4. Ensure/generate the unit's tests per the TEST HARNESS block above, in `api-backend/tests/`.
5. Run the layer's CI gate: `.\.venv\Scripts\ruff.exe check . && .\.venv\Scripts\ruff.exe format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\python.exe -m pytest -q` (from `api-backend/`). Also run `.\.venv\Scripts\alembic.exe downgrade base && .\.venv\Scripts\alembic.exe upgrade head` against the scratch DB — this is DB-1's own acceptance criterion and applies to every unit's round trip.
   If red, fix and re-run. Do not commit red.
6. If this unit shares a file with another in the same wave (DB-2/DB-3/DB-5 share the new revision file): wait for the prior unit's commit, `git pull --rebase` against ${LAYER_BRANCH}, re-read the file, then add your own `# --- DB-N ---` banner block.
7. Stage ONLY the source files listed above (no `git add -A`, no `git add .`). Do NOT stage or commit test files.
8. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message, or the message specified in impl doc §6 if given.
9. Report back: commit SHA, files changed, test summary, any row-count log output (DB-2 only — flag it for human review before the next unit starts). Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/app or api-backend/alembic only; never admin-frontend/ or client-frontend/).
- Reading the schedule doc or other unit specs — you own exactly this unit.
- Attempting DB-4's withdrawn work (dropping `recon_sessions` or its composite FK).
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after DB-5 commits and W2's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# W1
dispatch DB-1 alone
wait for commit; run wave gate (schedule §6) — if red: STOP, report, exit

# W2 — serialized, not parallel (shared revision file)
for unit in [DB-2, DB-3, DB-5]:
    dispatch unit; wait for its commit before dispatching the next
    (DB-2's row-count log gets a human check before DB-3 starts)
run wave gate (schedule §6) — if red: STOP, report, exit

dispatch Validation + Test agents in parallel (schedule §8)
if both PASS: open PR against ${PARENT_BRANCH}
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] DB-1, DB-2, DB-3, DB-5 each have a commit on `${LAYER_BRANCH}`. (DB-4 has none — withdrawn.)
- [ ] Both wave gates (W1, W2) were green when crossed.
- [ ] `alembic downgrade base && alembic upgrade head` round-trip green against the scratch DB.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
