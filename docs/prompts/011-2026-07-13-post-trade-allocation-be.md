# 011 — Post-Trade Allocation · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md` (waves) over `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `post-trade-allocation-integration-be` — cut from parent `post-trade-allocation-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/011-2026-07-13-post-trade-allocation-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `post-trade-allocation-integration` (from the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Schema precondition:** the DB-layer objects (`post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, `orders.allocated_run_id`) must exist in whatever DB this session's tests run against. This is a **schema-shape** precondition against the frozen seam, not "the DB schedule/PR has run" — you do not need the `-db` branch merged, only the tables present locally (apply the DB layer's migration to your own dev DB, or seed the shape directly, before running tests).
- **Toolchain precondition — verify before trusting any gate (found during prompt generation):** `api-backend/pyproject.toml` (ruff/pytest/mypy config) does **not** yet exist on `post-trade-allocation-integration` — it was added on `main` in commit `2cfa460` (`chore(tooling): configure ruff/pytest/mypy for api-backend and add Vitest to both frontends`) but has not been merged/rebased into this parent branch. The `.venv` already has the `ruff`/`pytest`/`mypy` binaries installed, so gate commands will *run*, but without `pyproject.toml`'s excludes/testpaths a bare `ruff check .` or `pytest -q` may scan `alembic/`/`.venv/` or collect unrelated tests.
  - **Before W1 dispatches:** check whether `api-backend/pyproject.toml` exists. If absent, ask the human whether to merge/rebase `main` up to `2cfa460` into `post-trade-allocation-integration` first, or scope every gate command in this session to the exact paths named in schedule §6 (`app/libs/post_trade_allocation`, `app/schemas/post_trade_allocation.py`) rather than a bare `.` — do not silently run the unscoped command and report a false red/green.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 011. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (`BE-1`, `BE-4`, `BE-5`) → W2 (`BE-2`) → W3 (`BE-3`, `BE-6`) → W4 (`BE-7`, `BE-8`) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave, honoring the in-wave serializations from schedule §7:
   - **W1:** dispatch `BE-4` immediately; dispatch `BE-1` first among the pair sharing `app/schemas/post_trade_allocation.py`, then `BE-5` after `BE-1` commits.
   - **W3:** dispatch `BE-3` first (both edit `service.py`), then `BE-6` after `BE-3` commits.
   - **W4:** dispatch `BE-7` first (both edit `main.py`), then `BE-8` after `BE-7` commits.
6. After `BE-7`/`BE-8`'s wave gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (venv-pinned) |
| Env activation | venv at `api-backend/.venv/` — invoke tools directly, e.g. `api-backend\.venv\Scripts\python.exe`, `...\ruff.exe`, `...\pytest.exe`, `...\mypy.exe` (no `Activate.ps1` needed if invoking full paths) |
| Package manager | pip (`api-backend/requirements.txt`) |
| Migration tool | n/a for this layer (Database layer's concern) — this layer only requires the resulting schema to exist locally |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash tool also available (Git Bash / POSIX sh) |
| OS | Windows 11 |
| Toolchain config caveat | `api-backend/pyproject.toml` missing on this branch as of session start — see §2 precondition before trusting `ruff`/`mypy` gate output |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`post-trade-allocation-integration`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router → service → repository`; a module may import only from layers below it. `service.py` owns all business logic (aggregation, split, persistence, portfolio math); `router.py` only wires HTTP to service calls; `repository.py` only does reads/writes, no business logic.
- **Return/error envelope:** FastAPI default `{"detail": "<msg>"}` on errors; every route's success response is the exact DTO shape pinned in impl doc §7 (from proposal §4.1) — money fields are `float` (JSON numbers, major units), never `Decimal`/`DecimalString`, at the schema boundary.
- **Precision & types:** internal math uses `Decimal`; cast to `float` only at the Pydantic schema boundary. **D-3 (safety-critical):** the net-traded aggregation is `Σ orders.proceeds`, always **signed** — never `abs()`, never `Σ|amount|`. A losing day's negative `traded` must survive unmodified through `allocated` and into the `client_portfolios.amount_in_trade` delta.
- **Naming:** `snake_case` for Python; DB column `multiplier` maps to API/UI field `units` (D-4); DB/DTO field is `allocated`, not `delegated` (D-7).
- **Additive & backward-compatible first:** this layer adds a new package and two new `Action` enum members; it edits no existing route or existing `Action` value.
- **Frozen seam:** the cross-layer contract in proposal §4 (verbatim in impl doc §7) is fixed — three routes, exact DTO field names, HTTP status codes. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

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
- **Never call `abs()` on `proceeds` or sum `amount` in place of `proceeds`** anywhere in `service.py` (D-3) — this is the exact bug this proposal corrected; any sub-agent whose diff introduces it must be told to fix it before committing, not after.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7 — see the W1/W3/W4 pairs in §3 above). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Test harness note:** impl doc §8.3 states test *goals* in prose; no `test-gen` run and no `tests` entry exists yet in the pipeline state file for this layer. Before dispatching W1, invoke the `test-gen` skill on `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` at level **standard** (impl doc §8.4's chosen level) so each unit's sub-agent has concrete test files under `api-backend/tests/libs/post_trade_allocation/` to make pass. If `test-gen` is not invoked first, each sub-agent must translate its unit's §8.3 goal into a concrete test itself before running the gate — note this explicitly in that sub-agent's brief so it doesn't skip testing. `BE-3`'s test is the highest-stakes one: it MUST include the losing-day (negative `Σ proceeds`) case per §8.3, not just the profit case.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 011.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13 venv at api-backend/.venv/ — call
  api-backend\.venv\Scripts\python.exe / ruff.exe / pytest.exe / mypy.exe directly
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- Toolchain caveat: api-backend/pyproject.toml may be missing on this branch (see prompt §2) —
  if so, scope ruff/mypy/pytest invocations to app/libs/post_trade_allocation and
  app/schemas/post_trade_allocation.py, not a bare "."

TEST HARNESS:
- If test-gen has already been run for this layer, concrete test files exist under
  api-backend/tests/libs/post_trade_allocation/ — make YOUR unit's test(s) pass
  without editing the test file. A red test is either a real bug in your
  implementation or a wrong §8.3 goal — if you believe it's the latter, STOP and
  report; do not rewrite the test yourself.
- If test-gen has NOT been run, translate your unit's §8.3 test goal(s) into concrete
  pytest test(s) yourself before running the gate. If you are BE-3, your test MUST
  cover both a profit day (positive Σ proceeds) and a losing day (negative Σ
  proceeds) — this is the D-3 safety-critical case.

INVARIANTS (hold at every step):
- Layering: router -> service -> repository; a module imports only from layers below it.
- Response DTOs: money fields are float (major units) at the schema boundary, never Decimal/string.
- D-3 (safety-critical): net traded = signed Sigma proceeds. NEVER abs(), NEVER Sigma|amount|.
- Naming: DB "multiplier" -> API "units" (D-4); DB/DTO field is "allocated", not "delegated" (D-7).
- Additive & backward-compatible first — no existing route or Action value changes shape.
- Frozen seam (proposal §4 / impl doc §7) is fixed — if your unit's contract conflicts with it, STOP and report.

TASK:
- Feature ID: <e.g. BE-3>
- Spec: read `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` §6 <BE-3>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-3>.
4. Make/write the unit test(s) for <BE-3> per the TEST HARNESS note above.
5. Run the layer's CI gate command (see §4/§6 above), scoped to your changed files if
   pyproject.toml is absent. If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, client-frontend/) or DB migration files.
- Calling abs() on proceeds, or summing amount in place of proceeds, anywhere in service.py.
- Reading the schedule doc or other unit specs — you own exactly <BE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after `BE-7`/`BE-8`'s wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2); check pyproject.toml presence

for wave in [W1(BE-1,BE-4,BE-5), W2(BE-2), W3(BE-3,BE-6), W4(BE-7,BE-8), W_final]:
    for unit in wave.units:
        # Honor in-wave serialization per schedule §7 (see §3 above for the exact pairs)
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (`BE-1`…`BE-8`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS, including the D-3 `abs()`/`Σ|amount|` grep check.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
