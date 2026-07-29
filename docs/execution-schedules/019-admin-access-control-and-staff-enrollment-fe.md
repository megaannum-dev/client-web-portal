# 019 — Admin Access Control & Staff Enrollment · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Frontend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs. Note this layer spans **two apps**: `admin-frontend/` (all of the access/console work) and `client-frontend/` (the register purge only).
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-fe` — cut from parent `claude/admin-pages-backend-proposal-f0c9fc` and merged back into it. **The human owns the merge** (and the parent's merge into `main`).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 3 — Frontend" |
| Sibling layer schedules | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md`, `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md` |
| Prompt (dispatch harness) | `docs/prompts/019-admin-access-control-and-staff-enrollment-fe.md` *(not written yet — intended path)* |

**Unit ID space this schedule sequences:** `FE-1 … FE-17` (definitions live in the impl doc — do not restate them here). `FE-17` is **conditional** (see §2).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green: the proposal's § 4 seam is agreed and unchanged; `admin-frontend` and `client-frontend` both install clean and their existing gates pass on the parent branch; `tsx` is available for `npx tsx admin-frontend/lib/pages.check.ts`.
- [ ] **Information precondition (impl §2, proposal C-3 / Q-5 / Execution step 3):** the Backend layer's Q-5 test outcome — whether `generate_password_reset_link` works over a passwordless identity, or the `generate_sign_in_with_email_link` fallback was selected — is **recorded and readable** in the Backend impl doc. This is a precondition on *information*, **not** on a sibling branch's state: no sibling code is imported, stood up, merged, or waited on. The recorded answer sets this run's unit set (below); nothing else in the schedule reads it.
- [ ] Layer branch `claude/admin-pages-backend-proposal-f0c9fc-fe` cut from the parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Conditional unit FE-17 — how the two answers are handled.** FE-17 sits in **W1**, where it shares no file with any other unit and has no dependents.

- **Q-5 = `generate_password_reset_link` succeeded** → the unit set is exactly `FE-1 … FE-16`. FE-17 is **dropped**: strike its row from W1 and from §5/§7, and record the drop against impl §9's checkbox ("FE-17 explicitly recorded as dropped because Q-5 selected the reset link"). W1 still dispatches `FE-1` and `FE-16` in parallel, no other wave, edge, barrier or gate changes, and no unit is re-assigned.
- **Q-5 = the `generate_sign_in_with_email_link` fallback was selected** → the unit set is `FE-1 … FE-17`. FE-17 dispatches in W1 as a third parallel unit and must be committed before the W1 barrier like any other.
- If the outcome is **not yet recorded**, the run does not start — dispatching W1 without it would either ship a route no link ever reaches or leave the set-password landing page missing.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order, and no schedule step here assumes one.

**Deferred to the downstream cross-layer step (not a wave here).** The proposal's **phase 5** smoke test needs a live backend and real mail, and it sits *after* this layer's PR. Every unit in this run verifies against impl §8's `vi.mock` fakes of the §7 seam only. The units whose verification is genuinely mock-bounded, and whose live confirmation is therefore deferred to phase 5, are: **FE-7** (real route shapes/status codes), **FE-9** and **FE-10** (a real stale-publish 409 from a live matrix), **FE-12** (a set-password mail actually arriving), **FE-15** (a real RM book/ticket handover), and **FE-17** if in scope (a real Firebase email link). No wave gate may claim any of these were verified end to end; the wave gate proves only the mocked behaviour.

**Exit signal (what this run produces):** every unit in §3 committed on the layer branch (FE-17 committed **or** recorded as dropped), the final validation wave green, PR opened against the parent branch. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two `FE-*` units. No edge references a `DB-*` or `BE-*` id; the cross-layer contract is impl §7, and this layer builds against that contract, not against a sibling's progress. The Q-5 answer is an entry precondition (§2), not an edge.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — the `AccessLevel` vocabulary everything else is written in |
| `FE-2` | `FE-1` | the derived catalog and its level maps are written in the new vocabulary |
| `FE-3` | `FE-2`, `FE-5`, `FE-7` | asserts over the derived catalog (FE-2), over the helpers FE-5 introduces/removes, and imports the `MatrixOut` type FE-7 declares |
| `FE-4` | `FE-1` | the hook's return type is FE-1's `AccessLevel`, its map FE-1's `GrantMap` |
| `FE-5` | `FE-1`, `FE-4` | needs `grants` on `PortalUser` (FE-4) before the sidebar/guard can read it; deletes symbols FE-1 first re-spelled |
| `FE-6` | `FE-4` | all 32 gate sites call `useCanEdit` from FE-4 |
| `FE-7` | `FE-1` | its DTOs are typed with FE-1's `AccessLevel` |
| `FE-8` | `FE-1`, `FE-2`, `FE-7` | wire-shaped console types: FE-1's `Level`, FE-2's re-keyed catalog, FE-7's DTO source |
| `FE-9` | `FE-2`, `FE-7`, `FE-8` | impl §3.2's documented exception — the store cannot be API-backed (nor the mock deleted) before the catalog, the action module and the DTO types exist |
| `FE-10` | `FE-7`, `FE-9` | `publish` calls FE-7's `publishMatrix` through the FE-9 store |
| `FE-11` | `FE-8`, **`FE-12`** | FE-8 supplies the `EnrollDraft` without `pw`/`expiry`. The second edge is impl §6 FE-11's own ordering note promoted to an edge: FE-11 deletes `lib/admin/password.ts`, whose other two importers are removed by FE-12, so FE-11 must land **second** or the branch is red at the barrier |
| `FE-12` | `FE-8`, `FE-9` | needs the DTO types and `sendLink(uid)` on the store |
| `FE-13` | `FE-8`, `FE-9` | the relocated ledger reads `OverrideOut` off the store |
| `FE-14` | `FE-2`, `FE-8`, `FE-9` | `ovr` keyed by `PageId` (FE-2), `EnrollDraft.ovrExpiry` (FE-8), `store.enroll` (FE-9) |
| `FE-15` | `FE-8`, `FE-9` | the two counts on `StaffOut` and the two draft fields (FE-8), `updateStaff` (FE-9) |
| `FE-16` | — | root — impl §6 states it touches no file any other unit touches |
| `FE-17` | — | no intra-layer edge. Its `Dependencies:` field names the recorded Q-5 outcome, i.e. §2's information precondition — carried as a precondition, not an edge |

**Graph invariants:**
- No cycles. Verified by the level assignment in §4 (every edge points from a lower wave to a higher one).
- Every edge is between two units in this layer. No `DB-*` / `BE-*` id appears above.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel **unless §7 flags a shared file**; W5's units are edge-light but file-heavy, and §7 governs there.

**Under-specified dependency data found (sequenced to the most defensible reading, not hidden):**
1. **`FE-11`'s `Dependencies:` field carries an ordering note instead of an edge** ("the file's deletion lands with whichever of the two is second"). Left as prose it is a coin flip that can leave `password.ts` deleted while FE-12's importers still reference it. Read as a hard edge `FE-11 → FE-12`, which fixes FE-11 second (W5 sub-batch S2, after FE-12 in S1) and keeps every barrier green.
2. **`FE-8` lists `admin-frontend/components/admin/config/OverridesLedger.tsx`, a path that does not exist until FE-13 creates it** (FE-13 performs the `enroll/` → `config/` move, and runs after FE-8). Read as: FE-8 edits the ledger **at its current path** `admin-frontend/components/admin/enroll/OverridesLedger.tsx`; FE-13, being downstream of FE-8, moves the FE-8 version. §5/§7 use the current path for FE-8.
3. **`FE-17`'s `Dependencies:` field names a test outcome rather than a unit** — correct for the impl doc, but not an edge. Recorded as §2's information precondition; FE-17 therefore has zero in-layer predecessors.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-16`, `FE-17`\* | yes (3 parallel dispatches, or 2 if FE-17 is dropped) | — |
| W2 | `FE-2`, `FE-4`, `FE-7` | yes (3) | W1 committed |
| W3 | `FE-5`, `FE-6`, `FE-8` | yes (3) | W2 committed |
| W4 | `FE-3`, `FE-9` | yes (2) | W3 committed |
| W5 | `FE-10`, `FE-11`, `FE-12`, `FE-13`, `FE-14`, `FE-15` | **no — serialized into sub-batches S1…S5 (§7)**; only S1's two units run concurrently | W4 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W5 committed |

\* `FE-17` only if §2's Q-5 answer selected the email-link fallback. Dropping it removes one row from W1 and changes nothing else.

W1 is as wide as the edges permit: `FE-1` is the only root the rest of the graph hangs off, and `FE-16` / `FE-17` are the only other units with no predecessors. Five feature waves is the DAG's minimum — the spine `FE-1 → FE-2/FE-7 → FE-8 → FE-9 → {FE-10, FE-12…FE-15}` is four edges deep, and `FE-3`'s three predecessors sit at depths 1 and 2.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W_final]:
    if wave has serialized sub-batches (§7):
        for batch in [S1, S2, …]:
            dispatch every unit in batch IN PARALLEL to its own agent
            wait for ALL units in batch to commit
    else:
        dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against parent branch
```

---

## 5. Per-wave delegation

<!-- Briefs are REFERENCES ONLY. The spec is in the impl doc; do not restate it here. -->

### Wave W1

| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 | `admin-frontend/lib/pages-config.ts`, `admin-frontend/lib/admin/types.ts`, `admin-frontend/lib/admin/catalog.ts` (`LEVEL_LABEL` keys only), `admin-frontend/components/admin/Shared.tsx`, `admin-frontend/components/admin/config/{ConfigModals,Matrix}.tsx` | commit exists on layer branch; impl §6 FE-1 "Done when" met (both greps clean, `tsc` clean, `pages.check.ts` still passes) |
| `FE-16` | impl §6 FE-16 | **admin-frontend:** delete `app/(auth)/register/`; modify `components/auth/AuthProvider.tsx`, `lib/auth-api.ts`, `lib/firebase-auth-errors.ts`, `app/(auth)/login/page.tsx` — **client-frontend:** delete `app/register/`; modify `components/auth/AuthProvider.tsx`, `lib/auth-api.ts`, `lib/firebase-auth-errors.ts`, `app/login/page.tsx` | commit exists; impl §6 FE-16 "Done when" met in **both** apps |
| `FE-17`\* | impl §6 FE-17 — **conditional, see §2** | create `admin-frontend/app/(auth)/set-password/page.tsx` (and the `client-frontend/app/set-password/page.tsx` sibling if the client email uses the same link type) | either committed, **or** explicitly recorded as dropped per §2; live email-link confirmation is deferred to proposal phase 5 |

**Barrier before W2:** all rows above show a commit on the layer branch AND the W1 gate (§6) passes.

### Wave W2

| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 | `admin-frontend/lib/admin/catalog.ts`, `admin-frontend/lib/admin/types.ts`, `admin-frontend/lib/admin/AdminStoreContext.tsx` (signatures only), `admin-frontend/components/admin/AccessEditor.tsx`, `admin-frontend/components/admin/config/{Matrix,RoleView,ConfigModals}.tsx`, `admin-frontend/components/admin/enroll/{Wizard,LifecycleModals}.tsx` | commit exists; impl §6 FE-2 "Done when" met |
| `FE-4` | impl §6 FE-4 | `admin-frontend/hooks/usePageAccess.ts`, `admin-frontend/types/portal.ts` | commit exists; impl §6 FE-4 "Done when" met |
| `FE-7` | impl §6 FE-7 | create `admin-frontend/server/admin/index.ts`, `admin-frontend/app/(roles)/admin/actions.ts`; modify `admin-frontend/server/endpoints.ts` | commit exists; impl §6 FE-7 "Done when" met (against mocked `apiClient` — live route shapes deferred to phase 5) |

**Barrier before W3:** commits present AND W3-entry gate (§6) passes.

### Wave W3

| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6 FE-5 | create `admin-frontend/components/auth/NoAccess.tsx`; modify `admin-frontend/lib/pages-config.ts`, `admin-frontend/components/auth/RoleGuard.tsx`, `admin-frontend/components/sidebar/SidebarNav.tsx`, `admin-frontend/app/page.tsx`, `admin-frontend/app/(roles)/{rm,mobo,pc,compliance,admin}/layout.tsx` | commit exists; impl §6 FE-5 "Done when" met |
| `FE-6` | impl §6 FE-6 | `admin-frontend/components/rm/{OnboardingModal,RequestTickets,ContactLog,SubscriptionAccordion,TransactionDetailModal}.tsx`, `admin-frontend/components/compliance/review/{CrDetailPanel,ObDetailPanel}.tsx`, `admin-frontend/app/(roles)/mobo/{trade-reconciliation,commission-tracking,recon-overview}/page.tsx`, `admin-frontend/app/(roles)/rm/model-subscription/page.tsx` | commit exists; impl §6 FE-6 "Done when" met — marker count still 32, each in a conditional-render position |
| `FE-8` | impl §6 FE-8 | `admin-frontend/lib/admin/types.ts`, `admin-frontend/components/admin/{AuditModal,Shared}.tsx` (`UserCell` call sites only), `admin-frontend/components/admin/enroll/{Directory,LifecycleModals,OverridesLedger}.tsx` — ledger at its **pre-move** path per §3 finding 2 | commit exists; impl §6 FE-8 "Done when" met |

**Barrier before W4:** commits present AND W4-entry gate (§6) passes — note the narrowly scoped `pages.check.ts` exception recorded there.

### Wave W4

| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 | `admin-frontend/lib/pages.check.ts` | commit exists; `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK`, and renaming a `PageId` makes it exit non-zero |
| `FE-9` | impl §6 FE-9 | `admin-frontend/lib/admin/AdminStoreContext.tsx`, `admin-frontend/app/(roles)/admin/layout.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`, `admin-frontend/components/admin/enroll/LifecycleModals.tsx`; create `admin-frontend/lib/admin/today.ts`; delete `admin-frontend/lib/mock/admin-data.ts` | commit exists; impl §6 FE-9 "Done when" met against the mocked actions module (live fetches deferred to phase 5) |

**Barrier before W5:** commits present AND the full W5-entry gate (§6) green — from here on `pages.check.ts` must pass in its final form.

### Wave W5 — serialized (see §7 for the order and the reason)

| Unit | Sub-batch | Brief | Files touched | Done when |
|---|---|---|---|---|
| `FE-10` | S1 | impl §6 FE-10 | `admin-frontend/lib/admin/AdminStoreContext.tsx`, `admin-frontend/components/admin/config/ConfigModals.tsx`, `admin-frontend/app/(roles)/admin/system-config/page.tsx` | commit exists; impl §6 FE-10 "Done when" met (409 proved against the mocked actions module; live conflict deferred to phase 5) |
| `FE-12` | S1 | impl §6 FE-12 | `admin-frontend/components/admin/enroll/{LifecycleModals,Directory}.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx` | commit exists; impl §6 FE-12 "Done when" met (real mail delivery deferred to phase 5) |
| `FE-11` | S2 | impl §6 FE-11 | `admin-frontend/components/admin/enroll/Wizard.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`; delete `admin-frontend/lib/admin/password.ts` | commit exists; impl §6 FE-11 "Done when" met — and `password.ts`'s deletion leaves **no** importer behind (FE-12 already landed) |
| `FE-14` | S3 | impl §6 FE-14 | `admin-frontend/components/admin/enroll/Wizard.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx` | commit exists; impl §6 FE-14 "Done when" met |
| `FE-15` | S4 | impl §6 FE-15 | `admin-frontend/components/admin/enroll/{LifecycleModals,Wizard}.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`, `admin-frontend/lib/admin/AdminStoreContext.tsx` | commit exists; impl §6 FE-15 "Done when" met (real handover deferred to phase 5) |
| `FE-13` | S5 | impl §6 FE-13 | create `admin-frontend/components/admin/config/OverridesLedger.tsx` (moved) and add `AddOverrideModal` to `admin-frontend/components/admin/config/ConfigModals.tsx`; delete `admin-frontend/components/admin/enroll/OverridesLedger.tsx` and remove `AddOverrideModal` from `admin-frontend/components/admin/enroll/LifecycleModals.tsx`; modify `admin-frontend/app/(roles)/admin/{system-config,enroll-user}/page.tsx`, `admin-frontend/components/admin/enroll/Directory.tsx`, `admin-frontend/components/admin/Shared.tsx` | commit exists; impl §6 FE-13 "Done when" met — and the moved file carries FE-8's and FE-12's edits, not a pre-W3 copy |

**Barrier before W-final:** every row above committed AND the full gate (§6) green in both apps.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave. Commands are impl §3.2's, verbatim, and the first three must pass **in both working directories**, `admin-frontend/` and `client-frontend/` (A-8 spans both):

1. **Unit tests + type-check + lint (per app):** `npx vitest run && npx tsc --noEmit && npx next lint`
   Run once in `admin-frontend/` and once in `client-frontend/`. Only tests for units already committed need pass at this point (impl §8; tests live in the git-ignored `tests/` dirs and are never committed).
2. **Registry check (repo root):** `npx tsx admin-frontend/lib/pages.check.ts` — expected output `pages.check.ts: OK`.

### Gate expectation per barrier (read this before calling a barrier red)

`lib/pages.check.ts` is a real `.ts` file inside `admin-frontend/`, so it is in `tsc`'s program. `FE-5` (W3) deletes the symbols its current assertions reference (`ROLE_PAGES`, `accessLevel`, `pagesForRole`, `rolesForPath`) and `FE-3` (W4) is the unit that rewrites it. The gate expectation is therefore sequenced, not uniform:

| Barrier | `npx vitest run` / `npx next lint` (both apps) | `npx tsc --noEmit` (both apps) | `npx tsx admin-frontend/lib/pages.check.ts` |
|---|---|---|---|
| after W1 | green | green | green (FE-1 folded its `"OPERATE"` assertion to `"EDIT"`) |
| after W2 | green | green | green (FE-2 touches `lib/admin/**` only; the script reads `pages-config`) |
| after W3 | green | green **except** errors confined to `admin-frontend/lib/pages.check.ts` — FE-5's expected fallout, cleared by FE-3 in W4. **Any error in any other file is red and halts the run.** | **not asserted** at this barrier — known-red by construction |
| after W4 | green | green, no exception | green, final form (`pages.check.ts: OK`) |
| after W5 | green | green | green |

This is the only sanctioned red in the run, it is confined to one named file, and it lives for exactly one barrier. It is recorded here rather than asserted-and-ignored so a genuine W3 regression in FE-6's eleven files or FE-8's six cannot hide behind it.

**Human gates:** **none inside this layer** — fully automated to PR. For completeness: the proposal's human gates (phase 0 Firebase extension, phase 4 live migration + seed, phase 5 cross-layer smoke mail, and the merges) all sit **outside** this layer. Phase 5 in particular is downstream of this PR and is **not a wave here**; the units whose live verification defers to it are listed in §2.

---

## 7. Shared-file / collision protocol (no worktrees)

All work happens in one working tree on one branch, so two agents in the same wave writing one file will collide. Every file below was checked against the union of §5's "Files touched" **per wave**; a file touched by ≥ 2 units in *different* waves is not a collision (the barrier serializes it) and is not listed.

**Shared-file map**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | — | — | **Checked, empty.** FE-1 (`lib/**` + `components/admin/**`), FE-16 (both apps' auth files + the two register dirs) and FE-17 (the new `set-password` route) are pairwise disjoint — impl §6 FE-16's "touches no file any of them touch" verified against FE-1's and FE-17's lists. Truly parallel-safe. |
| W2 | — | — | **Checked, empty.** FE-2 (`lib/admin/**`, `components/admin/**`), FE-4 (`hooks/usePageAccess.ts`, `types/portal.ts`) and FE-7 (`server/**`, `app/(roles)/admin/actions.ts`) are pairwise disjoint. |
| W3 | — | — | **Checked, empty.** FE-5 touches the five *namespace layouts* while FE-6 touches *pages/components* under those namespaces — no file in both. FE-8 stays inside `components/admin/**` + `lib/admin/types.ts`, which neither of the other two touches. (`Shared.tsx` is FE-1/W1 and FE-8/W3 — different waves; `lib/admin/types.ts` is FE-1/W1, FE-2/W2, FE-8/W3 — three different waves.) |
| W4 | — | — | **Checked, empty.** FE-3 owns `lib/pages.check.ts`; FE-9 owns the store, the admin layout, `enroll-user/page.tsx`, `LifecycleModals.tsx`, `lib/admin/today.ts` and the mock deletion. Disjoint. (`app/(roles)/admin/layout.tsx` is FE-5/W3 + FE-9/W4 — different waves.) |
| W5 | `app/(roles)/admin/enroll-user/page.tsx` | `FE-11`, `FE-12`, `FE-13`, `FE-14`, `FE-15` | **serialize** — see the W5 order below. Five of six units want this file, which is why W5 is serialized rather than parallel. |
| W5 | `components/admin/enroll/Wizard.tsx` | `FE-11`, `FE-14`, `FE-15` | **serialize** (S2 → S3 → S4) |
| W5 | `components/admin/enroll/LifecycleModals.tsx` | `FE-12`, `FE-15`, `FE-13` | **serialize** (S1 → S4 → S5) |
| W5 | `components/admin/config/ConfigModals.tsx` | `FE-10`, `FE-13` | **serialize** (S1 → S5) |
| W5 | `app/(roles)/admin/system-config/page.tsx` | `FE-10`, `FE-13` | **serialize** (S1 → S5) |
| W5 | `components/admin/enroll/Directory.tsx` | `FE-12`, `FE-13` | **serialize** (S1 → S5) |
| W5 | `lib/admin/AdminStoreContext.tsx` | `FE-10`, `FE-15` | **serialize** (S1 → S4) |
| W5 | `lib/admin/password.ts` (deleted by FE-11, last importers removed by FE-12) | `FE-11`, `FE-12` | **edge, not just serialization** — promoted to `FE-11 → FE-12` in §3, so FE-11 is fixed second (S2 after S1) |

**W5 dispatch order (one wave, five serialized sub-batches).** Each sub-batch waits for the previous one's commit(s) to be on the layer branch:

| Sub-batch | Units | Why here |
|---|---|---|
| S1 | `FE-10` **∥** `FE-12` | the only pair in W5 with disjoint file sets (`{AdminStoreContext, ConfigModals, system-config}` vs `{LifecycleModals, Directory, enroll-user}`) — the wave's only real parallelism. FE-12 first also satisfies the `password.ts` edge |
| S2 | `FE-11` | after FE-12 (§3 edge): `password.ts` may only be deleted once FE-12's two importers are gone. Also takes `Wizard.tsx` + `enroll-user/page.tsx` first among the wizard units |
| S3 | `FE-14` | contends `Wizard.tsx` + `enroll-user/page.tsx` with FE-11; runs on the FE-11 wizard so the Credentials step is already stripped |
| S4 | `FE-15` | contends `Wizard.tsx`, `enroll-user/page.tsx` (FE-11/FE-14), `LifecycleModals.tsx` (FE-12) and `AdminStoreContext.tsx` (FE-10) — it can only run after all four |
| S5 | `FE-13` | **last by design.** It *moves* files, so it must carry the final content: FE-8's ledger edits (W3), FE-12's `Directory`/`LifecycleModals` edits, FE-10's `ConfigModals`/`system-config` edits. Moving an earlier copy would silently revert them (§3 finding 2) |

**Rebase discipline within a wave** (when serializing on a shared file):
1. The contending agent waits until the predecessor's commit is on the layer branch.
2. It runs `git pull --rebase` (against the layer branch, **not** `main`), re-reads the target file, then edits.
3. If the rebase conflicts, it resolves, re-runs its unit tests, then commits. It **does not push**.

---

## 8. Final Validation & Test wave (W-final)

Dispatches after W5 is committed and its gate passed. Two agents run in parallel.

### 8.1 Validation agent

Verifies static properties of the finished layer against impl §6 / §9:
- [ ] Every unit ID in §3 has at least one commit on the layer branch — with FE-17 either committed or **explicitly recorded as dropped** per §2 (impl §9's exempt checkbox).
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created / modified / deleted as specified), in **both** `admin-frontend/` and `client-frontend/`.
- [ ] Public surface (impl §5 modules) matches the impl doc — imports resolve, no dangling references to removed symbols.

Frontend-specific invariants (all must hold):
- [ ] **Dead code purged — every grep returns nothing, across both `admin-frontend/` and `client-frontend/`:** `OPERATE`, `temporary password` (case-insensitive), `signUpWithEmailPassword`, `postBackendRegister`, `genPassword`, `seedLevels`, `nextId`, `ROLE_PAGES`, `rolesForPath`.
- [ ] **The 32 gate markers, per D-14:** `grep -ro "View/Edit Gate Function" admin-frontend --include=*.tsx | wc -l` is still **32** (not 31, not 33), each of the 11 files references `canEdit`, and every marker sits adjacent to a `canEdit` reference in a **conditional-render** position — controls are **hidden**, never `disabled={!canEdit}`.
- [ ] **`npx tsc --noEmit` clean in both apps** — no exception at this barrier (W3's narrow `pages.check.ts` carve-out was cleared by FE-3 in W4), and no `any` introduced on the changed lines.
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK`.
- [ ] `grep -rn "fetch(" admin-frontend/app/\(roles\)/admin admin-frontend/lib/admin` returns nothing — the admin pages reach the backend only through `server/admin`.
- [ ] Impl §7 still matches the proposal's frozen § 4 verbatim, checked against the proposal **on the parent branch** (sibling branches are not visible here).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl §8: `npx vitest run` — once in `admin-frontend/` and once in `client-frontend/`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code. Does **not** attempt anything requiring a live backend — the seam is mocked per impl §8, and the live proof is the proposal's phase 5 (§2).

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see §9).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave. The single exception is the W3 `pages.check.ts` carve-out documented in §6 — and only for errors inside that one file.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (as `FE-18`, …), then extend §3/§4/§5/§7 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl §7's seam (the cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.
- **A late Q-5 reversal** (the Backend layer re-records the opposite outcome after this run started) is a scope change, not a gate failure: add or drop FE-17's W1 row per §2 and re-run W1's gate only. No other wave is affected.

---

## 10. Definition of done

- [ ] Every wave W1…W5 committed on the layer branch; each wave gate green per §6's per-barrier expectation.
- [ ] FE-17 committed, or its drop recorded against impl §9.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `claude/admin-pages-backend-proposal-f0c9fc`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
