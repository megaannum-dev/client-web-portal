# 009 — Role-Based Page Access as a Single Config · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/009-role-based-page-access-config-fe.md` (waves) over `docs/implementations/009-role-based-page-access-config-fe.md` (units FE-1…FE-6).
> Layer: Frontend — single-layer proposal, no sibling prompts.
> Branch: `frontend-rolebased-architecture-redesign-fe` — cut from parent `frontend-rolebased-architecture-redesign`. Captured at session start.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/009-role-based-page-access-config-fe.md` | *what* to build (FE-1…FE-6 + contracts) |
| Execution schedule | `docs/execution-schedules/009-role-based-page-access-config-fe.md` | *what order* (W1 → W2 → W-final, gates, collision protocol) |
| Proposal | `docs/proposals/009-2026-07-07-role-based-page-access-config.md` | *why* + design decisions D-1…D-7 |
| This prompt | `docs/prompts/009-role-based-page-access-config-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 → schedule doc §1-4. Do **not** load FE-1…FE-6 feature bodies up front — pull each per dispatch. No §7 (frozen seam) — single-layer proposal.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  # Expected values for this run:
  #   PARENT_BRANCH = frontend-rolebased-architecture-redesign
  #   LAYER_BRANCH  = frontend-rolebased-architecture-redesign-fe
  ```
  If you're already on `${LAYER_BRANCH}`, record `PARENT_BRANCH` from the impl doc front matter — do not guess.
- **Confirm the branch state** before dispatching:
  - `git status` empty.
  - HEAD is `${LAYER_BRANCH}` (create it from `${PARENT_BRANCH}` if it doesn't yet exist).
  - No other prompt session dispatching on this branch.
- **No worktrees.** Every FE-* sub-agent shares this working tree. Schedule §7 confirmed zero shared-file collisions in W2 — no serialization needed.
- **No push, no merge.** Human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 009. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph: W1 (FE-1) → barrier → W2 (FE-2/3/4/5/6 parallel) → barrier → W-final.
3. For each unit in the current wave, spawn one sub-agent via the Agent tool using the brief template in §7. One feature per sub-agent.
4. Wait for the wave to commit; run the wave gate from schedule §6. Red = stop and report — no cross-wave patching.
5. Dispatch W-final validation + test agents in parallel per schedule §8.
6. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You do **not** edit source files yourself. You do **not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node (any recent LTS — `admin-frontend/package.json` sets no `engines`; `next@14.2.35` and `react@18` are the constraints) |
| Env activation | none (no venv; Node picks up from `$PATH`) |
| Package manager | `npm` (only `package-lock.json` present; no `pnpm-lock.yaml` / `yarn.lock`) |
| Migration tool | n/a (frontend only) |
| DB URL env var | n/a |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` = `frontend-rolebased-architecture-redesign` |
| Gate command (from schedule §6) | `cd admin-frontend && npm run lint && npm run build && npx tsx lib/pages.check.ts` |

`npx tsx` fetches `tsx` on demand — no `devDependencies` edit, no lock-file churn. The first sub-agent's run will populate the npx cache; later ones are fast.

---

## 5. Global invariants (inherited by every sub-agent)

Copied from impl doc §3.1:

- **Path alias:** `@/*` → repo-root of `admin-frontend/` (from `tsconfig.json`). New imports use `@/lib/...`, `@/hooks/...`, `@/components/...`.
- **File layout:** pure/no-React modules under `lib/`; React hooks under `hooks/`; presentational components under `components/`. FE-1 → `lib/`, FE-2 → `hooks/`. No exceptions.
- **String-literal unions, not enums.** Matches `Role` in `types/portal.ts` (proposal D-2).
- **Default-deny by construction (D-7).** Every registry lookup routes through `grantsFor(role)`. Unknown role → `{}`, never a fallback to another role. `ROLE_PAGES.ADMIN`'s all-pages set is reachable **only** via the literal `ADMIN` key.
- **No new dependencies.** Pure TS + existing React + existing `lucide-react`. No test framework added — self-check runs via `npx tsx` (impl doc §3.2).
- **`"use client"` only where needed.** `lib/pages.ts` stays server-safe (no React import); `hooks/usePageAccess.ts` is client (uses `useAuth`).
- **Additive & backward-compatible first.** FE-1 + FE-2 are pure additions (W1 + first half of W2). FE-3/4/5 swap call-sites; each commit builds green on its own.
- **Do not touch:** `types/portal.ts`, `components/auth/RoleGuard.tsx`, `components/sidebar/RoleGroup.tsx` — proposal D-4 invariant.

No cross-layer seam (single-layer proposal).

---

## 6. Operating rules (non-negotiable)

- **Human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Orchestrator and every sub-agent. `git push` is forbidden.
- **No worktrees.** `git worktree add` is forbidden.
- **No hook skipping.** `--no-verify`, `--no-gpg-sign` forbidden. If a pre-commit hook fails, sub-agent fixes the root cause and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`.** File lists are explicit, from the impl doc unit.
- **Do not read every FE-* feature up front.** Lazy-load per dispatch.
- **Red gate = stop.** No cross-wave patching, no invented units.
- **Never modify sibling directories.** This session is scoped to `admin-frontend/`. Do not touch `api-backend/`, `client-frontend/`, or the repo-root `docs/` tree beyond the four artifacts this run already produced.
- **Do not touch the three D-4 files** even if a naive read suggests it: `types/portal.ts`, `components/auth/RoleGuard.tsx`, `components/sidebar/RoleGroup.tsx`.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. W2 dispatches (FE-2/3/4/5/6) go in a **single message** with five parallel Agent tool calls — schedule §7 confirmed zero file overlap. W1 is a single unit (FE-1), no parallelism.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 009.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime: Node LTS (matches `next@14.2.35` / `react@18`); no venv, no env activation
- Package manager: npm
- Shell: PowerShell primary; Bash tool also available
- Branch you commit to: ${LAYER_BRANCH}   (= frontend-rolebased-architecture-redesign-fe)
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}   (= frontend-rolebased-architecture-redesign)

INVARIANTS (hold at every step):
- Path alias `@/*` → `admin-frontend/`. New imports use `@/lib/...`, `@/hooks/...`, `@/components/...`.
- `lib/` = pure, no React. `hooks/` = React hooks. `components/` = presentational. FE-1 → lib/, FE-2 → hooks/.
- String-literal unions, not enums (matches existing `Role` in types/portal.ts).
- Default-deny (proposal D-7): every registry lookup routes through `grantsFor(role)`; unknown role → {}. ADMIN's all-pages grant is reachable only via the literal "ADMIN" key.
- No new npm dependencies. Self-check runs via `npx tsx`.
- `"use client"` only where required. `lib/pages.ts` stays server-safe.
- Do NOT touch: types/portal.ts, components/auth/RoleGuard.tsx, components/sidebar/RoleGroup.tsx (proposal D-4).

TASK:
- Feature ID: <FE-N>
- Spec: read `docs/implementations/009-role-based-page-access-config-fe.md` §6 <FE-N>. That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (create/modify/delete as noted):
  - <path> — <create | modify>
  - ...
- Dependencies (already committed on ${LAYER_BRANCH}): <FE-1 | none>.

STEPS:
1. Read every file listed above (or its parent directory if creating).
2. Implement the contract from impl doc §6 <FE-N> exactly. Do not add tests to a separate framework; FE-1's `pages.check.ts` is the sole check (impl §8).
3. Run the gate from `admin-frontend/`:
     npm run lint && npm run build && npx tsx lib/pages.check.ts
   If red, fix and re-run. Do not commit red.
4. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
5. Commit with a one-line message:
     <type>(fe): <summary> (<FE-N>)
   Suggested types: `feat` for FE-1/FE-2/FE-6, `refactor` for FE-3/FE-4/FE-5.
6. Report back: commit SHA, files changed, whether `pages.check.ts: OK` printed. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in api-backend/ or client-frontend/.
- Editing types/portal.ts, components/auth/RoleGuard.tsx, or components/sidebar/RoleGroup.tsx (D-4 invariant).
- Reading the schedule doc, other unit specs, or the proposal — you own exactly <FE-N>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W2's gate is green. Use schedule §8.1 (validation checklist) and §8.2 (`cd admin-frontend && npm run lint && npm run build && npx tsx lib/pages.check.ts`) as the briefs verbatim, prefixed with the same CONTEXT + INVARIANTS blocks from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# W1
dispatch FE-1 sub-agent with §7.1 brief filled from impl doc §6 FE-1
wait for commit on ${LAYER_BRANCH}
run W1 gate (schedule §6) — if red: STOP, report, exit

# W2 — five parallel dispatches in ONE message
dispatch FE-2, FE-3, FE-4, FE-5, FE-6 sub-agents in parallel
wait until all five commits land on ${LAYER_BRANCH}
run W2 gate (schedule §6) — if red: STOP, report, exit

# W-final
dispatch validation agent (schedule §8.1) and test agent (schedule §8.2) in parallel
wait for both PASS reports — if either fails: STOP, report, exit

open PR against ${PARENT_BRANCH}
report: units committed (6 SHAs), gate summaries, PR URL
STOP
```

---

## 9. Definition of done

- [ ] FE-1…FE-6 each have a commit on `${LAYER_BRANCH}`.
- [ ] W1 gate green when crossed; W2 gate green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}` = `frontend-rolebased-architecture-redesign`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: 6 commit SHAs, gate summaries, PR URL.
