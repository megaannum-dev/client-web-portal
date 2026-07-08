# 009 — Role-Based Page Access as a Single Config · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/009-role-based-page-access-config-fe.md`. This file does not restate the spec — it references FE-1…FE-6 and orders them.
> Layer: Frontend — single-layer proposal, no sibling schedules.
> Branch: `frontend-rolebased-architecture-redesign-fe` — cut from parent `frontend-rolebased-architecture-redesign`, merged back by the human.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/009-role-based-page-access-config-fe.md` |
| Proposal | `docs/proposals/009-2026-07-07-role-based-page-access-config.md` § Frontend |
| Sibling layer schedules | none (single-layer) |
| Prompt (dispatch harness) | `docs/prompts/009-role-based-page-access-config-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions in impl doc §6 — not restated).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Proposal 009 approved (impl doc §2).
- [ ] Layer branch `frontend-rolebased-architecture-redesign-fe` cut from parent `frontend-rolebased-architecture-redesign` and checked out.
- [ ] Working tree clean.
- [ ] Node/npm available in `admin-frontend/` (existing `package.json` scripts `lint`/`build` runnable).

**Layer independence.** Single-layer proposal — no sibling schedules to coordinate with. No frozen seam.

**Exit signal:** FE-1…FE-6 committed on the layer branch, W-final green, PR opened against parent branch. Orchestrator does not push, does not merge — human owns that.

---

## 3. Dependency graph (intra-layer only)

Every other unit imports from `@/lib/pages` (FE-1). No unit depends on any other besides FE-1.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| FE-1 | — | root; defines the registry + `pages.check.ts` self-check consumed by every other unit |
| FE-2 | FE-1 | imports `accessLevel`, `AccessLevel`, `PageId` |
| FE-3 | FE-1 | imports `pagesForRole`, `groupsFor` |
| FE-4 | FE-1 | imports `defaultPathFor` |
| FE-5 | FE-1 | imports `rolesForPath` (three sibling layout files, no cross-edges between them — each is independent) |
| FE-6 | FE-1 | imports `rolesForPath`; also relies on `PAGES["admin.enroll-user"]` being present, which FE-1 defines |

**Graph invariants:** acyclic (star with FE-1 at the centre); all edges intra-layer; absence of edge between FE-2/3/4/5/6 means they are safe to run in parallel once FE-1 commits.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | FE-1 | n/a (single unit) | — |
| W2 | FE-2, FE-3, FE-4, FE-5, FE-6 | yes (5 parallel dispatches) | W1 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W2 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1

| Unit | Brief | Files touched (from impl doc §6) | Done when |
|---|---|---|---|
| FE-1 | Registry + self-check | create `admin-frontend/lib/pages.ts`, `admin-frontend/lib/pages.check.ts` | commit on layer branch; `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK` |

**Barrier before W2:** FE-1 committed + W1 gate (§6) green.

### Wave W2

| Unit | Brief | Files touched (from impl doc §6) | Done when |
|---|---|---|---|
| FE-2 | `usePageAccess` hook | create `admin-frontend/hooks/usePageAccess.ts` | commit on layer branch |
| FE-3 | `SidebarNav` from registry | modify `admin-frontend/components/sidebar/SidebarNav.tsx` | commit on layer branch |
| FE-4 | `app/page.tsx` from registry | modify `admin-frontend/app/page.tsx` | commit on layer branch |
| FE-5 | Per-namespace `layout.tsx` guards | modify `admin-frontend/app/(roles)/mobo/layout.tsx`, `.../rm/layout.tsx`, `.../pc/layout.tsx` | commit(s) on layer branch — one commit for all three or three commits, agent's choice; no cross-file dependency |
| FE-6 | Admin worked-example route | create `admin-frontend/app/(roles)/admin/layout.tsx`, `.../admin/enroll-user/page.tsx` | commit on layer branch |

**Barrier before W-final:** all five rows above committed + W2 gate (§6) green.

---

## 6. Wave gates (barriers between waves)

Run in order at each wave boundary from `admin-frontend/`:

1. **Lint** — `npm run lint`
2. **Build (type-check + Next build)** — `npm run build`
3. **Registry self-check** — `npx tsx lib/pages.check.ts`

There is no unit-test runner installed and none added by this branch (impl doc §8.1); type-check is folded into `npm run build`.

**Human gates:** none — fully automated to PR.

---

## 7. Shared-file / collision protocol (no worktrees)

**W1:** single unit, no contention possible.

**W2:** file union across FE-2/3/4/5/6.

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | — | — | none — all five units touch disjoint files (`hooks/usePageAccess.ts` · `components/sidebar/SidebarNav.tsx` · `app/page.tsx` · three `(roles)/*/layout.tsx` · two new `(roles)/admin/*` files) |

The five W2 units are truly parallel-safe.

**Rebase discipline (defensive):** if a W2 agent finds the layer branch has advanced (a peer committed while it was working), `git pull --rebase` against `frontend-rolebased-architecture-redesign-fe`, re-run gates (§6), commit. Do not push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

- [ ] Every unit ID FE-1…FE-6 has ≥ 1 commit on the layer branch.
- [ ] Impl §6 "Files" list matches the working-tree state — the two new `lib/*` files exist, the new `hooks/usePageAccess.ts` exists, the three `(roles)/*/layout.tsx` files no longer contain a literal `allowedRoles={["..."]}`, `SidebarNav.tsx` no longer contains `ROLE_GROUP` or `role === "ADMIN"`, `app/page.tsx` no longer contains `ROLE_BASE_ROUTES`, the two `(roles)/admin/*` files exist.
- [ ] Grep sweep (impl doc §9): `grep -rn 'ROLE_GROUP\|ROLE_BASE_ROUTES\|allowedRoles={\[' admin-frontend` returns only `components/auth/RoleGuard.tsx` (the prop declaration itself).
- [ ] `admin-frontend/types/portal.ts` unchanged (Role union untouched).
- [ ] `admin-frontend/components/auth/RoleGuard.tsx` and `admin-frontend/components/sidebar/RoleGroup.tsx` unchanged (D-4 invariant).

Reports **PASS** or explicit failures with file + line.

### 8.2 Test agent

- Runs from `admin-frontend/`: `npm run lint && npm run build && npx tsx lib/pages.check.ts`.
- Reports pass/fail + first failing line if any.
- Does not modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails, do not open a PR; report failures back to the human. Fixes go through §9.

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** No cross-wave patching.
- **New units mid-run:** add to impl doc §6 as FE-7… first, then extend §3–§5 here.
- No cross-layer seam here (single-layer), so §7-of-impl amendments do not apply.

---

## 10. Definition of done

- [ ] W1 and W2 committed on `frontend-rolebased-architecture-redesign-fe`; both wave gates green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `frontend-rolebased-architecture-redesign`.
- [ ] Orchestrator has not pushed to remote, not force-pushed, not merged, not opened worktrees.
