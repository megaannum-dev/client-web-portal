# 012 — Trade Reconciliation · Prompt — Layer: Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/012-trade-recon-integration-db.md` (waves) over `docs/implementations/012-trade-recon-integration-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `trade-reconciliation-integration-db` — cut from `trade-reconciliation-integration` (the parent branch already exists and is checked out today; see impl doc §2). This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/012-trade-recon-integration-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/012-trade-recon-integration-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `trade-reconciliation-integration` (per impl doc front matter — do not guess otherwise).
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - `alembic heads` on the target DB reports `29a586aaf08b` (impl doc §2 precondition).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 shows this layer's chain (DB-1→DB-2→DB-3, same file `recon.py`) is already sequenced one-unit-per-wave, so no in-wave collision handling is needed.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 012. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule doc §4): W1(DB-1) → W2(DB-2) → W3(DB-3) → W4(DB-4) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave (W4) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

Note this layer's DAG is a strict chain — every wave has exactly one unit, so "spawn all units in the wave in parallel" degenerates to one sub-agent per wave here (see schedule doc §4/§7).

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` (has `alembic.ini`, `alembic/versions/`) |
| Runtime | Python 3.13 (observed venv interpreter; no version pin in `pyproject.toml`) |
| Env activation | System Python has no project deps installed — **must** use the project venv. On Windows, `api-backend\.venv\Scripts\` holds tool executables directly (no `activate` needed if invoking full paths): `.\.venv\Scripts\alembic.exe`, `.\.venv\Scripts\pytest.exe`, `.\.venv\Scripts\ruff.exe`, `.\.venv\Scripts\mypy.exe` — all confirmed present. Run these from `api-backend/`. |
| Package manager | pip (venv-based; no poetry/uv lockfile found) |
| Migration tool | alembic — command: `.\.venv\Scripts\alembic.exe upgrade head` (run from `api-backend/`). Current head must be `29a586aaf08b` before this layer's new migration chains onto it as `down_revision`. |
| DB URL env var | `DATABASE_URL` (not `SQLALCHEMY_DATABASE_URI` or similar) |
| Shell | PowerShell primary; Bash tool also available (Git Bash / POSIX sh semantics), but all paths stay Windows-style |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (= `trade-reconciliation-integration`) |

**Gotcha (venv, not bare tool names):** the CI gate from impl doc §3.2 is written as `ruff check . && ruff format --check . && mypy app && pytest -q`, but a bare `ruff`/`mypy`/`pytest` may resolve to a different interpreter or nothing at all — the system Python has no project deps. Every sub-agent must invoke the **venv's executables** explicitly, e.g.:
```
cd api-backend
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\ruff.exe format --check .
.\.venv\Scripts\mypy.exe app
.\.venv\Scripts\pytest.exe -q
```

---

## 5. Global invariants (inherited by every sub-agent)

- **One model file per feature area** under `api-backend/app/models/` (e.g. `post_trade_allocation.py`, `pc.py`). This layer adds `api-backend/app/models/recon.py` only — no touch to `reconciliation.py`, `pc.py`, `post_trade_allocation.py`, or `users.py`.
- **UUID PK style:** `Uuid(native_uuid=False), default=uuid.uuid4` (see `Order.id`, `Model.id`) — not the `gen_random_uuid()` server-default form.
- **`created_at`/`updated_at` convention:** `DateTime(timezone=True), server_default=func.now()` (+ `onupdate=func.now()` only where a row is mutated after insert — not needed for this layer's insert-only tables).
- **Migration file naming:** `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head.
- **`app/models/__init__.py` re-export requirement:** every new model class must be added to the existing re-export block (see the `from app.models.reconciliation import (...)` pattern) so `Base.metadata` picks it up.
- **Additive & backward-compatible first** (impl doc §3.2): three brand-new tables, zero touch to existing columns/rows.
- **Frozen seam:** the cross-layer contract in proposal §4 (reproduced verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

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
- **Tests live in `api-backend/tests/`** (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** `api-backend/.gitignore` already ignores `/tests/` (confirmed). Sub-agents write and run tests but never stage or commit them. They stay local.
- **Use venv executables, not bare tool names** — see §4 gotcha.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (this layer's waves are all single-unit per schedule §4/§7, so this degenerates to one dispatch per wave). Across waves, always wait for the previous wave's commit + gate before dispatching.

### 7.0 Test harness — invoke BEFORE fan-out

The pipeline state file `.claude/plugin-state/docgen-012-trade-recon-integration.json` has no `tests` key recorded yet — `test-gen` has not been run for this layer. Impl doc §8.4 states the chosen `test-gen` level for this layer is `standard` (confirm this yourself by reading that section — do not just trust this line).

**Fan-out order:**
1. Invoke the `test-gen` skill at level `standard` on `docs/implementations/012-trade-recon-integration-db.md` **before** dispatching any feature sub-agent.
2. Dispatch feature sub-agents wave by wave (§7.1 brief below). Each is told to make its unit's tests pass **without editing test files** — a red test is either a real bug in the implementation or a wrong §8.3 test goal; in the latter case the sub-agent must **stop and flag it**, not silently rewrite the test.
3. Run W-final validation + test agents per schedule §8, after W4's gate is green.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 012.

CONTEXT (do not re-derive):
- Repo root: C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal
- Layer working dir: api-backend/
- Runtime: Python 3.13. Env: use the venv directly — .\.venv\Scripts\<tool>.exe from api-backend/
  (ruff.exe, mypy.exe, pytest.exe, alembic.exe all present there). Do NOT use a bare tool name.
- DB URL env var: DATABASE_URL
- Shell: PowerShell primary; Bash tool also available (Windows-style paths)
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- One model file per feature area under api-backend/app/models/. This layer touches
  ONLY api-backend/app/models/recon.py — never reconciliation.py, pc.py,
  post_trade_allocation.py, or users.py.
- UUID PKs via Uuid(native_uuid=False), default=uuid.uuid4 — not gen_random_uuid().
- created_at/updated_at via DateTime(timezone=True), server_default=func.now()
  (+ onupdate=func.now() only if the row mutates after insert; not needed here).
- Migration files: <revision>_<NNNN>_<slug>.py under api-backend/alembic/versions/,
  down_revision chained to the true current head.
- app/models/__init__.py must re-export every new model class so Base.metadata picks it up.
- Additive & backward-compatible first — no existing table/column is touched.
- Frozen seam: the cross-layer contract in proposal §4 / impl doc §7 is fixed. If your
  unit's contract seems to conflict with it, STOP and report — do not silently diverge.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/012-trade-recon-integration-db.md` §6 <DB-2>. That
  section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <unit ID>.
4. Tests for this unit were already generated by test-gen into api-backend/tests/
   (mirroring the source path) before you were dispatched — do NOT write new test files.
   Run them; make them pass by fixing your implementation, never by editing test files.
   If a test's expectation looks wrong against impl doc §8.3, STOP and report — do not
   silently rewrite it.
5. Run the layer's CI gate command using venv executables (see CONTEXT above):
   cd api-backend
   .\.venv\Scripts\ruff.exe check .
   .\.venv\Scripts\ruff.exe format --check .
   .\.venv\Scripts\mypy.exe app
   .\.venv\Scripts\pytest.exe -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — api-backend/tests/ is git-ignored; tests stay local.
7. Commit with the message from impl doc §6 <unit ID> (or a one-line
   `<type>(<scope>): <summary> (<UNIT-ID>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, client-frontend/, etc.).
- Writing or editing test files — tests come from test-gen, run-only for this sub-agent.
- Reading the schedule doc or other unit specs — you own exactly <unit ID>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W4's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
invoke test-gen (standard) on the impl doc, before any feature dispatch (§7.0)

for wave in [W1(DB-1), W2(DB-2), W3(DB-3), W4(DB-4), W_final]:
    for unit in wave.units:          # exactly one unit per wave in this layer
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit

open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` invoked on the impl doc before fan-out.
- [ ] Every unit DB-1…DB-4 in impl doc §6 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}` (`trade-reconciliation-integration`).
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
