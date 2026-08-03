# 020 — Schema / Format Cleanup Refactor · Prompt — Frontend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md` (waves) over `docs/implementations/020-schema-format-cleanup-refactor-fe.md` (units).
> Layer: Frontend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `schema-repository-refactor-bugfix-fe` — cut from `schema-repository-refactor-bugfix`. This prompt captures the actual parent branch at session start (§2 below).
> Worktrees: **none.** All work happens in the main working tree on the layer branch. This layer spans **two** working directories (`admin-frontend/`, `client-frontend/`) but still one branch, one tree.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/020-schema-format-cleanup-refactor-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/020-schema-format-cleanup-refactor-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7.1 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Frontend. **Two working directories, one branch:** `admin-frontend/` (14 units) and `client-frontend/` (3 units — FE-2, FE-8, and half of FE-11).
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`schema-repository-refactor-bugfix`) rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}`.
  - `admin-frontend/node_modules` and `client-frontend/node_modules` installed (`npm ci` in each).
  - The frontend build-performance baseline (impl §3.3 "before" row) has been recorded on `${PARENT_BRANCH}` **before this session starts** — it is unrecoverable once FE-11 edits `next.config.mjs`. If it is not yet filled in, stop and tell the human before dispatching FE-11.
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. Schedule §7 identifies two same-wave file collisions (W1: FE-6/FE-15 on `lib/rm/subscriptions.ts`; W2: FE-13/FE-16 on `client-info/page.tsx`) — both resolved by in-wave serialization, not a worktree.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."
- **Not preconditions (would break layer isolation):** "the BE branch is merged" and "the DB migration has run." Fees arriving as fractions (§7.1(a)) and errors in the new envelope (§7.1(c)) are seam **assumptions**, faked with `vi.mock`/`vi.fn` in every test. No unit imports from `api-backend/`, starts a backend, or hits a live endpoint.
- **Standing constraint for this entire layer:** **no page is deleted anywhere.** If a unit's contract in the impl doc ever reads as a page deletion, that is a doc error — stop and report; do not implement it.

---

## 3. Role

You are the **orchestrator** for the Frontend layer of proposal 020. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (9 units, 2 serialized) → W2 (3 units, 2 serialized) → W3 (2 units) → W4 (1 unit) → W5 (1 unit) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the whole wave to commit; run the wave gate from schedule §6 **in both working directories**. If red for a reason other than the declared W1-W3 `admin-frontend` vitest exception, stop and report.
5. Advance to the next wave.
6. Before dispatching W4 (FE-7), confirm the three FE-5 verdicts are recorded in the impl doc — this is a human gate (schedule §6), not a mechanical one.
7. After FE-9 (W5) commits and the gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees. You **do not** start a preview/dev server at any point in this layer.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dirs | `admin-frontend/` (14 units) and `client-frontend/` (3 units) — no shared package, no workspace root |
| Runtime | Node.js (LTS on this machine; no `engines` field pinned in either `package.json`) |
| Env activation | none — no venv equivalent for Node |
| Package manager | npm (`package-lock.json` present in both dirs — not pnpm, not yarn) |
| Test runner | Vitest — both dirs declare `vitest` and a `vitest.config.ts`; `"test": "vitest run"` in both `package.json` |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Data-flow chain (admin):** `page.tsx` ("use client", no fetch) → `hooks/api/use<Thing>.ts` ("use client") → `actions.ts` ("use server", wraps errors as `{success:false, code:"ACTION_ERROR"}`) → `server/<domain>/index.ts` ("server-only") → `server/api-client.ts` ("server-only", cookie `id_token` → Bearer) → backend. **Client-frontend is one hop shorter** — `page.tsx` → `lib/hooks/use<Thing>.ts` → `lib/api/<domain>.ts` (browser `fetch` with the Firebase token, no server action, no `api-client.ts`).
- **Dependency direction is one-way down that chain.** `lib/*` may not import from `app/*`; `server/*` may not import from `components/*`. One existing exception is load-bearing and stays: `hooks/api/useTradeRecords.ts` imports from its route's `actions.ts` — do not "fix" this.
- **`APIResult<T>`** (admin's universal return shape): `{success:true,data} | {success:false,error:string,code:string}`. `error` is **always a display-ready string** — never widen it to an object.
- **Formatters live in one file per domain** (`lib/pc/format.ts`, `lib/mobo/allocation.ts`). A second definition of an existing formatter is the exact defect class this branch exists to close (FE-6) — never introduce a new one.
- **No new dependency.** Every unit in this layer is config, deletion, or a move. `package.json` gains nothing.
- **No visual redesign.** Skeletons mirror existing structure; no new colour, spacing, or component vocabulary — except the two tiles proposal decision explicitly overrode (Renewals-Due count/list, status/tone fallback in FE-16), which become honest empty/dash states, not new visual design.
- **No page deletion, anywhere, ever, in this layer.** Restated from §2 because it is the standing constraint most likely to be violated by a unit misread.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session, for the orchestrator and every sub-agent.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. Fix the issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop** — except the declared W1-W3 `admin-frontend` vitest exception (schedule §6): expect 117 failures after W1, ≤44 after W2, exactly the 3 FE-5 unknown-class failures after FE-4 in W3, resolved by FE-5 within the same wave. A count that is NOT declining as specified is a real red gate.
- **Never modify sibling-layer files.** Scoped to `admin-frontend/` and `client-frontend/` only — never `api-backend/`.
- **Tests live in `<working-dir>/tests/`**, mirroring the source path, and are treated per each dir's own commit policy — **`admin-frontend/tests/` becomes tracked in git by FE-1 itself** (that unit's whole point); `client-frontend/tests/` is already tracked. `test-gen` output for either dir stays local and is never staged as part of a later unit's commit.
- **Frontend-only — no preview server, ever.** Do NOT run `preview_start`, `npm run dev`, or any dev/preview server after implementing any unit in this layer. Verification is the vitest run + typecheck/lint gate; running the app in a browser is left to the human.
- **Two serialized pairs in this layer (schedule §7) — do not dispatch these two in parallel:**
  - W1: FE-6 before FE-15 (both edit `admin-frontend/lib/rm/subscriptions.ts`).
  - W2: FE-16 before FE-13 (both edit `admin-frontend/app/(roles)/rm/client-info/page.tsx`).
- **W3→W4 human gate:** do not dispatch FE-7 until the three FE-5 verdicts are recorded in the impl doc (written from the actual vitest run, not reasoned in the abstract — proposal Q-7's own gating language).

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, dispatch all units in a **single message** with multiple parallel Agent tool calls, **except** the two serialized pairs named in §6 above, which are dispatched one after the other (wait for the first's commit before sending the second). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 020.

CONTEXT (do not re-derive):
- Layer working dir: <admin-frontend/ or client-frontend/ — from this unit's impl doc entry>
- Runtime: Node.js via npm. No env activation step.
- Shell: PowerShell primary; Bash tool also available.
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Data-flow chain is one-way down: page -> hook -> actions -> server/<domain> -> api-client -> backend (admin); page -> lib/hooks -> lib/api (client). Never import upward.
- APIResult<T>.error is always a display-ready string, never an object.
- Formatters live in exactly one file per domain (lib/pc/format.ts, lib/mobo/allocation.ts) — never introduce a second definition.
- No new npm dependency.
- No visual redesign beyond what this unit's contract explicitly specifies.
- NO PAGE IS EVER DELETED in this layer. If your unit's contract reads as a page deletion, STOP and report — do not implement it.
- The frozen seam (proposal §7.1) is fixed — if this unit's contract conflicts with it, STOP and report.

TEST HARNESS:
- `test-gen` has NOT yet been run for this layer. Before implementing this unit,
  check whether generated tests for it already exist under `<working-dir>/tests/`
  per impl doc §8.2's coverage matrix. If not, invoke the `test-gen` skill against
  `docs/implementations/020-schema-format-cleanup-refactor-fe.md` at level
  `standard` (impl §8.4's chosen level), upgraded to `thorough` if this unit is
  FE-6 or FE-7 (the money-path / trust-boundary units).
- A RED generated test for this unit is either a real bug or a wrong §8.3 goal —
  stop and flag it. Never edit the test to force green.
- EXCEPTION for FE-1/FE-3/FE-4/FE-5: these units' whole job IS the admin test
  baseline. A declining-but-nonzero vitest failure count in admin-frontend is
  EXPECTED here (schedule §6) — do not treat it as a reason to stop unless the
  count fails to decline as specified for this unit.
- FE-2 and FE-8 (client-frontend): the client suite has no such exception — it
  must be fully green after your unit.

TASK:
- Feature ID: <e.g. FE-6>
- Spec: read `docs/implementations/020-schema-format-cleanup-refactor-fe.md` §6 <FE-6>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7.1 if this unit touches the seam.
3. Implement the contract from impl doc §6 <FE-6>.
4. Ensure/generate the unit's tests per the TEST HARNESS block above, in `<working-dir>/tests/`.
5. Run the gate FOR THIS WORKING DIR ONLY (the sibling dir's gate is a different unit's job unless this unit touches both): `npx vitest run && npx tsc --noEmit && npx next lint` — UNGREPPED, no `grep -v "^tests/"` anywhere. If a type error originates in tests/, fix the test, not the filter.
   If red for a reason other than the declared admin test-baseline exception (FE-1/FE-3/FE-4/FE-5 only), fix and re-run. Do not commit red.
   DO NOT start a preview/dev server at any point.
6. If this unit shares a file with another in the same wave (FE-6/FE-15 on lib/rm/subscriptions.ts, or FE-16/FE-13 on client-info/page.tsx): wait for the first unit's commit, `git pull --rebase` against ${LAYER_BRANCH}, re-read the file, then make your edit.
7. Stage ONLY the source files listed above (no `git add -A`, no `git add .`). FE-1 is the one exception — it stages the 78 previously-untracked test files as its actual deliverable; every other unit's test output stays local and unstaged.
8. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message, or the message specified in impl doc §6 if given.
9. Report back: commit SHA, files changed, vitest/tsc/lint summary for this working dir. If this is FE-5, report all three verdicts explicitly — the orchestrator needs them recorded before FE-7 dispatches. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in the sibling working dir (unless this unit explicitly spans both, e.g. FE-11) or in api-backend/.
- Deleting any page, anywhere, for any reason.
- Starting a preview/dev server.
- Reading the schedule doc or other unit specs — you own exactly this unit.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after FE-9 (W5) commits and the gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above. Both agents run in **both** working directories.

---

## 8. Execution loop

```
read impl doc §1-3 and §7.1
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
confirm impl §3.3's "before" build-performance row is filled — if not, STOP and tell the human

for wave in [W1, W2, W3, W4, W5, W_final]:
    for unit in wave.units:
        # W1: FE-6 -> FE-15 serialized. W2: FE-16 -> FE-13 serialized. All else parallel.
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) in BOTH working dirs — if red for a non-exception
        reason: STOP, report to human, exit
    if wave == W3: confirm the three FE-5 verdicts are written into the impl doc
        before proceeding to W4 (human gate)
open PR against PARENT_BRANCH
report: units committed, gate summary (both dirs), PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit FE-1 … FE-16 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (W1-W5) was green when crossed, per the declared admin-baseline exception in W1-W3.
- [ ] The three FE-5 verdicts recorded in the impl doc before W4 (FE-7) dispatched.
- [ ] `npx vitest run && npx tsc --noEmit && npx next lint` green, ungrepped, in **both** working dirs.
- [ ] Impl §3.3's after-measurement recorded.
- [ ] No frontend page deleted anywhere in this layer.
- [ ] No preview/dev server was started at any point.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
