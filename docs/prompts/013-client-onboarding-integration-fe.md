# 013 — Client Onboarding Integration · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/013-client-onboarding-integration-fe.md` (waves) over `docs/implementations/013-client-onboarding-integration-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `client-onboarding-integration-fe` — cut from `client-onboarding-integration`, merged back into it (human owns the merge). This prompt captures the actual parent branch at session start.
> Worktrees: **none by default.** Waves W1 (`FE-1, FE-6, FE-9`) and W2 (`FE-2, FE-7, FE-8`) run in the main working tree — no same-file collision exists in either wave. **Exception — Wave W3 only:** `FE-3, FE-4, FE-5` all append to the same file (`admin-frontend/lib/onboarding/mappers.ts`); this dispatch uses a **worktree override** (schedule §7) to run all three concurrently in isolated temporary worktrees instead of serializing. See §7.3 below for the exact mechanics. Outside Wave W3, `git worktree add` remains forbidden.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/013-client-onboarding-integration-fe.md` | *what* to build (unit IDs + contracts, FE-1..FE-9) |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-fe.md` | *what order* (waves, gates, the W3 worktree collision protocol) |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` | *why* + frozen cross-layer seam (§4) |
| This prompt | this file | *who* runs it + *how* to drive the session (incl. §7.3 worktree mechanics) |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 and §7 (wave graph + the W3 worktree override). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend. **This layer spans two apps:** `admin-frontend` (FE-1, FE-2, FE-3, FE-4, FE-5, FE-9) and `client-frontend` (FE-6, FE-7, FE-8). Every dispatch must state which app its unit belongs to.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `client-onboarding-integration` (recorded in the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Test harness check (before fan-out):** read `.claude/plugin-state/docgen-013-client-onboarding-integration.json`. If it has no `tests` entry (it does not, as of this writing), the impl doc's §8 has test *goals* but no generated test code yet. Before dispatching Wave W1, invoke the `test-gen` skill on the impl doc at the level named in impl doc §8.4 (`standard`). Because this layer spans two apps, `test-gen` may need to be invoked once per working dir (`admin-frontend`, `client-frontend`) if it operates per-directory — this is a judgment call for the orchestrator to make at invocation time, not a mechanism this prompt asserts.
- **Worktrees:** none, except Wave W3's three units (`FE-3, FE-4, FE-5`), which run concurrently in temporary worktrees per §7.3 — a one-wave override, not a standing policy for this layer. `git worktree add` outside Wave W3 is forbidden.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 013. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Run the test-harness check (§2) and invoke `test-gen standard` if needed, before the first dispatch.
3. Walk the schedule's wave graph (schedule §4): **W1 `{FE-1, FE-6, FE-9}` → W2 `{FE-2, FE-7, FE-8}` → W3 `{FE-3, FE-4, FE-5}` → W-final.**
4. For every unit in W1 and W2, spawn **one sub-agent** via the Agent tool in the main working tree, using the brief template in §7.1. For W3's three units, spawn each sub-agent inside its own temporary worktree per §7.3 — still one sub-agent per unit.
5. Wait for the whole wave to commit; run the wave gate from schedule §6 (both apps' gate for W1/W2, admin-frontend-only for W3). If red, stop and report — do not attempt cross-wave fixes.
6. Advance to the next wave. For W3 specifically, merge the three worktree commits onto `${LAYER_BRANCH}` in the fixed order **FE-4 → FE-5 → FE-3** (§7.3) before running the W3 gate.
7. After W3's gate is green, dispatch the two W-final agents (validation + test, one pass covering both apps) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push or merge. You **do** open worktrees, but only for Wave W3, and only per the mechanics in §7.3.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `admin-frontend/` (FE-1, FE-2, FE-3, FE-4, FE-5, FE-9) **and** `client-frontend/` (FE-6, FE-7, FE-8) — two separate Next.js apps in this one layer; every sub-agent brief states which app its unit belongs to |
| Runtime | Node.js (version not pinned in either `package.json`; a sub-agent may check `node --version` if it matters, but should not need to) |
| Env activation | None needed (no venv) — `npm`/`npx` run directly |
| Package manager | npm (both apps invoke `npx` in scripts; no `pnpm-lock.yaml`/`yarn.lock` detected — assume npm) |
| Migration tool | N/A — not this layer's concern |
| DB URL env var | N/A — not this layer's concern |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 Pro |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Two apps, two conventions — both followed as-is, not unified.** admin-frontend: `page.tsx (client) → hooks/api/use<Feature>.ts (client hook) → app/(roles)/<role>/<feature>/actions.ts ("use server") → server/onboarding/index.ts (server-only fetch) → server/api-client.ts (apiClient<T>/apiClientFormData<T>)`. client-frontend: plain async functions in `lib/api/onboarding.ts` calling `fetch` directly, with the Firebase ID token supplied by the caller via `useAuth().getIdToken()` and attached as a Bearer header — no server-action layer, since nothing in client-frontend needs the httpOnly cookie admin-frontend relies on. Do not invent a server-action layer for client-frontend.
- **Mappers** (`lib/onboarding/*.ts` in both apps) are the DTO→view boundary: pure functions, no fetch logic, called by hooks — never by page components directly.
- **No design/layout changes.** Every page's JSX structure, class names, and component tree are out of scope; only the data-sourcing lines change. A unit that alters markup/classNames beyond swapping the data source is out of scope — stop and report.
- **Precision:** money/unit fields (`units`, `amount`, fee fractions) arrive from the backend as JSON numbers already coerced from `Decimal`/`Numeric` — this layer does no financial rounding of its own; it only formats for display, reusing existing formatters (e.g. `lib/pc/format.ts`) where applicable.
- **Naming:** camelCase for FE view types/fields (e.g. `clientRef`, `verifiedCount`); DTO field names stay snake_case, matching the backend wire contract verbatim — do not rename DTO fields on the way in.
- **Additive & backward-compatible first:** FE-1/FE-2/FE-6 land as new files alongside the still-working mocks; page cutovers and mock deletions (FE-3/FE-4/FE-5/FE-7/FE-8) land last, so both apps stay deployable at every commit.
- **Frozen seam:** the cross-layer contract in impl doc §7 / proposal §4 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees, except Wave W3.** `git worktree add` is forbidden everywhere in this layer **except** for the three Wave-W3 units (`FE-3, FE-4, FE-5`), where it is the prescribed collision-resolution mechanism per schedule §7 and §7.3 below. Do not use worktrees for W1, W2, or W-final.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `admin-frontend/` and `client-frontend/` — the two dirs named in §4 — nothing else. If a unit seems to require a change outside those dirs, the impl doc is wrong — stop and report.
- **Never cross app boundaries within one unit.** An admin-frontend unit (FE-1/2/3/4/5/9) touches only `admin-frontend/`; a client-frontend unit (FE-6/7/8) touches only `client-frontend/`.
- **Tests live in each app's `tests/` dir.** Every generated/written test goes under `admin-frontend/tests/` or `client-frontend/tests/` (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** Both apps' `tests/` dirs are git-ignored; feature agents write and run tests but never stage or commit them.
- **A sub-agent runs only its own app's gate.** An admin-frontend unit's sub-agent runs the admin-frontend gate command; a client-frontend unit's sub-agent runs the client-frontend gate command. It does not need to run the sibling app's gate. The orchestrator's WAVE gate (schedule §6) runs both apps' gates whenever the wave touches both (W1, W2); W3 is admin-frontend only.
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing, in either app. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within W1 and W2, all dispatches go in a **single message** with multiple parallel Agent tool calls (no worktrees — different files, different apps, no collision). Within W3, all three dispatches also go in a single message, but each sub-agent is pointed at its own temporary worktree per §7.3, not the main working tree. Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 013.

CONTEXT (do not re-derive):
- App this unit belongs to: <admin-frontend | client-frontend>
- Layer working dir: <admin-frontend/ | client-frontend/> (from §4)
- Runtime + package manager: Node.js, npm (from §4)
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: ${LAYER_BRANCH}
  (W3 units only: you are inside a temporary worktree at <worktree path> on
   throwaway branch <temp-fe-N> — NOT the main working tree. See §7.3.)
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
<paste the seven lines from §5 verbatim>

TASK:
- Feature ID: <e.g. FE-3>
- Spec: read `docs/implementations/013-client-onboarding-integration-fe.md` §6 <FE-3>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}, or already merged if W3): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-3>.
4. Write the unit test(s) for <FE-3> from impl doc §8 into `<app>/tests/`
   (mirror the source path; never co-locate next to source).
5. Run this unit's app's CI gate command (see §4/§6):
   <cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint>
   <or: cd client-frontend && npx vitest run && npx tsc --noEmit && npx next lint>
   If red, fix and re-run. Do not commit red.
   Do NOT start a preview/dev server — the vitest run + gate is the verification.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the `tests/` dir is git-ignored; tests stay local.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message
   (or the message impl doc §6 <FE-3> specifies, if any).
8. Report back: commit SHA (and, for W3, the worktree path + throwaway branch name),
   files changed, test summary. Exit.

FORBIDDEN:
- git push, --no-verify, --amend past a hook failure.
- git worktree add (unless you ARE the pre-created W3 worktree the orchestrator
  handed you — you do not create your own).
- Editing any file outside the "allowed" list above.
- Editing files in the sibling app's directory or a sibling layer's directory.
- Starting a dev/preview server.
- Reading the schedule doc or other unit specs — you own exactly <FE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after Wave W3's three merges have landed on `${LAYER_BRANCH}` and its gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above — both agents check **both apps** (admin-frontend and client-frontend), since W-final covers the whole layer, not one app.

### 7.3 Worktree protocol for Wave W3

Wave W3 (`FE-3, FE-4, FE-5`) is the one exception to this layer's "no worktrees" default: all three units append a distinct "half" to the same file, `admin-frontend/lib/onboarding/mappers.ts` (schedule §7). Instead of serializing the three units on that one file, this dispatch runs them **concurrently, each in its own temporary git worktree**, per the schedule's worktree override.

**Windows MAX_PATH:** before creating any worktree, check and set long-path support at the repo level:
```powershell
git config --get core.longpaths   # check first
git config core.longpaths true    # set if not already true
```

**Short path root:** create worktrees under a short root, not nested inside the repo's own long working-directory path — e.g. `C:\wt\013-fe-3\`, `C:\wt\013-fe-4\`, `C:\wt\013-fe-5\`.

**Create each worktree** off the current tip of `${LAYER_BRANCH}`, each on its own throwaway branch so the three don't fight over one ref:
```powershell
git worktree add -b temp-fe-3 C:\wt\013-fe-3 client-onboarding-integration-fe
git worktree add -b temp-fe-4 C:\wt\013-fe-4 client-onboarding-integration-fe
git worktree add -b temp-fe-5 C:\wt\013-fe-5 client-onboarding-integration-fe
```

**Node-specific concern (this is the part the DB/BE layers don't have):** a fresh `git worktree add` does not bring `node_modules/` (gitignored). Running `npm install` fresh in each of three worktrees is slow and wasteful when the real working tree already has a populated `admin-frontend/node_modules`. All three FE-3/FE-4/FE-5 units are admin-frontend-only, so this only needs to happen once per worktree, for `admin-frontend/node_modules`. After the worktree checkout completes (so the parent `admin-frontend/` directory exists) and **before** the sub-agent runs any `npx`/`npm` command inside that worktree, create a Windows directory junction pointing at the real `node_modules`:
```powershell
New-Item -ItemType Junction -Path "C:\wt\013-fe-3\admin-frontend\node_modules" -Target "<repo root>\admin-frontend\node_modules"
New-Item -ItemType Junction -Path "C:\wt\013-fe-4\admin-frontend\node_modules" -Target "<repo root>\admin-frontend\node_modules"
New-Item -ItemType Junction -Path "C:\wt\013-fe-5\admin-frontend\node_modules" -Target "<repo root>\admin-frontend\node_modules"
```

**Dispatch:** send all three sub-agent briefs (§7.1, filled for FE-3/FE-4/FE-5) in one message, each pointed at its own worktree path and throwaway branch. Each sub-agent commits its unit **inside its own worktree**, on its own throwaway branch — it does not touch `${LAYER_BRANCH}` directly.

**Merge order (fixed, not first-come-first-merged):** wait for all three sub-agents to report a commit in their own worktree, then merge onto `${LAYER_BRANCH}` in this exact order, regardless of which worktree's agent actually finished first in wall-clock time:
1. **FE-4** (compliance half)
2. **FE-5** (PC half)
3. **FE-3** (board half)

This matches the schedule's fixed deterministic order for `mappers.ts`'s three appended sections. If a later merge conflicts (unexpected, since each unit appends to a distinct section), resolve it directly on `${LAYER_BRANCH}` before proceeding to the next merge.

**Teardown (CRITICAL — order matters).** Unlink each junction BEFORE removing its worktree. `git worktree remove` recursing into a junction target via a recursive delete would delete/corrupt the **shared** `node_modules` that the main working tree and the other worktrees still need. For each of the three worktrees, after its merge has landed:
1. Unlink the junction with a **bare** `rmdir` — **no `/S` flag**:
   ```
   cmd /c rmdir "C:\wt\013-fe-3\admin-frontend\node_modules"
   ```
   `/S` recurses and would delete the real shared `node_modules` through the junction; a bare `rmdir` on a junction point only removes the link itself, leaving the real target untouched.
2. Then remove the worktree:
   ```powershell
   git worktree remove C:\wt\013-fe-3 --force
   ```
   (omit `--force` if the worktree is already clean).
3. Then delete the throwaway branch once its commit is merged into `${LAYER_BRANCH}`:
   ```powershell
   git branch -D temp-fe-3
   ```

Tear down all three worktrees (junction-unlink → `git worktree remove` → delete throwaway branch) only **after all three merges have landed** on `${LAYER_BRANCH}`, before advancing to Wave W3's gate and then W-final. No worktree survives past Wave W3's barrier.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4 and §7
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
check .claude/plugin-state/docgen-013-client-onboarding-integration.json for a "tests" entry;
  if absent, invoke test-gen standard on the impl doc (once per app if needed) before W1

for wave in [W1, W2]:
    dispatch every unit in wave IN PARALLEL to its own agent, main working tree, single message
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6, both apps) — if red: STOP, report to human, exit

# Wave W3 — worktree override (§7.3)
set core.longpaths true if not already
create 3 worktrees under C:\wt\013-fe-{3,4,5}, each on its own throwaway branch off LAYER_BRANCH's tip
junction each worktree's admin-frontend/node_modules to the real one
dispatch FE-3, FE-4, FE-5 IN PARALLEL, one per worktree, single message
wait until all three report a commit in their own worktree
merge onto LAYER_BRANCH in fixed order: FE-4 -> FE-5 -> FE-3
tear down all three worktrees: unlink junction (bare rmdir, no /S) -> git worktree remove -> delete throwaway branch
run wave gate (schedule §6, admin-frontend only) — if red: STOP, report to human, exit

# W-final
dispatch validation + test agents IN PARALLEL (both cover both apps)
if either fails: STOP, report to human, do not open PR

open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit FE-1..FE-9 has a commit on `${LAYER_BRANCH}` (FE-3/FE-4/FE-5 arrive via the W3 worktree merges, in order FE-4 → FE-5 → FE-3).
- [ ] Every wave gate (schedule §6) was green when crossed — W1/W2 checked both apps, W3 checked admin-frontend only.
- [ ] All three Wave-W3 worktrees were torn down (junction unlinked with a bare `rmdir`, then `git worktree remove`, then throwaway branch deleted) before W-final — none survives in the final report.
- [ ] W-final validation agent: PASS (both apps).
- [ ] W-final test agent: PASS (both apps — `cd admin-frontend && npx vitest run` and `cd client-frontend && npx vitest run`).
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, or merged; the only worktrees ever opened were Wave W3's three, and all three were removed before hand-off.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
