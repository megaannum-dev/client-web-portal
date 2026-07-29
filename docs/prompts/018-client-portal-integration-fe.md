# 018 — Client Portal ↔ Backend Integration · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/018-client-portal-integration-fe.md` (waves) over `docs/implementations/018-client-portal-integration-fe.md` (units).
> Layer: `Frontend (client-frontend)` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `client-portal-integration-fe` — cut from parent `client-portal-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/018-client-portal-integration-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/018-client-portal-integration-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Frontend (client-frontend)`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, the parent is `client-portal-integration` (per impl doc §2 front matter) — do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from `client-portal-integration`).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to `client-portal-integration`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend (client-frontend) layer of proposal 018. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Invoke `test-gen standard` on the impl doc if it has not already been run this session (see §4 TEST HARNESS and §8 loop below) — **before** dispatching W1.
3. Walk the schedule's wave graph (§4 of the schedule).
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. Advance to the next wave.
7. After the last feature wave (W6 / `FE-14`) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `client-frontend/` |
| Runtime | Node.js — see `client-frontend/package.json` (no `engines` field pinning a version) |
| Env activation | none — no-op for FE |
| Package manager | npm (confirmed: `client-frontend/package-lock.json` present; no `pnpm-lock.yaml`/`yarn.lock`) |
| Migration tool | n/a — frontend layer |
| DB URL env var | n/a — frontend layer |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`client-portal-integration`) |

**Gate commands** (verified against `client-frontend/package.json` `scripts` — do not substitute other names):
```bash
npm run lint            # "lint": "next lint"
npx tsc --noEmit         # no dedicated script; project has no separate "type-check" script
npm run test             # "test": "vitest run" — backed by client-frontend/vitest.config.ts
npm run build            # "build": "next build"
```

---

## 5. Global invariants (inherited by every sub-agent)

- **Data-access layering:** `page.tsx → lib/hooks/useX.ts → lib/api/<module>.ts → fetch(getApiBase() + path, Bearer <token>)`. No page calls `fetch` directly. A page may call more than one hook; a hook never imports another hook.
- **Hook shape:** `useState` for `data`/`loading`/`error`, a `useEffect` that awaits `useAuth().getIdToken()`, calls one `lib/api/*` function, and sets state, with a `cancelled` flag to avoid a post-unmount `setState`. Every new hook in this layer follows this exact shape; none introduces a different one (no SWR/React Query — not an installed dependency).
- **API module shape:** one file per resource under `lib/api/`, each exporting typed `fetch*`/`patch*`/`submit*` functions built on the existing `authedGet<T>` helper in `lib/api/onboarding.ts` (or a POST/PATCH sibling of it) — same error-unwrapping (`detail` field), same `Bearer` header convention. New modules add a shared `authedPost`/`authedPatch`/`authedUpload` helper alongside `authedGet` rather than duplicating fetch/error-parsing logic per module.
- **DTO naming:** wire fields are consumed verbatim (snake_case) in `lib/api/*` DTO interfaces; a hook may map to a camelCase view-model only where an existing component already expects one — new work prefers binding to the DTO shape directly.
- **Money/formatting:** DTOs carry money as `number`; every render site formats with `Intl.NumberFormat` or the existing `mask()`/currency helpers. No arithmetic in a page beyond formatting — totals/changes/amounts are Backend-derived per impl doc §7.
- **`null` rendering:** any DTO field typed `T | null` renders the existing `"—"` placeholder — never a fabricated default.
- **i18n:** every new/changed label goes through `useTranslation()`'s `t()`; both `public/locales/en/translation.json` and `public/locales/zh-TW/translation.json` are edited together, never one alone.
- **Component structure:** no unit in this layer changes page composition, spacing, or component tree shape — only data bindings, column sets, and the specific dormant/removed cards the impl doc names.
- **Additive-first ordering:** each page adds its new hook/data binding in the same commit that removes the mock import it replaces; the mock *files* themselves are the one contraction step, scheduled last (`FE-14`).
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
- **Never modify sibling-layer files.** This session is scoped to `client-frontend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in `client-frontend/tests/`.** Every generated/written test goes under that dir (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed — any layer.** `client-frontend/tests/` is git-ignored; feature agents write and run tests but never stage or commit them. They stay local.
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7: `FE-4`→`FE-5` in W1, `FE-2`→`FE-3` in W2). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 TEST HARNESS (read before first dispatch)

- Impl doc §8 has test goals for every FE-* unit, but **`test-gen` has not yet been run for this layer** — no `tests` entry exists for it in the pipeline state file.
- **Before dispatching W1**, the orchestrator must invoke `test-gen standard` (level confirmed from execution schedule §9 checklist wording, "§8 unit tests all pass (standard depth)" — impl doc has no more specific §8.4 override, so `standard` applies) against `docs/implementations/018-client-portal-integration-fe.md`, writing generated vitest files into `client-frontend/tests/`.
- Once generated, list the resulting test file paths in each unit's brief and instruct the feature sub-agent to make its unit's tests pass **without editing the test files themselves** — a red test is either a real bug in the implementation or a wrong §8 goal; if the latter, the sub-agent stops and flags it rather than rewriting the test.
- If `test-gen` genuinely cannot produce a file for a given unit (e.g. a pure cleanup/delete unit with no new logic), the sub-agent falls back to writing its own minimal vitest file under `client-frontend/tests/` per impl doc §8, following the same rule of never committing it.

### 7.2 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend (client-frontend) layer of proposal 018.

CONTEXT (do not re-derive):
- Repo root: C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal
- Layer working dir: client-frontend/
- Runtime + env activation: Node.js — see client-frontend/package.json; no env activation needed
- Package manager: npm
- Shell: PowerShell primary; Bash tool also available
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- Tests for this layer are generated by test-gen standard into client-frontend/tests/
  (run once by the orchestrator before W1, if not already run). Locate the file(s)
  covering <Feature ID> under client-frontend/tests/ (mirrors the source path) and
  make them pass. Do NOT edit test files — a red test means either a real bug in
  your implementation or a wrong §8 goal; if you believe it's the latter, STOP and
  report instead of rewriting the test.
- If no generated test file exists for this unit, write a minimal vitest file
  yourself under client-frontend/tests/ per impl doc §8, following the same
  never-commit rule below.

INVARIANTS (hold at every step):
- Data-access layering: page.tsx → lib/hooks/useX.ts → lib/api/<module>.ts → fetch(getApiBase() + path, Bearer <token>). No page calls fetch directly. A hook never imports another hook.
- Hook shape: useState for data/loading/error, useEffect awaiting useAuth().getIdToken(), one lib/api/* call, cancelled flag to avoid post-unmount setState. No SWR/React Query.
- API module shape: one file per resource under lib/api/, typed fetch*/patch*/submit* functions on the existing authedGet<T> helper (or a POST/PATCH/upload sibling of it) in lib/api/onboarding.ts; same detail-unwrapping error convention, same Bearer header convention.
- DTO naming: wire fields consumed verbatim (snake_case) in lib/api/* DTO interfaces; map to camelCase view-model only where an existing component already expects one.
- Money/formatting: DTOs carry money as number; format with Intl.NumberFormat or existing mask()/currency helpers. No arithmetic beyond formatting — totals/changes/amounts are Backend-derived.
- null rendering: any DTO field typed T | null renders the existing "—" placeholder — never a fabricated default.
- i18n: every new/changed label goes through useTranslation()'s t(); edit public/locales/en/translation.json and public/locales/zh-TW/translation.json together, never one alone.
- Component structure: no unit changes page composition, spacing, or component tree shape — only data bindings, column sets, and the specific dormant/removed cards the impl doc names.
- Frozen seam: the cross-layer contract in proposal §4 / impl doc §7 is fixed. If your unit's contract seems to conflict with it, STOP and report — do not silently diverge.

TASK:
- Feature ID: <e.g. FE-1>
- Spec: read `docs/implementations/018-client-portal-integration-fe.md` §6 <FE-1>. That section is
  the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-1>.
4. Make the generated test(s) for <FE-1> in client-frontend/tests/ pass (or write a
   minimal one yourself per §8 if none was generated) — never co-locate next to source.
5. Run the layer's CI gate command (see §4 above):
   npm run lint && npx tsc --noEmit && npm run test && npm run build
   If red, fix and re-run. Do not commit red.
   FRONTEND ONLY: do NOT start a preview/dev server — the vitest run + gate is the verification.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — client-frontend/tests/ is git-ignored;
   tests stay local.
7. Commit with the message from impl doc §6 <FE-1> (or a one-line
   `fe(<scope>): <summary> (<FE-1>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (client-frontend only — no api-backend, no admin-frontend).
- Reading the schedule doc or other unit specs — you own exactly <FE-1>.
```

### 7.3 W-final agents (validation + test)

Dispatched once, in parallel, after `FE-14` (W6) commits and its gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT + TEST HARNESS blocks from §7.1/§7.2 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
if test-gen has not been run for this layer:
    invoke test-gen standard on docs/implementations/018-client-portal-integration-fe.md

for wave in [W1, W2, W3, W4, W5, W6, W_final]:
    for unit in wave.units:
        # Same-file collisions in this wave? Serialize per schedule §7
        # (FE-4 -> FE-5 in W1; FE-2 -> FE-3 in W2).
        dispatch sub-agent with §7.2 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` invoked against the impl doc before W1 dispatch.
- [ ] Every unit `FE-1`…`FE-14` has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] `FE-14` is the last unit committed on the branch (impl doc §9 / schedule §4 constraint).
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
