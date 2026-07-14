# 011 — Post-Trade Allocation · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` (the impl doc). This file does not restate the spec.
> Layer: Frontend — **one layer per file.**
> Branch: `post-trade-allocation-integration-fe` — cut from parent `post-trade-allocation-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` |
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md`, `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md` |
| Prompt (dispatch harness) | `docs/prompts/011-2026-07-13-post-trade-allocation-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §7 seam (the §4.1 wire contract) is a verbatim copy of the proposal — checked before dispatch. This layer builds against that DTO shape; it does not import or run Backend code.
- [ ] Layer branch `post-trade-allocation-integration-fe` cut from `post-trade-allocation-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Database or Backend schedules. The seam is frozen in the proposal and re-pinned in impl doc §7; this layer's own tests fake the seam (canned DTO responses) rather than calling a real backend, so it is fully buildable and testable in isolation.

**Exit signal:** every unit in §3 committed on `post-trade-allocation-integration-fe`, W-final green, PR opened against `post-trade-allocation-integration`. The orchestrator does not push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — new transport module `server/mobo/index.ts` + `MOBO` endpoints block; independent of the mapper/type work |
| `FE-2` | `FE-1` | server-action wrappers import the typed functions `FE-1` defines in `server/mobo` |
| `FE-3` | `FE-2`, `FE-4` | the hook calls the actions (`FE-2`) and the mapper (`FE-4`) |
| `FE-4` | — | root — DTO→view mapper + `lib/mobo/types.ts` rename (`delegated → allocated`); independent of transport |
| `FE-5` | `FE-4` | the two component read sites must compile against the already-renamed type field |
| `FE-6` | `FE-3`, `FE-4`, `FE-5` | the page wiring consumes the hook (`FE-3`), the mapper (`FE-4`), and requires the components it renders (`FE-5`) to already compile against the renamed field |

**Graph invariants:** no cycles; all edges intra-Frontend. `FE-1` and `FE-4` are true roots and land in the same wave; `FE-2` and `FE-5` are each single-parent children of a different root and also land in the same wave, subject to §7 (no collision found between them).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-4` | yes — no shared files (§7) | — |
| W2 | `FE-2`, `FE-5` | yes — no shared files (§7) | W1 committed |
| W3 | `FE-3` | no (single unit) | W2 committed |
| W4 | `FE-6` | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 — `server/mobo/index.ts` + `MOBO` endpoints block | `create: admin-frontend/server/mobo/index.ts`, `modify: admin-frontend/server/endpoints.ts` | commit exists on layer branch |
| `FE-4` | impl §6 FE-4 — `lib/mobo/allocation.ts` → DTO→view mapper; `lib/mobo/types.ts` rename | `modify: admin-frontend/lib/mobo/allocation.ts`, `modify: admin-frontend/lib/mobo/types.ts` | commit exists on layer branch |

**Barrier before W2:** both rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 — server-action wrappers (`actions.ts`) | `create: admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts` | commit exists on layer branch |
| `FE-5` | impl §6 FE-5 — fix the two `.delegated` component read sites | `modify: admin-frontend/components/mobo/allocation/Panels.tsx`, `modify: admin-frontend/components/mobo/allocation/StackedBarChart.tsx` | commit exists on layer branch |

**Barrier before W3:** both rows above show a commit AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 — `hooks/api/usePostTradeAllocation.ts` | `create: admin-frontend/hooks/api/usePostTradeAllocation.ts` | commit exists on layer branch |

**Barrier before W4:** row above shows a commit AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-6` | impl §6 FE-6 — page wiring: hook, Sync button, `DateControl` from `/runs`, delete mock | `modify: admin-frontend/app/(roles)/mobo/post-trade-allocation/page.tsx`, `modify: admin-frontend/components/mobo/allocation/Panels.tsx` (`DateControl` props), `delete (block only): admin-frontend/lib/mock/mobo-data.ts` (`PTA_MODELS`/`PTA_CLIENTS`/`PTA_UNITS` + their type import) | commit exists on layer branch |

**Barrier before W-final:** row above shows a commit AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd admin-frontend && npm run lint`
2. **Type-check** — `cd admin-frontend && npx tsc --noEmit`
3. **Unit tests** — `cd admin-frontend && npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `cd admin-frontend && npm run build`

**Human gates:**
- [ ] none — fully automated to PR. This layer has no live-DB or live-API dependency; it tests against faked seam responses (impl doc §8).

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | not applicable — every wave's units touch disjoint file sets. `FE-1`/`FE-4` (W1) and `FE-2`/`FE-5` (W2) each touch entirely different files from their wave-mate. |

**Note on `Panels.tsx` across waves (not a same-wave collision):** `FE-5` (W2) edits `Panels.tsx` for the `.delegated → allocated` read-site fix; `FE-6` (W4) edits the same file again for `DateControl` props. This is safe because the two edits are in different waves, separated by hard barriers (W3 in between) — `FE-6`'s dispatch always starts from a tree that already has `FE-5`'s commit, so there is no simultaneous-write race. No action needed beyond respecting the wave order already fixed in §4.

**The map is empty for every wave** — no two units in the same wave ever touch the same file.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `FE-1`..`FE-6` has at least one commit on `post-trade-allocation-integration-fe`.
- [ ] `server/mobo/index.ts` exists; `server/endpoints.ts` has a `MOBO` block with `PTA`/`PTA_RUNS`/`PTA_RUN` keys.
- [ ] `lib/mobo/types.ts` has no remaining `delegated` field anywhere (grep for `\.delegated\b` across `admin-frontend/` returns zero hits).
- [ ] `lib/mobo/allocation.ts` contains no pro-rata math (no division/multiplication combining `traded`/`multiplier`/`unitsTotal` client-side) — it is a pure mapper.
- [ ] `lib/mock/mobo-data.ts` no longer exports `PTA_MODELS`/`PTA_CLIENTS`/`PTA_UNITS`.
- [ ] `page.tsx` uses `usePostTradeAllocation` (not a synchronous `loadPostTradeAllocation()` call) and renders a Sync control wired to the hook's `sync()`.
- [ ] No component under `components/mobo/allocation/` changed its rendered DOM structure/props beyond the `delegated → allocated` field rename and the `DateControl` data source — no visual/layout change (proposal's "no design/layout change" constraint).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `npx vitest run` (from `admin-frontend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `FE-7`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — the Database and Backend layers must acknowledge the seam change (via the proposal) before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `post-trade-allocation-integration-fe`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `post-trade-allocation-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
