# 014 — Client Onboarding Follow-Up Fixes · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: [`docs/implementations/014-onboarding-follow-up-fixes-fe.md`](../implementations/014-onboarding-follow-up-fixes-fe.md) (the impl doc). This file does not restate the spec — it references unit IDs `FE-1`..`FE-6` and orders their execution.
> Proposal: [`docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md`](../proposals/014-2026-07-21-onboarding-follow-up-fixes.md) § Layer 2 — Frontend
> Layer: **Frontend**
> Sibling layer schedule: [`docs/execution-schedules/014-onboarding-follow-up-fixes-be.md`](014-onboarding-follow-up-fixes-be.md)
> Prompt (dispatch harness): `docs/prompts/014-onboarding-follow-up-fixes-fe.md`

<!-- OVERRIDE — branching convention (carried forward from both impl docs,
per explicit user instruction on this proposal): no `014-onboarding-follow-up-fixes-fe`
branch is cut, no worktree. Every unit below commits directly to the CURRENT
branch (`onboarding-subsystem-fixing`) — the SAME branch the sibling Backend
schedule also commits to. Wherever the base template says "layer branch,"
"cut from parent," or "merge back," read it as "the current branch, already
checked out — no cut, no merge-back; the final PR is opened from this one
branch directly against `main`." -->
> Branch: `onboarding-subsystem-fixing` (current branch — **no `-fe` branch is cut**). Every unit below commits directly here.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/014-onboarding-follow-up-fixes-fe.md` |
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` § Layer 2 — Frontend |
| Sibling layer schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-be.md` |
| Prompt (dispatch harness) | `docs/prompts/014-onboarding-follow-up-fixes-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green: proposal 013's existing Frontend surfaces present on this branch (`OnboardingBoard.tsx`, `OnboardingModal.tsx`, `useOnboardingBoard.ts`, `lib/onboarding/{types,mappers}.ts`, `client-info/[id]/page.tsx`, `model-subscription/page.tsx` + components).
- [ ] Current branch is `onboarding-subsystem-fixing`, checked out, working tree clean.
- [ ] For browser-verification steps specifically (not for committing code) — the corresponding Backend units are live: `FE-3` needs `BE-2`/`BE-3`; `FE-4` needs `BE-6`/`BE-7`; `FE-5` needs `BE-8`; `FE-6` needs `BE-9` (including its `amount` field). See the cross-layer note below.

**Layer independence, redefined for this override.** As with the sibling Backend schedule: there is one branch, not two, so "runs on its own branch" doesn't apply. What still holds: no dependency edge in §3 below references a Backend unit, and `admin-frontend/**` (this layer) and `api-backend/**` (Backend) never share a file, so **git-level** parallelism between the two schedules is unconstrained. The one real coupling is **browser verification**, not commits: `FE-3`/`FE-4`/`FE-5`/`FE-6`'s code can be written and committed against the frozen §7 contract at any time, but their "Done when" browser checks only prove anything once the matching Backend unit is actually live on the branch. **Recommendation: run the Backend schedule's W1 to completion before attempting this schedule's W2/W3 browser verification**, especially for `FE-6`, which must be checked against `BE-9`'s *widened* form (with `amount`) — verifying earlier against a Backend that predates that field would pass against a DTO shape that no longer matches reality.

**Exit signal (what this run produces):** every unit in §3 committed on `onboarding-subsystem-fixing`, the final validation wave green, PR opened from this branch against `main`. **The orchestrator does not push, does not merge — the human owns that**, per [[git_workflow_human_owns_main]].

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — lifts `useOnboardingBoard()` to the parent page; nothing in this layer needs to exist first |
| `FE-2` | `FE-1` | both edit `OnboardingBoard.tsx`; `FE-2`'s chip fix is written against the already-prop-based component shape `FE-1` produces (sequencing, not a functional need — `status` on `KycBoardClient` doesn't require FE-1's prop lift to exist, but landing it after avoids a needless merge conflict on the same file) |
| `FE-3` | `FE-2` | both edit `KanbanCard`/`KycPanel` inside `OnboardingBoard.tsx`; `FE-3`'s status-locked buttons read `item.status`, which `FE-2` is what adds to `KycBoardClient` in the first place — this one IS a real (not just file-collision) dependency |
| `FE-4` | — | root — touches only `client-info/[id]/page.tsx`, `useClient.ts`, `lib/rm/clients.ts`, none of which any other unit touches |
| `FE-5` | `FE-1` | edits `OnboardingModal.tsx`, whose prop signature `FE-1` changes; sequencing to avoid a merge conflict on the same file, not a functional need (the cash-deposit field itself doesn't depend on the prop lift) |
| `FE-6` | — | root — touches only `model-subscription/page.tsx`, `SubscriptionAccordion.tsx`, and two new files, none of which any other unit touches |

**Graph invariants:** no cycles; `FE-3`'s edge on `FE-2` is the one **genuine** logical dependency in this layer (it consumes a field FE-2 introduces) — every other edge above is a file-collision sequencing choice, not a hard requirement.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1, FE-4, FE-6` | yes (3 units, 3 parallel dispatches — confirmed file-disjoint, §7) | — |
| W2 | `FE-2, FE-5` | yes (2 units, 2 parallel dispatches — confirmed file-disjoint, §7) | W1 committed |
| W3 | `FE-3` | yes (1 unit — trivially "parallel") | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against main
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 — lift `useOnboardingBoard()` to the shared parent page | `onboarding-renewal/page.tsx`, `OnboardingBoard.tsx`, `OnboardingModal.tsx` | commit exists on `onboarding-subsystem-fixing` |
| `FE-4` | impl §6 FE-4 — client-detail: 4 fields off mock, onto live data | `client-info/[id]/page.tsx`, `hooks/api/useClient.ts`, `lib/rm/clients.ts` | commit exists |
| `FE-6` | impl §6 FE-6 — Model Subscription: mock swap, allotment/redemption stay interactable no-ops | `hooks/api/useSubscriptions.ts` (new), `lib/rm/subscriptions.ts` (new), `model-subscription/page.tsx`, `SubscriptionAccordion.tsx` | commit exists |

**Barrier before W2:** all rows above must show a commit on `onboarding-subsystem-fixing` AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 — chip branches on status, not count | `lib/onboarding/types.ts`, `lib/onboarding/mappers.ts`, `OnboardingBoard.tsx` | commit exists |
| `FE-5` | impl §6 FE-5 — Initial Cash Deposit field wiring + client-side AUM floor | `OnboardingModal.tsx` | commit exists |

**Barrier before W3:** both rows above committed AND wave-gate checks pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 — status-locked buttons + download affordances | `OnboardingBoard.tsx` | commit exists; browser-verified against `BE-2`/`BE-3` if the Backend schedule has reached that point (see §2's cross-layer note) — otherwise commit now, defer browser verification to W-final |

---

## 6. Wave gates (barriers between waves)

At the end of each of W1/W2/W3, run in order — a failure blocks the next wave:

1. **Lint** — `npm run lint`
2. **Type-check** — `npx tsc --noEmit`
3. **Unit tests** — `npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point)
4. **Build** — `npm run build` (confirms no dangling import — e.g. `FE-1`'s prop-signature change didn't leave a stale internal `useOnboardingBoard()` call anywhere, `FE-6`'s two new files resolve)

**Human gates:**
- [ ] none — fully automated to PR. Browser verification of `FE-3`/`FE-4`/`FE-5`/`FE-6`'s "Done when" against a real backend is a **quality check the orchestrator performs**, not a human sign-off gate; if the corresponding Backend unit isn't live yet when a wave's browser check would run, defer that specific check to W-final rather than blocking the wave (see §2).

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | — | — | none — `FE-1` (`onboarding-renewal/page.tsx`, `OnboardingBoard.tsx`, `OnboardingModal.tsx`), `FE-4` (`client-info/[id]/page.tsx`, `useClient.ts`, `lib/rm/clients.ts`), and `FE-6` (two new files + `model-subscription/page.tsx`, `SubscriptionAccordion.tsx`) touch fully disjoint file sets — genuinely parallel-safe. |
| W2 | — | — | none — `FE-2` (`lib/onboarding/{types,mappers}.ts`, `OnboardingBoard.tsx`) and `FE-5` (`OnboardingModal.tsx`) touch disjoint files (both edit inside the `OnboardingBoard`/`OnboardingModal` pair `FE-1` already touched in W1, but W1 is already committed by the time W2 starts, so no same-wave collision). |
| W3 | — | — | n/a — single unit. |

**If the map is empty for a wave, all its units are truly parallel-safe** — true for all three waves here; this layer's DAG-driven wave split already happens to avoid every same-wave file collision, so no within-wave serialization or rebase discipline is needed anywhere in this schedule.

**Cross-layer note (not a collision, stated for completeness):** `admin-frontend/**` (this schedule) and `api-backend/**` (the sibling Backend schedule) never share a file — even though both schedules commit to the same branch, there is no scenario where a Backend-schedule commit and a Frontend-schedule commit touch the same path.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] Every unit ID `FE-1`..`FE-6` has at least one commit on `onboarding-subsystem-fixing`.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified as specified — `FE-6`'s two new files exist; `SubscriptionFormModal.tsx` was NOT touched, per FE-6's explicit invariant).
- [ ] Public surface matches: neither `OnboardingBoard.tsx` nor `OnboardingModal.tsx` calls `useOnboardingBoard()` internally anymore (FE-1); `SubscriptionAccordion.tsx` no longer imports `SUB_CLIENTS` (FE-6); no `any` types introduced by the new `lib/rm/subscriptions.ts`/`hooks/api/useSubscriptions.ts` files.
- [ ] Browser verification (deferred from W1/W2/W3 if the matching Backend unit wasn't live yet at the time): `FE-3` against `BE-2`/`BE-3`, `FE-4` against `BE-6`/`BE-7`, `FE-5` against `BE-8`, `FE-6` against `BE-9` (specifically confirming the accordion renders `sub.amount`-derived figures correctly, not a stale pre-widening shape).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `npx vitest run && npx tsc --noEmit && npm run lint`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (`FE-7`, …), then extend §3/§4/§5/§7 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam suspends this run — this already happened once (the `ClientSubscriptionRowDTO.amount` addition), already reflected in both impl docs' §7 before this schedule was written. Any further seam change requires the Backend layer to re-copy its own §7 too before either schedule resumes past that point.

---

## 10. Definition of done

- [ ] W1, W2, W3 fully committed on `onboarding-subsystem-fixing`, in that order; each wave gate (§6) green.
- [ ] W-final validation agent: PASS (including deferred browser-verification checks against the live Backend units).
- [ ] W-final test agent: PASS.
- [ ] PR opened from `onboarding-subsystem-fixing` against `main`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
