# 014 — `Client Onboarding Follow-Up Fixes` · Prompt — `Frontend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md` (waves) over `docs/implementations/014-onboarding-follow-up-fixes-fe.md` (units FE-1..FE-6).
> Layer: `Frontend` — **one layer per prompt.** Paste into a **fresh** Claude Code session. No prior conversation is assumed.
> Branch: `onboarding-subsystem-fixing` — **override, no `-fe` branch is cut.** This is a fix/patch pass on an already-in-progress branch, not a fresh feature build; see §2.
> Worktrees: **none.** All work happens in the main working tree, on the branch already checked out.

<!--
OVERRIDE NOTICE — read before following §2/§6 below:
This proposal's impl doc and schedule doc both state explicitly: there is NO
per-layer branch to cut and NO worktree to open. The orchestrator works
directly on `onboarding-subsystem-fixing`, which is ALREADY checked out.
Do not run `git worktree add`. Do not create or switch to any `-fe` branch.
Non-collision with the sibling Backend dispatch comes from disjoint
directories (admin-frontend/ here, api-backend/ there), not from git isolation.
-->

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/014-onboarding-follow-up-fixes-fe.md` | *what* to build (unit IDs FE-1..FE-6 + contracts) |
| Execution schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` | *why* + frozen cross-layer seam (§4) |
| This prompt | `docs/prompts/014-onboarding-follow-up-fixes-fe.md` | *who* runs it + *how* to drive the session |
| Sibling layer prompt | `docs/prompts/014-onboarding-follow-up-fixes-be.md` | Backend's dispatch — see the cross-layer note in §2 before relying on real backend behavior |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body (§6 of the impl doc) up front — pull each unit's contract lazily, right before dispatching its sub-agent.

---

## 2. Branch & session contract (OVERRIDDEN — no layer branch, no worktree)

- **Layer:** `Frontend`.
- **First action (mandatory):** confirm you are already on the correct branch — do **not** cut a new one.
  ```bash
  git rev-parse --abbrev-ref HEAD   # must print: onboarding-subsystem-fixing
  ```
  If it prints anything else, **stop and report** — do not `git checkout -b` a new branch and do not proceed.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `onboarding-subsystem-fixing`.
  - No other prompt session (this one or the sibling Backend dispatch) is actively dispatching a wave at this exact moment — the two layers touch disjoint directories (`admin-frontend/**` here, `api-backend/**` for Backend), so true interleaving is safe; this check is only against a genuinely concurrent double-dispatch of *this same* prompt.
- **No worktrees.** Do not run `git worktree add`.
- **No push, no merge.** The human owns the merge to `main`. Stop at "PR opened."

**Cross-layer note — read before dispatching W2/W3 (stated in schedule doc §2, repeated here since it directly affects how you verify this layer's units):** `FE-3`'s "Done when" needs `BE-2`/`BE-3` live; `FE-4` needs `BE-6`/`BE-7`; `FE-5` needs `BE-8`; `FE-6` needs `BE-9` — **specifically `BE-9`'s widened form, with the `ClientSubscriptionRowDTO.amount` field**. This is a **browser-verification** dependency, not a commit dependency — every unit's code can be written and committed against the frozen §7 seam regardless of whether the Backend layer has landed yet. But before you (the orchestrator) attempt any browser-based "Done when" check for `FE-3`/`FE-4`/`FE-5`/`FE-6`, **check whether the Backend prompt's dispatch (`docs/prompts/014-onboarding-follow-up-fixes-be.md`) has already run** — e.g. `git log --oneline --grep="(BE-"` on `onboarding-subsystem-fixing` to see if `BE-2/3/6/7/8/9` already have commits. If the Backend layer hasn't run yet:
- Do **not** block this layer's *commits* on it — proceed through W1/W2/W3 and commit every unit's code regardless.
- Do **defer** the affected units' browser-verification checks to W-final, and note in your final report which checks were deferred and why (so the human knows to re-run them once Backend lands, if it hasn't by the time this session ends).
- If you have the ability to dispatch the Backend prompt yourself first (i.e. the human has asked you to run both layers), recommend doing so before this layer's W2, since `FE-2`'s wave lands right before the units that need Backend the most.

---

## 3. Role

You are the **orchestrator** for the `Frontend` layer of proposal 014. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule doc §4) — three waves: **W1** `{FE-1, FE-4, FE-6}` (parallel, file-disjoint) → **W2** `{FE-2, FE-5}` (parallel, file-disjoint) → **W3** `{FE-3}` (alone, depends on FE-2's `status` field).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After W3 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8 — including any browser-verification checks deferred per §2's cross-layer note.
7. Open a PR against `main`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees. You do **not** start a dev/preview server at any point (see §6).

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node v24 |
| Env activation | none needed — `npm install` should already be satisfied on this branch; if `node_modules/` is missing, run `npm install` from `admin-frontend/` first |
| Package manager | `npm` (`package.json`, no `pnpm`/`yarn` lockfile in this dir) |
| Migration tool | n/a — Frontend layer |
| DB URL env var | n/a — Frontend layer |
| Shell | PowerShell primary; Bash also available (Git Bash) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `main` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Data flow:** `page.tsx` → hook (`hooks/api/use*.ts`) → server action (`app/(roles)/.../actions.ts`) → `lib/rm/api-client.ts` → backend route. No component calls `fetch` directly.
- **View-model mapping:** DTOs are mapped to page-specific view types in a `lib/*` mapper file (`lib/onboarding/mappers.ts`, or the new `lib/rm/subscriptions.ts` for FE-6) — components never destructure a raw DTO field name that diverges from its view-model name.
- **State sharing between sibling components:** lift to the nearest common parent, pass down as props — no ad-hoc global store/context introduced for this proposal (FE-1 is this pattern's one application in this layer).
- **`null`-safety:** any newly-widened DTO field that can be `null` renders as `"—"`, matching every existing field on the same page.
- **Additive & backward-compatible first** (impl doc §3.2): FE-1's prop-lifting is the only structural reshape in this layer; keep it isolated to its own commit.
- **Frozen seam (proposal §4.1 / impl doc §7)** is fixed. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge. `FE-6` in particular must consume `ClientSubscriptionRowDTO.amount` — if that field is missing from the live backend response when you go to browser-verify, that's a signal the Backend layer's `BE-9` hasn't landed yet (see §2's cross-layer note), not a reason to add a client-side fallback computation.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `main`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No new branch.** Do not `git checkout -b` anything. Work happens directly on `onboarding-subsystem-fixing`.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. Report and wait for the human.
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/`. If a unit seems to require a change under `api-backend/`, the impl doc is wrong — stop and report.
- **Tests live in `admin-frontend/tests/`.** Mirror the source path, never co-located next to source.
- **Tests are NEVER committed.** `tests/` is git-ignored; sub-agents write and run tests but never stage or commit them.
- **No preview/dev server, ever, in this session.** Do NOT run `npm run dev`, do NOT call `preview_start`, do NOT open a browser tab against a local dev server — not the orchestrator, not any sub-agent. Verification for this layer is `npx vitest run` + `npx tsc --noEmit` + `npm run lint`; the "Done when" browser-behavior descriptions in the impl doc describe what a human (or a later, separate verification pass) would observe running the app — they are not something this session executes by launching the app itself.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — schedule doc §7 confirms every wave in this layer is file-disjoint, so no in-wave serialization is needed anywhere. Across waves, always wait for the previous wave's commits + gate before dispatching the next.

**Test-gen note:** impl doc §8.4 states the chosen level is **`standard`**, bumped to **`thorough`** for `FE-5` (the money-math floor check mirroring a backend validation) and `FE-3` (the most state-combinations-per-unit finding in this layer). Before dispatching W1, invoke the `test-gen` skill against `docs/implementations/014-onboarding-follow-up-fixes-fe.md` at level `standard` (escalating FE-3/FE-5 to `thorough` per impl doc §8.4). This generates test files into `admin-frontend/tests/` **before** fan-out; sub-agents then make the already-generated tests for their unit pass, rather than writing tests from scratch.

### 7.1 Brief template (fill and send — one per unit)

```
You are a feature sub-agent for the Frontend layer of proposal 014.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime: Node v24 (npm install already run on this branch; run it yourself if
  node_modules/ is missing)
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: onboarding-subsystem-fixing (already checked out —
  do NOT create a branch, do NOT open a worktree)
- Merge target (DO NOT push, DO NOT switch to): main

INVARIANTS (hold at every step):
- Data flow: page.tsx -> hook -> server action -> api-client -> backend route. No
  component calls fetch directly.
- View-model mapping lives in a lib/* mapper file; components never destructure a
  raw DTO field name that diverges from its view-model name.
- Sibling-component state sharing is lifted to the nearest common parent, passed
  down as props — no new global store/context.
- null-safe rendering: any nullable field renders "—", matching the page's existing
  fallback convention.
- Frozen seam (proposal §4.1 / impl doc §7) is fixed — if this unit's contract
  seems to conflict with it, STOP and report; do not silently diverge.

TEST HARNESS:
- Tests for <Feature ID> were generated by test-gen (standard level, thorough for
  FE-3/FE-5) into admin-frontend/tests/ before you were dispatched — do not write
  tests from scratch; read what's there and make it pass. A red generated test
  means either a real bug or a wrong §8.3 goal — if you believe it's the latter,
  STOP and report; do not edit the test file to force it green.

TASK:
- Feature ID: <e.g. FE-3>
- Spec: read docs/implementations/014-onboarding-follow-up-fixes-fe.md §6 <FE-3>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
  - <path> — <create | modify>
- Dependencies (already committed on onboarding-subsystem-fixing): <list of unit
  IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches it.
3. Implement the contract from impl doc §6 <FE-3>.
4. Confirm/complete the tests already generated for this unit in admin-frontend/tests/
   — run them; if a goal from impl doc §8.3 <FE-3> has no matching generated test,
   flag it rather than silently skip it.
5. Run the layer's CI gate (from admin-frontend/): npx vitest run && npx tsc --noEmit && npm run lint
   If red, fix and re-run. Do not commit red.
   Do NOT start a preview/dev server at any point — see the operating rules.
6. Stage ONLY the source files listed above (no git add -A). Do NOT stage or commit
   test files — admin-frontend/tests/ is git-ignored, tests stay local.
7. Commit with a one-line message: "fix(fe): <one-line summary> (<FE-3>)".
8. Report back: commit SHA, files changed, test summary. Note explicitly whether
   this unit's "Done when" browser-behavior criteria could be confirmed (they
   generally cannot from this session, since no dev server is started here — say
   so plainly rather than claiming a browser check you didn't perform). Exit.

FORBIDDEN:
- git push, git worktree add, git checkout -b, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files under api-backend/.
- Starting a dev/preview server (npm run dev, preview_start, or otherwise).
- Reading the schedule doc or other unit specs — you own exactly <FE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W3's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above. The validation agent's checklist includes the browser-verification items deferred per §2's cross-layer note — if the Backend layer still hasn't landed the relevant `BE-*` units by W-final, the validation agent reports those specific checks as **"not verifiable — Backend unit BE-N not yet present"**, not as a pass or a fail; the orchestrator surfaces this distinction in its final report rather than collapsing it into either PASS or FAIL.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
confirm HEAD == onboarding-subsystem-fixing (§2) — do NOT cut a branch, do NOT open a worktree
check (advisory, not blocking) whether the sibling Backend prompt has already run —
    git log --oneline --grep="(BE-" — note the result for W-final's browser-verification step

for wave in [W1 {FE-1, FE-4, FE-6}, W2 {FE-2, FE-5}, W3 {FE-3}, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent (single message, multiple Agent calls)
    wait for ALL units in wave to commit (barrier)
    run wave gate (schedule §6) — if red: STOP, report to human, exit

open PR against main
report: units committed (FE-1..FE-6), gate summary, which browser-verification
    items were confirmed vs. deferred (per §2), PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit FE-1..FE-6 has a commit on `onboarding-subsystem-fixing`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS (with any Backend-dependent browser checks explicitly marked "not verifiable yet" rather than silently skipped, if the Backend layer hadn't landed by this point).
- [ ] W-final test agent: PASS.
- [ ] PR opened against `main`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, created a new branch, opened a worktree, or started a dev/preview server.
- [ ] Final report delivered: units committed, gate summaries, deferred-verification list (if any), PR URL.
