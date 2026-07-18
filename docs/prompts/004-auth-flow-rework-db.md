# 004 — Authentication Flow Rework · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/004-auth-flow-rework-db.md` (waves) over `docs/implementations/004-auth-flow-rework-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `rework-authentication-module-db` — cut from parent `rework-authentication-module`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/004-auth-flow-rework-db.md` | *what* to build (`DB-1`…`DB-3` + contracts) |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4.6, § 4.11, § 6 | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/004-auth-flow-rework-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (once): this file → impl doc § 1-3 → impl doc § 7 (frozen seam) → schedule doc § 1-4 (wave graph). Do **not** read every feature body up front — pull `DB-1`/`DB-2`/`DB-3` per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`rework-authentication-module`) — do not guess.
- **Confirm branch state before dispatching anything:**
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or it has been cut from `${PARENT_BRANCH}`).
  - No other prompt session is dispatching on this branch.
  - `alembic current` (from `api-backend/`) reports head `d06ece9f47be` — if a newer revision has landed since this doc was written, **stop and report to the human**; do not silently rebase the migration's `down_revision`.
- **No worktrees.** Do not run `git worktree add`.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 004. Your job is to:

1. Read the impl doc and schedule doc once (§ 1 read order).
2. Walk the schedule's wave graph (schedule § 4): W1 (`DB-1`) → W2 (`DB-2`, `DB-3`, parallel) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in § 7. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule § 6. If red, stop and report — do not attempt cross-wave fixes.
5. **Human gate before W-final:** `DB-2`'s MariaDB rehearsal (`alembic upgrade head` then `alembic downgrade -1` against a live-shaped dump, row counts re-queried at rehearsal time) must be confirmed by the human before W-final dispatches. This is not something a sub-agent can self-certify — surface it explicitly and wait.
6. After W2's gate is green and the rehearsal is signed off, dispatch the two W-final agents (validation + test) in parallel per schedule § 8.
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
| Package manager | `pip` (`api-backend/requirements.txt`; no lockfile-based manager in this dir) |
| Migration tool | `alembic` — run via the venv binary: `api-backend/.venv/Scripts/alembic.exe` (not bare `alembic`, to avoid resolving to a system install) |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash also available (Git Bash / POSIX sh) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`rework-authentication-module`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering:** models (`app/models/users.py`) → migration (`alembic/versions/`) → pure gate function (`app/libs/auth/status.py`). No FastAPI/HTTP concerns anywhere in this layer — wiring the gate into a route dependency is Backend-layer work, out of scope here.
- **Enum persistence:** value-based string enums via `SAEnum(EnumCls, native_enum=False, length=N, values_callable=lambda c: [m.value for m in c])`, matching the existing `Portal`/`AdminRole` columns exactly.
- **Column placement:** every new column goes **before** `created_at`/`updated_at` on its table, matching migration `8f2a1c9d4b6e`'s precedent.
- **Migration style:** MariaDB-targeted via `op.execute` (not dialect-agnostic `op.add_column`, since column *position* — `AFTER <col>` — matters), with a module-level `_require(condition, message)` self-assertion helper, and pre/post row-count checks re-queried at run time — never hardcoded to a prior design doc's row-count figure.
- **Self-referential FK:** `users.authorized_by` uses `ON DELETE SET NULL`, not the default `RESTRICT` — a relationship built over it must pass explicit `foreign_keys=`.
- **Additive & backward-compatible first:** both new columns (`users.status`, `users.authorized_by`) are nullable-or-defaulted additions; nothing existing is renamed or dropped.
- **Frozen seam:** the cross-layer contract in proposal § 4.6/§ 6 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is hard-forbidden in this session, for the orchestrator and every sub-agent.
- **No worktrees.** `git worktree add` is hard-forbidden.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`.** File lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load `DB-1`/`DB-2`/`DB-3` bodies lazily per dispatch.
- **Red gate = stop.** Report the failure and wait for the human; do not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/app/models/users.py`, `api-backend/alembic/versions/`, and `api-backend/app/libs/auth/status.py` only. If a unit seems to require touching `app/libs/clients/`, `app/libs/staff/`, `app/libs/auth/deps.py`'s request-path wiring, or any other Backend-layer file, the impl doc is wrong for this layer — stop and report.
- **Tests live in `api-backend/tests/`.** Mirror the source path; never co-locate next to source.
- **Tests are NEVER committed.** `tests/` is git-ignored; sub-agents write and run tests but never stage or commit them.
- **`DB-2`'s MariaDB rehearsal is a human-gated step, not something a sub-agent performs unattended.** The sub-agent for `DB-2` authors and unit-tests the migration file; it does **not** independently declare the rehearsal complete — that confirmation comes from the human orchestrating this session.

---

## 7. Delegation model — the sub-agent brief template

**Test harness state:** the impl doc § 8.3 has test goals for `DB-1`/`DB-3`, but `test-gen` has **not** been run yet for this layer (no `tests` entry in the pipeline state file as of this prompt's authoring). **Before dispatching W1**, the orchestrator must invoke `test-gen thorough` against `docs/implementations/004-auth-flow-rework-db.md` (chosen level per impl doc § 8.4) to generate concrete test files into `api-backend/tests/`. `DB-2` is exempt from `test-gen`'s automated output — its "test" is the MariaDB rehearsal (§ 6 human gate), not a pytest file; do not ask `test-gen` to fabricate a MariaDB integration test.

Once tests exist, each sub-agent below is told: make your unit's generated tests pass without editing test files. A red test is either a real bug in your implementation or a wrong § 8.3 goal — in the latter case, stop and flag it to the human; do not rewrite the test to make it pass.

**Dispatch rule:** one Agent tool call per unit. Within W2 (`DB-2` + `DB-3`), both dispatches go in a **single message** with two parallel Agent tool calls — schedule § 7 confirms no shared-file collision between them. W1 (`DB-1`) is a single dispatch; always wait for its commit + gate before W2.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 004.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python via api-backend/.venv/Scripts/activate
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: models → migration → pure gate function. No FastAPI/HTTP concerns in this layer.
- Enum persistence: value-based SAEnum, values_callable, matching Portal/AdminRole.
- Column placement: new columns go before created_at/updated_at.
- Migration style: MariaDB op.execute, _require() self-assertions, re-queried row counts.
- Self-referential FK: users.authorized_by uses ON DELETE SET NULL, explicit foreign_keys=.
- Additive & backward-compatible first.
- Frozen seam (proposal § 4.6/§ 6) is fixed — stop and report on any apparent conflict.

TASK:
- Feature ID: <DB-1 | DB-2 | DB-3>
- Spec: read `docs/implementations/004-auth-flow-rework-db.md` § 6 <unit ID>. That
  section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc § 7.
3. Implement the contract from impl doc § 6 <unit ID>.
4. If test-gen has already generated tests for this unit in api-backend/tests/, make
   them pass without editing test files. (DB-2 is exempt — see note below.)
5. Run the layer's CI gate command: ruff check . && ruff format --check . && mypy app && pytest -q
   If red, fix and re-run. Do not commit red.
   EXCEPTION — DB-2 only: this migration cannot be exercised by pytest -q (SQLite
   create_all never runs MariaDB DDL). Author + self-review the migration file
   against the contract; the MariaDB rehearsal is a separate human-gated step
   (schedule § 6), not something you perform or self-certify.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — tests/ is git-ignored on every layer.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message
   (or the message specified in the impl doc unit, if any).
8. Report back: commit SHA, files changed, test summary (or "N/A — human rehearsal
   pending" for DB-2). Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in the Backend layer's directories (app/libs/auth/deps.py's request-path
  wiring, app/libs/clients/, app/libs/staff/, etc.) — that is sibling-layer scope.
- Reading the schedule doc or other unit specs — you own exactly <unit ID>.
- Declaring DB-2's MariaDB rehearsal "done" on your own authority.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W2's gate is green **and** the human has confirmed `DB-2`'s MariaDB rehearsal. Use schedule doc § 8.1 (validation) and § 8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from § 7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
invoke test-gen thorough on docs/implementations/004-auth-flow-rework-db.md (skip DB-2 — no pytest harness for it)

for wave in [W1, W2]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit

STOP and wait for human confirmation of DB-2's MariaDB rehearsal (schedule §6 human gate)

dispatch W-final (validation + test) in parallel
if either fails: STOP, report, do not open PR
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `DB-1`, `DB-2`, `DB-3` each have a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule § 6) was green when crossed.
- [ ] `DB-2`'s MariaDB rehearsal confirmed by the human.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
