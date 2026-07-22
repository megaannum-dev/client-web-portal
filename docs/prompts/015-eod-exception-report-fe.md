# 015 — End-of-Day Exception Report · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/015-eod-exception-report-fe.md` (waves) over `docs/implementations/015-eod-exception-report-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-fe` — see `templates/implementation_details.md` §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/015-eod-exception-report-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/015-eod-exception-report-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as the branch this one was cut from (record it from the impl doc's front matter or ask the human — do not guess). The impl doc's front matter currently lists the parent as `<TODO: parent-branch>` — **confirm the real parent branch with the human before proceeding** if it is not obvious from `git log`/`git branch`.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization (this layer has none — every wave's units touch distinct files).
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 015. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

**Note on this layer's wave shape:** W1 = {FE-1, FE-4}, fully parallel. W2 = {FE-2} alone. W3 = {FE-3, FE-6}, fully parallel. W4 = {FE-5} alone. No same-file collisions anywhere in this layer.

**Important scope note (this layer only):** `admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` already exists on `main` (a prior UI-only pass ported it from the design handoff). FE-5 **modifies** this existing file — it does not create it. Its sub-agent's brief must say "modify," and the "no design/layout change" constraint (impl doc §3.1) applies: every helper component in that file (`VolumeTile`, `MonthProgress`, `Ref`, `Mismatch`, `LEG_META`, `LegBlock`, `LegRowView`, `AllClear`, `SignLine`, `buildL1`/`buildL2`/`buildL3`) must be byte-for-byte unchanged except the data-sourcing lines and the two button handlers.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node.js (version per repo's `.nvmrc`/CI config if present; no project-specific pin found — use the environment's default Node LTS) |
| Env activation | none — plain `npm` in `admin-frontend/` |
| Package manager | npm (`admin-frontend/package-lock.json` present; no `pnpm-lock.yaml`/`yarn.lock`) |
| Shell | PowerShell primary; Bash also available (Git Bash) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `page.tsx (client) → hooks/api/useEodReport.ts (client hook) → app/(roles)/mobo/daily-exception-report/actions.ts ("use server" boundary) → server/mobo/index.ts (server-only fetch) → server/api-client.ts (apiClient<T> / HTTP)`. Mirrors `useReconciliationFlow`'s stack exactly.
- **Return/error envelope:** bare `HTTPException`-sourced backend errors surfaced as `apiClient`'s `APIResult<T>` (`{ success: true, data } | { success: false, error, code }`); the export download instead uses the base64-proxy failure shape (`server/onboarding/index.ts`'s `downloadDocument` convention) — never a `{code, message, details?}` envelope.
- **Precision & types:** no new numeric formatting logic in this layer — `RcOrder`/`RcAlloc`/`RcPort` and their display strings (`fmtUsd`-formatted) are consumed as-is from `flow-types.ts`, unchanged.
- **Naming:** camelCase for all TS identifiers; server-only fetch functions live in `server/<domain>/index.ts` marked `"use server"`; actions live in `app/(roles)/mobo/<feature>/actions.ts`; hooks in `hooks/api/use<Feature>.ts`.
- **Additive & backward-compatible first:** FE-1/FE-2/FE-3/FE-4 land as new files/functions alongside the still-working mock-backed page; FE-5 (the actual cutover) lands last so the branch stays deployable at every commit.
- **No design/layout changes.** Every existing component in `page.tsx` is reused verbatim — only the data-sourcing lines and button `onClick`s change (see the scope note in §3 above).
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
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `admin-frontend/tests/` (mirroring the source path, e.g. `admin-frontend/tests/hooks/useEodReport.test.ts`), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored on every layer; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not branch artifacts).
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Test harness:** impl doc §8.3 has test goals for FE-1 through FE-6, but `test-gen` has **not** yet been run for this layer (the state file has no `tests` entry). **Before fan-out, invoke `test-gen standard` on `docs/implementations/015-eod-exception-report-fe.md`** (impl §8.4 names `standard` as the chosen level for this layer) to generate concrete vitest files into `admin-frontend/tests/` from the §8.3 goals. Once generated, each feature sub-agent's job is to make its unit's tests pass — a red test is either a real bug in the unit or a wrong §8.3 goal; in the latter case, stop and flag it to the human rather than rewriting the test to match broken code.

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (no same-file serialization needed anywhere in this layer — schedule §7's shared-file map is empty for every wave). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 015.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + env activation: Node.js, plain npm — no venv/activation step
- Shell: PowerShell primary; Bash (Git Bash) also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- Tests for this layer are generated by `test-gen standard` into
  admin-frontend/tests/, from impl doc §8.3 goals, BEFORE your dispatch. Make
  your unit's tests pass without editing the test file itself. If a test looks
  wrong, stop and report — do not rewrite it to match a bug.

INVARIANTS (hold at every step):
- page.tsx -> hooks/api/useEodReport.ts -> actions.ts ("use server") ->
  server/mobo/index.ts -> server/api-client.ts. Mirrors useReconciliationFlow.
- APIResult<T> = { success: true, data } | { success: false, error, code } for
  JSON calls; the base64-proxy shape for the binary export download.
- No new numeric formatting — reuse RcOrder/RcAlloc/RcPort and fmtUsd-formatted
  strings from flow-types.ts unchanged.
- camelCase TS identifiers; server-only fetch in server/<domain>/index.ts
  ("use server"); actions in app/(roles)/mobo/<feature>/actions.ts; hooks in
  hooks/api/use<Feature>.ts.
- Additive first — FE-1 through FE-4 land alongside the still-working
  mock-backed page; do not touch page.tsx until your unit specifically says so.
- NO DESIGN/LAYOUT CHANGES. If your unit is FE-5, every existing component in
  page.tsx (VolumeTile, MonthProgress, Ref, Mismatch, LEG_META, LegBlock,
  LegRowView, AllClear, SignLine, buildL1/buildL2/buildL3) must stay
  byte-for-byte unchanged except the data-sourcing lines and the two button
  handlers.
- Frozen seam (proposal §4 / impl doc §7) is fixed. If your unit's contract
  seems to conflict with it, STOP and report — do not silently diverge.

TASK:
- Feature ID: <e.g. FE-3>
- Spec: read `docs/implementations/015-eod-exception-report-fe.md` §6 <FE-3>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-N>.
4. Confirm/adjust the generated test(s) for <FE-N> already sitting in
   admin-frontend/tests/ (do not write new test code inline unless the TEST
   HARNESS block above says test-gen hasn't run yet).
5. Run the layer's CI gate command:
   cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint
   If red, fix and re-run. Do not commit red.
   Do NOT start a preview/dev server — the vitest run + gate is the verification.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the tests/ dir is git-ignored on every
   layer; tests stay local.
7. Commit with a one-line `fe(eod): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/), or
  admin-frontend/lib/mobo/reconciliation-flow.ts / reconciliation.ts (still
  used by trade-reconciliation / recon-overview — out of scope for this layer).
- Starting a dev/preview server.
- Reading the schedule doc or other unit specs — you own exactly <FE-N>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green (i.e. after FE-5 commits). Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(FE-1,FE-4), W2(FE-2), W3(FE-3,FE-6), W4(FE-5), W_final]:
    dispatch every unit in wave in a single message (parallel Agent calls)
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

**Before opening the PR**, surface the two human gates from schedule §6 to the human explicitly in your final report — they are not automatable in this session:
- Live Backend round-trip (visual parity + a real sign-off/export cycle) has not been verified by this session; flag it as outstanding.
- The print route's manual render check (valid `X-Eod-Render-Token`) has not been verified by this session; flag it as outstanding.

---

## 9. Definition of done

- [ ] Every unit in impl doc §6 (FE-1 through FE-6) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] The two human gates (§8 above) are reported as outstanding, not silently skipped.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree, and has **not** started a dev/preview server.
- [ ] Final report delivered: units committed, gate summaries, PR URL, outstanding human gates.
