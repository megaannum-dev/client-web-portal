# 015 — End-of-Day Exception Report · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/015-eod-exception-report-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `<parent-branch>-fe` — cut from the current/parent branch and merged back into it (human owns the merge). See `templates/implementation_details.md` §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/015-eod-exception-report-fe.md` |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/015-eod-exception-report-db.md`, `docs/execution-schedules/015-eod-exception-report-be.md` |
| Prompt (dispatch harness) | `docs/prompts/015-eod-exception-report-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] The frozen seam (impl doc §7) is agreed and matches the proposal § 4 verbatim.
- [ ] `NEXT_PUBLIC_API_BASE_URL` / `id_token` cookie flow already works for other MOBO screens (confirmed via the working Trade Reconciliation page) — no new auth plumbing needed.
- [ ] Layer branch `<parent-branch>-fe` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Database or Backend schedules. It builds against the frozen wire contract (impl doc § 7) and can develop against a mocked `apiClient` response before the Backend branch merges — full live round-trip verification (§ 10) is the one checkpoint that needs a reachable Backend, and is called out explicitly as a human-verified step, not an automated wave gate.

**Exit signal:** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against the parent branch. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| FE-1 | — | root — endpoints + server fetch functions, no internal dependency |
| FE-4 | — | root — `EodReportView` types, no internal dependency |
| FE-2 | FE-1 | server action boundary wraps the fetch functions FE-1 creates |
| FE-6 | FE-2 | print route calls the same `getEodReport` action FE-2 exposes, server-side |
| FE-3 | FE-2, FE-4 | hook calls the action (FE-2) and is typed against `EodReportView` (FE-4) |
| FE-5 | FE-3 | page cutover consumes the `useEodReport` hook FE-3 exports |

**Graph invariants:** no cycles. Every edge is between units in this same layer.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | FE-1, FE-4 | yes (2 units, 2 parallel dispatches) | — |
| W2 | FE-2 | no (single unit) | W1 committed |
| W3 | FE-3, FE-6 | yes (2 units, 2 parallel dispatches) | W2 committed |
| W4 | FE-5 | no (single unit) | W3 committed |
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
| FE-1 | impl §6.FE-1 — endpoints + server fetch functions | `modify: admin-frontend/server/endpoints.ts`, `modify: admin-frontend/server/mobo/index.ts` | commit exists on layer branch |
| FE-4 | impl §6.FE-4 — `EodReportView` types | `create: admin-frontend/lib/mobo/eod-types.ts` | commit exists on layer branch |

**Barrier before W2:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| FE-2 | impl §6.FE-2 — server action boundary | `create: admin-frontend/app/(roles)/mobo/daily-exception-report/actions.ts` | commit exists on layer branch |

**Barrier before W3:** as above.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| FE-3 | impl §6.FE-3 — `useEodReport` hook | `create: admin-frontend/hooks/api/useEodReport.ts` | commit exists on layer branch |
| FE-6 | impl §6.FE-6 — print route | `create: admin-frontend/app/(roles)/mobo/daily-exception-report/print/page.tsx` | commit exists on layer branch |

**Barrier before W4:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| FE-5 | impl §6.FE-5 — cut over `page.tsx` | `modify: admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` | commit exists on layer branch |

**Barrier before W-final:** as above.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd admin-frontend && npx next lint`
2. **Type-check** — `cd admin-frontend && npx tsc --noEmit`
3. **Unit tests** — `cd admin-frontend && npx vitest run` (impl doc § 8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `cd admin-frontend && npx next build` (W4 only — the full page cutover is the first point the whole route tree must compile together; W1-W3 rely on step 2's `tsc --noEmit` as the smoke check since new files aren't yet wired into a page)

**Human gates:**
- [ ] Before advancing past W-final to PR: the page has been manually verified against a live seeded Backend endpoint — visual parity with the mock-era render, plus a real sign-off + export round-trip (impl § 9's Definition of Done explicitly calls these out as human-verified, not automatable in this layer's own test suite since it never spins up the Backend).
- [ ] The print route has been manually hit directly with a valid `X-Eod-Render-Token` and confirmed to render correctly, ahead of the Backend layer's `ChromiumRenderer` deployment gate.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:** empty for every wave.
- W1: FE-1 touches `server/endpoints.ts` + `server/mobo/index.ts`; FE-4 touches `lib/mobo/eod-types.ts` — no overlap.
- W2: FE-2 alone.
- W3: FE-3 creates `hooks/api/useEodReport.ts`; FE-6 creates `print/page.tsx` — no overlap.
- W4: FE-5 alone.

**Every wave's units are truly parallel-safe** — no serialization needed anywhere in this layer.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID FE-1 through FE-6 has at least one commit on the layer branch.
- [ ] `page.tsx`'s existing helper components (`VolumeTile`, `MonthProgress`, `Ref`, `Mismatch`, `LEG_META`, `LegBlock`, `LegRowView`, `AllClear`, `SignLine`, `buildL1`/`buildL2`/`buildL3`) are unchanged byte-for-byte except the data-sourcing lines and button handlers (confirms FE-5 honored the "no design/layout change" constraint).
- [ ] `admin-frontend/lib/mobo/reconciliation-flow.ts` and `admin-frontend/lib/mobo/reconciliation.ts` are untouched (confirms the Daily Exception Report cutover did not disturb the Trade Reconciliation / recon-overview screens' still-mock-backed seams).
- [ ] The print route (`print/page.tsx`) is not referenced from `components/sidebar/SidebarNav.tsx` or any page-config listing.
- [ ] No `any` types added; imports resolve across the whole new file set.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8: `cd admin-frontend && npx vitest run`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see § 9 below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `FE-7`), then extend § 3/§ 4/§ 5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's § 7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] The two human gates in § 6 confirmed (live Backend round-trip; print route manual check).
- [ ] PR opened against parent branch.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
