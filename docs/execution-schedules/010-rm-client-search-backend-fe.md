# 010 — RM Client Book: Live Search Against `client_profiles` · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/010-rm-client-search-backend-fe.md` (the impl doc). This file does not restate the spec.
> Layer: Frontend — **one layer per file.**
> Branch: `searchbar-client-book-fe` — cut from parent `searchbar-client-book` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/010-rm-client-search-backend-fe.md` |
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 2 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/010-rm-client-search-backend-be.md` |
| Prompt (dispatch harness) | `docs/prompts/010-rm-client-search-backend-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-10` (definitions live in the impl doc — not restated here). `FE-9`/`FE-10` were added after the initial cut of this schedule (route consolidation + explicit field presentation) — this revision folds them into the wave graph.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Parent branch `searchbar-client-book` at commit `655b625` or later.
- [ ] `useAuth().portalUser` exposes `firebase_uid` (verify `admin-frontend/types/portal.ts` + `admin-frontend/components/auth/AuthProvider.tsx`) — if absent, this is folded into `FE-4`'s diff per impl doc §6 FE-4, not treated as a blocking precondition.
- [ ] Impl doc §7 seam is a verbatim copy of the proposal's §4.1 — checked before dispatch.
- [ ] Layer branch `searchbar-client-book-fe` cut from `searchbar-client-book` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Backend schedule. The seam is frozen in the proposal and re-pinned in impl doc §7; the Backend layer may run before, after, or concurrent with this one. Where a unit needs a live backend to observe network behavior (e.g. FE-3's "watch network tab" verification), it may run against a mocked `apiClient` response shaped per §7 instead of a running Backend branch.

**Exit signal:** every unit in §3 committed on `searchbar-client-book-fe`, W-final green, PR opened against `searchbar-client-book`. The orchestrator does not push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — config module has no dependency on DTOs or hooks |
| `FE-2` | — | root — DTO types + mapper + endpoints entry, self-contained |
| `FE-8` | — | root — mock overlay rewrite touches only `lib/mock/rm-data.ts`, independent of the fetch chain |
| `FE-9` | — | root — pure route move + link fixes + config cleanup; touches no file any other unit creates, and reads no DTO/hook. Deliberately a root so it lands in the **first** wave, ahead of the data-wiring units, per the explicit "fix routes first" instruction. |
| `FE-3` | `FE-2` | server fetchers import `ClientListDTO`/`ClientListItemDTO` and the new `ENDPOINTS.RM.*` entries from `FE-2`. **Not** dependent on `FE-9` — `FE-3` creates `client-info/[id]/actions.ts` directly at the final location (brand-new file, nothing to relocate); it shares that new directory with `FE-9`'s relocated `page.tsx` without needing to run after it. |
| `FE-4` | `FE-2`, `FE-3` | hook imports `dtoListToRows` (`FE-2`) and calls the `getClients` action (`FE-3`) |
| `FE-5` | `FE-2`, `FE-3`, `FE-4` | hook imports `dtoToRow` (`FE-2`), calls the `getClient` action (`FE-3`), and reads `getCachedById` exported from `useClientBook` (`FE-4`) |
| `FE-6` | `FE-1`, `FE-4`, `FE-9` | page imports `ADV_FIELDS` (`FE-1`) and consumes `useClientBook` (`FE-4`); its `openClient` push target is `/rm/client-info/${id}`, which only exists once `FE-9` has moved the detail page there — committing this unit before `FE-9` would link to a route that doesn't exist yet |
| `FE-7` | `FE-5`, `FE-8`, `FE-9` | page consumes `useClient` (`FE-5`) and `getMockOverlay` (`FE-8`); operates on `client-info/[id]/page.tsx`, which `FE-9` must have already created (via the move) before this unit's diff makes sense |
| `FE-10` | `FE-7` | restructures the same file `FE-7` just wired to live data — needs the real `ClientRow` fields already flowing in before regrouping them into Basic Info / Subscription Info |

**Graph invariants:** no cycles; all edges intra-Frontend; absence of an edge = safe to run in parallel (`FE-1`/`FE-2`/`FE-8`/`FE-9` in W1; `FE-5`/`FE-6` share W4 — see §4).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-2`, `FE-8`, `FE-9` | yes (4 parallel dispatches) | — |
| W2 | `FE-3` | no (single unit) | W1 committed |
| W3 | `FE-4` | no (single unit) | W2 committed |
| W4 | `FE-5`, `FE-6` | yes (2 parallel dispatches) | W3 committed |
| W5 | `FE-7` | no (single unit) | W4 committed |
| W6 | `FE-10` | no (single unit) | W5 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W6 committed |

`FE-9` (route consolidation) sits in W1 — the earliest possible wave — which is exactly what "fix the routes before wiring the data" means in DAG terms: every data-wiring unit that touches the detail page (`FE-6`, `FE-7`) now has an edge to `FE-9`, so the topological sort *forces* `FE-9` to commit before them regardless of dispatch order. No manual "phase 0" bookkeeping is needed — the dependency graph enforces the sequencing on its own.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W6, W_final]:
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
| `FE-1` | impl §6 FE-1 — `client-search-fields.ts` config module | `create: lib/rm/client-search-fields.ts` | commit exists on layer branch |
| `FE-2` | impl §6 FE-2 — DTO types, `ClientRow`, mapper, endpoints entry | `create: lib/rm/clients.ts`, `modify: server/endpoints.ts` | commit exists on layer branch |
| `FE-8` | impl §6 FE-8 — mock overlay: hash-based lookup by real id | `modify: lib/mock/rm-data.ts` | commit exists on layer branch |
| `FE-9` | impl §6 FE-9 — route consolidation: `client-detail/[id]` → `client-info/[id]` | `delete: app/(roles)/rm/client-detail/[id]/page.tsx`; `create: app/(roles)/rm/client-info/[id]/page.tsx`; `modify: app/(roles)/rm/client-info/page.tsx`; `modify: components/rm/OnboardingBoard.tsx`; `modify: lib/pages-config.ts`; `modify: lib/pages.check.ts` | commit exists on layer branch |

**Barrier before W2:** all four rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 — server fetchers + action wrappers | `create: server/rm/index.ts`, `create: app/(roles)/rm/client-info/actions.ts`, `create: app/(roles)/rm/client-info/[id]/actions.ts` | commit exists on layer branch |

**Barrier before W3:** row above shows a commit AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-4` | impl §6 FE-4 — `useClientBook` hook with module-scope cache | `create: hooks/api/useClientBook.ts`, `modify (if needed): types/portal.ts` | commit exists on layer branch |

**Barrier before W4:** row above shows a commit AND wave-gate checks pass.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6 FE-5 — `useClient(id)` hook, cache-hit-first + sibling-endpoint fallback | `create: hooks/api/useClient.ts` | commit exists on layer branch |
| `FE-6` | impl §6 FE-6 — refactor `client-info/page.tsx` to consume live data | `modify: app/(roles)/rm/client-info/page.tsx` | commit exists on layer branch |

**Barrier before W5:** both rows above show a commit AND wave-gate checks pass.

### Wave W5
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-7` | impl §6 FE-7 — wire live data into `client-info/[id]/page.tsx` via `useClient` | `modify: app/(roles)/rm/client-info/[id]/page.tsx` | commit exists on layer branch |

**Barrier before W6:** row above shows a commit AND wave-gate checks pass.

### Wave W6
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-10` | impl §6 FE-10 — detail sub-page: explicit Basic Info / Subscription Info groups | `modify: app/(roles)/rm/client-info/[id]/page.tsx`, `modify: lib/mock/rm-data.ts` (drop `clientId`) | commit exists on layer branch |

**Barrier before W-final:** row above shows a commit AND wave-gate checks pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `npx next lint` (confirmed sufficient — this repo has no separate formatter; `next lint` is the single lint/format gate).
2. **Type-check** — `npx tsc --noEmit -p tsconfig.json`
3. **Unit tests** — no automated runner configured in this repo (impl doc §8.1); at each wave boundary, perform the manual verification rows from impl §8.2 that correspond to units already committed (e.g. after W1, `FE-1`'s, `FE-8`'s, and `FE-9`'s manual checks apply — including running `npx tsx admin-frontend/lib/pages.check.ts` for `FE-9`).
4. **Build / import smoke** — `npx next build` (or the dev-server preview boot, per the repo's verify skill, if a full production build is too slow to run at every wave boundary)

**Human gates:**
- [ ] none — fully automated to PR. No backend cutover or data migration in this layer; verification against a live backend (impl §8.2 "Preview" rows) can substitute a mocked `apiClient` response until the Backend layer's branch is available.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none found — see below |

**The map is empty for every wave.** W1's four units (`FE-1`, `FE-2`, `FE-8`, `FE-9`) touch disjoint files — `FE-9`'s six files (`client-detail/[id]/page.tsx` delete, `client-info/[id]/page.tsx` create, `client-info/page.tsx` one-line, `OnboardingBoard.tsx` one-line, `pages-config.ts`, `pages.check.ts`) do not overlap with `FE-1`/`FE-2`/`FE-8`'s files. `FE-3` (W2) also lands in the new `client-info/[id]/` directory (`actions.ts`) but that is a different file from `FE-9`'s `page.tsx` in the same directory — still no collision, and they're in different waves regardless. W4's two units (`FE-5`, `FE-6`) touch `hooks/api/useClient.ts` and `app/(roles)/rm/client-info/page.tsx` respectively — disjoint. All units are truly parallel-safe within their waves.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `FE-1`..`FE-10` has at least one commit on `searchbar-client-book-fe`.
- [ ] `lib/rm/client-search-fields.ts`, `lib/rm/clients.ts`, `hooks/api/useClientBook.ts`, `hooks/api/useClient.ts`, `server/rm/index.ts`, `app/(roles)/rm/client-info/actions.ts`, `app/(roles)/rm/client-info/[id]/actions.ts`, `app/(roles)/rm/client-info/[id]/page.tsx` all exist as specified.
- [ ] `app/(roles)/rm/client-detail/` does **not** exist anywhere in the tree (fully deleted by `FE-9`).
- [ ] `lib/pages-config.ts` no longer defines `rm.client-detail` in `PageId`, `PAGES`, or `ROLE_PAGES.RM`.
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` exits 0.
- [ ] `app/(roles)/rm/client-info/page.tsx` no longer imports `RM_CLIENTS`, `getClientDetail`, or `KNOWN_CLIENT_IDS` from `@/lib/mock/rm-data`; its `openClient` pushes to `/rm/client-info/${id}`.
- [ ] `components/rm/OnboardingBoard.tsx`'s `openProfile` pushes to `/rm/client-info/${id}`, not `/rm/client-detail/${id}`.
- [ ] `app/(roles)/rm/client-info/[id]/page.tsx` calls `useClient(id)` and `getMockOverlay`, not `getClientDetail`; renders a "Basic Info" group (9 fields, "ID Info" always blank) and a "Subscription Info" group (IB Account + Subscribed Models).
- [ ] `lib/mock/rm-data.ts` no longer exports `RM_CLIENTS`, `CLIENT_EXTRA`, `KNOWN_CLIENT_IDS`, `getClientDetail`, or `clientId` (on `MockOverlay`); `RENEWALS_DUE`/`ONBOARDING_QUEUE`/`REQUEST_TICKETS`/KYC pipeline/`SUB_CLIENTS` exports are untouched.
- [ ] No `any` types introduced in the new files (`lib/rm/*.ts`, `hooks/api/useClient*.ts`).
- [ ] `npx tsc --noEmit` reports zero errors across the whole project (confirms no dangling reference to a removed mock export or the deleted route elsewhere in the app).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- No automated suite exists for this layer (impl doc §8.1). In its place: run through every row of impl doc §8.2's manual-verification matrix (now `FE-1`..`FE-10`) against the running app (mocked or live backend), recording pass/fail per unit.
- Reports pass/fail per unit and, for any failure, the exact reproduction step from §8.2.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (e.g. `FE-11`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — the Backend layer must acknowledge the seam change (via the proposal) before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W6 committed on `searchbar-client-book-fe`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `searchbar-client-book`.
- [ ] Orchestrator has not pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
