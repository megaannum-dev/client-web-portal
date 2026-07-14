# 011 — Post-Trade Allocation · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` (waves) over `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `post-trade-allocation-integration-fe` — cut from parent `post-trade-allocation-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/011-2026-07-13-post-trade-allocation-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `post-trade-allocation-integration` (from the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Seam-only dependency:** this layer does not need the Backend or Database branches merged — it builds against the frozen DTO shape in impl doc §7 and fakes it in its own tests (§8). Do not import backend code, run the API server, or wait on a sibling PR.
- **Toolchain precondition — verify before trusting any gate (found during prompt generation):** `admin-frontend/vitest.config.ts` (and `vitest.setup.ts`) do **not** yet exist on `post-trade-allocation-integration` — they were added on `main` in commit `2cfa460` (`chore(tooling): configure ruff/pytest/mypy for api-backend and add Vitest to both frontends`) but have not been merged/rebased into this parent branch. The `vitest` binary is present in `node_modules/.bin` and `package.json` may already declare a `test` script from a stale install, but without `vitest.config.ts` (test environment, path aliases) and `vitest.setup.ts` a bare `npm test`/`npx vitest run` may fail to resolve `@/` imports or a DOM environment, unrelated to any real bug in this layer's code.
  - **Before W1 dispatches:** check whether `admin-frontend/vitest.config.ts` exists. If absent, ask the human whether to merge/rebase `main` up to `2cfa460` into `post-trade-allocation-integration` first (recommended — the config is small and already authored), or, failing that, scope this session's §8 verification to manual browser checks (per the `verify` skill) and drop the automated `vitest` gate until the config lands. Do not fabricate a passing/failing vitest result against an unconfigured harness.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 confirms no same-wave file collisions exist for this layer.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 011. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (`FE-1`, `FE-4`) → W2 (`FE-2`, `FE-5`) → W3 (`FE-3`) → W4 (`FE-6`) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature. W1 and W2 are true parallel dispatches — no in-wave serialization needed (schedule §7: map is empty).
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After `FE-6`'s wave gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node 24 (repo-wide) |
| Env activation | none — plain `npm` in `admin-frontend/` |
| Package manager | npm (`admin-frontend/package-lock.json`) |
| Migration tool | n/a (frontend layer) |
| DB URL env var | n/a (frontend layer) |
| Shell | PowerShell primary; Bash tool also available (Git Bash / POSIX sh) |
| OS | Windows 11 |
| Toolchain config caveat | `admin-frontend/vitest.config.ts` missing on this branch as of session start — see §2 precondition before trusting an automated test gate |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`post-trade-allocation-integration`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `page → hooks/api/* → app/**/actions.ts ("use server") → server/<area>/index.ts → server/api-client.ts → server/endpoints.ts`. A component may not call `server/*` directly — it goes through a hook.
- **Return/error envelope:** `server/mobo/index.ts` functions return `APIResult<DTO>` via the shared `apiClient` (cookie→Bearer already wired app-wide) — same shape as `server/pc`.
- **Precision & types:** money crosses the wire as JSON numbers in major units (already the DTO shape per proposal §4.1) — the seam mapper (`lib/mobo/allocation.ts`) does formatting only via `ptaMoney()`, never math (no client-side pro-rata).
- **Naming:** `camelCase` for TS identifiers; DTO field is `allocated`, not `delegated` (D-7) — this is a breaking rename across `lib/mobo/types.ts` and its two component read sites, landed in one commit (FE-4/FE-5 boundary), never mid-rename.
- **Additive & backward-compatible first:** the type rename is the one non-additive step in this layer; it is scoped to `FE-4` (type + mapper) and `FE-5` (the two read sites) landing as adjacent, sequential commits — the branch never sits with a half-renamed field.
- **No design/layout change** (proposal constraint): no component's rendered DOM structure, styling, or visual behavior may change beyond the field rename and the new data sources (`/runs` for `DateControl`, the hook for the page). If a unit's contract seems to require a visual change, **stop and report** — do not silently diverge.
- **Frozen seam:** the cross-layer contract in proposal §4 (verbatim in impl doc §7) is fixed — exact DTO field names, route paths, money-as-number-in-major-units. This layer never imports or runs backend code; it fakes the seam in its own tests.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Never introduce client-side pro-rata math.** `lib/mobo/allocation.ts` is a pure mapper after this layer lands — if a unit's implementation recomputes `allocated`/`pct`/`unitsTotal` from `traded`/`units` instead of reading them off the DTO, that is a regression to the pre-011 behavior — stop and report.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — schedule §7 confirms no same-wave file collisions in this layer. Across waves, always wait for the previous wave's commits + gate before dispatching.

**Test harness note:** impl doc §8.3 states test *goals* in prose; no `test-gen` run and no `tests` entry exists yet in the pipeline state file for this layer. Before dispatching W1, invoke the `test-gen` skill on `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` at level **standard** (impl doc §8.4's chosen level, or `standard` if unspecified) so each unit's sub-agent has concrete Vitest files to make pass. If `test-gen` is not invoked first — or if the `vitest.config.ts` toolchain gap from §2 is unresolved — each sub-agent must translate its unit's §8.3 goal into a concrete test itself (or, if the harness genuinely cannot run, fall back to the `verify` skill's manual-browser-check flow) before considering the unit done; note explicitly in the brief which path applies so the sub-agent doesn't silently skip verification.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 011.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + package manager: Node 24, npm, no env activation needed
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- Toolchain caveat: admin-frontend/vitest.config.ts may be missing on this branch (see
  prompt §2) — if `npx vitest run` fails to resolve imports/DOM env, that is a harness
  gap, not necessarily your bug; fall back to the verify skill's manual check and report
  the gap, do not fabricate a pass.

TEST HARNESS:
- If test-gen has already been run for this layer, concrete Vitest files exist —
  make YOUR unit's test(s) pass without editing the test file. A red test is either
  a real bug in your implementation or a wrong §8.3 goal — if you believe it's the
  latter, STOP and report; do not rewrite the test yourself.
- If test-gen has NOT been run, translate your unit's §8.3 test goal(s) into a
  concrete Vitest test yourself before running the gate (or fall back per the
  toolchain caveat above if the harness itself is unusable).

INVARIANTS (hold at every step):
- Layering: page -> hooks/api/* -> app/**/actions.ts ("use server") -> server/<area>/index.ts -> server/api-client.ts -> server/endpoints.ts.
- Money crosses the wire as JSON numbers in major units; no client-side pro-rata math anywhere.
- DTO field is "allocated", not "delegated" (D-7) — the rename must not leave the branch mid-rename.
- No design/layout change beyond the field rename and the new /runs data source for DateControl.
- Frozen seam (proposal §4 / impl doc §7) is fixed — if your unit's contract conflicts with it, STOP and report.

TASK:
- Feature ID: <e.g. FE-4>
- Spec: read `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` §6 <FE-4>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-4>.
4. Make/write the unit test(s) for <FE-4> per the TEST HARNESS note above.
5. Run the layer's CI gate command (`npm run lint && npx tsc --noEmit && npx vitest run
   && npm run build`, or the manual-verify fallback per the toolchain caveat). If red,
   fix and re-run. Do not commit red (unless the red is the known harness gap — then
   report it explicitly, don't paper over it).
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/, client-frontend/).
- Any change to a component's rendered DOM structure/styling beyond the field rename
  and the documented new data sources.
- Reading the schedule doc or other unit specs — you own exactly <FE-4>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after `FE-6`'s wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2); check vitest.config.ts presence

for wave in [W1(FE-1,FE-4), W2(FE-2,FE-5), W3(FE-3), W4(FE-6), W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>  # all parallel, no serialization needed
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (`FE-1`…`FE-6`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed (or the toolchain gap was explicitly reported and the human accepted the manual-verify fallback).
- [ ] W-final validation agent: PASS, including the "zero `.delegated` references" and "no client-side pro-rata math" checks.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
