# 011 — Post-Trade Allocation · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md` (waves) over `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `post-trade-allocation-integration-db` — cut from parent `post-trade-allocation-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/011-2026-07-13-post-trade-allocation-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `post-trade-allocation-integration` (from the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Toolchain precondition — verify before trusting any gate (found during prompt generation):** `api-backend/pyproject.toml` (ruff/pytest/mypy config) does **not** yet exist on `post-trade-allocation-integration` — it was added on `main` in commit `2cfa460` (`chore(tooling): configure ruff/pytest/mypy for api-backend and add Vitest to both frontends`) but has not been merged/rebased into this parent branch. The `.venv` already has the `ruff`/`pytest`/`mypy`/`alembic` binaries installed, so gate commands will *run*, but without `pyproject.toml`'s `exclude = ["alembic", ".venv", "pc_storage"]` a bare `ruff check .` will scan `alembic/` and `.venv/` and produce noise unrelated to this layer's units.
  - **Before W1 dispatches:** check `Test-Path api-backend/pyproject.toml` (or `ls`). If absent, ask the human whether to merge/rebase `main` up to `2cfa460` into `post-trade-allocation-integration` first (cleanest), or scope every `ruff check`/`mypy` invocation in this session to the exact new/changed files only (`api-backend/app/models/post_trade_allocation.py`, `api-backend/app/models/reconciliation.py`, the new migration file) instead of a bare `.` — do not silently run the unscoped command and report a false red/green.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 011. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (`DB-1`) → W2 (`DB-2`, `DB-3`, `DB-4`) → W3 (`DB-5`) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave. **In W2, dispatch `DB-2` and `DB-4` in parallel first; hold `DB-3` until `DB-2` commits** (schedule §7 — both edit `api-backend/app/models/post_trade_allocation.py`).
6. After `DB-5`'s wave gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees. You **do not** apply the migration to the live database — that is a separate human-owned cutover step outside this session's scope (only a dev-DB round-trip is required here).

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (venv-pinned) |
| Env activation | venv at `api-backend/.venv/` — invoke tools directly, e.g. `api-backend\.venv\Scripts\python.exe`, `...\alembic.exe`, `...\ruff.exe`, `...\pytest.exe`, `...\mypy.exe` (no `Activate.ps1` needed if invoking full paths) |
| Package manager | pip (`api-backend/requirements.txt`) |
| Migration tool | Alembic — `api-backend\.venv\Scripts\alembic.exe upgrade head` / `downgrade -1`, run from `api-backend/` |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash tool also available (Git Bash / POSIX sh) |
| OS | Windows 11 |
| Toolchain config caveat | `api-backend/pyproject.toml` missing on this branch as of session start — see §2 precondition before trusting `ruff`/`mypy` gate output |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`post-trade-allocation-integration`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** this layer is ORM models + one Alembic migration only — no service/router code. `app/models/post_trade_allocation.py` may be imported by Backend later; it must not import from `app/libs/*`.
- **Return/error envelope:** n/a at this layer (no API surface).
- **Precision & types:** money columns are `Numeric(28, 10)`, always **signed** — never add a non-negative `CheckConstraint` (D-3: `traded`/`allocated`/`amount_in_trade` legitimately go negative on a losing trading day). Percent is `Numeric(6, 3)`. UUID PKs use `Uuid(native_uuid=False), default=uuid.uuid4`. Enums stored non-native via `SAEnum(E, native_enum=False, values_callable=lambda e: [m.value for m in e])`. Timestamps: `DateTime(timezone=True)`; immutable run rows get `created_at` only; `client_portfolios` gets both `created_at`/`updated_at` semantics per its `updated_at` column with `onupdate=func.now()`. Column ordering: timestamps last.
- **Naming:** `snake_case` for all tables/columns; migration filenames follow `<hash>_00NN_<slug>.py`, next sequence is `0014`.
- **Additive & backward-compatible first:** every unit in this layer adds a table or a nullable column — nothing alters or drops an existing column. The branch is deployable at every commit.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with the seam (e.g. a column name, a signedness assumption), **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

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
- **Never apply the migration to a live/shared database.** Only a local dev-DB (or in-memory/disposable) round-trip is in scope for this session.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7 — W2's `DB-2`/`DB-3` pair). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Test harness note:** impl doc §8.3 states test *goals* in prose; no `test-gen` run and no `tests` entry exists yet in the pipeline state file for this layer. Before dispatching W1, invoke the `test-gen` skill on `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` at level **standard** (impl doc §8.4's chosen level) so each unit's sub-agent has concrete test files to make pass rather than writing tests ad hoc from the prose goals. If `test-gen` is not invoked first, each sub-agent must translate its unit's §8.3 goal into a concrete test itself before running the gate — note this explicitly in that sub-agent's brief so it doesn't skip testing.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 011.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13 venv at api-backend/.venv/ — call
  api-backend\.venv\Scripts\python.exe / alembic.exe / ruff.exe / pytest.exe / mypy.exe directly
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- Toolchain caveat: api-backend/pyproject.toml may be missing on this branch (see prompt §2) —
  if so, scope ruff/mypy invocations to the exact files you touched, not a bare "."

TEST HARNESS:
- If test-gen has already been run for this layer, concrete test files exist under
  api-backend/tests/ (or co-located app/models/test_*.py) — make YOUR unit's test(s)
  pass without editing the test file. A red test is either a real bug in your
  implementation or a wrong §8.3 goal — if you believe it's the latter, STOP and
  report; do not rewrite the test yourself.
- If test-gen has NOT been run, translate your unit's §8.3 test goal into a concrete
  test yourself (in-memory SQLite, per impl doc §8.1) before running the gate.

INVARIANTS (hold at every step):
- ORM only, no service/router code; app/models/post_trade_allocation.py must not import app/libs/*.
- Money = Numeric(28,10), always signed, no non-negative CheckConstraint (D-3).
- UUID PKs: Uuid(native_uuid=False), default=uuid.uuid4. Enums: SAEnum(..., native_enum=False, values_callable=...).
- Timestamps: DateTime(timezone=True); timestamps last in column order.
- Additive & backward-compatible first — no existing column altered or dropped.
- Frozen seam (proposal §4) is fixed — if your unit's contract conflicts with it, STOP and report.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` §6 <DB-2>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <DB-2>.
4. Make/write the unit test(s) for <DB-2> per the TEST HARNESS note above.
5. Run the layer's CI gate command (see §4/§6 above), scoped to your changed files if
   pyproject.toml is absent. If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, client-frontend/).
- Applying the migration to any live/shared database.
- Reading the schedule doc or other unit specs — you own exactly <DB-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after `DB-5`'s wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants). The test agent additionally runs the migration round-trip from schedule §6:
```bash
cd api-backend
.venv/Scripts/alembic.exe upgrade head
.venv/Scripts/alembic.exe downgrade -1
.venv/Scripts/alembic.exe upgrade head
```

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2); check pyproject.toml presence

for wave in [W1(DB-1), W2(DB-2,DB-3,DB-4), W3(DB-5), W_final]:
    for unit in wave.units:
        # W2: dispatch DB-2 and DB-4 together; hold DB-3 until DB-2 commits (schedule §7)
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (`DB-1`…`DB-5`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS, including the migration up/down/up round-trip.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or applied the migration to a live database.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
