# 010 — RM Client Book: Live Search Against `client_profiles` · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/010-rm-client-search-backend-fe.md` (waves) over `docs/implementations/010-rm-client-search-backend-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `searchbar-client-book-fe` — cut from parent `searchbar-client-book`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/010-rm-client-search-backend-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/010-rm-client-search-backend-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/010-rm-client-search-backend-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, the parent is `searchbar-client-book` — confirmed from this prompt's front matter and the impl doc's branch contract (§2). Do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from `searchbar-client-book`).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule doc §7 confirms W1 (`FE-1`/`FE-2`/`FE-8`/`FE-9`) and W4 (`FE-5`/`FE-6`) are the only multi-unit waves, and both are file-disjoint — no in-wave serialization needed.
- **No push, no merge.** The human owns the merge back to `searchbar-client-book`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 010. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 → W2 → W3 → W4 → W5 → W6 → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. W1 dispatches 4 sub-agents in parallel (`FE-1`, `FE-2`, `FE-8`, `FE-9`); W4 dispatches 2 in parallel (`FE-5`, `FE-6`); every other wave is a single dispatch.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After `FE-10` commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

**Why `FE-9` dispatches first (W1), not last:** the proposal's own scope note is explicit that the route split (`/rm/client-detail/[id]` vs. `/rm/client-info/page.tsx`) gets fixed *before* any live-data wiring touches the detail page. The schedule encodes this as a dependency edge — `FE-6` and `FE-7` both depend on `FE-9` — rather than as a separate manual phase, so simply following the wave order already honours the sequencing. Do not reorder `FE-9` later "for convenience"; its early placement is load-bearing, not arbitrary.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node.js (Next.js 14.2.35, React 18) — no explicit engine pin in `package.json`; use the Node already on `PATH` |
| Env activation | none — no venv/virtualenv equivalent for this layer |
| Package manager | `npm` (`admin-frontend/package-lock.json` present; no pnpm/yarn lockfile) |
| Migration tool | n/a — this layer touches no database |
| DB URL env var | n/a for this layer (backend-only) |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (expected: `searchbar-client-book`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `server/api-client.ts` (shared, `import "server-only"`) → per-domain `"use server"` fetchers (`server/rm/index.ts`) → route-local `"use server"` actions (`app/(roles)/rm/**/actions.ts`) → client hooks (`hooks/api/*.ts`) → pages (`app/(roles)/rm/**/page.tsx`). A file may only import from a layer to its left in this chain.
- **DTO ↔ UI shape separation:** wire DTOs (`ClientListItemDTO`, `ClientListDTO` in `lib/rm/clients.ts`) match the backend contract verbatim (snake_case); UI shapes (`ClientRow`, camelCase) are what components consume. The mapper (`dtoToRow`/`dtoListToRows`) is the only place that translates between them.
- **Return/error envelope:** server fetchers/actions return `APIResult<T> = { success: true; data: T } | { success: false; error: string; code: string }` (from `server/api-client.ts`) — do not invent a different shape.
- **Module-scope caching, not a new dependency:** no React Query, SWR, or debounce library. Caching is a hand-rolled `Map` at module scope, matching `hooks/api/useAllocation.ts`.
- **Naming:** camelCase for UI-shape TS; snake_case only inside DTO type definitions that mirror the wire contract.
- **Additive & backward-compatible first:** new files are additive; the page-file edits (`client-info/page.tsx`, `client-info/[id]/page.tsx`) and `lib/mock/rm-data.ts` are edited in place but not restructured beyond what the impl doc specifies.
- **Frozen seam:** the cross-layer contract in proposal §4.1 is fixed (reproduced verbatim in impl doc §7). If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.
- **Role-based visibility is ADMIN-only, not COMPLIANCE.** The backend scopes `GET /api/rm/clients` by role (RM: own book; ADMIN: everything); COMPLIANCE gets a 403, unchanged from today. This layer does **not** add any COMPLIANCE-specific branching, copy, or UI.
- **The canonical detail route is `/rm/client-info/[id]`, never `/rm/client-detail/[id]`.** `FE-9` deletes the old route entirely. After `FE-9` lands, no file in this layer may reference `/rm/client-detail` in any string, import path, or comment describing current behavior — that path is intentionally a 404. Two nav call sites were fixed by `FE-9` (`client-info/page.tsx`'s `openClient`, `components/rm/OnboardingBoard.tsx`'s `openProfile`); do not reintroduce a third hardcoded reference elsewhere.
- **"ID Info" on the detail page is always a blank placeholder** (`FE-10`) — never wire it to `clientId`, a UUID, or any other value. **"Assigned RM"** on the detail page is the resolved display name only (`ClientRow.assignedRm`) — no RM phone/email field exists in the DTO; do not fabricate one.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report. In particular, never touch `api-backend/`.
- **No automated test runner exists for this layer** (impl doc §8.1) — wave gates 1-2 (lint, type-check) are the enforced automated gate; gate 3 is manual verification per impl doc §8.2, performed by the orchestrator or a dedicated sub-agent against a running preview (mocked `apiClient` responses are acceptable if the Backend layer's branch isn't available yet).

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls — W1 (`FE-1`, `FE-2`, `FE-8`, `FE-9`) and W4 (`FE-5`, `FE-6`) are the only waves with more than one unit, and schedule §7 confirms both are file-disjoint (no serialization needed). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 010.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + env activation: Node.js (Next.js 14.2.35), no venv/activation step
- Package manager: npm
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: server/api-client.ts -> server/rm/index.ts ("use server") ->
  app/(roles)/rm/**/actions.ts ("use server") -> hooks/api/*.ts -> page.tsx.
  Only import from a layer to your left in this chain.
- DTO (snake_case, matches wire contract) vs. ClientRow (camelCase, UI shape) —
  never let a raw DTO field name leak into a component; go through the mapper
  in lib/rm/clients.ts.
- Server calls return APIResult<T> = { success, data } | { success: false, error, code }.
- No new dependency (no React Query/SWR/debounce lib) — module-scope Map cache
  only, matching hooks/api/useAllocation.ts.
- Frozen seam (proposal §4.1 / impl doc §7) is fixed — if your unit's contract
  seems to conflict with it, STOP and report, do not silently diverge.
- Do not special-case AdminRole.COMPLIANCE anywhere — it is not part of this
  proposal's visibility grant; it will simply get an error/403 state like any
  other unauthorized caller, and this layer renders that generically.
- The canonical detail route is /rm/client-info/[id], NEVER /rm/client-detail/[id]
  — that route was deleted by FE-9. Do not write, link to, or reference the old
  path anywhere, including in comments describing current behavior.
- "ID Info" on the detail page is always a blank placeholder — never wire it to
  any data source. "Assigned RM" is the resolved name only (ClientRow.assignedRm)
  — no RM contact fields exist; do not invent one.

TASK:
- Feature ID: <e.g. FE-9>
- Spec: read `docs/implementations/010-rm-client-search-backend-fe.md` §6 <FE-9>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create, modify, or delete).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-9>.
4. This layer has no automated test runner (impl doc §8.1) — instead, perform
   the manual verification row(s) for <FE-9> from impl doc §8.2 against a
   running preview (`npm run dev` in admin-frontend/), mocking the backend
   fetch if the Backend layer's branch isn't available. Record pass/fail.
5. Run the layer's CI gate commands from admin-frontend/:
   npx tsc --noEmit -p tsconfig.json && npx next lint
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message,
   e.g. "refactor(rm): move client-detail route under client-info (FE-9)".
8. Report back: commit SHA, files changed, manual-verification result. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in api-backend/ or any other sibling-layer directory.
- Adding a new npm dependency (React Query, SWR, debounce library, etc.).
- Adding any AdminRole.COMPLIANCE-specific branching or copy.
- Writing, linking to, or referencing /rm/client-detail anywhere once FE-9
  has landed (check whether FE-9 is in "already committed" above).
- Wiring "ID Info" to any data source, or inventing an RM-contact field.
- Reading the schedule doc or other unit specs — you own exactly <FE-9>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after `FE-10`'s gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants). The test agent runs the full manual-verification matrix from impl doc §8.2 (`FE-1`..`FE-10`), not an automated suite (none exists for this layer). The validation agent's checklist explicitly includes confirming `app/(roles)/rm/client-detail/` no longer exists anywhere in the tree and `pages.check.ts` passes.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(FE-1,FE-2,FE-8,FE-9), W2(FE-3), W3(FE-4), W4(FE-5,FE-6), W5(FE-7), W6(FE-10), W_final]:
    for unit in wave.units:
        # W1 and W4 dispatch multiple units in one message, in parallel —
        # schedule §7 confirms no same-file collisions in either wave.
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit FE-1..FE-10 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] `FE-9` committed and gate-passed in W1, before `FE-6` (W4) and `FE-7` (W5) — confirm this ordering held, not just that all units eventually landed.
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` passes.
- [ ] W-final validation agent: PASS — including confirming `client-detail/` no longer exists, no COMPLIANCE-specific code was added, and no new dependency was introduced.
- [ ] W-final test agent: PASS (full manual-verification matrix from impl doc §8.2).
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
