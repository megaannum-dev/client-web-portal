# 004 — Authentication Flow Rework · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/004-auth-flow-rework-fe.md` (the impl doc). This file does not restate the spec.
> Layer: Frontend — **one layer per file.** Sibling layers (`-db`, `-be`) already committed on their own branches.
> Branch: `rework-authentication-module-fe` — cut from `rework-authentication-module` (parent), merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/004-auth-flow-rework-fe.md` |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` §6, §4.12 |
| Sibling layer schedules | `docs/execution-schedules/004-auth-flow-rework-db.md` · `docs/execution-schedules/004-auth-flow-rework-be.md` |
| Prompt (dispatch harness) | `docs/prompts/004-auth-flow-rework-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-6` (definitions live in the impl doc).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions green (the §7 seam matches what's actually committed on `rework-authentication-module-be`; `node_modules/` present in both `client-frontend/` and `admin-frontend/`).
- [ ] Layer branch `rework-authentication-module-fe` cut from `rework-authentication-module` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on `-db` or `-be`'s schedules. It builds against the seam frozen in impl doc §7 (already committed on `-be`), not against that branch's schedule progress.

**Exit signal:** every unit in §3 committed on the layer branch, W-final green, PR opened against `rework-authentication-module`. The orchestrator does not push, does not merge.

---

## 3. Dependency graph (intra-layer only)

Two fully independent chains — one per app, zero shared files, safe to run the two chains in parallel across their own waves.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root of the client-frontend chain (auth-api.ts + types) |
| `FE-2` | `FE-1` | `AuthProvider` consumes `BackendAuthError` and the new `postBackendLogin`/`postBackendRegister` signatures FE-1 introduces |
| `FE-3` | `FE-2` | login/register pages render the error states FE-2's provider now produces |
| `FE-4` | — | root of the admin-frontend chain (auth-api.ts + types) |
| `FE-5` | `FE-4` | same reason as FE-2, admin side |
| `FE-6` | `FE-5` | same reason as FE-3, admin side |

**Graph invariants:**
- No cycles.
- Every edge is within this layer (both chains are Frontend-layer units; no edge references a DB-* or BE-* unit).
- FE-1/FE-4 have no dependency on each other — different apps, different working directories, genuinely parallel.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1, FE-4` | yes (2 units, 2 parallel dispatches, different apps) | — |
| W2 | `FE-2, FE-5` | yes | W1 committed |
| W3 | `FE-3, FE-6` | yes | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against rework-authentication-module
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `FE-1` | impl §6 FE-1 | `client-frontend/lib/auth-api.ts`, `client-frontend/types/portal.ts` | commit exists on layer branch |
| `FE-4` | impl §6 FE-4 | `admin-frontend/lib/auth-api.ts`, `admin-frontend/types/portal.ts` | commit exists on layer branch |

**Barrier before W2:** both rows above must show a commit AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6 FE-2 | `client-frontend/components/auth/AuthProvider.tsx` | commit exists on layer branch |
| `FE-5` | impl §6 FE-5 | `admin-frontend/components/auth/AuthProvider.tsx` | commit exists on layer branch |

**Barrier before W3:** both rows above must show a commit AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-3` | impl §6 FE-3 | `client-frontend/app/login/page.tsx`, `client-frontend/app/register/page.tsx` | commit exists on layer branch |
| `FE-6` | impl §6 FE-6 | `admin-frontend/app/(auth)/login/page.tsx`, `admin-frontend/app/(auth)/register/page.tsx` | commit exists on layer branch |

**Barrier before W-final:** both rows above must show a commit AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run **per app** (both `client-frontend/` and `admin-frontend/`, independently) — a failure blocks the next wave:

1. **Lint** — `npx next lint`
2. **Type-check** — covered by `next lint`'s TS integration; no standalone `tsc` script exists in either app (confirmed in impl doc §3.2) — do not fabricate one.
3. **Unit tests** — `npx vitest run` (impl doc §8 — only tests for units already committed need pass at this point).
4. **Build / import smoke** — not run per-wave (expensive); deferred to W-final (`next build`).

**Human gates:** none — fully automated to PR. (Unlike the Backend layer, no live-DB migration or cutover is involved here.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:** empty for every wave. `client-frontend/` and `admin-frontend/` are separate directories with zero overlapping files across all six units — W1/W2/W3's two units each are genuinely parallel-safe with no serialization needed.

**No worktree override is invoked for this layer** — unlike the Backend layer's W1/W5 collisions, there is nothing to collide on.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6/§9:
- [ ] Every unit ID FE-1..FE-6 has at least one commit on the layer branch.
- [ ] `client-frontend/types/portal.ts` and `admin-frontend/types/portal.ts` no longer declare an `id` field on `PortalUser`.
- [ ] `client-frontend/lib/auth-api.ts` and `admin-frontend/lib/auth-api.ts` no longer reference `/api/auth/login` or `/api/auth/register` anywhere (grep clean).
- [ ] `npx next build` succeeds in both apps (full type-check + lint + production build — the layer's heaviest gate, run once here rather than per-wave).
- [ ] No dangling references to removed symbols (e.g. old `postBackendRegister(idToken)` two-arg call sites in admin-frontend still passing the old body shape).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs `npx vitest run` in both `client-frontend/` and `admin-frontend/` (impl doc §8).
- Reports pass/fail counts and any failing test's first traceback frame, per app.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS** in both apps. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are a follow-up wave (new units added to the impl doc, e.g. `FE-7`).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** No cross-wave fixes.
- **New units mid-run:** add to the impl doc first (`FE-7`, `FE-8`, …), then extend this file's §3/§4/§5.
- **Scope change:** any edit to impl doc §7 (the seam) suspends this run until re-verified against the Backend layer's actual committed schemas.

---

## 10. Definition of done

- [ ] Every wave W1…W3 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `rework-authentication-module`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
