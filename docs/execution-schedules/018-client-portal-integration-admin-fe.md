# 018 — Client Portal ↔ Backend Integration · Execution Schedule — Layer: Frontend (admin-frontend)

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/018-client-portal-integration-admin-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend (admin-frontend) — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-portal-integration-admin-fe` — cut from `client-portal-integration` (parent) and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/018-client-portal-integration-admin-fe.md` |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 4 — Frontend (admin-frontend, RM inbox) |
| Sibling layer schedules | `docs/execution-schedules/018-client-portal-integration-db.md` (Database), `docs/execution-schedules/018-client-portal-integration-be.md` (Backend), `docs/execution-schedules/018-client-portal-integration-fe.md` (Frontend — client-frontend) |
| Prompt (dispatch harness) | `docs/prompts/018-client-portal-integration-admin-fe.md` |

**Unit ID space this schedule sequences:** `ADM-1`, `ADM-2`, `ADM-3`, `ADM-5` (definitions live in the impl doc — do not restate them here).

**Note on the ID gap:** `ADM-4` does not exist in this run. It was retired in a prior amendment to the impl doc (it belonged to a since-removed PC model-form "Model Limit" field) and is explicitly **not reused** — see impl doc §1 and §6/ADM-5's proposal-ref note. This schedule sequences exactly the four units that exist in the impl doc's §6: `ADM-1`, `ADM-2`, `ADM-3`, `ADM-5`. No unit numbered `ADM-4` is dispatched by this schedule.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green: Backend layer's `/api/rm/tickets`, `/api/rm/tickets/{ref}`, `/api/rm/tickets/{ref}/status` routes reachable at `NEXT_PUBLIC_API_BASE_URL` and matching impl doc §7.1 exactly (status codes included); the frozen seam in the proposal's §4 is agreed (impl doc §7 is copied from it verbatim).
- [ ] Layer branch `client-portal-integration-admin-fe` cut from `client-portal-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in the impl doc's §7; sibling layers (DB, Backend, client-frontend) may run before, after, or concurrent with this one. All layer branches eventually merge back into `client-portal-integration` — the human decides the merge order, and no schedule step here assumes one.

**Exit signal (what this run produces):** every unit in §3 committed on `client-portal-integration-admin-fe`, the final validation wave green, PR opened against `client-portal-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two `ADM-*` units in this impl doc. No edge references a sibling layer's unit ID (e.g. no `BE-*`/`DB-*`/`FE-*` edge) — the impl doc's §7 (frozen seam) is the only cross-layer coupling, and this layer builds against that contract, not against another layer's schedule progress.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `ADM-1` | — | root — introduces the ticket data-access layer (`lib/rm/tickets.ts`, `hooks/api/useRmTickets.ts`, `app/(roles)/rm/requests/actions.ts`) and rebinds the inbox off `TICKET_QUEUE`; impl doc states explicitly "none — parallel-safe with everything else in this doc; ADM-2/ADM-3/ADM-5 build on this unit." |
| `ADM-2` | `ADM-1` | detail page uses `useRmTicket`, added alongside `useRmTickets` (ADM-1's hook), and consumes the same DTO/mapper ADM-1 introduces. |
| `ADM-3` | `ADM-1`, `ADM-2` | wires `RequestTickets.tsx`'s action panels to `setTicketStatus`, and its success path calls the detail page's `refetch` (ADM-2's `useRmTicket` shape). |
| `ADM-5` | `ADM-1`, `ADM-2`, `ADM-3` | impl doc: "every consumer of the mock ticket symbols must have moved off them first" — deletes `TICKET_QUEUE`/`REQUEST_TICKETS`/`isOpenTicket`/mock `RequestTicket` type only once ADM-1 through ADM-3 no longer reference them. |

**Graph invariants:**
- No cycles — the chain is strictly linear (`ADM-1 → ADM-2 → ADM-3 → ADM-5`).
- Every edge is between units in this same layer.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel — there are none here beyond the chain: this DAG has no branching, so no two units are ever parallel-eligible in the same wave.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `ADM-1` | no (single unit) | — |
| W2 | `ADM-2` | no (single unit) | W1 committed |
| W3 | `ADM-3` | no (single unit) | W2 committed |
| W4 | `ADM-5` | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

The DAG is a strict linear chain (impl doc's own dependency lines force this: ADM-2 depends on ADM-1, ADM-3 depends on ADM-1+ADM-2, ADM-5 depends on ADM-1+ADM-2+ADM-3), so each feature wave has exactly one unit and no intra-wave parallelism is available. This also means §7's shared-file collision protocol is moot for this layer's feature waves — no wave ever contains two units.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-portal-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `ADM-1` | impl §6 ADM-1 — inbox reads the real ticket feed | create: `lib/rm/tickets.ts`, create: `hooks/api/useRmTickets.ts`, create: `app/(roles)/rm/requests/actions.ts`, modify: `server/rm/index.ts`, modify: `server/endpoints.ts`, modify: `components/rm/RequestTickets.tsx` | commit exists on layer branch |

**Barrier before W2:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `ADM-2` | impl §6 ADM-2 — detail page resolves from the real endpoint | modify: `app/(roles)/rm/requests/[ref]/page.tsx`, modify: `hooks/api/useRmTickets.ts` (add `useRmTicket`) | commit exists on layer branch |

**Barrier before W3:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `ADM-3` | impl §6 ADM-3 — Reply / Decline / In-Progress wired to the status endpoint | modify: `components/rm/RequestTickets.tsx` (`ActOnTradePanel`, `ReplyPanel`) | commit exists on layer branch |

**Barrier before W4:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `ADM-5` | impl §6 ADM-5 — dashboard "Open Requests" counts + mock deletion | modify: `app/(roles)/rm/client-info/page.tsx`, modify: `lib/mock/rm-data.ts` (delete `TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket`, `RequestTicket` type only) | commit exists on layer branch |

**Barrier before W-final:** row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order (impl doc §3.2, "Gates before merge") — a failure blocks the next wave:

1. **Lint** — `npm run lint` (run from `admin-frontend/`; `next lint`)
2. **Type-check** — `npx tsc --noEmit` (run from `admin-frontend/`; no dedicated `type-check` script exists per impl doc §3.2)
3. **Unit tests** — `npm run test` (run from `admin-frontend/`; `vitest run` — impl doc §8; only tests for units already committed need pass at this point)
4. **Build** — `npm run build` (run from `admin-frontend/`; `next build`)

**Human gates:**
- [ ] none — fully automated to PR for this layer's own wave barriers. The impl doc names one human gate, but it is a proposal-level, cross-layer gate (the proposal's step-3 visual-confirmation gate comparing inbox/detail before-and-after), not a barrier internal to this schedule's waves — impl doc §3.2: "The only human gate this layer participates in is the proposal's step-3 visual-confirmation gate (scheduling metadata, not a unit here)."

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none found |

**The map is empty for every wave.** Each feature wave (W1–W4) contains exactly one unit (the DAG is a strict linear chain — see §3/§4), so no two units ever write to the same file in the same wave. Two files are each touched by more than one unit across the *whole run* — `hooks/api/useRmTickets.ts` (ADM-1 creates, ADM-2 modifies) and `components/rm/RequestTickets.tsx` (ADM-1 modifies, ADM-3 modifies) — but the dependency edges in §3 already place those units in different, sequential waves, so no in-wave collision is possible and no additional serialization step is needed.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID in §3 (`ADM-1`, `ADM-2`, `ADM-3`, `ADM-5`) has at least one commit on `client-portal-integration-admin-fe`.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified/deleted as specified) — including that `lib/mock/rm-data.ts` retains `RM_CLIENTS`, `CLIENT_EXTRA`, `SUB_CLIENTS`, `MODEL_SIZES`, `OB_MODEL_CATALOG`, `getMockOverlay` unchanged.
- [ ] Public surface (impl §5 modules) matches impl doc — imports resolve, no dangling references to removed symbols (`rg "TICKET_QUEUE|REQUEST_TICKETS|isOpenTicket"` under `admin-frontend/` returns nothing).
- [ ] `admin-frontend/lib/pc/*` and `admin-frontend/components/pc/model-management/*` are untouched — `git diff` against parent shows no file in either directory (impl doc §9 / proposal Non-Goals: no `model_limit` authoring surface added by this layer).
- [ ] No `any` types added (Frontend-layer invariant).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8.1: `npm run test` (run from `admin-frontend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `ADM-6` — `ADM-4` stays retired and must never be reissued), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers (DB, Backend, client-frontend) must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `client-portal-integration-admin-fe`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-portal-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
