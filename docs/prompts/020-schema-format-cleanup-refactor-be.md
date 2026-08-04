# 020 — Schema / Format Cleanup Refactor · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md` (waves) over `docs/implementations/020-schema-format-cleanup-refactor-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `schema-repository-refactor-bugfix-be` — cut from `schema-repository-refactor-bugfix`. This prompt captures the actual parent branch at session start (§2 below).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/020-schema-format-cleanup-refactor-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/020-schema-format-cleanup-refactor-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`schema-repository-refactor-bugfix`) rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}`.
  - `api-backend/.venv/` exists and resolves `ruff`, `mypy`, `pytest`, FastAPI, SQLAlchemy.
  - A MySQL instance reachable at `DATABASE_URL`; alembic head is `c72e91a4f6b3`.
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. This layer's DAG has **no same-wave file collisions** (schedule §7) — every wave dispatches fully in parallel.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."
- **Not a precondition:** the DB layer's fee/storage-key migrations are seam **assumptions**, mocked in tests. Do not wait on the `-db` branch, do not import from it, do not start a live backend against it.

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 020. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (7 units) → W2 (6 units) → W3 (3 units) → W-final. Every wave is fully parallel — no serialization needed within any wave in this layer.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After BE-10's wave (W3) commits and the gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (version per `api-backend/.venv/pyvenv.cfg`) |
| Env activation | **No `source`/`activate` — invoke venv executables directly:** `.\.venv\Scripts\python.exe`, `.\.venv\Scripts\ruff.exe`, `.\.venv\Scripts\mypy.exe`. The system Python on PATH has none of the project's dependencies. |
| Package manager | pip (deps declared in `api-backend/pyproject.toml`, installed into `api-backend/.venv/`) |
| Migration tool | not this layer's concern — alembic head `c72e91a4f6b3` is a precondition, not a task |
| DB URL env var | `DATABASE_URL` (creds `portal/portalsecret`) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering: `router → service → repository`.** `router.py` owns FastAPI decorators/`Depends`/request-shape validation; `service.py` owns business logic and is where `raise HTTPException` lives; `repository.py` owns SQLAlchemy queries and nothing else. A router may import its service; a service may import its repository; **never the reverse**.
- **`app/core/*` is the floor.** It is imported by everything and imports **no** feature package. BE-5's whole point is moving `storage.py` here because four feature packages currently reach across that boundary.
- **Feature packages should not import each other.** One violation is deliberately NOT fixed on this branch: `eod` + `post_trade_allocation` importing `app.libs.reconciliation.*` (documented, not removed — see BE-4/proposal D-12).
- **Errors:** `raise HTTPException(status.HTTP_XXX, "message")` with a plain string `detail`. BE-9 normalizes the *wire shape* (adds the envelope for non-2xx), it does not change how call sites raise.
- **Typing:** full annotations, `from __future__ import annotations` in most modules, `mypy app` must be clean.
- **Money/rates:** `Decimal` on the DB side (`Numeric(9,6)`), `float` in Pydantic DTOs. Fee comparisons must be done in `Decimal`, never float-to-float (BE-13's whole point).
- **The one permitted red test:** `tests/libs/post_trade_allocation/test_be3_service_run.py:365` stays failing and unskipped per proposal D-7. Never skip/xfail/edit it to pass.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session, for the orchestrator and every sub-agent.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave.
- **Never modify sibling-layer files.** Scoped to `api-backend/`. If a unit seems to need a change outside it, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/`**, mirroring the source path, and are **never committed** (`api-backend/.gitignore:28`).
- **The gate's pytest stage has a moving target across waves, not a fixed zero.** ~255 failures after W1, ~a dozen after W2, exactly one (D-7) after W3. Do not treat a non-zero count at W1/W2 as a red gate on its own — compare against the declining baseline in schedule §6.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — this layer's DAG has no same-wave file collisions (schedule §7), so every wave is fully parallel. Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 020.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python via .\.venv\Scripts\*.exe — never bare `python`/`pytest`/`ruff`/`mypy`.
- Shell: PowerShell primary; Bash tool also available.
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- router → service → repository; never the reverse.
- app/core/* imports no feature package; every feature package may import it.
- HTTPException(status, "message") — plain string detail; BE-9's envelope wraps the wire shape, not the raise call.
- Full type annotations; mypy app clean.
- Money/rates: Decimal on the DB side, float in Pydantic DTOs; fee comparisons in Decimal only.
- tests/libs/post_trade_allocation/test_be3_service_run.py:365 stays red and unskipped (D-7) — never touch it.
- The frozen seam (proposal §4) is fixed — if this unit's contract conflicts with it, STOP and report.

TEST HARNESS:
- `test-gen` has NOT yet been run for this layer. Before implementing this unit,
  check whether generated tests for it already exist under `api-backend/tests/`
  per impl doc §8.2's coverage matrix. If not, invoke the `test-gen` skill against
  `docs/implementations/020-schema-format-cleanup-refactor-be.md` at level
  `standard` (impl §8.4's chosen level), upgraded to `thorough` if this unit is
  BE-6, BE-9, BE-14 or BE-15 (the trust-boundary/money-path units).
- A RED generated test for this unit is either a real bug or a wrong §8.3 goal —
  stop and flag it. Never edit the test to force green, and never touch
  test_be3_service_run.py:365 (D-7 — the one permitted red test, unrelated to your unit).
- Tests go into `api-backend/tests/`, mirroring the source path, and are NEVER
  staged or committed.

TASK:
- Feature ID: <e.g. BE-5>
- Spec: read `docs/implementations/020-schema-format-cleanup-refactor-be.md` §6 <BE-5>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-5>.
4. Ensure/generate the unit's tests per the TEST HARNESS block above.
5. Run the layer's CI gate: `.\.venv\Scripts\ruff.exe check . && .\.venv\Scripts\ruff.exe format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\python.exe -m pytest -q` (from `api-backend/`).
   If red for a reason other than the declining test-baseline count or D-7, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`). Do NOT stage or commit test files.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message, or the message specified in impl doc §6 if given.
8. Report back: commit SHA, files changed, test summary (including current pytest failure count, for the orchestrator's wave-gate comparison). Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/app or api-backend/tests only; never admin-frontend/, client-frontend/, or api-backend/alembic/).
- Reading the schedule doc or other unit specs — you own exactly this unit.
- Skipping, xfailing, or editing tests/libs/post_trade_allocation/test_be3_service_run.py:365.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W3's units commit and the gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1, W2, W3, W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
        (all dispatches in ONE message — no same-wave collisions in this layer)
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
        (compare pytest failure count against the DECLINING baseline, not zero, until W3)
open PR against PARENT_BRANCH
report: units committed, gate summary (incl. final pytest count = 1, D-7 named), PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit BE-1 … BE-16 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (W1, W2, W3) was green when crossed, per the declining-baseline standard.
- [ ] Route count is exactly 90 (verified after W2).
- [ ] `pytest -q` reports exactly one failure — `test_be3_service_run.py:365` (D-7) — after W3.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
