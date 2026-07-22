# 015 — End-of-Day Exception Report · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/015-eod-exception-report-db.md` (waves) over `docs/implementations/015-eod-exception-report-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-db` — see `templates/implementation_details.md` §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/015-eod-exception-report-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/015-eod-exception-report-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as the branch this one was cut from (record it from the impl doc's front matter or ask the human — do not guess). The impl doc's front matter currently lists the parent as `<TODO: parent-branch>` — **confirm the real parent branch with the human before proceeding** if it is not obvious from `git log`/`git branch`.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 015. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

**Note on this layer's wave shape:** every wave in the Database schedule contains exactly one unit (DB-1 → DB-2 → DB-3 → DB-4, strictly linear — each unit shares a file with, or is otherwise built on, its predecessor). There is no parallelism to exploit here; the loop in §8 still applies, it just dispatches one sub-agent per wave.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 |
| Env activation | venv at `api-backend\.venv\` — invoke tools via `.\.venv\Scripts\python.exe` / `.\.venv\Scripts\alembic.exe` / `.\.venv\Scripts\pytest.exe` (system Python has no project deps installed) |
| Package manager | pip, via the project's `pyproject.toml` (no lockfile-based manager) |
| Migration tool | Alembic — `.\.venv\Scripts\alembic.exe upgrade head` / `downgrade -1`, from `api-backend/` |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash also available (Git Bash) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** one model file per feature area under `api-backend/app/models/`; this layer adds `api-backend/app/models/eod.py` only — no touch to `recon.py`, `reconciliation.py`, `post_trade_allocation.py`, or `trade_models/storage.py`.
- **Return/error envelope:** n/a at this layer (no HTTP surface) — DB integrity errors (`IntegrityError`) are the only "error shape" this layer produces, and that's SQLAlchemy's own.
- **Precision & types:** UUID PKs via `Uuid(native_uuid=False), default=uuid.uuid4`; string-backed enums via `SAEnum(Enum, native_enum=False, length=N, values_callable=lambda e: [m.value for m in e])` (matches `recon.py`'s `SourceKind`) — never a native Postgres enum type; money/notional columns are `Numeric`, never `Float`.
- **Naming:** `created_at` via `DateTime(timezone=True), server_default=func.now()`; migration files `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head (`b1c2d3e4f5a6`).
- **Additive & backward-compatible first:** two brand-new tables, zero touch to existing columns/rows; the migration is purely additive (no `ALTER` on any existing table).
- **Frozen seam:** the cross-layer contract in proposal §4 (reproduced in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/` (mirroring the source path, e.g. `api-backend/tests/models/test_eod.py`), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored on every layer; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not branch artifacts).

---

## 7. Delegation model — the sub-agent brief template

**Test harness:** impl doc §8.3 has test goals for DB-1 through DB-4, but `test-gen` has **not** yet been run for this layer (the state file has no `tests` entry). **Before fan-out, invoke `test-gen standard` on `docs/implementations/015-eod-exception-report-db.md`** (impl §8.4 names `standard` as the chosen level for this layer) to generate concrete pytest files into `api-backend/tests/models/test_eod.py` from the §8.3 goals. Once generated, each feature sub-agent's job is to make its unit's tests pass — a red test is either a real bug in the unit or a wrong §8.3 goal; in the latter case, stop and flag it to the human rather than rewriting the test to match broken code.

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7 — not applicable in this layer, since every wave here has exactly one unit). Across waves, always wait for the previous wave's commit + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 015.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, venv at api-backend\.venv\ — use
  .\.venv\Scripts\python.exe / .\.venv\Scripts\alembic.exe / .\.venv\Scripts\pytest.exe
- Shell: PowerShell primary; Bash (Git Bash) also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- Tests for this layer are generated by `test-gen standard` into
  api-backend/tests/models/test_eod.py, from impl doc §8.3 goals, BEFORE your
  dispatch. Make your unit's tests pass without editing the test file itself.
  If a test looks wrong, stop and report — do not rewrite it to match a bug.

INVARIANTS (hold at every step):
- One model file per feature area under api-backend/app/models/; this layer
  touches ONLY api-backend/app/models/eod.py (and its __init__.py re-export).
- UUID PKs via Uuid(native_uuid=False), default=uuid.uuid4; string-backed enums
  via SAEnum(Enum, native_enum=False, length=N, values_callable=lambda e: [m.value
  for m in e]) — never a native Postgres enum type.
- created_at via DateTime(timezone=True), server_default=func.now(); migration
  files <revision>_<NNNN>_<slug>.py, down_revision chained to head b1c2d3e4f5a6.
- Purely additive — zero touch to any existing table/column/row.
- Frozen seam (proposal §4 / impl doc §7) is fixed. If your unit's contract
  seems to conflict with it, STOP and report — do not silently diverge.

TASK:
- Feature ID: <e.g. DB-1>
- Spec: read `docs/implementations/015-eod-exception-report-db.md` §6 <DB-1>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <DB-N>.
4. Confirm/adjust the generated test(s) for <DB-N> already sitting in
   api-backend/tests/models/test_eod.py (do not write new test code inline
   unless the TEST HARNESS block above says test-gen hasn't run yet).
5. Run the layer's CI gate command:
   cd api-backend && .\.venv\Scripts\python.exe -m ruff check . && .\.venv\Scripts\python.exe -m ruff format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\pytest.exe -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the tests/ dir is git-ignored on every
   layer; tests stay local.
7. Commit with a one-line `db(eod): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, or api-backend/
  files outside app/models/eod.py, app/models/__init__.py, alembic/versions/).
- Reading the schedule doc or other unit specs — you own exactly <DB-N>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green (i.e. after DB-4 commits). Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(DB-1), W2(DB-2), W3(DB-3), W4(DB-4), W_final]:
    for unit in wave.units:      # exactly one per wave in this layer
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (DB-1 through DB-4) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
