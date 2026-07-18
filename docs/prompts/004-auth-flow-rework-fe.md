# 004 — `Authentication Flow Rework` · Prompt — `Frontend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/004-auth-flow-rework-fe.md` (waves) over `docs/implementations/004-auth-flow-rework-fe.md` (units).
> Layer: `Frontend` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `rework-authentication-module-fe` — cut from `rework-authentication-module` (parent). This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch. (This layer has zero same-wave file collisions — see schedule §7 — so the worktree override used on the Backend layer does not apply here.)

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/004-auth-flow-rework-fe.md` | *what* to build (FE-1..FE-6 + contracts) |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-fe.md` | *what order* (waves, gates) |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` | *why* + frozen cross-layer seam (§6, §4.12) |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

**Why this layer exists:** the Backend layer (`rework-authentication-module-be`) already landed and replaced the unified `/api/auth/login` + `/api/auth/register` with portal-scoped, bind-only routes plus a dev-only `/api/dev/register`. Both `client-frontend` and `admin-frontend` still call the old routes and now 404 at runtime. This layer repoints them — it does **not** build any new admin-console UI (client onboarding / staff enrollment forms are an explicit non-goal per the proposal §3).

---

## 2. Branch & session contract

- **Layer:** Frontend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, the parent is `rework-authentication-module` (per this doc's front matter) — do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or cut it now from `${PARENT_BRANCH}`).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** `git worktree add` is forbidden — this layer has no same-wave file collisions (schedule §7 confirms the map is empty).
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 004. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (FE-1, FE-4) → W2 (FE-2, FE-5) → W3 (FE-3, FE-6) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the whole wave to commit; run the wave gate from schedule §6 (per app: `npx next lint` + `npx vitest run`). If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After W3 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dirs | `client-frontend/` (FE-1, FE-2, FE-3) and `admin-frontend/` (FE-4, FE-5, FE-6) — two separate Next.js apps, never cross-imported |
| Runtime | Node.js (version per each app's `package.json`/lockfile — not pinned here; use whatever `npm` on PATH resolves) |
| Env activation | none needed — `node_modules/` already installed in both apps |
| Package manager | npm |
| Migration tool | N/A — no DB layer work in this prompt |
| DB URL env var | N/A |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`rework-authentication-module`) |

**Toolchain confirmed present (do not re-verify per sub-agent):** both `client-frontend/package.json` and `admin-frontend/package.json` have `"test": "vitest run"` backed by a `vitest.config.ts`, and a `"lint": "next lint"` script. Neither has a standalone `tsc`/typecheck script — type errors surface via `next lint`'s TS integration and, at W-final, via `next build`.

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `page (Server/Client Component) → AuthProvider (context) → lib/auth-api.ts (fetch wrapper) → backend`. A page never calls `fetch` directly.
- **Return/error envelope:** non-2xx responses from `lib/auth-api.ts` throw a plain `Error`/`BackendAuthError` carrying a `.status: number` property — callers branch on status, never re-parse `.message`.
- **Naming:** `postBackend<Verb>` for `lib/auth-api.ts` functions — keep the existing convention, do not rename.
- **Additive & backward-compatible first:** not really applicable here (this is a contract-repoint, not an additive schema change) — but do not remove `postBackendLogout` or `syncPortalUserAfterFirebaseAuth`'s exported names, only their internals, unless the impl doc's unit says otherwise.
- **Frozen seam:** the cross-layer contract in proposal §5/§4.12, re-pinned in impl doc §7, is fixed (route paths, request/response shapes, status codes). If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main`** (and this layer's parent branch) **and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. Report and wait for the human.
- **Never modify the sibling app when working on one app's unit.** A `client-frontend` unit (FE-1/2/3) touches only `client-frontend/`; an `admin-frontend` unit (FE-4/5/6) touches only `admin-frontend/`. If a unit seems to require touching the other app, the impl doc is wrong — stop and report.
- **Never modify `api-backend/`.** This layer builds against the already-committed Backend contract (impl doc §7) — it does not touch backend code, even to "fix" a seam mismatch. A seam mismatch is a stop-and-report condition, not a cross-layer edit.
- **Tests live in each app's own `tests/` dir**, mirroring source path, never co-located.
- **Tests are NEVER committed.** Both apps' `tests/` dirs are git-ignored; feature agents write and run tests but never stage or commit them.
- **No preview server.** Do NOT run `npm run dev` / start any dev server after implementing. Verification is `npx vitest run` + `npx next lint` (and `npx next build` at W-final only). Running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, both dispatches go in a **single message** with two parallel Agent tool calls (the two apps never collide — schedule §7 confirms an empty shared-file map). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 004.

CONTEXT (do not re-derive):
- Layer working dir: <client-frontend/ or admin-frontend/, per unit>
- Runtime + env activation: Node.js, npm, no env activation needed
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: page -> AuthProvider (context) -> lib/auth-api.ts (fetch wrapper) -> backend. Never fetch directly from a page.
- Errors from lib/auth-api.ts carry a `.status: number` property; callers branch on status, not on message text.
- Naming: keep the existing `postBackend<Verb>` convention — do not rename exported functions.
- Frozen seam (impl doc §7) is fixed — if this unit's contract conflicts with it, STOP and report, do not diverge silently.

TASK:
- Feature ID: <e.g. FE-1>
- Spec: read `docs/implementations/004-auth-flow-rework-fe.md` §6 <FE-1>. That section
  is the CONTRACT — implement it as specified. Do not exceed scope (no new UI screens —
  see the impl doc's "Explicitly NOT in scope" note in §1).
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above.
2. Read the frozen seam in impl doc §7.
3. Implement the contract from impl doc §6 <FE-1>.
4. Write the unit test(s) for <FE-1> from impl doc §8 into `<layer working dir>/tests/`
   (mirror the source path; never co-locate next to source).
5. Run the layer's CI gate command: `npx vitest run && npx next lint` (from the
   unit's own app directory — client-frontend/ or admin-frontend/).
   If red, fix and re-run. Do not commit red.
   Do NOT start a preview/dev server.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in the OTHER frontend app, or in api-backend/.
- Reading the schedule doc or other unit specs — you own exactly <FE-1>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W3's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(FE-1,FE-4), W2(FE-2,FE-5), W3(FE-3,FE-6), W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6, per app) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit FE-1..FE-6 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
