# 017 — `Transaction Details Wiring` · Prompt — `Frontend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/017-transaction-details-wiring-fe.md` (waves) over `docs/implementations/017-transaction-details-wiring-fe.md` (units).
> Layer: `Frontend` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `transaction-details-wiring-fe` — cut from parent `transaction-details-wiring`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/017-transaction-details-wiring-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` | *why* + frozen cross-layer seam |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Frontend`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `transaction-details-wiring` (recorded in the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Frontend` layer of proposal 017. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule) — this layer is **four waves**: W1 (FE-1) → W2 (FE-2, FE-3, FE-4 — all three dispatch in parallel in a single message, since each depends only on FE-1 and they touch disjoint files) → W3 (FE-5) → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. In W2, all three dispatches go in one message.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After FE-5 (the last feature wave) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node.js (Next.js 14.2.35 — see `admin-frontend/package.json`; no `.nvmrc` pinned, use whatever LTS Node is on PATH) |
| Env activation | none — no venv equivalent for this layer |
| Package manager | npm (`admin-frontend/package-lock.json`) |
| Migration tool | N/A — not applicable to this layer |
| DB URL env var | N/A — this layer never touches a database directly |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering:** `app/(roles)/rm/model-subscription/actions.ts` (`"use server"`) → `server/rm/index.ts` (`"use server"`, calls `apiClient`) → `server/api-client.ts` (raw fetch + auth). Client components (`"use client"`) call **only** the server actions in `actions.ts`, never `server/rm` or `apiClient` directly.
- **Error envelope:** every server action returns `APIResult<T> = { success: true; data: T } | { success: false; error: string; code: string }`. `actions.ts` wraps the `server/rm` call in `try/catch`, funneling any thrown error through the local `toErrorResult` helper.
- **Decimal-as-number:** `settlement_amount` crosses the wire as a JSON number, not a string.
- **Date/time-as-string:** `transaction_date`/`transaction_time` cross the wire as plain strings (`"YYYY-MM-DD"` / `"HH:MM"`), matching the native `<input type="date">`/`<input type="time">` values already produced.
- **POST convention:** `apiClient<T>(path, { method: "POST", body: JSON.stringify(req) })`.
- **Additive & backward-compatible first:** `has_transaction_detail` is additive to `AllotRdmptDTO`; the new `TxnRow` element is appended, never inserted/reordered.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. Report and wait for the human.
- **Never modify sibling-layer files** (`api-backend/**`). This session is scoped to `admin-frontend/`.
- **Tests live in `admin-frontend/tests/`** (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** `admin-frontend/tests/` is git-ignored — tests are run locally, never staged/committed.
- **No preview/dev server.** Do **not** start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. FE-2, FE-3, and FE-4 all depend only on FE-1 and touch disjoint files (per schedule §7, no same-wave collision) — dispatch all three in a **single message** with three parallel Agent tool calls. FE-1 and FE-5 are single-unit waves, dispatched alone.

### 7.1 Brief template (fill and send — one per unit: FE-1 alone; then FE-2/FE-3/FE-4 together; then FE-5 alone)

```
You are a feature sub-agent for the Frontend layer of proposal 017.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime: Node.js (Next.js 14.2.35), npm
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: actions.ts ("use server") → server/rm/index.ts ("use server") →
  server/api-client.ts. Client components call only actions.ts.
- Error envelope: APIResult<T>; actions.ts wraps in try/catch via toErrorResult.
- Decimal-as-number: settlement_amount is a JSON number, not a string.
- Date/time-as-string: transaction_date/transaction_time cross the wire as plain
  strings ("YYYY-MM-DD" / "HH:MM").
- POST convention: apiClient<T>(path, { method: "POST", body: JSON.stringify(req) }).
- Additive & backward-compatible first: has_transaction_detail is additive; the new
  TxnRow element is appended, never inserted/reordered.
- Frozen seam (proposal §4) is fixed — if this unit's contract conflicts with it, STOP
  and report.

TEST HARNESS:
- No tests exist yet for this layer's units. Before implementing the FIRST unit
  dispatched (FE-1), invoke the `test-gen` skill on
  `docs/implementations/017-transaction-details-wiring-fe.md` at level `standard`
  (per its §8.4) to generate test goals for ALL FE-* units into `admin-frontend/tests/`.
  For each unit you implement, make ONLY that unit's already-generated tests pass —
  do not implement ahead of the unit you were dispatched for. A red test after
  implementation is either a real bug in your implementation or a wrong §8.3 goal;
  if you believe it's the latter, STOP and flag it rather than editing the generated
  test to force a pass.

TASK:
- Feature ID: <FE-1 | FE-2 | FE-3 | FE-4 | FE-5 — fill per dispatch>
- Spec: read `docs/implementations/017-transaction-details-wiring-fe.md` §6 <unit ID>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit — read the unit's own
  "Files:" line, do not assume):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <from impl doc unit's
  "Dependencies:" line — e.g. FE-2/FE-3/FE-4 each depend on FE-1 only; FE-5 depends
  on FE-2, FE-3, FE-4; FE-1 has none>.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 — this unit implements part of it.
3. Implement the contract from impl doc §6 <unit ID>.
4. Ensure the test-gen output for this unit in admin-frontend/tests/ passes.
5. Run the layer's CI gate command (from admin-frontend/):
   npx vitest run && npx tsc --noEmit && npx next lint
   If red, fix and re-run. Do not commit red.
   Do NOT start a preview/dev server — the vitest run + gate is the verification.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — admin-frontend/tests/ is git-ignored.
7. Commit with a one-line `fe(transaction-details): <summary> (<UNIT-ID>)` message
   (or the exact message from the impl doc unit if it specifies one).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files under api-backend/.
- Starting any dev/preview server.
- Reading the schedule doc or other unit specs — you own exactly the one unit ID above
  (or, for the W2 trio, exactly your own of FE-2/FE-3/FE-4).
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after FE-5's wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(FE-1), W2(FE-2,FE-3,FE-4 parallel), W3(FE-5), W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
        # W2's three units dispatch together in one message
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] FE-1 through FE-5 each have a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or started a dev/preview server.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
