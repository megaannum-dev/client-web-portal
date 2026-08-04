# 020 — Schema / Format Cleanup Refactor · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/020-schema-format-cleanup-refactor-fe.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: **Frontend** — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `schema-repository-refactor-bugfix-fe` — cut from `schema-repository-refactor-bugfix` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch. This layer spans **two** working directories (`admin-frontend/`, `client-frontend/`) but still **one** branch, **one** tree.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/020-schema-format-cleanup-refactor-fe.md` |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md`, `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md` |
| Prompt (dispatch harness) | `docs/prompts/020-schema-format-cleanup-refactor-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-16` (definitions live in the impl doc — do not restate them here). 14 units are `admin-frontend/`-only (FE-1, FE-3, FE-4, FE-5, FE-6, FE-7, FE-9, FE-10, FE-11 (half), FE-12, FE-13, FE-14, FE-15, FE-16); 3 are `client-frontend/`-only (FE-2, FE-8, FE-11 (half)).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `admin-frontend/node_modules` and `client-frontend/node_modules` installed (`npm ci` in each).
- [ ] The proposal's §4 seam is frozen; impl doc §7.1 is a verbatim copy of it.
- [ ] The frontend build baseline (impl §3.3 "before" row) has been recorded on `schema-repository-refactor-bugfix` **before this schedule starts** — FE-11's acceptance is a comparison, and the "before" number cannot be recovered once the branch changes the config.
- [ ] Layer branch `schema-repository-refactor-bugfix-fe` cut from `schema-repository-refactor-bugfix` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the `-db` or `-be` schedules. Fees arriving as fractions (§7.1(a)) and errors arriving in the new envelope (§7.1(c)) are seam **assumptions** here, faked in tests with `vi.mock`/`vi.fn` — no unit in this layer imports from `api-backend/`, starts a backend, or hits a live endpoint.

**Declared exception to "green at every commit":** between FE-1 landing and FE-5 landing (i.e. across W1→W2→W3 for the admin test-baseline chain), `npx vitest run` in `admin-frontend/` is expected to be **red** (117 failures immediately after FE-1, declining through FE-3/FE-4/FE-5). This is impl doc's own explicitly declared exception (§3.2) — do not treat it as a broken wave gate; treat the *declining count* as the signal.

**Exit signal:** all `FE-*` units committed on the layer branch; `npx vitest run && npx tsc --noEmit && npx next lint` green in **both** working dirs, ungrepped; impl §3.3's after-measurement recorded; the three FE-5 verdicts recorded in the impl doc; PR opened against `schema-repository-refactor-bugfix`. **The orchestrator does not push, does not merge.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | Root. Un-gitignores and commits `admin-frontend/tests/` — every other admin unit's gate is meaningless until the suite is tracked. |
| `FE-2` | — | Root, parallel-safe. `client-frontend`-only; independent of the admin test-baseline chain. |
| `FE-3` | `FE-1` | The suite must be tracked, or these fixture edits are invisible to review. |
| `FE-4` | `FE-3` | FE-3's shared-mock fixes change which tests even reach an assertion; fixing copy before that would mean fixing it twice. |
| `FE-5` | `FE-3` | Same reason — a shared-mock failure must not be mistaken for a product bug. |
| `FE-6` | — | Root, parallel-safe. Atomic fee-scale unit — **must not be split** (impl §6, four display sites go off by 100× otherwise). |
| `FE-7` | `FE-5` | FE-5's row-1 verdict (is the error actually swallowed, or a stale-mock artifact?) must be recorded before the envelope rewrite lands — otherwise the rewrite would disguise the real answer. |
| `FE-8` | — | Root, parallel-safe. `client-frontend`-only; independent of FE-7 (different app, different code path). |
| `FE-9` | `FE-7` | Verifies the same three `res.text()` functions FE-7 rewrites; sequenced after to avoid a merge conflict in identical hunks. |
| `FE-10` | — | Root, parallel-safe with every other FE unit. Rewires `recon-overview` onto `/trade-records`; independent of the fee/error-envelope/test-baseline chains. |
| `FE-11` | — | Root, parallel-safe. `optimizePackageImports` + `--turbo` in both apps. |
| `FE-12` | — | Root. Ports the `Skeleton` primitive to admin, verbatim. Blocks FE-13. |
| `FE-13` | `FE-12` | Needs the ported `Skeleton` primitive to build the 18 per-route skeletons on top of. |
| `FE-14` | — | Root, parallel-safe. One download helper. |
| `FE-15` | — | Root, parallel-safe with every other FE unit, including FE-10 (different files in `lib/mock/`). Dead-code deletion + type relocation in `rm-data.ts`. |
| `FE-16` | `FE-15`, `FE-6` | Deletes the file FE-15 trimmed and relocated types out of (must land first); imports `DEFAULT_MGMT_FRACTION`/`DEFAULT_INCENTIVE_FRACTION`/`formatFeePercent` from `lib/fee.ts`, which only exist post-FE-6. |

**Graph invariants:** no cycles; every edge intra-layer; absence of an edge = safe to run in parallel subject to §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1, FE-2, FE-6, FE-8, FE-10, FE-11, FE-12, FE-14, FE-15` | yes, **except FE-6/FE-15 serialized** (shared file — see §7) | — |
| W2 | `FE-3, FE-13, FE-16` | yes, **except FE-13/FE-16 serialized** (shared file — see §7) | W1 committed |
| W3 | `FE-4, FE-5` | yes (2 parallel dispatches) | W2 committed |
| W4 | `FE-7` | n/a (single unit) | W3 committed |
| W5 | `FE-9` | n/a (single unit) | W4 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W5 committed |

This wave order reproduces the impl doc's own explicitly required contiguous sequencing (§3.2): FE-1 (W1) → FE-3 (W2) → FE-4, FE-5 (W3) → FE-7 (W4) → FE-9 (W5).

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W5, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
      (except pairs flagged in §7, which serialize within the wave)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
      (W1-W3: gate checks the DECLINING failure count, not zero — see §6)
open PR against schema-repository-refactor-bugfix
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Working dir | Files touched | Done when |
|---|---|---|---|---|
| `FE-1` | Un-gitignore `admin-frontend/tests/` and commit the suite | admin | `modify: admin-frontend/.gitignore`; `create (track): admin-frontend/tests/**` (78 files) | commit exists; `git ls-files` reports all 78 |
| `FE-2` | client: clear the 5 self-signup-purge failures | client | `delete: tests/lib/auth-api.test.ts`, `tests/app/register/page.test.tsx`; `modify: tests/components/auth/AuthProvider.test.tsx`, `tests/components/auth/FE-16.auth-surface.test.tsx:94-97` | `npx vitest run` in `client-frontend` reports 0 failed |
| `FE-6` | One fee scale: parser, formatter, all four consumer sites, ONE unit | admin | `create: lib/fee.ts`; `delete: lib/onboarding/fee.ts`; `modify: CreateModelForm.tsx, EditModelForm.tsx, OnboardingModal.tsx, OverviewTab.tsx, lib/pc/format.ts, lib/pc/models.ts, lib/pc/types.ts, lib/rm/subscriptions.ts, components/rm/SubscriptionFormModal.tsx` | commit exists; **must land as one commit, not split** |
| `FE-8` | client: de-duplicate six error-unwrap helpers | client | `modify: lib/auth-api.ts:9, lib/api/{documents,kyc,onboarding,portfolio,tickets}.ts` | commit exists on layer branch |
| `FE-10` | Rewire the MOBO dashboard onto `/trade-records`; delete the mock file | admin | `modify: lib/mobo/reconciliation.ts, app/(roles)/mobo/recon-overview/page.tsx`; `delete: lib/mock/mobo-data.ts`; `modify: tests/lib/mobo/FE-4.reconciliation-mapper.test.ts` | commit exists; page/nav/`ROLE_DEFAULT_PAGE.MOBO` byte-unchanged |
| `FE-11` | `optimizePackageImports` + `--turbo` in both apps | both | `modify: admin-frontend/next.config.mjs, client-frontend/next.config.mjs, admin-frontend/package.json:6, client-frontend/package.json:6`; conditionally `client-frontend/package.json:17, admin-frontend/tsconfig.json` | commit exists; §3.3 after-row filled |
| `FE-12` | Port the `Skeleton` primitive to admin, verbatim | admin | `create: components/ui/skeleton.tsx` | commit exists; byte-identical to `client-frontend/components/ui/skeleton.tsx` |
| `FE-14` | One download helper | admin | `delete: lib/downloadFile.ts`; `modify: app/(shared)/monthly-reports/page.tsx:6` | commit exists on layer branch |
| `FE-15` | Delete `rm-data.ts`'s dead code; relocate its real types | admin | `modify: lib/mock/rm-data.ts`; `create: lib/rm/types.ts`; `modify: lib/rm/subscriptions.ts, hooks/api/useRmTickets.ts` + 6 more import sites | commit exists; `grep -rn "getClientDetail\|KNOWN_CLIENT_IDS\|SUB_CLIENTS\b"` returns zero hits |

**Dispatch order within W1 (serialized pair — see §7):** FE-6 → FE-15 (both touch `lib/rm/subscriptions.ts`, different line ranges). All other W1 units are truly parallel.

**Barrier before W2:** all rows above committed AND wave-gate checks (§6) pass (expect `admin-frontend` `vitest` red at 117 failures after FE-1 — this is the declared exception, not a gate failure).

### Wave W2
| Unit | Brief | Working dir | Files touched | Done when |
|---|---|---|---|---|
| `FE-3` | admin: four shared-mock fixes + delete the spec-ahead tests | admin | shared test helpers / per-file mock factories; `delete:` 11 spec-ahead files | `npx vitest run` drops from 117 to ≤ 44 failures |
| `FE-13` | One `Skeleton.tsx` per admin route | admin | per route: `create: Skeleton.tsx, loading.tsx`; `modify: .../page.tsx` (hook-flag routes only, incl. `client-info/page.tsx:352-354`) | every listed route has both files; both render the same component |
| `FE-16` | Wire model catalog + size to real data; resolve overlay's 3 live fields; delete `rm-data.ts` | admin | `modify: app/(roles)/rm/model-subscription/page.tsx, components/rm/SubscriptionFormModal.tsx, app/(roles)/rm/client-info/page.tsx`; `delete: lib/mock/rm-data.ts` | commit exists; `lib/mock/rm-data.ts` no longer exists |

**Dispatch order within W2 (serialized pair — see §7):** FE-16 → FE-13, both touching `app/(roles)/rm/client-info/page.tsx` — FE-16 lands the business-logic rewrite (deletes the `getMockOverlay`/`RENEWALS_DUE` dependency) before FE-13 wraps the finished page in a loading skeleton.

**Barrier before W3:** all rows above committed AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Working dir | Files touched | Done when |
|---|---|---|---|---|
| `FE-4` | admin: the ~38 UI-copy / DOM / module-boundary drift failures | admin | drifted assertions across FE-11–FE-15/ADM-5/role-guard nav tests; `read (possibly modify): lib/mobo/allocation.ts:24-29` | `npx vitest run` down to exactly the 3 FE-5 unknown-class failures |
| `FE-5` | Diagnose the three unknown-class failures before touching any assertion | admin | `read: app/(roles)/admin/actions.ts:28-34, lib/admin/AdminStoreContext.tsx, lib/mobo/allocation.ts`; `modify:` per verdict | three verdicts recorded in the impl doc |

**Barrier before W4:** both rows above committed AND wave-gate checks (§6) pass; the three FE-5 verdicts are written into the impl doc (not just decided in the agent's head).

### Wave W4
| Unit | Brief | Working dir | Files touched | Done when |
|---|---|---|---|---|
| `FE-7` | Parse the §7.1(c) error envelope in `server/api-client.ts` (3 sites); fold in 3 competing conventions | admin | `modify: server/api-client.ts, server/pc/index.ts, server/onboarding/index.ts, lib/auth-api.ts` | commit exists; produced `error` never contains `{` |

**Barrier before W5:** row above committed AND wave-gate checks (§6) pass.

### Wave W5
| Unit | Brief | Working dir | Files touched | Done when |
|---|---|---|---|---|
| `FE-9` | Verify the re-auth branch fires on the five 403→401 paths | admin | `verify (expect no change): server/api-client.ts:37,63,96`; `modify:` only if a gap is found | commit exists; `304` precedes `401` precedes envelope parsing, in all three wrappers |

**Barrier before W-final:** row above committed AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave, in **both** working dirs unless the wave's units are single-dir:

1. **Lint** — `npx next lint`.
2. **Type-check** — `npx tsc --noEmit` — **ungrepped.** Impl §3.2 is explicit: no `grep -v "^tests/"` filter anywhere in this pipeline. A type error originating in `tests/` is fixed as a test (FE-3/FE-4), never filtered.
3. **Unit tests** — `npx vitest run`. **W1/W2/W3 in `admin-frontend` are the declared exception to green-at-every-commit** (impl §3.2): expect 117 failures after W1 (FE-1 alone), ≤ 44 after W2 (FE-3), exactly the 3 FE-5 unknown-class failures after W3's FE-4, then those 3 resolved by FE-5 itself within the same wave. `client-frontend` has no such exception and must be green from W1 onward.
4. **Build smoke** — `next build` succeeds in both dirs (only meaningfully re-checked at W1's gate for FE-11's config change, and at W-final).

**Human gates:**
- [ ] **The three FE-5 verdicts, at the W3→W4 barrier.** FE-7 (W4) must not dispatch until each FE-5 verdict is recorded in the impl doc — recording the verdict from the empirical vitest run, not from reasoning about what "should" be true (proposal Q-7's own gating language). This is the one point in this schedule where a human should read the recorded verdicts before letting W4 proceed, even though the mechanical gate (vitest green) may already look satisfied.
- [ ] Otherwise — none; fully automated to PR.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flags any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `admin-frontend/lib/rm/subscriptions.ts` | `FE-6, FE-15` | Serialize: dispatch FE-6 first (`:38-40` delete `formatFeePercent`, `:124-125` repoint import), then FE-15 rebases and edits (redefines `SubClient`/`SubModel`/`TxnRow` in place of importing them) — no line overlap, but same file, same wave. |
| W2 | `admin-frontend/app/(roles)/rm/client-info/page.tsx` | `FE-13, FE-16` | Serialize: dispatch FE-16 first (deletes the `getMockOverlay`/`RENEWALS_DUE` dependency, inlines honest fallbacks), then FE-13 rebases and adds the loading-skeleton wrapper on top of the now-final page — wrapping a page that is about to be rewritten would waste the edit. |

**W3, W4 and W5 have no shared files — trivially parallel-safe (W3's two units touch disjoint files per impl §6; W4 and W5 are single-unit waves).**

**Cross-wave notes (informational only, no action needed):**
- `admin-frontend/components/rm/SubscriptionFormModal.tsx`: FE-6 (W1, `:154-155` fee-input parse) then FE-16 (W2, `:77`/`:100`/`:125-126` model-size lookup) — different regions, sequential by wave, no conflict.
- `admin-frontend/server/api-client.ts`: FE-7 (W4) then FE-9 (W5, verify-only unless a gap is found).

**Rebase discipline within a wave** (when serializing on a shared file):
1. The second contending agent waits until the first's commit is on the layer branch.
2. It runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If the rebase conflicts, it resolves, re-runs `npx vitest run` for the affected working dir, then commits. It does **not** push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

- [ ] Every unit ID FE-1 … FE-16 has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (including `lib/mock/mobo-data.ts` and `lib/mock/rm-data.ts` both absent; `lib/mock/eom-reports.ts` untouched).
- [ ] No frontend page was deleted anywhere in this layer — a standing constraint for this branch (impl §2.1: "no page is deleted anywhere in this layer").
- [ ] `admin-frontend`'s route/page list is unchanged in count; only `recon-overview/page.tsx`'s data source changed (FE-10).
- [ ] Exactly one exported `parseFeePercent` and one exported `formatFeePercent` exist in `admin-frontend`, both in `lib/fee.ts` (FE-6's invariant).
- [ ] No optional-chaining/`any` regressions introduced — spot-check `npx tsc --noEmit` output for new suppressions.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs, in **both** working dirs: `npx vitest run && npx tsc --noEmit && npx next lint` — ungrepped.
- Reports pass/fail counts per dir and any failing test's first traceback frame.
- Confirms the three FE-5 verdicts are present in the impl doc and match the final test run's actual outcome (not a stale earlier guess).
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS** in **both** working dirs. If either fails: do not open a PR; report every failure to the human; fixes are dispatched as a follow-up wave.

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** A red gate halts the algorithm at that wave — except the declared W1-W3 `admin-frontend` vitest exception (§6), which is expected red and not a stop condition provided the failure count is declining as specified.
- **New units mid-run:** add to the impl doc first (e.g. `FE-17`), then extend §3/§4/§5 here. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7.1 (the seam) suspends this run until the `-db`/`-be` layers acknowledge it.

---

## 10. Definition of done

- [ ] W1 through W5 committed on the layer branch; each wave gate green (W1-W3's `admin-frontend` vitest count declining per §6, not necessarily zero until W3 completes).
- [ ] The three FE-5 verdicts recorded in the impl doc before W4 dispatched.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS in both working dirs.
- [ ] No frontend page deleted anywhere in this layer.
- [ ] PR opened against `schema-repository-refactor-bugfix`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
