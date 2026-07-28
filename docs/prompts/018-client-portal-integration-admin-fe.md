# 018 — Client Portal ↔ Backend Integration · Prompt — Frontend (admin-frontend)

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/018-client-portal-integration-admin-fe.md` (waves) over `docs/implementations/018-client-portal-integration-admin-fe.md` (units).
> Layer: Frontend (admin-frontend) — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `client-portal-integration-admin-fe` — cut from parent `client-portal-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/018-client-portal-integration-admin-fe.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-admin-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/018-client-portal-integration-admin-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

**Note on unit ID prefix:** this layer's impl doc uses `ADM-` (not `FE-`) for unit IDs, since the proposal has two frontend layers and IDs must stay globally unique against the sibling client-frontend doc's `FE-*` IDs (see impl doc's deviation note, top of file). Every reference to a feature ID in this prompt — including the §7 brief template — uses `ADM-N` accordingly.

---

## 2. Branch & session contract

- **Layer:** Frontend (admin-frontend).
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-admin-fe"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `client-portal-integration` (per impl doc §2 — do not guess otherwise).
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 collision map is empty for this layer (strict linear DAG — no in-wave collisions).
- **No push, no merge.** The human owns the merge back to `client-portal-integration`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Frontend (admin-frontend) layer of proposal 018. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `admin-frontend/` |
| Runtime | Node.js (Next.js 14.2.35) |
| Env activation | none — no-op for this layer (frontend) |
| Package manager | npm (confirmed via `admin-frontend/package-lock.json`; no `pnpm-lock.yaml`/`yarn.lock` present) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (= `client-portal-integration`) |

**Gate commands** (verified directly against `admin-frontend/package.json` `scripts` — run from `admin-frontend/`):
```bash
npm run lint       # "lint": "next lint"
npx tsc --noEmit   # no dedicated type-check script exists; project convention per impl doc §3.2
npm run test       # "test": "vitest run"
npm run build      # "build": "next build"
```
`admin-frontend/vitest.config.ts` exists (jsdom, `@vitejs/plugin-react`, `@/` alias) — confirmed present, a real config, not assumed.

No DB URL / migration tool rows apply to this layer.

---

## 5. Global invariants (inherited by every sub-agent)

<!-- Copied verbatim from impl doc §3.1 / §3.2. -->

- **Data-access shape (§3.1):** the real established data-access shape in admin-frontend is Server Actions, not a direct client-side `fetch` — this differs from client-frontend's `useX()` → `useEffect` + `getIdToken()` + `fetch` pattern, and this layer follows admin-frontend's own real convention rather than importing the client-frontend shape wholesale, per the codebase's existing precedent (`hooks/api/useModels.ts`, `hooks/api/useReconciliationFlow.ts`):
  1. `server/rm/index.ts` (server-only, `import "server-only"` transitively via `server/api-client.ts`) — one `apiClient<T>(ENDPOINTS.RM.X)` call per route. The auth token is never touched by hand here; `server/api-client.ts` reads it from the `id_token` cookie via `cookies()`.
  2. `app/(roles)/rm/requests/actions.ts` (`"use server"`) — thin try/catch + `logger` wrapper around the `server/rm` functions, returning `APIResult<T>` (`{success:true,data}` | `{success:false,error,code}`), matching every sibling `actions.ts`.
  3. `hooks/api/useRmTickets.ts` (`"use client"`) — `useState` for `data`/`loading`/`error`, a `useCallback` fetch function guarded by a `useRef` in-flight flag, a `useEffect` that calls it once, and an exposed `refetch`. This is the exact shape of `useReconciliationFlow`/`useModels` — no new hook shape is introduced.
- **DTO + mapper file (§3.1):** one `lib/rm/tickets.ts` holding the raw `RmTicketDTO` (snake_case, matches the wire) plus a `mapDtoToRequestTicket` function that reshapes it into the **existing** `RequestTicket` view type `RequestTickets.tsx` already renders — mirrors `lib/rm/clients.ts` / `lib/pc/models.ts`. Components are never handed a raw DTO to destructure inline.
- **Endpoints (§3.1):** new paths are added to the existing `ENDPOINTS.RM` object in `server/endpoints.ts`, not inlined as string literals in `server/rm/index.ts`.
- **Money/formatting (§3.1):** `RmTicketDTO`'s `amount`/`multiplier`/`notional` are numbers; the mapper formats them into the display strings (`cash`, `mult`, `notional` as already-formatted strings) `RequestTickets.tsx` expects, since that component was built against pre-formatted mock strings and this layer does not restructure its JSX (no design/layout change, per the proposal's standing constraint).
- **Status → chip tone (§3.1):** `TicketStatus` (`new`/`in_progress`/`replied`/`closed`/`declined`) maps to the existing `ChipTone` values the mock data already used (`New`→`warm`, `In Progress`→`review`, `Replied`→`active`, `Closed`→`neutral`, `Declined`→`overdue`) — the same tones already encoded, so no new tone is invented.
- **`null` rendering (§3.1):** any DTO field typed `T | None` on the wire renders the existing `"—"` placeholder `RequestTickets.tsx` already uses for absent `model`/`account`/`subject`.
- **Component structure (§3.1):** no unit in this layer changes page composition, spacing, or the component tree of `RequestTickets.tsx` or its detail page — only data bindings.
- **Additive & backward-compatible first (§3.2):** trunk-friendly, small units; each ADM-* unit is its own commit; the branch stays green after every commit. Additive-first ordering: ADM-1 introduces the new data layer and rebinds the inbox in the same commit that removes its `TICKET_QUEUE` import; the mock symbols (`TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket`, `RequestTicket` type) are the one contraction step, scheduled last (ADM-5), once every other consumer has moved off them.
- **Frozen seam:** the cross-layer contract in proposal §4 (reproduced verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Scope boundary — zero `model_limit` / PC-model-form work:** this layer does **not** touch `models.model_limit` or any PC model-management surface. `admin-frontend/lib/pc/*` and `admin-frontend/components/pc/model-management/*` are untouched by every unit in this doc — no unit adds an `EditModelForm`/`ModelDetailPanel`/`lib/pc/types.ts` field for `model_limit`. Per the proposal's Non-Goals, that attribute has no authoring path anywhere, on either frontend. Unit ID `ADM-4` is **retired, not reused** — it belonged to the now-removed PC model-form field — and must not be reintroduced under any ID.
- **Scope boundary — zero client-renewal-upload (D-4) work:** this layer has zero work for the client renewal-upload feature (D-4: the client writes the same `onboarding_documents` row the RM board already reads, so nothing here needs wiring).
- **No new admin-frontend surface** beyond the one named item (the RM ticket inbox) — no new page, no new role, no new nav entry.

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
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not a branch artifact).
- **Frontend layer only — no preview server.** Do NOT start a Next.js/dev/preview server (no `preview_start`, no `npm run dev`) after implementing. Verification is the vitest suite + typecheck/lint gate; running the app in a browser is left to the human.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7 — moot here, the DAG is a strict linear chain with exactly one unit per feature wave). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 TEST HARNESS status (read before first dispatch)

No `tests` entry exists yet in the pipeline state file for this layer — **`test-gen` has not been run.** Before fan-out (before dispatching the W1 sub-agent), the orchestrator must invoke:

```
test-gen standard
```

against `docs/implementations/018-client-portal-integration-admin-fe.md` — level **standard**, per impl doc §8.4 ("Chosen `test-gen` level for this layer: **standard** (happy path + main negative + the null/409/empty-vs-zero cases named above per unit) — set by the orchestrator; escalate to `thorough` only if the visual-confirmation gate surfaces edge cases this misses.").

Once `test-gen` has produced the concrete vitest files under `admin-frontend/tests/` (mirroring source paths, e.g. `tests/hooks/api/ADM-1.use-rm-tickets.test.tsx`), each feature sub-agent's job is to make its unit's already-generated tests pass — **not** to invent its own test file from scratch, and not to edit the generated test file's assertions. A red test after implementing is either a real bug in the unit or a wrong §8.3 goal; if the latter, the sub-agent stops and flags it rather than rewriting the test to fit.

The orchestrator's fan-out order is therefore: (1) invoke `test-gen standard` on this impl doc → (2) dispatch feature agents wave by wave, each told to make its unit's generated tests pass → (3) W-final validation + test agents per schedule §8.

### 7.2 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend (admin-frontend) layer of proposal 018.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + env activation: Node.js (Next.js 14.2.35); no env activation needed
- Package manager: npm
- Shell: PowerShell primary; Bash tool also available (Windows 11)
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- TEST HARNESS: test-gen standard has already been run against the impl doc before
  your dispatch; generated test file(s) for your unit already exist under
  admin-frontend/tests/ (mirroring source path). Make them pass — do not rewrite
  their assertions. A red test is either a bug in your implementation or a
  wrong §8.3 goal; if you believe it's the latter, stop and report, do not
  edit the test to fit.

INVARIANTS (hold at every step):
<paste the full §5 bullet list verbatim>

TASK:
- Feature ID: <e.g. ADM-2>
- Spec: read `docs/implementations/018-client-portal-integration-admin-fe.md` §6 <ADM-2>. That section is
  the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <ADM-2>.
4. Run the already-generated test(s) for <ADM-2> from `admin-frontend/tests/` (see TEST HARNESS
   above). If red, fix the implementation and re-run. Do not commit red. Do not edit test assertions.
5. Run the layer's CI gate command (see §4 above):
   npm run lint && npx tsc --noEmit && npm run test && npm run build
   If red, fix and re-run. Do not commit red.
   FRONTEND ONLY: do NOT start a preview/dev server — the vitest run + gate is the verification.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the `tests/` dir is git-ignored;
   tests stay local.
7. Commit with the message from impl doc §6 <ADM-2> (or a one-line
   `<type>(<scope>): <summary> (<ADM-N>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories.
- Reading the schedule doc or other unit specs — you own exactly <ADM-2>.
- Adding any `model_limit` field/surface, or any client-renewal-upload (D-4) wiring.
- Reintroducing unit ID `ADM-4` under any name — it is retired, not reused.
```

### 7.3 W-final agents (validation + test)

Dispatched once, in parallel, after the last feature wave's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.2 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
invoke test-gen standard on the impl doc (no tests entry exists yet for this layer)

for wave in schedule.waves + [W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.2 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

Per schedule §4, the wave sequence for this layer is a strict linear chain: `W1(ADM-1) → W2(ADM-2) → W3(ADM-3) → W4(ADM-5) → W-final`. Each feature wave has exactly one unit — no intra-wave parallelism is available, and the schedule's shared-file collision map (§7) is empty as a result. `ADM-4` does not appear in this sequence — it is retired and must not be dispatched.

---

## 9. Definition of done

- [ ] `test-gen standard` was invoked against the impl doc before the first feature dispatch.
- [ ] Every unit in impl doc §6 (`ADM-1`, `ADM-2`, `ADM-3`, `ADM-5`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] No unit added `model_limit` surface or D-4 client-renewal-upload wiring; `ADM-4` was not reintroduced.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
