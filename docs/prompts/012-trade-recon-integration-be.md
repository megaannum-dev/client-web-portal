# 012 — Trade Reconciliation · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/012-trade-recon-integration-be.md` (waves) over `docs/implementations/012-trade-recon-integration-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `trade-reconciliation-integration-be` — cut from `trade-reconciliation-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/012-trade-recon-integration-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/012-trade-recon-integration-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `trade-reconciliation-integration` (per impl doc front matter) — do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Schema precondition (verify before dispatching W1):** `recon_sessions`, `algotrade_orders`, `algotrade_executions` must already be applied to the working DB. This is a **migration-applied precondition**, not "the DB layer's branch/PR must be merged first" — verify schema presence directly (e.g. `.\.venv\Scripts\alembic.exe current` against `$env:DATABASE_URL`, or a quick introspection query for the three table names). Do **not** wait on a sibling branch or PR.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 confirms there are zero same-file collisions in any wave of this layer, so no in-wave serialization is needed.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 012. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Verify the schema precondition (§2 above).
3. Run `test-gen thorough` on the impl doc if tests have not yet been generated for this layer (see §7.1 CONTEXT block — check before W1).
4. Walk the schedule's wave graph (schedule §4): W1 (`BE-1, BE-2, BE-3, BE-4, BE-5, BE-6, BE-8` — 7 parallel units) → W2 (`BE-7`) → W3 (`BE-9`) → W-final.
5. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7.1 of this prompt. Each sub-agent implements exactly one unit.
6. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
7. Advance to the next wave.
8. After W3's gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
9. Open a PR against `${PARENT_BRANCH}`. Report status, **explicitly flagging the outstanding production-synthesizer human gate** (§6 below). Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (observed venv interpreter; no version pin in `pyproject.toml`) |
| Env activation | System Python has **no** project deps installed — always invoke the venv's executables directly, never a bare `pytest`/`ruff`/`mypy`/`alembic`. On Windows: `api-backend\.venv\Scripts\pytest.exe`, `api-backend\.venv\Scripts\ruff.exe`, `api-backend\.venv\Scripts\mypy.exe`, `api-backend\.venv\Scripts\alembic.exe` (all confirmed present). |
| Package manager | pip (venv-based; no poetry/uv lockfile in this repo) |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash tool also available (paths stay Windows-style either way) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (= `trade-reconciliation-integration`) |

**CI gate command** (impl doc §3.2), run from `api-backend/`:
```
ruff check . && ruff format --check . && mypy app && pytest -q
```
**Gotcha:** the four tools above must resolve to the **venv's** executables (`.\.venv\Scripts\<tool>.exe`), not a bare command name that might hit a different or absent interpreter — the system Python has none of these installed.

**Schema precondition gotcha:** `recon_sessions`/`algotrade_orders`/`algotrade_executions` must be present on the working DB before any BE unit can be dispatched (BE-4/5/6/7/8/9 all query or write these or the tables they join). Verify with `alembic current` or a direct schema check — this is about DB *state*, not about the DB layer's git branch/PR status.

**Stale-directory gotcha:** `api-backend/app/libs/reconciliation/` already exists on disk holding only unreferenced `__pycache__` bytecode from an abandoned earlier attempt — no tracked `.py` sources, nothing in git. BE units create fresh `.py` files at this path; there is nothing to delete, and a sub-agent should not be confused by the stray cache files.

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router.py` (thin HTTP boundary, `Depends(require_action(...))`) → `service.py`/`engine.py` (business logic) → `repository.py`/`adapters/` (pure DB access, no `HTTPException`, no aggregation) → `models`. Mirrors `app/libs/post_trade_allocation/` and `app/libs/allocation_matrix/` exactly.
- **Module layout:** one directory per feature area under `app/libs/`; this layer's directory is `app/libs/reconciliation/`, reclaiming the stale bytecode-only directory noted above.
- **Schemas:** Pydantic `BaseModel` with `ConfigDict(from_attributes=True)` under `app/schemas/<feature>.py`, one class per DTO, mirroring `app/schemas/post_trade_allocation.py`.
- **Routes:** `router = APIRouter(prefix="/mobo", tags=["mobo"])`; route functions take `Depends(require_action(Action.X))`, mirroring `post_trade_allocation/router.py`.
- **Actions:** new gate values append to the `Action(str, enum.Enum)` block in `app/libs/auth/actions.py` with a feature-owner comment, plus a `ROLE_ACTIONS` entry for `AdminRole.MOBO`.
- **Error envelope:** bare `HTTPException(status_code, detail=<string>)` — no new envelope shape.
- **Additive & backward-compatible first:** prefer additive changes; zero changes to existing routes/services beyond the one hook call (BE-8) and one new route (BE-9).
- **Frozen seam:** the cross-layer contract in proposal §4 (reproduced verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

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
- **Tests live in `api-backend/tests/`** (mirroring the source path), never co-located next to source. This dir is git-ignored per `api-backend/.gitignore`'s `/tests/` entry — tests are **never staged or committed on any layer**, they stay local as a verification aid.
- **BE-8 is NOT a mid-schedule human gate.** BE-8 (`synth.py` + its hook into `PostTradeAllocationService.run()`) commits on the layer branch during W1 exactly like any other unit — that commit alone changes code on a branch, it executes nothing. The orchestrator must **not** pause W1→W2 progression waiting for human sign-off on BE-8. The real human gate is downstream: sign-off is required only before this hook path is ever exercised against a **production** IB Flex-import run, i.e. at/after the point the merged code is deployed and allowed to process live data (schedule doc §6, §10). This session ends at "PR opened" — well before that deployment moment — so the gate never blocks this run; it must simply be **surfaced in the final report** as an outstanding item for the human, not silently dropped.
- **Test-gen before fan-out.** See §7.1 CONTEXT block below — confirm whether `test-gen thorough` has already run for this layer before dispatching W1.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (schedule §7 confirms zero same-file collisions in any wave of this layer — no in-wave serialization is needed). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Fan-out order for this layer:**
1. **Test-gen (once, before W1).** Check `.claude/plugin-state/docgen-012-trade-recon-integration.json` for a `tests` key recorded against this layer. If absent, invoke the `test-gen` skill with argument `thorough` against `docs/implementations/012-trade-recon-integration-be.md` (impl doc §8.4 states `thorough` as the chosen level for this layer — confirm by reading §8.4 yourself before invoking). This generates the concrete pytest files each feature sub-agent will run against.
2. **Feature agents, wave by wave** (W1 → W2 → W3). Each agent is told to make its unit's already-generated tests pass **without editing test files**. If a generated test is red and the sub-agent believes the test itself (not the implementation) is wrong, it must **STOP and flag** — a red test is either a real implementation bug or an incorrect §8.3 goal in the impl doc; a sub-agent never silently rewrites a test to make it pass.
3. **W-final validation + test agents**, dispatched in parallel per schedule §8, after W3's gate is green.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 012.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13; use api-backend\.venv\Scripts\<tool>.exe directly
  (pytest.exe, ruff.exe, mypy.exe) — the system Python has no project deps, never invoke
  a bare tool name.
- Shell: PowerShell primary; Bash tool also available (paths stay Windows-style)
- DB URL env var: DATABASE_URL
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- Test harness: tests for this unit were already generated by test-gen (thorough) into
  api-backend/tests/libs/reconciliation/ (or the mirrored path for the file you're touching)
  BEFORE you were dispatched. Make them pass — do not edit test files. If a generated test
  looks wrong to you, STOP and report; do not rewrite it to force a pass.

INVARIANTS (hold at every step):
- Layering: router.py -> service.py/engine.py -> repository.py/adapters/ -> models.
  Mirrors app/libs/post_trade_allocation/ and app/libs/allocation_matrix/ exactly.
- Module layout: one directory per feature area under app/libs/; this layer's directory
  is app/libs/reconciliation/ (reclaiming a stale bytecode-only directory with no
  tracked .py sources -- nothing to delete, just create fresh files).
- Schemas: Pydantic BaseModel with ConfigDict(from_attributes=True) under
  app/schemas/<feature>.py, one class per DTO.
- Routes: router = APIRouter(prefix="/mobo", tags=["mobo"]); gate with
  Depends(require_action(Action.X)).
- Actions: new gate values append to the Action(str, enum.Enum) block in
  app/libs/auth/actions.py with a feature-owner comment, plus a ROLE_ACTIONS entry
  for AdminRole.MOBO.
- Error envelope: bare HTTPException(status_code, detail=<string>) -- no new envelope shape.
- Additive & backward-compatible first -- do not touch existing routes/services beyond
  what your unit's contract specifies.
- Frozen seam: the cross-layer contract in impl doc §7 is fixed. If your unit's contract
  seems to conflict with it, STOP and report -- do not silently diverge.

TASK:
- Unit ID: <e.g. BE-4>
- Spec: read `docs/implementations/012-trade-recon-integration-be.md` §6 <BE-4>. That
  section is the CONTRACT -- implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-4>.
4. Run the already-generated tests for this unit under api-backend/tests/ (see CONTEXT).
   If a test is red: fix the implementation, or if you believe the test itself is wrong,
   STOP and report -- do not edit the test file.
5. Run the layer's CI gate command from api-backend/:
   .\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\pytest.exe -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files -- api-backend/tests/ is git-ignored; tests stay local.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, client-frontend/, alembic/).
- Editing test files to force a red test green.
- Reading the schedule doc or other unit specs -- you own exactly <BE-4>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W3's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
verify DB schema precondition (recon_sessions/algotrade_orders/algotrade_executions applied)
check test-gen state; if not yet run for this layer, invoke test-gen thorough on the impl doc

for wave in [W1, W2, W3, W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
        # schedule §7 confirms zero same-file collisions in any wave -- full parallel dispatch
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit

open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL, and the outstanding production-synthesizer
        human gate (schedule §6/§10) as an explicit flagged item -- not satisfied by this run
STOP
```

---

## 9. Definition of done

- [ ] Every unit `BE-1` … `BE-9` (impl doc §6) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (W1, W2, W3 — schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] `git grep synth` (production code only, excluding tests) returns exactly one import site.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL, and the outstanding production-synthesizer human gate explicitly flagged (not resolved by this session — it is a post-merge/deployment gate per schedule doc §6/§10).
