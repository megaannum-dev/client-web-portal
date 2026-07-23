# 016 — Allotment & Redemption Integration · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/016-allotment-redemption-integration-fe.md` (waves) over `docs/implementations/016-allotment-redemption-integration-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-fe` — see `templates/implementation_details.md` §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/016-allotment-redemption-integration-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 3 — Frontend" | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/016-allotment-redemption-integration-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  Per the impl doc's front matter, `PARENT_BRANCH` is `allotment-redemption-integration` and `LAYER_BRANCH` is `allotment-redemption-integration-fe`. If already on `${LAYER_BRANCH}`, confirm `PARENT_BRANCH` from `git log`/`git branch` rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule §7 confirms every wave's units are file-disjoint except two documented cross-wave (not same-wave) overlaps — see §5 below.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."
- **Layer-independence precondition (read before doing anything else):** per impl doc §1/§2, this layer's dependency on "the Backend layer's 4 new routes" is a **contract precondition, not a runtime one**. This layer is built entirely against the frozen seam in impl doc §7 and does **not** need the Backend layer's code to exist, be merged, or even be started before this session runs. Only genuine end-to-end (cross-layer) testing — out of scope for this dispatch — needs the Backend routes live. **Do not stall waiting on the Backend or Database sibling branches; this schedule does not wait on them.**

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 016. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Invoke `test-gen standard` on the impl doc (see §8 step 0) **before** dispatching any feature-wave sub-agents — no `tests` entry exists yet for this layer in the plugin state file.
3. Walk the schedule's wave graph (§4 of the schedule).
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. Advance to the next wave.
7. After the last feature wave (FE-5) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

**This layer's wave shape** (schedule §4): W1 = `FE-1` alone. W2 = `FE-2` + `FE-4`, **true parallel** (schedule §7 confirms zero file overlap — dispatch both Agent calls in one message). W3 = `FE-3` alone. W4 = `FE-5` alone. W-final = validation + test, parallel. **Addendum 2026-07-23:** W5 = `FE-6` alone. W6 = `FE-7` alone. W-final-2 = validation + test, parallel.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node.js — no `engines` field found in `admin-frontend/package.json`; `<TODO: fill from environment>` for the exact pinned version |
| Env activation | none — no venv-equivalent for Node; just `cd admin-frontend` (or run commands with cwd set there) |
| Package manager | npm (`admin-frontend/package-lock.json` present; no `pnpm-lock.yaml`/`yarn.lock`) |
| Shell | PowerShell primary; Bash (Git Bash) also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (= `allotment-redemption-integration`) |

CI gate, verified against `admin-frontend/package.json` (`"test": "vitest run"`, `vitest ^4.1.10`, `@testing-library/react`/`jest-dom` present as devDependencies):
```powershell
# PowerShell
cd admin-frontend; npx vitest run ; npx tsc --noEmit ; npx next lint
```
```bash
# Bash
cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint
```

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1:

- **Layering:** `app/(roles)/rm/.../actions.ts` (`"use server"`) → `server/rm/index.ts` (`"use server"`, calls `apiClient`) → `server/api-client.ts` (raw fetch + auth). Client components (`"use client"`) call **only** the server actions in `actions.ts`, never `server/rm` or `apiClient` directly.
- **Error envelope:** every server action returns `APIResult<T> = { success: true; data: T } | { success: false; error: string; code: string }`. `actions.ts` wraps the `server/rm` call in `try/catch` and funnels any thrown error through the local `toErrorResult(error): { success: false; error; code: "ACTION_ERROR" }` helper — the underlying `apiClient` call already returns a typed failure branch for HTTP/network errors, so the `catch` only exists for unexpected throws.
- **Decimal-as-number:** per the existing convention in `lib/onboarding/types.ts`, `Decimal` fields cross the wire as JSON numbers (e.g. `mgmt_fee: 0.015`), not strings. New request DTOs (impl §6 FE-1) follow the same rule.
- **App Router:** page at `app/(roles)/rm/model-subscription/page.tsx`, a client component (`"use client"`) wrapped in `<Suspense>`; server actions live in the sibling `actions.ts` (route-scoped, not global).
- **POST convention (new — this layer establishes it for `server/rm`):** `apiClient<T>(path, { method: "POST", body: JSON.stringify(req) })`. No new helper needed — `apiClient` already sets `Content-Type: application/json` in `buildHeaders`.
- **Additive & backward-compatible first** (impl doc §3.2): FE-1's type widening is a strict superset of the existing union; FE-4's `TxnRow` widening appends a field rather than rewriting the tuple shape. No visual/layout change to `SubscriptionAccordion`/`SubscriptionFormModal` beyond what each unit's contract specifies.
- **Frozen seam:** the cross-layer contract in proposal §4 (reproduced in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Frontend layer only — no preview server, stated again because it is easy to skip:** after implementing, do **not** start a preview/dev server — no `preview_start`, no `npm run dev`, no browser check of any kind. Verification for this layer is the `vitest run` + `tsc --noEmit` + `next lint` gate only. Running the app in a browser is explicitly left to the human, not this session.

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
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `admin-frontend/tests/` (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored on every layer; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not branch artifacts).
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Test harness:** impl doc §8.2/§8.3 has coverage-matrix + test goals for FE-1 through FE-5, but `test-gen` has **not** yet been run for this layer (the plugin state file `docgen-016-allotment-redemption-integration.json` has an empty `prompts` array and no `tests` entry). **Before fan-out (step 0 of §8 below), invoke `test-gen standard` on `docs/implementations/016-allotment-redemption-integration-fe.md`** (impl §8.4 names `standard` as the chosen level for this layer) to generate concrete vitest files into `admin-frontend/tests/` from the §8.3 goals. Once generated, each feature sub-agent's job is to make its unit's tests pass — a red test is either a real bug in the unit or a wrong §8.3 goal; in the latter case, stop and flag it to the human rather than rewriting the test to match broken code.

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls. **W2 is the true-parallel wave** (`FE-2` + `FE-4`, confirmed file-disjoint by schedule §7) — both Agent calls must go in one message. Across waves, always wait for the previous wave's commits + gate before dispatching. Note schedule §7's two cross-wave (not same-wave) file overlaps: `SubscriptionAccordion.tsx` is touched by FE-4 (W2) and again by FE-3 (W3) for context plumbing only; `SubscriptionFormModal.tsx`/`page.tsx` are touched by FE-3 (W3) and again by FE-5 (W4). Each later unit's sub-agent must re-read those files fresh from the layer branch at wave start (post-barrier), not from a stale pre-wave snapshot.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 016.

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
- app/(roles)/rm/.../actions.ts ("use server") -> server/rm/index.ts
  ("use server", calls apiClient) -> server/api-client.ts (raw fetch + auth).
  Client components ("use client") call ONLY actions.ts, never server/rm or
  apiClient directly.
- APIResult<T> = { success: true; data: T } | { success: false; error: string;
  code: string }. actions.ts wraps the server/rm call in try/catch, funneling
  thrown errors through toErrorResult(error) -> { success:false; error;
  code:"ACTION_ERROR" }.
- Decimal-as-number: Decimal fields cross the wire as JSON numbers (e.g.
  mgmt_fee: 0.015), never strings. Applies to new request DTOs.
- App Router conventions already in use: page.tsx is "use client" wrapped in
  <Suspense>; server actions live in the sibling actions.ts (route-scoped).
- POST convention this layer establishes for server/rm: apiClient<T>(path,
  { method: "POST", body: JSON.stringify(req) }). No new helper needed —
  apiClient already sets Content-Type.
- Additive-first: type/tuple widenings are strict supersets/appends, not
  rewrites. No visual/layout change beyond what your unit's contract specifies.
- Frozen seam (proposal §4 / impl doc §7) is fixed. If your unit's contract
  seems to conflict with it, STOP and report — do not silently diverge.
- NO PREVIEW/DEV SERVER. Do not run npm run dev, do not call preview_start, do
  not open a browser. Verification is vitest run + tsc --noEmit + next lint only.

TASK:
- Feature ID: <e.g. FE-3>
- Spec: read `docs/implementations/016-allotment-redemption-integration-fe.md`
  §6 <FE-3>. That section is the CONTRACT — implement it as specified. Do not
  exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.
- If this unit re-touches a file a prior wave already edited (see schedule §7's
  cross-wave notes), re-read that file fresh from ${LAYER_BRANCH} first — do
  not edit from a stale pre-wave snapshot.

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
7. Commit with a one-line `fe(rm): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (api-backend/, migrations/).
- Starting a dev/preview server or opening a browser.
- Reading the schedule doc or other unit specs — you own exactly <FE-N>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green (i.e. after FE-5 commits). Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

step 0: invoke test-gen standard on
        docs/implementations/016-allotment-redemption-integration-fe.md
        (generates admin-frontend/tests/ from impl §8.3 goals) — do this
        BEFORE dispatching any feature-wave sub-agent below.

for wave in [W1(FE-1), W2(FE-2,FE-4), W3(FE-3), W4(FE-5), W_final,
             W5(FE-6), W6(FE-7), W_final_2]:
    dispatch every unit in wave in a single message (parallel Agent calls)
    # W2 is the true-parallel wave: FE-2 and FE-4 in one message, two Agent calls
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6: next lint, tsc --noEmit, vitest run)
      — if red: STOP, report to human, exit
open PR against PARENT_BRANCH (or update existing PR)
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` invoked on the impl doc before any feature-wave dispatch.
- [ ] Every unit in impl doc §6 (FE-1 through FE-7) has a commit on the working branch.
- [ ] Every wave gate (schedule §6: `npx next lint`, `npx tsc --noEmit`, `npx vitest run`) was green when crossed.
- [ ] W-final validation agent: PASS. W-final-2 validation agent: PASS.
- [ ] W-final test agent: PASS. W-final-2 test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or started a dev/preview server.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
