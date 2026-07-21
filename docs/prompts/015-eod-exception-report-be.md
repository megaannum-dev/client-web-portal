# 015 — End-of-Day Exception Report · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/015-eod-exception-report-be.md` (waves) over `docs/implementations/015-eod-exception-report-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-be` — see `templates/implementation_details.md` §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/015-eod-exception-report-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/015-eod-exception-report-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as the branch this one was cut from (record it from the impl doc's front matter or ask the human — do not guess). The impl doc's front matter currently lists the parent as `<TODO: parent-branch>` — **confirm the real parent branch with the human before proceeding** if it is not obvious from `git log`/`git branch`.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Entry precondition specific to this layer:** the Database layer's `eod_records`/`eod_break_records` tables must already be applied to the working DB (the migration file/state — not a merged sibling PR; a local `alembic upgrade head` run suffices). Confirm `alembic heads` reports the migration from `015-eod-exception-report-db.md` before dispatching W1.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 015. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

**Note on this layer's wave shape:** W1 = {BE-1, BE-2, BE-3, BE-8}, all four fully parallel. W2 = {BE-4, BE-6, BE-7, BE-9} — **BE-4 and BE-7 both touch `api-backend/app/libs/eod/service.py` and must serialize within this wave**: dispatch BE-4 first, wait for its commit, then dispatch BE-7 (which rebases against the layer branch before starting — see schedule §7). BE-6 and BE-9 in W2 have no such constraint and dispatch alongside BE-4 immediately. W3 = {BE-5} alone. W4 = {BE-10} alone.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 |
| Env activation | venv at `api-backend\.venv\` — invoke tools via `.\.venv\Scripts\python.exe` / `.\.venv\Scripts\alembic.exe` / `.\.venv\Scripts\pytest.exe` (system Python has no project deps installed) |
| Package manager | pip, via the project's `pyproject.toml` (no lockfile-based manager) |
| DB URL env var | `DATABASE_URL` |
| Shell | PowerShell primary; Bash also available (Git Bash) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

**One BE-9-specific note:** the `playwright` package is a new dependency this layer adds (impl §6.BE-9). It is imported **locally inside `ChromiumRenderer.render()`**, not at module level, specifically so the rest of this layer's automated tests (and every other sub-agent's gate run) do not require Chromium's browser binaries to be installed. Do **not** run `playwright install chromium` as part of any feature dispatch in this layer — it is a deployment-time step (impl doc §9), out of scope for this session.

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router.py` (thin HTTP boundary, `Depends(require_action(...))`) → `service.py` (business logic, one class taking `db: Session`) → `repository.py` (pure DB access, no `HTTPException`, no aggregation) → `models`. Mirrors `app/libs/onboarding/` and `app/libs/reconciliation/`.
- **Return/error envelope:** bare `HTTPException(status_code, detail=<string>)` — no new envelope shape.
- **Precision & types:** money/notional is `Decimal`, never `float`, end to end (repository → service → schema serialization via `fmt_usd`).
- **Naming:** one directory per feature area under `app/libs/` — this layer's is `app/libs/eod/`, brand new. Routes under `router = APIRouter(prefix="/mobo", tags=["mobo"])`. New `Action` members get an inline comment naming the owning feature/unit, matching every existing entry in `app/libs/auth/actions.py`.
- **Additive & backward-compatible first:** zero changes to existing routes/services beyond BE-6's one hook call into `PostTradeAllocationService.run()`; three new routes, one new `Action` member, three new settings.
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
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/eod/` (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored on every layer; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not branch artifacts).
- **No test ever launches a real headless browser or hits a real Next.js print route.** `ChromiumRenderer`/`WeasyPrintRenderer` are always mocked in this layer's automated suite (impl §8.1) — manual end-to-end verification of `ChromiumRenderer` is a human step, not a feature-agent task.

---

## 7. Delegation model — the sub-agent brief template

**Test harness:** impl doc §8.3 has test goals for BE-1 through BE-10, but `test-gen` has **not** yet been run for this layer (the state file has no `tests` entry). **Before fan-out, invoke `test-gen thorough` on `docs/implementations/015-eod-exception-report-be.md`** (impl §8.4 names `thorough` — sign-off's guard ordering, the frozen-vs-live status branching, and the completeness gate are exactly the edge/ordering logic this level covers) to generate concrete pytest files into `api-backend/tests/libs/eod/` from the §8.3 goals. Once generated, each feature sub-agent's job is to make its unit's tests pass — a red test is either a real bug in the unit or a wrong §8.3 goal; in the latter case, stop and flag it to the human rather than rewriting the test to match broken code.

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — **except** BE-4/BE-7 in W2, which must serialize per schedule §7 (dispatch BE-4 alone first, wait for its commit, then dispatch BE-7 — BE-6 and BE-9 can go in the same initial parallel batch as BE-4). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 015.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, venv at api-backend\.venv\ — use
  .\.venv\Scripts\python.exe / .\.venv\Scripts\pytest.exe
- Shell: PowerShell primary; Bash (Git Bash) also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- Tests for this layer are generated by `test-gen thorough` into
  api-backend/tests/libs/eod/, from impl doc §8.3 goals, BEFORE your dispatch.
  Make your unit's tests pass without editing the test file itself. If a test
  looks wrong, stop and report — do not rewrite it to match a bug.
- Never launch a real headless browser or hit a real Next.js route in any test
  you run — ChromiumRenderer/WeasyPrintRenderer are always mocked.

INVARIANTS (hold at every step):
- router.py -> service.py -> repository.py -> models; a module may import
  only from layers below it.
- Bare HTTPException(status_code, detail=<string>) — no new error envelope.
- Money/notional is Decimal end to end, never float.
- One directory per feature area under app/libs/ — this layer is app/libs/eod/.
- Additive & backward-compatible first — zero changes to existing routes
  beyond BE-6's one hook call into PostTradeAllocationService.run().
- Frozen seam (proposal §4 / impl doc §7) is fixed. If your unit's contract
  seems to conflict with it, STOP and report — do not silently diverge.

TASK:
- Feature ID: <e.g. BE-4>
- Spec: read `docs/implementations/015-eod-exception-report-be.md` §6 <BE-4>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-N>.
4. Confirm/adjust the generated test(s) for <BE-N> already sitting in
   api-backend/tests/libs/eod/ (do not write new test code inline unless the
   TEST HARNESS block above says test-gen hasn't run yet).
5. Run the layer's CI gate command:
   cd api-backend && .\.venv\Scripts\python.exe -m ruff check . && .\.venv\Scripts\python.exe -m ruff format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\pytest.exe -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the tests/ dir is git-ignored on every
   layer; tests stay local.
7. Commit with a one-line `be(eod): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, or api-backend/
  files outside app/libs/eod/, app/schemas/eod.py, app/libs/auth/actions.py,
  app/libs/post_trade_allocation/service.py, app/core/config.py, pyproject.toml,
  app/main.py — as named in your specific unit's Files list).
- Running `playwright install chromium` or launching a real browser.
- Reading the schedule doc or other unit specs — you own exactly <BE-N>.
```

**BE-4/BE-7 serialization addendum** — when dispatching BE-7, add this line to its brief's TASK section:
```
- NOTE: this unit modifies api-backend/app/libs/eod/service.py, a file BE-4
  creates. Confirm BE-4's commit is already on ${LAYER_BRANCH} before starting;
  run `git pull --rebase` against ${LAYER_BRANCH} (not main) first, then re-read
  service.py before adding your export() method.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green (i.e. after BE-10 commits). Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
confirm eod_records/eod_break_records tables applied to the working DB

for wave in [W1(BE-1,BE-2,BE-3,BE-8), W2(BE-4,BE-6,BE-7,BE-9), W3(BE-5), W4(BE-10), W_final]:
    if wave == W2:
        dispatch BE-4, BE-6, BE-9 together (single message, parallel Agent calls)
        wait for BE-4's commit specifically
        dispatch BE-7 (with the serialization addendum above)
    else:
        dispatch every unit in wave in a single message (parallel Agent calls)
    wait until every dispatched sub-agent in the wave reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (BE-1 through BE-10) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
