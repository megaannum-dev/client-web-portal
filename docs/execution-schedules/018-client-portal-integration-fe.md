# 018 — Client Portal ↔ Backend Integration · Execution Schedule — Frontend (client-frontend)

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/018-client-portal-integration-fe.md` (the impl doc). This file does not restate the spec — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend (client-frontend) — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-portal-integration-fe` — cut from parent `client-portal-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/018-client-portal-integration-fe.md` |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 3 — Frontend (client-frontend) |
| Sibling layer schedules | `docs/execution-schedules/018-client-portal-integration-db.md`, `docs/execution-schedules/018-client-portal-integration-be.md`, `docs/execution-schedules/018-client-portal-integration-admin-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/018-client-portal-integration-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-14` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green: Backend layer's `/client/*` and `/rm/tickets*` routes reachable at `NEXT_PUBLIC_API_BASE_URL` and matching impl doc §7.1 exactly (status codes included); the frozen seam in proposal §4 is agreed (it is — impl doc §7 is copied from it verbatim).
- [ ] Layer branch `client-portal-integration-fe` cut from parent `client-portal-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; the DB, Backend, and admin-frontend layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order.

**Exit signal (what this run produces):** every unit FE-1…FE-14 committed on the layer branch, the final validation wave green, PR opened against `client-portal-integration`. The orchestrator does not push, does not merge — the human owns that.

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two FE-* units in this layer's impl doc. No edge references a sibling layer's unit ID; cross-layer coupling is resolved by the frozen seam in impl doc §7.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root: portfolio data-access + hooks |
| `FE-2` | `FE-1` | consumes `usePortfolio()`/`usePortfolioHistory()` |
| `FE-3` | `FE-1` | Subscribed Models table reads `usePortfolio().positions` |
| `FE-4` | — | root: profile data-access + hooks |
| `FE-5` | — | root: KYC data-access + hooks (parallel-safe with FE-4; shares `profile/page.tsx` — see §7 collision) |
| `FE-6` | — | root: documents data-access + hooks |
| `FE-7` | `FE-6` | reuses `useDocuments()` |
| `FE-8` | `FE-1`, `FE-3` | Redemption picker reads `usePortfolio().positions`; Allotment picker reads `useRecommendedModels()` (introduced by FE-3) |
| `FE-9` | `FE-8` | shares `ClientRequestDTO`/`TicketStatus` from `lib/api/tickets.ts` (introduced by FE-8) |
| `FE-10` | `FE-1`, `FE-11` | overview stat cards read `usePortfolio()`; events panel reads `useClientEvents()` (renamed by FE-11) |
| `FE-11` | — | root: rename `useOnboardingEvents` → `useClientEvents`; events page rework |
| `FE-12` | `FE-4` | header RM contact reads `useProfile().assigned_rm` |
| `FE-13` | `FE-1`, `FE-2`, `FE-3`, `FE-4`, `FE-5`, `FE-6`, `FE-7`, `FE-8`, `FE-9`, `FE-10`, `FE-11` | i18n `mock.*` namespace cleanup requires every page that reads it (`overview`, `events`) to have already dropped those lookups; impl doc states dependency as "FE-1 through FE-11" verbatim |
| `FE-14` | every other unit (`FE-1`…`FE-13`) | contraction step — mock layer deletion; impl doc states this must be the last commit on the branch |

**Graph invariants:**
- No cycles.
- Every edge is between units in this layer.
- An edge means "must be committed before the dependent starts."
- Absence of an edge = safe to run in parallel (subject to the shared-file protocol in §7).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-4`, `FE-5`, `FE-6`, `FE-11` | yes, except `FE-4`/`FE-5` serialize on a shared file (§7) | — |
| W2 | `FE-2`, `FE-3`, `FE-7`, `FE-10`, `FE-12` | yes, except `FE-2`/`FE-3` serialize on a shared file (§7) | W1 committed |
| W3 | `FE-8` | n/a (single unit) | W2 committed |
| W4 | `FE-9` | n/a (single unit) | W3 committed |
| W5 | `FE-13` | n/a (single unit) | W4 committed |
| W6 | `FE-14` | n/a (single unit) | W5 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W6 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W6, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent (subject to §7 serialization)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-portal-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6.FE-1 — Portfolio data-access + hooks | `create: lib/api/portfolio.ts`, `create: lib/hooks/usePortfolio.ts`, `create: lib/hooks/usePortfolioHistory.ts`, `delete: lib/hooks/useSubscriptions.ts` | commit exists on layer branch |
| `FE-4` | impl §6.FE-4 — Profile: personal info + PATCH | `create: lib/api/profile.ts`, `create: lib/hooks/useProfile.ts`, `modify: app/(dashboard)/profile/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json` | commit exists on layer branch |
| `FE-5` | impl §6.FE-5 — Renewal doc card, AML deletion, Supporting Documents shelved | `create: lib/api/kyc.ts`, `create: lib/hooks/useKyc.ts`, `modify: app/(dashboard)/profile/page.tsx`, `delete: components/KycProvider.tsx` | commit exists on layer branch |
| `FE-6` | impl §6.FE-6 — Legal reports from directory listing | `create: lib/api/documents.ts`, `create: lib/hooks/useDocuments.ts`, `modify: app/(dashboard)/documents/legal-reports/page.tsx` | commit exists on layer branch |
| `FE-11` | impl §6.FE-11 — Events page on server feed alone | `modify: lib/hooks/useOnboardingEvents.ts` (rename export to `useClientEvents`), `modify: app/(dashboard)/events/page.tsx`, `delete: lib/hooks/useEventItems.ts` | commit exists on layer branch |

**Barrier before W2:** all rows above must show a commit on the layer branch AND wave-gate checks (§6) pass. `FE-4`/`FE-5` must serialize per §7 before the barrier is declared closed.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6.FE-2 — Portfolio charts and stat cards on real data | `modify: app/(dashboard)/portfolio/page.tsx` | commit exists on layer branch |
| `FE-3` | impl §6.FE-3 — Model attribute rework: Subscribed + Recommended tables | `create: lib/api/models.ts`, `create: lib/hooks/useRecommendedModels.ts`, `modify: app/(dashboard)/portfolio/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json` | commit exists on layer branch |
| `FE-7` | impl §6.FE-7 — Monthly reports + FAB on the same documents hook | `modify: app/(dashboard)/documents/monthly-reports/page.tsx`, `modify: components/ui/FloatingActionButton.tsx` | commit exists on layer branch |
| `FE-10` | impl §6.FE-10 — Overview stat cards + latest-events panel | `modify: app/(dashboard)/overview/page.tsx` | commit exists on layer branch |
| `FE-12` | impl §6.FE-12 — Header RM contact | `modify: components/header/HeaderActions.tsx` | commit exists on layer branch |

**Barrier before W3:** all rows above must show a commit on the layer branch AND wave-gate checks (§6) pass. `FE-2`/`FE-3` must serialize per §7 before the barrier is declared closed.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-8` | impl §6.FE-8 — RaiseTicketModal posts to the server | `create: lib/api/tickets.ts`, `modify: components/ui/RaiseTicketModal.tsx` | commit exists on layer branch |

**Barrier before W4:** row above committed; wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-9` | impl §6.FE-9 — Request history + overview recent requests | `create: lib/api/requests.ts` (re-exports `ClientRequestDTO`/`fetchRequests`), `create: lib/hooks/useRequests.ts`, `modify: app/(dashboard)/portfolio/page.tsx`, `modify: app/(dashboard)/overview/page.tsx`, `delete: lib/hooks/useAllotmentRequests.ts` | commit exists on layer branch |

**Barrier before W5:** row above committed; wave-gate checks (§6) pass. Note: `FE-9` touches `portfolio/page.tsx` and `overview/page.tsx`, both already modified by earlier waves (`FE-2`/`FE-3` and `FE-10` respectively) — safe because those waves are already closed and committed; see §7 for the cross-wave note.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-13` | impl §6.FE-13 — Dead route, dead i18n namespace, stale type cleanup | `delete: app/(dashboard)/support/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json`, `modify: types/portal.ts` | commit exists on layer branch |

**Barrier before W6:** row above committed; wave-gate checks (§6) pass.

### Wave W6
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-14` | impl §6.FE-14 — Delete the mock layer | `delete: lib/mock/data.ts`, `delete: lib/mock/store.ts`, `delete: components/MockStoreInit.tsx`, `modify: app/(dashboard)/layout.tsx` | commit exists on layer branch |

**Barrier before W-final:** row above committed; wave-gate checks (§6) pass. Per impl doc §9, `FE-14` must be the last unit committed on this branch — no unit may be dispatched after it in any feature wave.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave (impl doc §3.2, run from `client-frontend/`):

1. **Lint / format** — `npm run lint`
2. **Type-check** — `npx tsc --noEmit`
3. **Unit tests** — `npm run test` (only tests for units already committed need pass at this point)
4. **Build / import smoke** — `npm run build`

**Human gates:**
- [ ] none — fully automated to PR. The proposal's step-3 visual-confirmation gate (side-by-side page comparison, impl doc §9) is scheduling metadata external to this run, not a wave barrier here.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flags any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `app/(dashboard)/profile/page.tsx` | `FE-4`, `FE-5` | serialize: dispatch `FE-4` first, then `FE-5` after `FE-4` commits (still within W1) — impl doc §6.FE-5 explicitly calls these "adjacent commits on the same file, not concurrent branches" |
| W2 | `app/(dashboard)/portfolio/page.tsx` | `FE-2`, `FE-3` | serialize: dispatch `FE-2` first, then `FE-3` after `FE-2` commits (still within W2) — no ordering is stated in the impl doc, so this schedule picks `FE-2` (charts/stat cards) before `FE-3` (model tables) as they touch disjoint sections of the same file |
| W2 | `public/locales/en/translation.json`, `public/locales/zh-TW/translation.json` | `FE-3` only (no contender in W2 — `FE-4`'s edits to these files already closed in W1) | none — not a collision, listed for traceability only |

**If the map is empty for a wave, all its units are truly parallel-safe.** W3, W4, W5, W6 each have a single unit — no intra-wave collision is possible.

**Cross-wave note (not a same-wave collision, no protocol action needed):** `FE-9` (W4) modifies `portfolio/page.tsx` and `overview/page.tsx`, both already touched by earlier, already-closed waves (`FE-2`/`FE-3` in W2, `FE-10` in W2). This is safe by construction — the wave barrier guarantees W2's commits are on the branch before W4 dispatches — but `FE-9`'s agent must `git pull` (no rebase needed, same branch, sequential waves) before editing.

**Rebase discipline within a wave** (when serializing on a shared file):
1. Contending agent B waits until A's commit is on the layer branch.
2. B runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If B's rebase conflicts, B resolves, re-runs unit tests, then commits. B does not push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] Every unit ID `FE-1`…`FE-14` has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified/deleted as specified).
- [ ] Public surface (impl §5 modules) matches impl doc — imports resolve, no dangling references to removed symbols.
- [ ] `rg "MOCK_"` and `rg "localStorage"` (outside theme/locale prefs) return nothing under `client-frontend/{app,components,lib}` (impl §9 "No mock left").
- [ ] No money/status arithmetic exists in any `.tsx` beyond formatting (impl §9 "Logic lives once").
- [ ] Impl doc §7 (frozen seam) matches the proposal's §4 verbatim.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `npm run test` (= `vitest run`, run from `client-frontend/`).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does not modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `FE-15`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (the frozen seam / cross-layer contract) suspends this run — the DB, Backend, and admin-frontend layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W6 committed on `client-portal-integration-fe`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-portal-integration`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
