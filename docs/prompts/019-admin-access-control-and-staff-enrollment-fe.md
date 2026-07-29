# 019 — Admin Access Control & Staff Enrollment · Prompt — Frontend

> Status: **Ready to dispatch — conditional on a recorded fact (see §2).**
> Drives: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md` (waves) over `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed. This is the one layer that spans **two working directories**, `admin-frontend/` and `client-frontend/` — read §2 and §4 before dispatching anything.
> Branch: `<parent-branch>-fe` — see [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention. This prompt captures the actual parent branch at session start; the expected parent (as a sanity check only, not to be hardcoded) is `claude/admin-pages-backend-proposal-f0c9fc`.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` | *what* to build (unit IDs `FE-1`…`FE-17` + contracts) |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` | *why* + frozen cross-layer seam (§4) |
| This prompt | `docs/prompts/019-admin-access-control-and-staff-enrollment-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull `FE-*` unit bodies from impl doc §6 per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend — spans `admin-frontend/` and `client-frontend/`.
- **First action (mandatory):** capture the parent branch name.
  ```powershell
  $PARENT_BRANCH = git rev-parse --abbrev-ref HEAD
  $LAYER_BRANCH  = "$PARENT_BRANCH-fe"
  ```
  If already on `$LAYER_BRANCH`, capture `$PARENT_BRANCH` from the impl doc's front matter (expected: `claude/admin-pages-backend-proposal-f0c9fc`) — do not guess.
- **Confirm branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `$LAYER_BRANCH` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.

- **Entry precondition — on a recorded fact, not a sibling branch.** `FE-17` (the set-password landing form) is in scope **only if** the Backend layer's Q-5 test outcome, recorded in `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` §6, unit `BE-13`, says the `generate_sign_in_with_email_link` fallback was selected. This is a precondition on **information visible on disk**, not on the Backend layer's branch state, its merge status, or its session having run — the Backend impl doc file exists and is readable regardless of what branch is checked out or whether that layer has run at all.
  - Read that BE-13 slot **before dispatching Wave 1**.
  - If it says the fallback was selected → `FE-17` is in scope; Wave 1 dispatches three units.
  - If it says `generate_password_reset_link` succeeded (or otherwise records the reset-link outcome) → `FE-17` is dropped; Wave 1 dispatches two units; record the drop per schedule §2 / impl §9.
  - **If the BE-13 slot does not exist yet** (the Backend layer hasn't recorded an outcome) → **STOP before Wave 1.** Report to the human that this session cannot proceed: Wave 1's unit count depends on that recorded line, and guessing either drops a route a live link will reach or ships a page nothing reaches. Do **not** interpret this as "wait for the backend branch" — nothing about the backend branch or its merge state is being waited on, only its impl doc's recorded test result.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 019. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Resolve the `FE-17` precondition (§2) before Wave 1.
3. Invoke `test-gen thorough` on the Frontend impl doc (see §6, §8 step 0) before Wave 1.
4. Walk the schedule's wave graph (schedule §4).
5. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one `FE-*` feature, in whichever of `admin-frontend/` or `client-frontend/` its files live (some units, the register purge `FE-16` and conditionally `FE-17`, touch both).
6. Wait for the whole wave to commit; run the wave gate from schedule §6, reading the **per-barrier gate-expectation table** there rather than assuming a flat "always green" rule (see §6 below).
7. Advance to the next wave, respecting schedule §7's W5 sub-batch serialization.
8. After the last feature wave commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
9. Open a PR against `$PARENT_BRANCH`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, start a dev/preview server, or open worktrees.

**Mock-bounded verification.** This session has no live backend. Units `FE-7`, `FE-9`, `FE-10`, `FE-12`, `FE-15`, and `FE-17` (if in scope) are verifiable in this session only against the `vi.mock`-faked seam (impl §8.1). Do not report these as end-to-end verified — their live confirmation is the proposal's phase 5 cross-layer smoke test, which runs after this PR and is not a wave in this schedule. Report them as "passing against mocks" and stop there.

---

## 4. Environment facts (inherited by every sub-agent)

**This layer has two working directories, not one.** Every fact and every gate command below applies to **both** `admin-frontend/` and `client-frontend/` unless marked otherwise — run the command in whichever directory the current unit's files live in; for a unit touching both (the register purge, and `FE-16`/`FE-17`), run it in both.

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\.claude\worktrees\admin-pages-backend-proposal-f0c9fc` |
| Layer working dirs | **both** `admin-frontend/` and `client-frontend/` (repo-relative) |
| Runtime | Node.js — <TODO: fill from environment; neither directory has a `.nvmrc` nor an `"engines"` field in `package.json`, so the exact version is not pinned in-repo> |
| Package manager | npm in **both** directories — `admin-frontend/package-lock.json` and `client-frontend/package-lock.json` both present (no `pnpm-lock.yaml`, no `yarn.lock` in either) |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `$PARENT_BRANCH` |

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1 — do not paraphrase; do not restate any type or contract beyond these lines.

- **Data-access chain:** `client page/store → hooks/api/useX.ts or app/(roles)/<route>/actions.ts ("use server" logging wrapper) → server/<domain>/index.ts ("use server") → apiClient → ENDPOINTS`. `server/<domain>/index.ts` never imports a component or a hook; `actions.ts` adds only `logger` + `try/catch → {success:false, code:"ACTION_ERROR"}`; the hook/store owns `data`/`loading`/`error` and an `inFlight` ref.
- **Result envelope:** every server action returns `APIResult<T>` = `{success:true,data:T} | {success:false,error:string,code:string}`. Callers branch on `.success`; failures surface via `toast.error(result.error)`. No thrown errors cross the action boundary.
- **Wire DTOs are consumed verbatim (snake_case).** No camelCase view-model layer is introduced.
- **One access vocabulary:** `AccessLevel = "NONE" | "VIEW" | "EDIT"` — the only spelling anywhere in the frontend.
- **`page_id`, never `path`.** Every store key, staged change, override, catalog lookup and matrix cell is keyed by `PageId`.
- **Role code, never role index.**
- **Derived, not stored.**
- **At `VIEW`, mutating controls are hidden, not disabled (D-14).** A `VIEW` user never sees a `disabled` mutating control, only its absence. All 32 marker sites render `{canEdit && …}`. A container whose only children are gated controls is hidden with them.
- **No new component props for gating.** `useCanEdit(pageId)` reads context inside the component that owns the control.
- **No layout redesign.**
- **Additive & backward-compatible first** (impl §3.2): prefer additive changes; contraction/removal steps come last in the schedule.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed (reproduced verbatim in impl doc §7). If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `$PARENT_BRANCH`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load `FE-*` bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave — **except** the one sanctioned exception below. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/` and `client-frontend/` only — never `api-backend/` or a DB migration.
- **Tests live in each app's own `tests/` dir**, mirroring the source path: `admin-frontend/tests/**`, `client-frontend/tests/**`. Never co-located next to source.
- **Tests are NEVER committed.** Both `tests/` dirs are git-ignored already. Sub-agents write and run tests but never stage or commit them.
- **Frontend layer — no preview/dev server.** Do NOT run `npm run dev`, do NOT call any `preview_start`-style tool, at any point after implementing. Verification is the vitest run + typecheck/lint gate; a human runs the app in a browser separately, outside this session.
- **CI gate command, run in both directories for every barrier:** `npx vitest run` then `npx tsc --noEmit` then `npx next lint`, in `admin-frontend/` **and** `client-frontend/`; plus, from the repo root, `npx tsx admin-frontend/lib/pages.check.ts` (admin-frontend only — a plain `node:assert` script, not part of the vitest suite).
- **Gate expectation is per-wave, not flat.** Read schedule doc §6's per-barrier table before calling any barrier red. In particular: `admin-frontend/lib/pages.check.ts` is **known-red by design** after the W3 barrier (unit `FE-5` deletes symbols the script currently asserts on) until `FE-3` (W4) rewrites it. At the W3 barrier, an error confined to that one file is the expected, sanctioned exception — it does not halt the run. An error in **any other file** at any barrier is red and halts the run as normal. See schedule §6 for the exact per-barrier table; do not flatten it into "must always pass."
- **Test generation runs once, before Wave 1** (not per-unit): invoke the `test-gen` skill with argument `thorough` against the Frontend impl doc, before any feature wave dispatches. See §8 step 0 for why `thorough` was chosen and where the generated tests land.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls, except where schedule §7 requires in-wave serialization (W5's sub-batches S1…S5). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 019.

CONTEXT (do not re-derive):
- Layer working dirs: admin-frontend/ and client-frontend/ (repo root: C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\.claude\worktrees\admin-pages-backend-proposal-f0c9fc) — work in whichever this unit's files live in; some units touch both.
- Runtime: Node.js (npm; package-lock.json in each app)
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: $LAYER_BRANCH
- Merge target (DO NOT push, DO NOT switch to): $PARENT_BRANCH

INVARIANTS (hold at every step):
<paste the invariants from §5 verbatim>

TASK:
- Feature ID: <e.g. FE-8>
- Spec: read `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` §6 <FE-8>. That section is
  the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on $LAYER_BRANCH): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-8>.
4. Locate the tests already generated by `test-gen thorough` for <FE-8> under
   admin-frontend/tests/** or client-frontend/tests/** (mirroring source path — see §8
   step 0 of this prompt). Run them; do not write new test files for this unit.
5. Run the CI gate command for the app(s) this unit touches: `npx vitest run`, then
   `npx tsc --noEmit`, then `npx next lint` — plus, if in admin-frontend and past W3,
   `npx tsx admin-frontend/lib/pages.check.ts` from the repo root.
   If red, fix and re-run. Do not commit red — UNLESS this is the W3 barrier and the
   only red is confined to admin-frontend/lib/pages.check.ts itself (sanctioned per
   this prompt's §6 and schedule §6; FE-3 in W4 clears it).
   Do NOT start a preview/dev server at any point.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the tests/ dirs are git-ignored on every layer.
7. Commit with a one-line `<type>(<scope>): <summary> (FE-8)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in api-backend/ or any DB migration.
- Starting a dev/preview server.
- Reading the schedule doc or other unit specs — you own exactly <FE-8>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture $PARENT_BRANCH, $LAYER_BRANCH; verify branch state (§2)

STEP 0 — resolve preconditions before Wave 1:
  read docs/implementations/019-admin-access-control-and-staff-enrollment-be.md §6 BE-13
    - if the Q-5 outcome is not recorded there: STOP, report to human, exit
    - if fallback selected: FE-17 in scope, Wave 1 has 3 units
    - if reset link succeeded: FE-17 dropped, Wave 1 has 2 units; record the drop
  invoke test-gen skill, arg "thorough", against docs/implementations/019-…-fe.md
    (writes into admin-frontend/tests/** and client-frontend/tests/**, per impl §8.1)

for wave in schedule.waves + [W_final]:
    for unit in wave.units (respecting W5 sub-batch serialization, schedule §7):
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on $LAYER_BRANCH
    run wave gate (schedule §6) — read the per-barrier expectation table first;
        if red outside the sanctioned W3 pages.check.ts exception: STOP, report, exit
open PR against $PARENT_BRANCH
report: units committed, gate summary (noting any mock-bounded units per §3), PR URL
STOP
```

---

## 9. Definition of done

- [ ] The `FE-17` / Q-5 precondition resolved before Wave 1 (§2), and recorded either as "in scope" or "dropped."
- [ ] `test-gen thorough` invoked against the Frontend impl doc before Wave 1.
- [ ] Every unit in impl doc §6 (`FE-1`…`FE-16`, plus `FE-17` if in scope) has a commit on `$LAYER_BRANCH`.
- [ ] Every wave gate (schedule §6) was green when crossed, per its per-barrier expectation — including the sanctioned W3 `pages.check.ts` exception, confined to that one file and cleared by W4.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] Units `FE-7`, `FE-9`, `FE-10`, `FE-12`, `FE-15` (and `FE-17` if in scope) are reported as verified against mocks only — no claim of live-backend verification, which is deferred to the proposal's phase 5.
- [ ] PR opened against `$PARENT_BRANCH`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or started a dev/preview server.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
