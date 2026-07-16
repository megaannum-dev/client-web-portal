# 012 — Trade Reconciliation · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/012-trade-recon-integration-fe.md` (waves) over `docs/implementations/012-trade-recon-integration-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `trade-reconciliation-integration-fe` — cut from `trade-reconciliation-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/012-trade-recon-integration-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/012-trade-recon-integration-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, `PARENT_BRANCH=trade-reconciliation-integration` (recorded in the impl doc's front matter — do not guess).
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule doc §7 confirms zero same-file collisions across all waves for this layer.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 012. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Check whether `test-gen` needs to run first (see §7.0 below) and invoke it if so.
3. Walk the schedule's wave graph (schedule §4: W1…W5, then W-final).
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7.1 of this prompt. Each sub-agent implements exactly one feature.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. Between W4 and W5: hold for the human verification gate (see §6 below) before dispatching W5. **Do not dispatch FE-6 (mock deletion) without explicit human confirmation.**
7. Advance to the next wave.
8. After W5 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
9. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` (has `package.json`, `vitest.config.ts`, `vitest.setup.ts`) |
| Runtime | Node (observed `v24.11.0` in this environment; no `.nvmrc`/`engines` pin found in `package.json` — observed, not pinned) |
| Env activation | none needed (no Python-style venv for a Node project) — just run from `admin-frontend/` |
| Package manager | npm (confirmed via `admin-frontend/package-lock.json` — not pnpm/yarn; no `pnpm-lock.yaml` found) |
| CI gate command | `cd admin-frontend; npx vitest run && npx tsc --noEmit && npx next lint` (confirmed: `package.json` has `"test": "vitest run"`, `"lint": "next lint"`, `"build": "next build"` scripts; `vitest.config.ts`/`vitest.setup.ts` exist — real, already-configured gate) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (= `trade-reconciliation-integration` if starting fresh on the layer branch) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction** (impl doc §3.1, §1 diagram): `page.tsx (client) → hooks/api/use<Feature>.ts (client hook: cache, loading, error, refetch) → app/(roles)/mobo/<feature>/actions.ts ("use server" wrapper: try/catch, logging) → server/mobo/index.ts (server-only: apiClient<T> + ENDPOINTS) → server/api-client.ts (apiClient<T>: cookie-based Bearer token, no-store fetch, APIResult<T> envelope)`. May only import from the layer below.
- **Server-only fetch functions** live in `server/<domain>/index.ts`, marked `"use server"`, importing `apiClient`/`ENDPOINTS` only — never called directly from a client component.
- **Actions convention:** `app/(roles)/mobo/<feature>/actions.ts` is the `"use server"` boundary a client hook calls; wraps the server function in try/catch + `logger.log`/`logger.json`, converting thrown errors to the `APIResult` failure shape via a local `toErrorResult`.
- **Hooks convention:** `hooks/api/use<Feature>.ts` own `data`/`loading`/`error`/`refetch` state, a module-scoped cache keyed by the request's discriminating param, and refetch-on-window-refocus (per sibling `usePostTradeAllocation`, minus extras this feature doesn't need — see impl doc FE-3).
- **Mappers** (`lib/mobo/<feature>.ts`) are pure DTO→View functions with zero fetch logic.
- **No design/layout changes** — `Cards.tsx`/`Detail.tsx`/`page.tsx`'s JSX structure is out of scope; only data-sourcing code changes.
- **Naming:** camelCase for FE; layer suffix (`-fe`) in the branch name, not filenames.
- **Additive & backward-compatible first** (impl doc §3.2): FE-1 through FE-4 land as new files/functions alongside the still-working mock; FE-5 (cutover) and FE-6 (mock deletion) land last, so the branch stays deployable at every commit.
- **Frozen seam:** the cross-layer contract in proposal §4 (re-pinned verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

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
- **Tests live in `admin-frontend/tests/`**, mirroring the source path, never co-located next to source.
- **Tests are NEVER committed.** `admin-frontend/tests/` is git-ignored (per `admin-frontend/.gitignore`'s `tests/` entry) — feature agents write and run tests but never stage or commit them.
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing, in the orchestrator or any sub-agent. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.
- **Human gate before W5 (mock deletion) — additional guardrail specific to this layer:** after W4 (`FE-5`, the page cutover) commits and its wave gate is green, the orchestrator MUST STOP and explicitly ask the human to confirm that the FE-5 page renders against a live seeded Backend endpoint with the same visual as today's mock (schedule doc §6 human gate; impl doc §9 / proposal's Execution & verification §3(c)). Do **not** dispatch `FE-6` (deleting `admin-frontend/lib/mock/mobo-flow-data.ts`) until the human has given that explicit confirmation in chat. This is the one human checkpoint in an otherwise fully automated run — treat it as a hard blocking gate, not a suggestion.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (schedule doc §7 confirms zero same-file collisions in every wave of this layer — no serialization needed). Across waves, always wait for the previous wave's commits + gate before dispatching. Wave W4→W5 additionally waits for the human gate in §6 above.

### 7.0 Test generation (before fan-out)

Check `.claude/plugin-state/docgen-012-trade-recon-integration.json` — as of this prompt's authoring, it records no `tests` key for this layer, meaning `test-gen` has not yet run. Before dispatching W1:

1. Re-check the state file yourself at session start (it may have changed since).
2. If test scaffolding is not yet present, invoke the `test-gen` skill at the `standard` level (confirm this is the chosen level by reading impl doc §8.4 yourself) against `docs/implementations/012-trade-recon-integration-fe.md`.
3. Only then proceed to dispatch W1.

**Fan-out order overall:** (1) test-gen if needed → (2) dispatch feature agents wave by wave, each told to make its unit's tests pass without editing test files (a red test is either a real bug in the implementation or a wrong §8.3 goal — STOP and flag either way, do not silently rewrite the test to pass) → (3) W-final validation + test agents per schedule §8.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 012.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + env activation: Node (observed v24.11.0, not pinned); no env activation needed
- Package manager: npm
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: page.tsx → hooks/api/use<Feature>.ts → app/(roles)/mobo/<feature>/actions.ts → server/mobo/index.ts → server/api-client.ts. Only import from the layer below.
- Server-only fetch functions live in server/<domain>/index.ts, "use server", apiClient/ENDPOINTS only.
- actions.ts wraps the server call in try/catch + logger.log/logger.json, converts thrown errors via a local toErrorResult.
- hooks/api/use<Feature>.ts own data/loading/error/refetch + module-scoped cache + refetch-on-refocus (unless the unit's spec says otherwise).
- Mappers are pure DTO→View, zero fetch logic.
- No design/layout changes — Cards.tsx/Detail.tsx/page.tsx JSX is out of scope; only data-sourcing code changes.
- Additive first: do not remove the mock or old call sites unless your unit is explicitly the cutover/deletion unit.
- Frozen seam (proposal §4 / impl doc §7) is fixed — if your unit's contract seems to conflict with it, STOP and report; do not silently diverge.

TASK:
- Feature ID: <e.g. FE-3>
- Spec: read `docs/implementations/012-trade-recon-integration-fe.md` §6 <FE-3>. That section is
  the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-3>.
4. Confirm/run the unit test(s) for <FE-3> from impl doc §8 in `admin-frontend/tests/`
   (mirror the source path; never co-locate next to source). If test-gen already wrote them,
   do not edit the test files — make the implementation satisfy them. A red test is either
   a real bug or a wrong §8.3 goal; STOP and flag, don't silently rewrite the test.
5. Run the layer's CI gate command: cd admin-frontend; npx vitest run && npx tsc --noEmit && npx next lint.
   If red, fix the implementation and re-run. Do not commit red.
   FRONTEND ONLY: do NOT start a preview/dev server (no preview_start, no npm run dev) —
   the vitest run + gate is the verification.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — admin-frontend/tests/ is git-ignored;
   tests stay local.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/, db migrations, etc.).
- Starting a preview/dev server.
- Reading the schedule doc or other unit specs — you own exactly <FE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W5's gate is green (and only after the human gate in §6 was satisfied before W5). Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants). Neither W-final agent starts a preview server either.

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
run test-gen (standard) if not already done (§7.0)

for wave in [W1, W2, W3, W4, W5, W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
    if wave == W4:
        STOP and ask the human to confirm FE-5 renders correctly against a live
        seeded Backend endpoint (schedule §6 human gate) — do NOT dispatch W5
        (FE-6, mock deletion) until the human explicitly confirms in chat
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` has run for this layer (or was already present).
- [ ] Every unit FE-1 through FE-6 in impl doc §6 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] The human verification gate between W4 and W5 was explicitly confirmed before FE-6 was dispatched.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or started a preview/dev server.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
