# 020 — Schema / Format Cleanup Refactor · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § **Layer 3 — Frontend** (A-1 … A-6, C-1, C-2, and the § B "Adapting to changes in other layers" table), plus the frontend half of § **Layer 4 — Test baseline** (B-3 client-frontend, B-4 admin-frontend, B-5 the three unknown-class failures).
> **Not** in this doc: Layer 4 B-1 / B-2 (the api-backend collection errors and the 255 backend failures) — those belong to the sibling BE doc.
> Layer: **Frontend** — one layer per file.
> Sibling layer docs: `docs/implementations/020-schema-format-cleanup-refactor-db.md`, `docs/implementations/020-schema-format-cleanup-refactor-be.md`
> Execution schedule: `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md`
> Branch: `schema-repository-refactor-bugfix-fe`
> Builds on / prerequisites: nothing merged from a sibling layer. The §7 seam is the only shared state; fees-as-fractions and the new error envelope are **assumptions**, mocked in tests (§8), never a runtime dependency on BE code.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 3 — Frontend; § Layer 4 B-3 / B-4 / B-5 |
| Frozen seam | same proposal, § 4. Cross-layer seam (frozen here) § 4.1 — copied verbatim into §7.1 |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md` |
| Sibling layer impl docs | `docs/implementations/020-schema-format-cleanup-refactor-db.md`, `docs/implementations/020-schema-format-cleanup-refactor-be.md` |
| Settled decisions realized here | D-1 (fraction is canonical), D-6 (measure before structural build work), D-8 (diagnose, don't re-assert), D-11 (admin skeleton-until-data; client-frontend not retrofitted), **D-12** (BE deletes only `GET /mobo/reconciliation`; `/mobo/trade-records` and its whole admin chain are retained — route count 94 → 93) |
| Open questions touched | **Q-7** — *"does the `FE-7` diagnosis change Phase 4's scope?"* Provisionally **no**; see FE-5 row 1, where the reproduction points at a test-registry bug rather than a swallowed error. The empirical confirmation stays gated in Phase 0c and is a precondition of FE-7 — the provisional answer does not release the gate. |
| Builds on | `main` @ `f76d0a4` — the measured baseline in §3.3 was taken there |

---

## 2. Branch & session contract

- **Branch:** `schema-repository-refactor-bugfix-fe` — every unit below lands on this one branch.
  - Convention: parent branch + `-fe`. The parent branch is captured at session start; the layer branch is cut from it and merges back into it. **The human owns that merge** (agents stop at "PR opened").

### 2.1 This layer spans TWO working directories

Unlike the DB and BE layers, this layer has **two** roots and no shared package:

| Working dir | Units that touch it |
|---|---|
| `admin-frontend/` | FE-1, FE-3, FE-4, FE-5, FE-6, FE-7, FE-9, FE-10, FE-11 (half), FE-12, FE-13, FE-14, FE-15, FE-16 — **14 units** |
| `client-frontend/` | FE-2, FE-8, FE-11 (half) — **3 units** |

IDs run FE-1 … FE-16. **FE-10 was re-scoped twice on 2026-08-03** — first subsumed by FE-3(d) (withdrawn), then briefly a page deletion the human explicitly rejected ("don't delete any page on the frontend"). Both are recorded as superseded history inside its own section. It now rewires the `recon-overview` dashboard onto `/trade-records` and deletes only the mock data file behind it (proposal C-0). **FE-15 and FE-16 were added the same day**, after the human asked where else the codebase feeds on mock data, then asked to resolve it rather than leave it: FE-15 deletes dead code in `lib/mock/rm-data.ts` and relocates its still-real types; FE-16 wires the model catalog to real data, resolves `getMockOverlay`'s 3 live fields to honest placeholders, and deletes `lib/mock/rm-data.ts` entirely (proposal C-0b/C-0c). **All 16 units do work; no page is deleted anywhere in this layer.**

They share no code, no `node_modules`, and no test run. **Every gate command in §3.2 runs once per working dir.** Each unit below names its working dir explicitly; where a unit says *admin-only*, `client-frontend/` must be byte-identical before and after.

The asymmetry is deliberate and settled (D-11): admin is where the drift is (117 test failures, zero loading states, an ungated test suite, the fee bug), and `client-frontend` is touched only where the proposal names it.

### 2.2 Preconditions (must be true before starting)

- [ ] The §7 seam is agreed at proposal level. §7.1 is a verbatim copy — it is not renegotiated with a sibling layer.
- [ ] `admin-frontend/node_modules` and `client-frontend/node_modules` are installed (`npm ci` in each). Both already declare `vitest@^4.1.10` and a `vitest.config.ts`.
- [ ] The frontend build baseline (§3.3) has been recorded on `main` — FE-11's acceptance is a *comparison*, and the "before" number cannot be recovered after the branch changes the config.

**Explicitly NOT preconditions** (they would break layer isolation):

- ~~"the BE branch is merged"~~ — it is not, and must not be. Fees arriving as fractions (§7.1 a) and errors arriving in the new envelope (§7.1 c) are **assumptions from the seam**. Every test that needs the other side of the seam fakes it with `vi.mock` / `vi.fn` returning the DTO shape stated in §8.3. No unit in this doc may import from `api-backend/`, start a backend, or hit a live endpoint.
- ~~"the DB migration has run"~~ — same reason. FE-6 changes what the frontend *sends and renders*; it does not read the database.

> **Consequence to accept up front:** between this branch merging and the BE branch merging, the running admin UI will divide fees by 100 against a backend that still stores percent. That window is the parent branch's problem, sequenced by proposal § Execution Phase 2 ("DB B-1 + Backend C-1/C-2 + Frontend A-1/A-2 land together; they are individually wrong"). It is **not** solved by weakening layer isolation here.

### 2.3 Read-first inventory

`admin-frontend/`:

| Path | Why |
|---|---|
| `.gitignore` (line 11) | FE-1 removes it |
| `package.json` (`scripts.dev` :6, `scripts.test` :10) | FE-11 |
| `next.config.mjs` (7 lines total) | FE-11 |
| `tsconfig.json` (no `target` key) | FE-11 candidate (ii) |
| `tailwind.config.ts:34` (`surface.highest`) | FE-12 — the token the ported primitive needs |
| `lib/onboarding/fee.ts:8-14` | FE-6 — the *keeper* (fraction scale) |
| `components/pc/model-management/CreateModelForm.tsx:209-220, 313-314` | FE-6 — the *deleted* percent-scale copy + 2 of its 4 call sites |
| `components/pc/model-management/EditModelForm.tsx:10, 89, 91` | FE-6 — the other 2 call sites, imported **from `CreateModelForm`** |
| `components/rm/OnboardingModal.tsx:25, 169-170` | FE-6 — the only importer of the fraction-scale copy; its import path moves |
| `components/pc/model-management/OverviewTab.tsx:26-27` | FE-6 display site |
| `lib/pc/format.ts:49-54` | FE-6 display site (`m.mgmt / 100`, `m.incentive / 100`) |
| `lib/pc/models.ts:21-22, 69-70` | FE-6 defaults `2` / `20` |
| `lib/pc/types.ts:96-97` | FE-6 — comment only; read-through, no logic change |
| `lib/rm/subscriptions.ts:38-40, 124-125` | FE-6 — `formatFeePercent` is **module-private** here and moves out |
| `components/rm/SubscriptionFormModal.tsx:154-155` | FE-6 input site (`parseFloat`) |
| `server/api-client.ts:37-42, 63-68, 96-103` | FE-7, FE-9 — the three `res.text()` sites + the `401` re-auth branch |
| `server/pc/index.ts:117-122` | FE-7 — competing convention #1 (parses, `downloadMaterial` only) |
| `lib/auth-api.ts:9-30` | FE-7 — competing convention #2 (login only) |
| `server/onboarding/index.ts:71, 91, 111, 148` | FE-7 — competing convention #3 (never reads the body) |
| `lib/download.ts` / `lib/downloadFile.ts` | FE-14 |
| `app/(shared)/monthly-reports/page.tsx:6` | FE-14 — the sole `downloadAs` importer |
| `lib/mobo/allocation.ts:24-29` (`ptaMoney`) | FE-4 — the 3 formatting failures |
| `app/(roles)/admin/actions.ts:28-34` (`toErrorResult`) | FE-5 — FE-7 diagnosis target |
| `app/(roles)/mobo/trade-reconciliation/{page.tsx,actions.ts}` + `hooks/api/useTradeRecords.ts` | Confirmed **live and retained** (D-12) — untouched by FE-10, which rewires a *different* page onto the same endpoint; FE-13 skeletonizes the trade-reconciliation page |
  - `app/(roles)/mobo/recon-overview/page.tsx`, `lib/mobo/reconciliation.ts` — FE-10 modifies both to source from `/trade-records`; `lib/mock/mobo-data.ts` is deleted once nothing imports it. Read first to confirm the single-consumer chain in FE-10's contract.
| `app/(roles)/rm/client-info/page.tsx:352-354` | FE-13 — the one existing hook-flag loading state to fold in |
| `app/(roles)/**` (20 `page.tsx`) | FE-13 |
| `tests/` (78 test files, currently untracked) | FE-1, FE-3, FE-4, FE-5 |

`client-frontend/`:

| Path | Why |
|---|---|
| `components/ui/skeleton.tsx` (8 lines) | FE-12 — the source of the verbatim port |
| `app/(dashboard)/**/loading.tsx` (8 files) | FE-13 — the pattern being replicated (`overview/loading.tsx` is the reference) |
| `lib/auth-api.ts:9-30` (`parseApiError`, currently **not exported**) | FE-7 model; FE-8 exports it |
| `lib/api/{documents.ts:18, kyc.ts:47, kyc.ts:66, onboarding.ts:6, portfolio.ts:37, tickets.ts:42}` | FE-8 — the six duplicates |
| `package.json:17` (`"lucide": "^1.3.0"`) | FE-11 candidate (i) |
| `next.config.mjs`, `package.json:6` | FE-11 |
| `tests/lib/auth-api.test.ts`, `tests/app/register/page.test.tsx`, `tests/components/auth/{AuthProvider,FE-16.auth-surface}.test.tsx` | FE-2 |

### 2.4 Hand-off / exit signal

All FE-* units committed on the layer branch; `npx vitest run && npx tsc --noEmit && npx next lint` green **in both working dirs, ungrepped**; §3.3's after-measurement recorded in this doc; the three FE-5 verdicts recorded in this doc; PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

**Observed data-flow chain (both apps, verified by reading the files, not inferred):**

```
app/(roles)/<role>/<route>/page.tsx        "use client"  — renders, owns no fetch
        │  calls
        ▼
hooks/api/use<Thing>.ts                    "use client"  — useState/useEffect + module-scoped Map cache
        │  imports & awaits
        ▼
app/(roles)/<role>/<route>/actions.ts      "use server"  — try/catch + logger, wraps the error as
        │  calls                                           { success:false, code:"ACTION_ERROR" }
        ▼
server/<domain>/index.ts                   "server-only" — ENDPOINTS lookup, DTO typing
        │  calls
        ▼
server/api-client.ts                       "server-only" — cookie id_token → Bearer, fetch, APIResult
        │  HTTP
        ▼
api-backend  /api/…
```

Concrete instance, end to end (the one FE-5 diagnoses):
`app/(roles)/admin/system-config/page.tsx` → `lib/admin/AdminStoreContext.tsx` → `app/(roles)/admin/actions.ts::getMatrix` → `server/admin/index.ts::getMatrix` → `server/api-client.ts::apiClientConditional` → `GET /api/admin/access/matrix`.

Second instance (MOBO, no per-route hook dir):
`app/(roles)/mobo/trade-reconciliation/page.tsx` → `hooks/api/useTradeRecords.ts` → `app/(roles)/mobo/trade-reconciliation/actions.ts::getRecords` → `server/mobo/index.ts::getTradeRecords` → `apiClient` → `GET /api/mobo/trade-records`.

`client-frontend` is one hop shorter: `app/(dashboard)/<route>/page.tsx` → `lib/hooks/use<Thing>.ts` → `lib/api/<domain>.ts` (browser `fetch` with the Firebase token, **no** server action, **no** `api-client.ts`). This is why FE-7 (admin) and FE-8 (client) are different units against the same seam: admin funnels every call through one shared wrapper; client does not have one.

**Rules every unit inherits:**

- **Dependency direction is one-way down that chain.** `lib/*` may not import from `app/*`; `server/*` may not import from `components/*`. One existing violation is load-bearing and stays: `hooks/api/useTradeRecords.ts:4` imports from `app/(roles)/mobo/trade-reconciliation/actions.ts`. That inversion is exactly why the proposal's original "delete `actions.ts`" instruction would have broken the build — see FE-10.
- **`APIResult<T>`** (`server/api-client.ts:5-7`) is admin's universal return shape: `{success:true,data} | {success:false,error:string,code:string}`. `error` is **always a display-ready string**; no unit may widen it to an object. FE-7 changes what fills it, never its type.
- **Formatters live in one file per domain** (`lib/pc/format.ts`, `lib/mobo/allocation.ts`). A second definition of an existing formatter is the defect class this branch exists to close (FE-6).
- **No new dependency.** Every unit here is config, deletion, or a move. `package.json` gains nothing (FE-11 only *removes* one).
- **No visual redesign** (proposal § Non-Goals). Skeletons mirror existing structure; no new colour, spacing, or component vocabulary.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each §6 unit is one atomic commit leaving the branch green. The single exception is FE-6, which is **deliberately one unit spanning six files** — see FE-6's rationale; splitting it ships a 100× error.
- **Every unit independently revertible**, with the dependencies noted per unit.
- **Gates before merge — run per working directory, from inside it:**

  ```bash
  # in admin-frontend/ , then again in client-frontend/
  npx vitest run && npx tsc --noEmit && npx next lint
  ```

  Both dirs already declare `"test": "vitest run"` in `package.json` and carry a `vitest.config.ts`, so `npm test` is equivalent to the first clause.

- **This gate is currently unusable in `admin-frontend`, and making it usable is unit FE-1.** On `main`:

  | Working dir | `npx vitest run` on `main` |
  |---|---|
  | `client-frontend` | 65 passed / **5 failed** / 2 unhandled errors (re-measured 2026-08-03, matches proposal Layer 4 A) |
  | `admin-frontend` | 371 passed / **117 failed** — and the 78 test files are **untracked**, because `.gitignore:11` ignores `tests/` |

- **The habitual workaround ends here.** `npx tsc --noEmit 2>&1 | grep -v "^tests/"` — filtering the type errors that come from the test tree — is exactly the practice that let admin accumulate 117 failures behind an ungated suite. **Every FE unit must leave the *ungrepped* command passing.** If a type error originates in `tests/`, the fix is the test (FE-3, FE-4), not the filter.
- **No secrets, no manual steps in the merge path.** The one human-judgement step in this layer is FE-5's three verdicts and FE-4's `ptaMoney` "look before you assert" — both are *recorded in this doc*, not silently baked into a commit.
- **Reversibility:** every unit here is code-only and reverts with the branch. Nothing in this layer is lossy. See §9.

### 3.3 Build-performance baseline (FE-11's acceptance data — fill in before changing config)

Recorded on `main`, `admin-frontend`, route `/pc/model-management` (the dashboard route with the heaviest icon + recharts graph):

| Measurement | Before (`main`) | After (FE-11) |
|---|---|---|
| Cold `next dev` → first paint of the route | `<TODO>` | `<TODO>` |
| Warm recompile after a one-character edit to that `page.tsx` | `<TODO>` | `<TODO>` |
| `next build` wall time | `<TODO>` | `<TODO>` |

Method: `rm -rf .next` before each cold run; take the median of 3; read the timing from Next's own `✓ Compiled /… in Xs` line, not a stopwatch. **The "before" row must be filled before FE-11 edits `next.config.mjs`** — it is unrecoverable afterwards.

---

## 4. Architecture (level 1 of 3)

**Two independent Next 14 App Router applications. No shared package, no workspace root.**

```
admin-frontend/                       ← 12 working units
├── next.config.mjs        FE-11      experimental.optimizePackageImports
├── package.json           FE-11      dev script → --turbo
├── tsconfig.json          FE-11(ii)  candidate: "target": "ES2017"
├── .gitignore             FE-1       drop line 11 (`tests/`)
├── lib/
│   ├── fee.ts             FE-6  NEW  the ONE parseFeePercent + formatFeePercent
│   ├── onboarding/fee.ts  FE-6  DEL  (moved to lib/fee.ts)
│   ├── download.ts        FE-14      kept — saveBase64File
│   ├── downloadFile.ts    FE-14 DEL
│   ├── pc/{format,models,types}.ts   FE-6  fraction-scale reads
│   ├── rm/subscriptions.ts           FE-6  formatFeePercent moves out
│   ├── mobo/allocation.ts            FE-4  ptaMoney — inspect, then decide
│   └── icons.ts                      FE-11 unchanged file; the thing being optimized
├── server/
│   ├── api-client.ts      FE-7,FE-9  envelope parsing ×3 + 401 re-auth branch
│   ├── pc/index.ts        FE-7       fold competing convention #1 in
│   └── onboarding/index.ts FE-7      fold competing convention #3 in
├── components/
│   ├── ui/skeleton.tsx    FE-12 NEW  verbatim port from client-frontend
│   ├── pc/model-management/{CreateModelForm,EditModelForm,OverviewTab}.tsx   FE-6
│   └── rm/{OnboardingModal,SubscriptionFormModal}.tsx                        FE-6
├── app/(roles)/<role>/<route>/
│   ├── Skeleton.tsx       FE-13 NEW  one per route (18 routes)
│   ├── loading.tsx        FE-13 NEW  two lines, renders <RouteSkeleton/>
│   └── page.tsx           FE-13      renders the SAME <RouteSkeleton/> while hook.loading
└── tests/                 FE-1       78 files — becomes tracked
                           FE-3,4,5   the 117 failures

client-frontend/                      ← 3 working units
├── next.config.mjs        FE-11      same two lines
├── package.json           FE-11      dev --turbo; drop dead "lucide" dep (:17)
├── components/ui/skeleton.tsx        FE-12 SOURCE — read-only, not modified
├── app/(dashboard)/**/loading.tsx    FE-13 SOURCE — read-only, NOT retrofitted (D-11)
├── lib/auth-api.ts        FE-8       export parseApiError
├── lib/api/*.ts           FE-8       six duplicates → the one export
└── tests/                 FE-2       5 failures (tracked already)
```

**Dependency direction:** `app/**/page.tsx` → `hooks/api/*` → `app/**/actions.ts` → `server/*` → `server/api-client.ts`. Nothing below imports from anything above. New files respect it: `lib/fee.ts` imports nothing; `components/ui/skeleton.tsx` imports nothing; each `Skeleton.tsx` imports only `@/components/ui/skeleton`.

**External seams:** this layer consumes the §7 contract only — fee values as decimal fractions on every DTO field, and the §7(c) error envelope on every non-2xx. Neither is a runtime dependency on sibling branch code; both are mocked in §8.

---

## 5. Modules (level 2 of 3)

### 5.1 `admin-frontend/tests` — the regression gate
- **Responsibility:** be the thing a commit is gated on. Today it is invisible to git and therefore gates nothing.
- **Files:** `admin-frontend/.gitignore`, `admin-frontend/tests/**` (78 files).
- **Public surface:** the `npx vitest run` exit code in `admin-frontend/`.
- **Owns features:** FE-1, FE-3, FE-4, FE-5. (FE-2 is the same responsibility in `client-frontend`, where the suite is already tracked.)

### 5.2 `admin-frontend/lib/fee` — fee-unit conversion
- **Responsibility:** the single definition of the percent-string ⇄ decimal-fraction conversion, in both directions.
- **Files:** `admin-frontend/lib/fee.ts` (new); deletes `admin-frontend/lib/onboarding/fee.ts` and the copy inside `CreateModelForm.tsx`; unexports-and-moves the one in `lib/rm/subscriptions.ts`.
- **Public surface:** `parseFeePercent(input: string): number`, `formatFeePercent(fraction: number): string`.
- **Owns features:** FE-6.

### 5.3 `admin-frontend/server` — the HTTP boundary
- **Responsibility:** turn an HTTP response into `APIResult<T>` with a display-ready `error` string.
- **Files:** `server/api-client.ts`, `server/pc/index.ts`, `server/onboarding/index.ts`, `lib/auth-api.ts`.
- **Public surface:** `apiClient`, `apiClientFormData`, `apiClientConditional`, `APIResult<T>`, `ConditionalResult<T>`.
- **Owns features:** FE-7, FE-9.

### 5.4 `client-frontend/lib/api` — the browser fetch boundary
- **Responsibility:** same job as 5.3, but browser-side and, today, six times over.
- **Files:** `lib/auth-api.ts`, `lib/api/{documents,kyc,onboarding,portfolio,tickets}.ts`.
- **Public surface:** `parseApiError(res, methodPath): Promise<string>` — currently module-private, becomes exported.
- **Owns features:** FE-8.

### 5.5 `admin-frontend` loading surface
- **Responsibility:** show structure-preserving placeholder markup continuously from navigation until data renders.
- **Files:** `components/ui/skeleton.tsx` (new), `app/(roles)/<role>/<route>/Skeleton.tsx` ×18 (new), `.../loading.tsx` ×18 (new), the corresponding `page.tsx` files.
- **Public surface:** `Skeleton` (the primitive) and one default-exported `<Route>Skeleton` per route.
- **Owns features:** FE-12, FE-13.

### 5.6 Build configuration (both apps)
- **Responsibility:** dev/build speed. No runtime behaviour.
- **Files:** `{admin,client}-frontend/next.config.mjs`, `{admin,client}-frontend/package.json`, `admin-frontend/tsconfig.json`.
- **Owns features:** FE-11.

### 5.7 Dead-surface removal
- **Responsibility:** remove the duplicate download helper. (It was also scoped to delete whatever BE C-5 stranded — under **D-12** it strands nothing on the frontend.)
- **Files:** `lib/downloadFile.ts`, `app/(shared)/monthly-reports/page.tsx`. `app/(roles)/mobo/trade-reconciliation/**`, `hooks/api/useTradeRecords.ts` and `server/mobo/*` are **read-only here — retained**.
- **Owns features:** FE-10, FE-14, FE-15, FE-16. (FE-10 was originally scoped to this module and withdrawn under its first target — D-12 retains the trade-reconciliation surface — then briefly re-scoped to delete `recon-overview`, which was rejected; it now rewires that page onto `/trade-records` and deletes only the mock data file. FE-15/FE-16 do the same "purge the mock" audit over `rm-data.ts`, ending in its deletion. FE-3(d) separately owns the stale spec-ahead tests.)

---

## 6. Features (level 3 of 3 — the work units)

Order is by ID (logical grouping), **not** execution order. Sequencing lives in the execution schedule.

---

### FE-1 — Un-gitignore `admin-frontend/tests/` and commit the suite (Yes)

- **Proposal ref:** § Layer 3 C-1 (and it is the root cause behind § Layer 4 B-4).
- **Working dir:** `admin-frontend/` — **admin-only.** `client-frontend/tests/` is already tracked (21 files, verified).
- **Module:** §5.1
- **Files:** `modify: admin-frontend/.gitignore`; `create (track): admin-frontend/tests/**` — 78 test files.
- **Dependencies:** none — parallel-safe, and **it should land first**: every other admin unit's gate is meaningless until the suite is tracked.

**Contract (required code):**

```diff
--- a/admin-frontend/.gitignore
+++ b/admin-frontend/.gitignore
@@ -8,7 +8,6 @@
 # testing
 /coverage
-tests/
```

Verification that it took effect:

```bash
cd admin-frontend
git check-ignore -v tests/lib/admin/FE-9.store.test.tsx   # must exit 1 (not ignored)
git status --porcelain tests/ | wc -l                      # must be 78
```

**The template tension — resolve it, do not paper over it.**

§8 of `templates/implementation_details.md` states that tests are *"NEVER committed — any layer"* and that `tests/` is git-ignored on every layer. This unit does the opposite. Both are correct, because they are about **two different bodies of tests**:

| | `admin-frontend/tests/**` on `main` today | `test-gen` output for THIS branch |
|---|---|---|
| Origin | Hand-written / generated across proposals 012–019, then hand-maintained; already on disk, 78 files, 488 tests | Written by the `test-gen` skill from §8 of this doc |
| Role | **The regression baseline.** It is the only artifact that can prove FE-4/FE-6/FE-7 did not break the other 371 passing tests | Per-unit acceptance checks for the units in §6 |
| This branch | **Committed** (this unit). An untracked baseline is not a baseline — it cannot be diffed, reviewed, or restored | **Stays uncommitted**, per §8.1 |

The rule the template is protecting is *"generated scaffolding does not become permanent repo weight"*. The rule this unit is protecting is *"a suite that no commit is gated on will drift, and this one drifted to 117 failures"*. The reconciliation is a line, not a compromise:

> **Everything under `admin-frontend/tests/` that exists on `main` at branch point is committed by FE-1 and is thereafter the tracked regression baseline. Anything `test-gen` writes for the units in this doc is added to `.gitignore` by path (or written under `tests/_generated/`) and is never staged.**

The implementer must record, in the FE-1 commit message, the exact file count committed, so a later reviewer can tell baseline from generated output.

**Behavior / invariants:**
- No test file's *content* is edited in this unit. FE-1 is `git add` and one deleted `.gitignore` line — nothing else. Content fixes are FE-3/FE-4/FE-5.
- Immediately after FE-1, `npx vitest run` in `admin-frontend` is **red** (117 failures). That is expected and correct: FE-1's job is to make the red visible, not to hide it. The branch is not "green at every commit" between FE-1 and FE-5 — this is the one **explicitly declared exception** to §3.2's green-at-every-commit rule, and the execution schedule must sequence FE-1 → FE-3 → FE-4 → FE-5 contiguously because of it.
- `npx tsc --noEmit` **ungrepped** must be run and its output captured in the FE-1 commit message as the "type errors originating in `tests/`" starting count. FE-3/FE-4 drive it to zero.

**Done when:** `git check-ignore tests/…` exits non-zero, `git ls-files admin-frontend/tests | wc -l` returns 78, and the commit message records both the file count and the ungrepped `tsc` error count.

---

### FE-2 — client-frontend: clear the 5 self-signup-purge failures (Yes)

- **Proposal ref:** § Layer 4 B-3.
- **Working dir:** `client-frontend/` — **client-only.**
- **Module:** §5.1 (test-gate responsibility, client side)
- **Files:** `delete: client-frontend/tests/lib/auth-api.test.ts`; `delete: client-frontend/tests/app/register/page.test.tsx`; `modify: client-frontend/tests/components/auth/AuthProvider.test.tsx`; `modify: client-frontend/tests/components/auth/FE-16.auth-surface.test.tsx` (line 94-97).
- **Dependencies:** none — parallel-safe.

**Verified baseline (re-run 2026-08-03 on `main`):**

```
Test Files  4 failed | 18 passed (22)
     Tests  5 failed | 65 passed (70)
    Errors  2 errors        ← both: "TypeError: signUpWithEmailPassword is not a function"
                              at tests/components/auth/AuthProvider.test.tsx:56
```

Cause is commit `3c562d9` (FE-16 of proposal 019), which removed `postBackendRegister` from `lib/auth-api.ts` and `signUpWithEmailPassword` from `components/auth/AuthProvider.tsx`.

**Contract (required code):**

Three distinct problems, three distinct fixes.

*(a) `tests/lib/auth-api.test.ts` — hard import of a deleted symbol. Delete the file.*

```ts
// tests/lib/auth-api.test.ts:5  — the import that cannot resolve
import {
  postBackendRegister,   // ← removed from lib/auth-api.ts by 3c562d9
  ...
```
Its remaining coverage (`postBackendLogin`, `getApiBase`, the 404 special-case) is already asserted by `tests/components/auth/FE-16.auth-surface.test.tsx`. **Before deleting, confirm that** — if any assertion is unique to this file, port it into the FE-16 file rather than losing it.

*(b) `tests/app/register/page.test.tsx` — imports a route that no longer exists. Delete the file.*

```ts
// tests/app/register/page.test.tsx:17
import RegisterPage from "@/app/register/page";   // `client-frontend/app/register/` does not exist (verified)
```

*(c) `tests/components/auth/AuthProvider.test.tsx` — source of the 2 unhandled errors.* Lines 49-56 destructure `signUpWithEmailPassword` off the context and call it; it is `undefined`, so React's event handler throws outside any assertion. Delete the two tests that exercise the registration flow (`"suppresses onAuthStateChanged's login-bind while signUpWithEmailPassword is in flight"`, `"always clears the registering guard, even when postBackendRegister throws (404 case)"`) and the `mockPostBackendRegister` scaffolding at :32/:39. Keep every login-path test in the file.

*(d) `tests/components/auth/FE-16.auth-surface.test.tsx:94-97` — rewrite the negative assertion.* This is the real bug of the four: a test written to verify a deletion, using a mock style that cannot express "absent".

```ts
// CURRENT — fails for the wrong reason.
// The file's top-level `vi.mock("@/lib/auth-api", …)` factory (line ~40) is
// EXHAUSTIVE: Vitest throws "No 'postBackendRegister' export is defined on the
// mock" on unknown-property access rather than yielding `undefined`, so this
// assertion can never observe the absence it is asserting.
it("negative: has no postBackendRegister export", async () => {
  const mod = await import("@/lib/auth-api");
  expect((mod as Record<string, unknown>).postBackendRegister).toBeUndefined();
});
```

Replace with a **partial** mock, so unmocked exports fall through to the real module and a *deleted* export really is `undefined`:

```ts
vi.mock("@/lib/auth-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-api")>()),
  postBackendLogin: (...args: unknown[]) => postBackendLoginMock(...args),
}));

it("negative: has no postBackendRegister export", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("@/lib/auth-api");
  expect(mod.postBackendRegister).toBeUndefined();
});
```

`vi.importActual` is the tighter of the two options the proposal offers (`importOriginal` or a source-text check) because it asserts against the **module's real export table**, bypassing the mock entirely — a source-text `expect(src).not.toContain("postBackendRegister")` would pass on a commented-out symbol.

**Behavior / invariants:**
- Coverage of the *purge itself* must not shrink. After this unit, at least one live assertion still proves each of: no `postBackendRegister` export, no `signUpWithEmailPassword` on the context value, no request to `/api/dev/register`, and `auth/email-already-in-use` mapping to the generic copy. All four exist in `FE-16.auth-surface.test.tsx` today; (d) makes the first of them meaningful.
- No `client-frontend` **source** file is modified by this unit.

**Done when:** `cd client-frontend && npx vitest run` reports `0 failed`, `0 errors`, and ≥ 63 passing (70 minus the deleted registration tests).

---

### FE-3 — admin: four shared-mock fixes + delete the spec-ahead tests (~55 + 18 failures) (Yes)

- **Proposal ref:** § Layer 4 B-4, rows 1–4.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.1
- **Files:** modify the shared test helpers / per-file mock factories listed below; `delete:` the 11 spec-ahead files enumerated in (d).
- **Dependencies:** **FE-1** (the suite must be tracked, or these edits are invisible to review).

Four sub-fixes. (a)–(c) are each *one* edit clearing 15–23 failures; (d) is a deletion.

**(a) 23 × `useAuth must be used within AuthProvider`.** Components gained a `useCanEdit` permission gate; the affected tests render the component bare.

*Contract — one shared helper, added under `tests/` and imported by all 23:*

```tsx
// tests/_helpers/renderWithAuth.tsx
import { render, type RenderOptions } from "@testing-library/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import type { ReactElement } from "react";

/** Render inside a real AuthProvider seeded with a fixed portal user, so
 *  `useCanEdit`/`usePageAccess` resolve instead of throwing. */
export function renderWithAuth(ui: ReactElement, opts?: RenderOptions) {
  return render(<AuthProvider>{ui}</AuthProvider>, opts);
}
```

Prefer the real `AuthProvider` wrapper over mocking `usePageAccess`: the wrapper exercises the gate, the mock stubs it out. Fall back to a `usePageAccess` **partial** mock only for the tests where a real provider drags in Firebase.

**(b) 17 × missing `useSearchParams`.** `next/navigation` is mocked per-file with an exhaustive factory; `OnboardingBoard.tsx:4` now calls `useSearchParams`, which the factory does not define.

```ts
// the shared next/navigation mock — PARTIAL, so the next added hook does not repeat this
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
```

**(c) 15 × missing hook exports (`useContactLogs`, `usePostTradeAllocationHistory`).** Same root cause as (b): exhaustive `vi.mock` factories over `@/hooks/api/*`.

```ts
// BEFORE — exhaustive: adding an export to the real module breaks every test that mocks it
vi.mock("@/hooks/api/useClient", () => ({ useClient: () => ({ data: null, loading: false }) }));

// AFTER — partial: unmocked exports fall through to the real module
vi.mock("@/hooks/api/useClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/api/useClient")>()),
  useClient: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));
```

> **(b) and (c) share one root cause, and the partial-mock conversion IS the fix.** Adding the two missing names would clear today's 32 failures and guarantee a 33rd the next time a hook module grows an export. Convert **every** `vi.mock` factory over a first-party module in `admin-frontend/tests/` to the `importOriginal` spread form, not just the failing ones. That is the difference between clearing a cluster and closing a defect class.

**(d) 18 × spec-ahead tests — delete.** Generated from the 012 / 015 impl docs for code that **never landed on `main`**. Verified: `grep -rn "getEod\|getReconciliation\|getFlow\|useReconciliationFlow\|flow-types" admin-frontend/{app,lib,server,hooks,components}` returns **zero** hits — every reference is inside `tests/`.

Files to delete (all 11 hit at least one nonexistent symbol; confirm each is entirely spec-ahead before deleting, and keep any test in them that exercises code that *does* exist):

```
tests/app/(roles)/mobo/daily-exception-report/FE-2.actions.test.ts
tests/app/(roles)/mobo/daily-exception-report/FE-6.print-page.test.tsx
tests/app/(roles)/mobo/trade-reconciliation/FE-2.actions.test.ts
tests/app/(roles)/mobo/trade-reconciliation/FE-5.page.test.tsx
tests/app/(roles)/mobo/trade-reconciliation/FE-6.mock-deletion.test.ts
tests/hooks/api/FE-3.use-eod-report.test.tsx
tests/hooks/api/FE-3.use-reconciliation-flow.test.tsx
tests/lib/mobo/FE-4.eod-types.test.ts
tests/lib/mobo/FE-4.reconciliation-mapper.test.ts
tests/server/mobo/FE-1.eod.test.ts
tests/server/mobo/FE-1.reconciliation.test.ts
```

**Behavior / invariants:**
- No `admin-frontend` **source** file is modified by this unit. If a fix appears to require a source change, it belongs to FE-4 or FE-5, not here.
- After (b)+(c), a repo-wide check must hold: no `vi.mock("@/…", () => …)` factory over a first-party module remains without `importOriginal`. Third-party module mocks (`firebase/auth`, `sonner`) may stay exhaustive.
- Deleting a spec-ahead file must not reduce coverage of anything real. The check is mechanical: every symbol the file imports either does not exist in source, or is covered by a surviving test.

**Done when:** `npx vitest run` in `admin-frontend` drops from 117 failures to **≤ 44** (117 − 23 − 17 − 15 − 18), and `npx tsc --noEmit` ungrepped reports no error originating in a deleted or mock-fixed file.

---

### FE-4 — admin: the ~38 UI-copy / DOM / module-boundary drift failures (Yes)

- **Proposal ref:** § Layer 4 B-4, rows 5 (`ptaMoney`, 3) and 6 (~38 mechanical).
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.1 (plus `lib/mobo/allocation.ts` if — and only if — the `ptaMoney` verdict says so)
- **Files:** `modify:` the drifted assertions across `FE-11`–`FE-15`, `ADM-5` and the role-guard nav tests; `read (and possibly modify): lib/mobo/allocation.ts:24-29`.
- **Dependencies:** **FE-3** (its shared-mock fixes change which tests even reach an assertion; fixing copy first means fixing it twice).

**The mechanical ~38.** Rendered copy, DOM structure and module boundaries moved; the assertions did not. Each is a one-line assertion update. The discipline that makes this safe:

> For each failure, open the **source** that produces the value and confirm the *current* output is the intended one, then update the assertion to it. Never copy the "Received" string out of the vitest diff into the "Expected" slot without reading the source. That copy-the-diff loop is precisely how a 117-failure baseline forms (proposal D-8), and it is indistinguishable, at review time, from a correct fix.

**The 3 `ptaMoney` failures are NOT mechanical — call them out separately.**

```ts
// admin-frontend/lib/mobo/allocation.ts:21-29 — current, after commit 4825f10
/** Format money: $X.XXM at/above 1e6, $Xk rounded at/above 1e3, else the plain dollar amount
 *  (small per-client allocations are common with real backend data and would otherwise all
 *  round to "$0k"). */
export function ptaMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(3)}M`;   // ← test expects '$6.80M', gets '$6.800M'
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(3)}k`;   // ← test expects '$250k',  gets '$250.000k'
  return `$${Math.round(v)}`;
}
```

Three signals that `toFixed(3)` on the `k` branch is an **unintended side effect** of `4825f10`, not a deliberate format change:

1. The function's own docstring, **left unedited by that commit**, still says *"`$Xk` rounded"* — `$250.000k` is not rounded, and the code now contradicts the comment directly above it.
2. `4825f10`'s stated intent was the small-value branch (*"would otherwise all round to `$0k`"*), which is the third `return`. Widening precision on the `k` branch does not serve that intent.
3. The sibling formatter `lib/pc/format.ts:32-42` (`fmtMoneyShort`) — the same display concept, elsewhere in the same app — uses `Math.round(x)` for `k` and `toFixed(1)` for `M`. `$250.000k` matches nothing else in the codebase.

**Required procedure — read `4825f10` before touching anything:**

```bash
git show 4825f10 -- admin-frontend/lib/mobo/allocation.ts
git log -L 24,29:admin-frontend/lib/mobo/allocation.ts
```

Then take exactly one of two branches and **record which, and why, in this unit's commit message**:

| Verdict | Action |
|---|---|
| The `M`-branch `toFixed(3)` was intended (3 dp reads as a real precision requirement for millions) but the `k`-branch was collateral | Restore `k` to `Math.round`, keep `M` at `toFixed(3)`. Update the `$6.80M`→`$6.800M` assertion; the `$250k` assertion then passes unchanged. **Product fix.** |
| Both were intended | Update all three assertions and **fix the docstring** so it stops contradicting the code. |

Do not resolve this by updating all three assertions without opening the commit. That is the outcome the proposal explicitly warns against.

**Behavior / invariants:**
- Every assertion changed in this unit is traceable to a source read, not to a diff paste.
- If a `ptaMoney` product fix lands, `mapDtoToPostTradeAllocation` and its screens are unaffected — `ptaMoney` is display-only and does no arithmetic that feeds a total.

**Done when:** `npx vitest run` in `admin-frontend` is down to **exactly the 3 FE-5 unknown-class failures**, and the `ptaMoney` verdict is written in the commit message.

---

### FE-5 — Diagnose the three unknown-class failures before touching any assertion (Yes)

- **Proposal ref:** § Layer 4 B-5, decision **D-8**; open question **Q-7**.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.1
- **Files:** `read: app/(roles)/admin/actions.ts:28-34`, `lib/admin/AdminStoreContext.tsx`, `lib/mobo/allocation.ts`; `modify:` per verdict — one of a source file, a fixture, or the test.
- **Dependencies:** **FE-3** (a shared-mock failure must not be mistaken for a product bug). **FE-7 must NOT land before this unit's FE-7-row verdict is recorded** — see the gate below.

**The rule:** each row gets a real diagnosis first; the outcome is then one of `{product fix, fixture fix, test rewrite}`, chosen *from* the diagnosis. Do not skip, do not silence, do not re-assert.

**Diagnosis table — hypothesis from the proposal, verdict filled in by the implementer:**

| # | Test | Proposal's hypothesis | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `tests/server/admin/FE-7.index.test.ts:197` — a thrown error is not funneled to `{success:false, code:"ACTION_ERROR"}` | **Most likely a real bug** — a swallowed error path in `app/(roles)/admin/actions.ts` | `<TODO — see the strong prior below>` | |
| 2 | `tests/lib/admin/FE-10.publish.test.tsx:81` — 3 staged cells produce 2 changes | Plausibly correct: a stage equal to the published value is dropped as a no-op, with a fixture that does not reflect that | `<TODO>` | |
| 3 | `tests/lib/admin/FE-9.store.test.tsx:109` — a staged `VIEW` does not beat a published `EDIT` | Likely a test bug: `eff` is called on a context object captured **before** `act`, i.e. a stale closure | `<TODO>` | |

**Row 1 — the gate, and a strong prior already established.** The verdict here must be recorded **before FE-7 lands**, because the envelope work rewrites the same error-handling path and would make a genuinely swallowed error look well-formed. Reproduction (run 2026-08-03, `main`):

```
AssertionError: expected { success: true, data: [] } to deeply equal { success: false, …(2) }
  - Expected                        + Received
  -   "code": "ACTION_ERROR",       +   "data": [],
  -   "error": "network down",      +   "success": true,
  -   "success": false,
❯ tests/server/admin/FE-7.index.test.ts:197
```

Read that received value carefully: `{success:true, data:[]}` is **the previous test's mock return**, not anything `actions.ts` could produce from a throw. `actions.ts:35-44` wraps `_getStaff()` in `try/catch` and returns `toErrorResult(error)` — there is no path through it that yields `success:true` from a throwing dependency. The two tests use back-to-back `vi.doMock("@/server/admin", …)` with no `vi.resetModules()` between them, so the second `await import("@/app/(roles)/admin/actions")` resolves from the module registry populated by the first — the throwing factory is never applied.

That points hard at **test rewrite** (add `vi.resetModules()` in a `beforeEach`, or hoist to `vi.mock` with a per-test `mockImplementationOnce`).

> **This is a prior, not a verdict, and the distinction is the whole point of D-8.** The reproduction above is strong evidence and it is why the coordinator has marked proposal **Q-7 provisionally resolved** — but a provisional resolution does not release the gate. Blind-updating an assertion to match observed behaviour is exactly the mechanism that produced the 377-failure baseline; reasoning our way to "it's probably just a test bug" and skipping the check is the same mistake wearing a better argument. **The confirmation step is the deliverable.**
>
> The confirmation is cheap and its shape is unambiguous: add `vi.resetModules()`, change **nothing** in `app/(roles)/admin/actions.ts` or anything below it, and re-run.
>
> - **Green with zero source edits** ⇒ verdict is *test rewrite*; Q-7 resolves to "no, the FE-7 diagnosis does not change Phase 4's scope"; FE-7 is unblocked. Record the diff in the Evidence cell so the next reader can see that no source moved.
> - **Still red** ⇒ `actions.ts` has a genuinely swallowed error path. The product fix lands **here, in FE-5, before FE-7** — the envelope work would otherwise rewrite that same path and make the swallowed case look well-formed. Q-7 reopens and Phase 4's scope is affected.
>
> Do not record the verdict from the reasoning above. Record it from the run.

**Row 3 — the stale closure is visible in the source.** `tests/lib/admin/FE-9.store.test.tsx:105-110`:

```tsx
const store = ctx as unknown as { eff: …; stage: … };   // ctx captured from the CURRENT render
act(() => store.stage("pc.model-management", "PC", "VIEW"));
expect(store.eff("pc.model-management", "PC")).toBe("VIEW");   // `store` is the PRE-act object
```

Sibling tests in the same file use a `store()` **accessor** (`tests/lib/admin/FE-10.publish.test.tsx:14-18` calls `store().stage(…)`), which re-reads `ctx` after each render. Re-run this assertion through the accessor form: green ⇒ test rewrite; still red ⇒ the precedence logic in `AdminStoreContext` is wrong and it is a product fix.

**Row 2 — confirm the rule, then choose.** Establish from `AdminStoreContext.tsx`'s `stage`/`publish` whether staging a cell to its already-published value is intentionally dropped from `changes`. If yes ⇒ fixture fix (`MATRIX_FIXTURE` must make all three staged values differ from published) **plus a comment naming the no-op-drop rule at the `publish` call site**, so the next reader does not re-derive it. If no ⇒ product fix in `publish`.

**Behavior / invariants:**
- No assertion in any of the three tests may be edited before its Verdict cell is filled in **in this document**.
- The verdict table above is the deliverable, as much as the code is. Proposal B-5: *"record the verdict in the impl doc — the next person to see these should not have to re-derive it."*
- A "test rewrite" verdict may not weaken what the test proves. Row 3 must still assert that a staged value beats a published one; it may only change *how* it reads the store.

**Done when:** all three Verdict + Evidence cells are filled, all three tests pass, `admin-frontend`'s suite is at **0 failures**, and the row-1 verdict is recorded in a commit that precedes FE-7's.

---

### FE-6 — One fee scale: the parser, the formatter, and all four consumer sites, in ONE unit (Yes)

- **Proposal ref:** § Layer 3 **A-1 + A-2** (deliberately merged — see below). Realizes seam §7.1(a) and decision **D-1**.
- **Working dir:** `admin-frontend/` — **admin-only.** `client-frontend` has **zero** fee references (verified) and is not touched.
- **Module:** §5.2
- **Files:**
  - `create: admin-frontend/lib/fee.ts`
  - `delete: admin-frontend/lib/onboarding/fee.ts`
  - `modify: components/pc/model-management/CreateModelForm.tsx` (delete :209-220, repoint :313-314)
  - `modify: components/pc/model-management/EditModelForm.tsx` (:10 import, :89, :91)
  - `modify: components/rm/OnboardingModal.tsx` (:25 import path only)
  - `modify: components/pc/model-management/OverviewTab.tsx` (:26-27)
  - `modify: lib/pc/format.ts` (:50, :52)
  - `modify: lib/pc/models.ts` (:21-22, and the comment at :18-20)
  - `modify: lib/pc/types.ts` (:96-97 — comment only)
  - `modify: lib/rm/subscriptions.ts` (:38-40 delete, :124-125 repoint)
  - `modify: components/rm/SubscriptionFormModal.tsx` (:154-155)
- **Dependencies:** none on other FE units. **Must not be split.**

> ## ⚠ THIS UNIT IS ATOMIC. SPLITTING IT BREAKS FOUR DISPLAY SITES BY 100×.
>
> The four sites in the table below are **correct today only because** `CreateModelForm`'s `parseFeePercent` is wrong. `lib/pc/format.ts:50` divides by 100 because the value it receives is `2`, not `0.02`. `lib/pc/models.ts:21` defaults to `2` for the same reason. Delete the bad parser on its own and every one of those four sites is instantly off by a factor of 100 — a 2% management fee renders as `0.02%` and a `parseFloat("1.0%")` input persists `1.0` where `0.01` is meant.
>
> There is no ordering of sub-commits that avoids this: the parser and its consumers must change in the same commit. The proposal says the same thing at Layer 3 A-2 (*"A-1 and A-2 must land in the same commit"*) and again at § Execution Phase 2 (*"they are individually wrong"*). If the execution schedule tries to split FE-6, the schedule is wrong.

**Contract (required code):**

*(1) The one module. `parseFeePercent` is the existing `lib/onboarding/fee.ts` body, moved unchanged (it is already fraction-scale and already correct). `formatFeePercent` is the existing private function from `lib/rm/subscriptions.ts:38-40`, moved and exported.*

```ts
// admin-frontend/lib/fee.ts  — the ONLY definition of either direction.
// Fee unit is the decimal fraction everywhere (seam §7.1(a)): 0.020000 means 2%.

/**
 * "1.5%" | "1.5" -> 0.015. Accepts the modals' free-text fee inputs (with or
 * without a trailing "%"); strips everything but digits and the decimal point,
 * then divides by 100. THROWS on empty/unparseable input so the caller surfaces
 * a validation error instead of silently sending 0.
 * Moved verbatim from lib/onboarding/fee.ts:8-14 — it is no longer onboarding-specific.
 */
export function parseFeePercent(input: string): number {
  const cleaned = input.trim().replace(/[^\d.]/g, "");
  if (!cleaned) throw new Error(`Invalid fee value: "${input}"`);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Invalid fee value: "${input}"`);
  return n / 100;
}

/**
 * 0.015 -> "1.5%". The inverse of parseFeePercent.
 * parseFloat after toFixed(2) trims trailing zeros (0.10 -> "10%", not "10.00%").
 * Moved from lib/rm/subscriptions.ts:38-40, where it was module-private.
 */
export function formatFeePercent(fraction: number): string {
  return `${parseFloat((fraction * 100).toFixed(2))}%`;
}
```

*(2) Delete the percent-scale twin.* `CreateModelForm.tsx:209-220` — the whole docstring **and** the function. The docstring is not salvage: it *codifies* the wrong convention (*"Fees are kept on the SAME whole-number percentage scale"*) and cites `lib/pc/models.ts` / `lib/pc/format.ts` as its justification — the very two files this unit corrects.

**It has four call sites, not two.** The proposal's A-1 names `CreateModelForm`; the fourth-listed file in its § B table is `EditModelForm.tsx`, which is where the other two live:

| Call site | Note |
|---|---|
| `CreateModelForm.tsx:313` `mgmt_fee: parseFeePercent(mgmtFee)` | in-file |
| `CreateModelForm.tsx:314` `incentive_fee: parseFeePercent(incentiveFee)` | in-file |
| `EditModelForm.tsx:89` `const mgmtFeeNum = parseFeePercent(mgmtFee)` | **imports it from `./CreateModelForm` at :10** |
| `EditModelForm.tsx:91` `const incentiveFeeNum = parseFeePercent(incentiveFee)` | same import |

`EditModelForm.tsx:10` currently reads `import { CategorySelect, CreateField, CreateTextArea, parseFeePercent } from "./CreateModelForm";` — drop `parseFeePercent` from that list and add `import { parseFeePercent } from "@/lib/fee";`. The three UI components stay where they are.

**Return-type change to handle:** the deleted copy returns `number | null` (empty input → `null` → "fall back to the hardcoded default"); the keeper **throws**. `EditModelForm.tsx:90` and `:92` compare `mgmtFeeNum !== (model.mgmt_fee ?? null)` and `CreateModelForm.tsx:313-314` assign into an optional `number | null` field. Guard the empty case at the call site rather than weakening the parser:

```ts
const mgmtFeeNum = mgmtFee.trim() === "" ? null : parseFeePercent(mgmtFee);
```

*(3) The four display / input sites — all in this same commit.*

| # | Site | Before | After |
|---|---|---|---|
| a | `components/pc/model-management/OverviewTab.tsx:26-27` | `` m.mgmt_fee ? `${m.mgmt_fee.toFixed(2)}%` : "2.00%" `` | `` m.mgmt_fee != null ? formatFeePercent(m.mgmt_fee) : formatFeePercent(0.02) `` (and `0.2` for incentive at :27) |
| b | `lib/pc/format.ts:50, 52` | `const mgmtFee = (m.mgmt / 100) * m.size;` / `const incFee = (m.incentive / 100) * (excess / 100) * m.size;` | `const mgmtFee = m.mgmt * m.size;` / `const incFee = m.incentive * (excess / 100) * m.size;` — **only the fee operand loses its `/100`. `excess` is a performance percentage, not a fee; its `/100` stays.** Update the docstring at :44-48, which currently says "both whole-number percentages". |
| c | `lib/pc/models.ts:21-22` | `const DEFAULT_MGMT_PCT = 2;` / `const DEFAULT_INCENTIVE_PCT = 20;` | `= 0.02;` / `= 0.2;` — rename to `DEFAULT_MGMT_FRACTION` / `DEFAULT_INCENTIVE_FRACTION` so the `_PCT` suffix stops lying, and fix the comment at :18-20. Consumed at :69-70. |
| d | `components/rm/SubscriptionFormModal.tsx:154-155` | `mgmt_fee: isNew ? parseFloat(mgmtFee) \|\| null : null` | `mgmt_fee: isNew ? (mgmtFee.trim() === "" ? null : parseFeePercent(mgmtFee)) : null` — same for `incentive_fee` at :155. `parseFloat("1.0%")` yields `1.0`; `parseFeePercent("1.0%")` yields `0.01`. |

*(4) Read-through sites — comments only, no logic.* `lib/pc/models.ts:81-82`, `lib/pc/types.ts:96-97`, `components/rm/SubscriptionAccordion.tsx:193-194`. `lib/pc/types.ts:96-97`'s trailing comments name `DEFAULT_MGMT_PCT` and must be updated to the renamed constants.

*(5) `lib/rm/subscriptions.ts`* — delete the private `formatFeePercent` at :38-40, `import { formatFeePercent } from "@/lib/fee";`, leave :124-125 otherwise untouched. Its inputs (`sub.mgmt_fee` from `ClientSubscriptionsDTO`) were **already** fractions per the 013 seam, which is why this file is a move and not a fix.

**Behavior / invariants:**
- **Repo-wide grep invariant** (proposal Goal 1): `grep -rn "parseFeePercent" admin-frontend --include=*.ts --include=*.tsx` (excluding `tests/`) returns **exactly one `export function` line**, in `lib/fee.ts`. Same for `formatFeePercent`.
- **Round-trip invariant:** the PC editor round-trips `"2.0"` → `0.02` (sent) → `"2%"` (rendered). `formatFeePercent(parseFeePercent(s))` is the identity on any well-formed percent string.
- **Boundary:** `parseFeePercent` throws on `""` and on non-numeric input. No call site may swallow that into `0` — a silently-zero fee is the failure mode the throw exists to prevent.
- **Range:** the seam's backend side enforces `Field(ge=0, lt=1)`. The frontend does **not** duplicate that validation (that is the BE's trust boundary), but no frontend site may produce a value `>= 1` from a plausible input — which is exactly what the four sites do today.

**Done when:** the two greps return one definition each; `npx vitest run && npx tsc --noEmit && npx next lint` green in `admin-frontend`; and the round-trip is demonstrated in a test per §8.3.

---

### FE-7 — Parse the §7(c) error envelope in `server/api-client.ts` (3 sites) and fold in the three competing conventions (Yes)

- **Proposal ref:** § Layer 3 A-3. Realizes seam §7.1(c). Decision **D-5** (envelope normalized at the BE handler layer, so the string case is byte-identical on the wire).
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.3
- **Files:** `modify: server/api-client.ts` (:38-42, :64-68, :99-103); `modify: server/pc/index.ts` (:117-122); `modify: server/onboarding/index.ts` (:71, :91, :111, :148); `modify: lib/auth-api.ts` (:9-30).
- **Dependencies:** **FE-5 row 1's verdict must be recorded first** (see FE-5's gate — the envelope work would disguise a genuinely swallowed error). No dependency on the BE branch: the envelope is an assumption (§7.2), mocked in tests.

**The defect, verified.** All three `api-client.ts` error branches read the body as **text**:

```ts
// server/api-client.ts:38-42 (identical at :64-68 and :99-103)
if (!res.ok) {
  let msg = `HTTP ${res.status}`;
  try { msg = (await res.text()).slice(0, 200) || msg; } catch { /* noop */ }
  return { success: false, error: msg, code: `HTTP_${res.status}` };
}
```

`error` then flows unchanged into `APIResult.error` and out to ~29 UI surfaces (`lib/admin/AdminStoreContext.tsx:184,195,…` plus ~19 `setError(r.error)` calls across `hooks/api/*`), so a 409 renders to the user as the literal `{"detail":"An override already exists for this user and page"}`.

**Contract (required code):**

*(1) One helper, one definition, at the top of `server/api-client.ts`. Modelled on `client-frontend/lib/auth-api.ts:9-30`, which is the working version of this logic.*

```ts
/** §7.1(c) envelope: { detail: string, code?: string, errors?: [...] }.
 *  Returns a display-ready message and, when present, the server's machine-readable slug.
 *  Falls back to statusText, then to `HTTP <status>`, when the body is not JSON — the
 *  fallback must survive Starlette's plain-text 500 and an empty body alike. */
async function parseErrorEnvelope(
  res: Response,
): Promise<{ error: string; code: string }> {
  const fallbackCode = `HTTP_${res.status}`;
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null) {
      const b = body as { detail?: unknown; code?: unknown };
      const detail =
        typeof b.detail === "string"
          ? b.detail
          : Array.isArray(b.detail)                      // pre-envelope 422 (see note)
            ? b.detail.map((x) => JSON.stringify(x)).join(", ")
            : null;
      if (detail) {
        return { error: detail, code: typeof b.code === "string" ? b.code : fallbackCode };
      }
    }
  } catch {
    /* not JSON — fall through */
  }
  return { error: res.statusText || `HTTP ${res.status}`, code: fallbackCode };
}
```

> The `Array.isArray` branch is defensive, not required by the seam. Per §7.1(c) `detail` is **always** a string once the BE handlers land — but this branch merges before that one does, and a raw Pydantic 422 must not regress to `res.statusText` in the meantime. Keep it; it is three lines and it is what `client-frontend/lib/auth-api.ts:16` already does.

*(2) All three sites collapse to two lines each.*

```ts
// server/api-client.ts — apiClient (:38-42), apiClientFormData (:64-68)
if (!res.ok) {
  const { error, code } = await parseErrorEnvelope(res);
  return { success: false, error, code };
}

// apiClientConditional (:99-103) — same, wrapped in its ConditionalResult
if (!res.ok) {
  const { error, code } = await parseErrorEnvelope(res);
  return { result: { success: false, error, code }, notModified: false };
}
```

*(3) The three competing conventions collapse into this one.*

| Convention | Where | Change |
|---|---|---|
| #1 — parses, but only in one function | `server/pc/index.ts:117-122` (`downloadMaterial`) | Replace the inline 6-line `errJson`/`detail` block with `parseErrorEnvelope(res)`. Export the helper from `api-client.ts` to make this possible. Behaviour is a superset: it also picks up `code`, and it gains the `statusText` fallback it lacks today. |
| #2 — login only | `lib/auth-api.ts:9-30` (`parseApiError`) | **Keep as-is.** It is not a duplicate: it appends contextual suffixes (`(POST /api/auth/admin/login)`, plus the "restart the FastAPI server" hint on 404) that the generic helper must not add to every error. Add a one-line comment naming it as the deliberate login-specific variant, so the next audit does not merge it away. |
| #3 — never reads the body at all | `server/onboarding/index.ts:71, 91, 111, 148` | The worst of the three: `if (!res.ok) return { success:false, error: \`HTTP ${res.status}\`, … }` **discards the response body entirely** — e.g. "No file uploaded for this document" becomes `HTTP 400`. All four are base64 download proxies with a bespoke fetch. Replace each with `parseErrorEnvelope(res)`. |

*(4) `code` propagation.* `APIResult.code` currently only ever holds `HTTP_<status>` / `UNAUTHORIZED` / `NOT_MODIFIED` / `NETWORK_ERROR`. It may now also hold the server's slug (e.g. `matrix_changed_since_read`). One existing consumer branches on it — `lib/admin/AdminStoreContext.tsx:223-226` tests for `HTTP_409` and calls `refreshMatrix()`. **That comparison must be widened, not replaced**, or the conflict-recovery path silently stops firing the moment the BE starts sending a `code`:

```ts
if (r.code === "HTTP_409" || r.code === "matrix_changed_since_read") { refreshMatrix(); … }
```

Grep for every `\.code ===` comparison on an `APIResult` and apply the same treatment. This is the one way FE-7 can break working behaviour, and it is easy to miss.

**Behavior / invariants:**
- **No toast or `setError` string may contain `{`.** That is the user-visible acceptance criterion (proposal § Execution Phase 4) and it is greppable in a test.
- `APIResult.error` stays `string`. The envelope's `errors[]` array is **not** surfaced by this unit — no admin UI renders per-field errors today, and adding one is a feature, not cleanup.
- A non-JSON body (Starlette's plain-text `Internal Server Error`, an empty 502 from a proxy) must yield `res.statusText`, never a thrown exception and never an empty string.
- The 401 short-circuit at `:37`, `:63`, `:96` runs **before** the `!res.ok` branch and is untouched by this unit — see FE-9.

**Done when:** all three `api-client.ts` sites and the four `onboarding/index.ts` sites call the one helper; `server/pc/index.ts:117-122`'s inline block is gone; `grep -rn "res.text()" admin-frontend/server` returns nothing; and a 409 with `{"detail":"…","code":"…"}` surfaces as the bare message with the slug in `code`.

---

### FE-8 — De-duplicate client-frontend's six error-unwrap helpers (Recommend)

- **Proposal ref:** § Layer 3 A-4.
- **Working dir:** `client-frontend/` — **client-only.**
- **Module:** §5.4
- **Files:** `modify: lib/auth-api.ts:9` (add `export`); `modify: lib/api/documents.ts` (:18-…), `lib/api/kyc.ts` (:47, :66 — **two** copies in this one file), `lib/api/onboarding.ts` (:6-…), `lib/api/portfolio.ts` (:37), `lib/api/tickets.ts` (:42).
- **Dependencies:** none — parallel-safe. Independent of FE-7 (different app, different code path).

**Verified:** `lib/auth-api.ts:9` declares `async function parseApiError(res, methodPath)` **without `export`** — which is why six near-copies exist. All six duplicate sites are confirmed by `grep -n statusText lib/api/*.ts`: `documents.ts:19` (inside `detailFromResponse`), `kyc.ts:47`, `kyc.ts:66`, `onboarding.ts:8` (inside `unwrapResponse`), `portfolio.ts:37`, `tickets.ts:42`.

**Contract (required code):**

```ts
// client-frontend/lib/auth-api.ts:9 — one word changes.
export async function parseApiError(res: Response, methodPath: string): Promise<string> {
```

Each of the six then becomes a call:

```ts
// e.g. client-frontend/lib/api/portfolio.ts:36-38
import { getApiBase, parseApiError } from "@/lib/auth-api";
// …
if (!res.ok) throw new Error(await parseApiError(res, `GET ${path}`));
```

**Behavior / invariants:**
- **Two behaviour deltas to accept knowingly**, because the shared version is the strictly better one and the proposal's stated goal is exactly this convergence:
  1. Messages gain the `(<status> <method> <path>)` suffix the six lack today.
  2. On 404 they gain the "restart the FastAPI server" hint. Harmless in an auth-adjacent dev tool; if a reviewer objects, the fix is a second exported `parseApiError` **option flag**, not a seventh copy.
- Any test asserting an exact error string from one of the six must be updated in the same commit — that is a real consequence, not drift.
- `documents.ts`'s `detailFromResponse` and `onboarding.ts`'s `unwrapResponse` are *wrappers around* the duplicated logic, not bare copies. Keep the wrapper, replace its body.
- After this unit: `grep -c "res.statusText" client-frontend/lib` returns **1** (in `auth-api.ts`).

**Done when:** the six duplicates are gone, `parseApiError` is exported and imported six times, and `npx vitest run && npx tsc --noEmit && npx next lint` is green in `client-frontend`.

---

### FE-9 — Verify the re-auth branch fires on the five paths the BE changes 403 → 401 (Yes)

- **Proposal ref:** § Layer 3 B table row 3; consumes seam §7.1(c)'s status table (*Missing or invalid credentials → 401*) and BE C-3.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.3
- **Files:** `verify (expect no change): server/api-client.ts:37, :63, :96`; `modify:` only if a gap is found.
- **Dependencies:** **FE-7** (same three functions; sequencing them apart avoids a merge conflict in the identical hunks).

This is a **verification unit**. Its expected outcome is *"no code change, one test added"*. Say so in the commit message if that is how it lands — a unit that correctly changes nothing is a result, not a non-event.

**Contract (required code):**

The branch already exists, three times over:

```ts
// server/api-client.ts:37   (apiClient)
if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
// :63  (apiClientFormData)  — identical
// :96  (apiClientConditional) — same, wrapped: { result: {…}, notModified: false }
```

**What to verify, in order:**

1. **All three wrappers have it.** Confirmed by reading: `:37`, `:63`, `:96`. If a *fourth* bespoke fetch path exists that lacks it, it is in scope. Candidates — the four base64 proxies in `server/onboarding/index.ts` (:70, :90, :110, :147) and `server/pc/index.ts:115`: **verified, all five do check 401 before `!res.ok`.** No gap.
2. **The 401 check precedes the `!res.ok` check** in each. Otherwise FE-7's envelope parsing would swallow the 401 into a generic error and the re-auth path would never see it. Confirmed at all three sites; **FE-7 must not reorder them**, and this unit's test locks that in.
3. **`code: "UNAUTHORIZED"` reaches a consumer that actually re-authenticates.** Trace every reader of `code === "UNAUTHORIZED"` from `hooks/api/*` and `lib/admin/AdminStoreContext.tsx` through to whatever triggers the re-login. This is the substantive half of the unit: the proposal asserts the branch exists, but never asserts that anything downstream *acts* on it. If the trace dead-ends in a generic toast, that is a real finding — record it, and fix it here if the fix is small; otherwise raise it rather than declaring the unit done.
4. **The five previously-403 backend paths** — `auth/deps.py:32`, `auth/deps.py:40`, `auth/status.py:14`, `:17`, `:20` — are BE-side and **not visible on this branch**. They are covered here only through the seam: the test mocks a `401` response and asserts the `UNAUTHORIZED` result. Do not attempt to reach the real endpoints.

**Behavior / invariants:**
- A `401` never reaches `parseErrorEnvelope`; its `error` is the fixed literal `"Unauthorized"` regardless of body, so a re-auth prompt is never replaced by a server message.
- `apiClientConditional`'s 304 check (`:93`) still precedes its 401 check — a `304` is not an auth failure.

**Done when:** the ordering invariant is covered by a test at all three wrappers, the step-3 trace is written into the commit message, and either "no source change required" or the specific gap fixed is recorded.

---

### FE-10 — Rewire the MOBO dashboard onto `/trade-records`; delete the mock file (Yes — user req.)

> **Re-scoped twice on 2026-08-03.** First written against the proposal's original (wrong) file list — nothing to delete once corrected, recorded as a withdrawn stub. Then re-scoped a second time to **delete** the `recon-overview` page outright, which the human explicitly rejected: *"don't delete any page on the frontend."* The confirmed direction wires the page to real data instead of removing it. Both earlier framings are kept as §"Superseded history" below rather than deleted, since together they are the record of why three different shapes were considered before this one.

- **Proposal ref:** § Layer 3 C-0 (the finding this unit now realizes); § Layer 3 B table row 4 (first superseded framing, see history); § 1.1; BE C-5; **decision D-12**.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.7
- **Files:** `modify: lib/mobo/reconciliation.ts` (add `mapTradeRecordToReconTrade`; convert `loadReconciliation()` into a `useReconciliation()` hook); `modify: app/(roles)/mobo/recon-overview/page.tsx` (call the hook instead of the function; render a loading state); `delete: lib/mock/mobo-data.ts`; `modify: tests/lib/mobo/FE-4.reconciliation-mapper.test.ts` (new cases for the new mapper, existing cases for `mapOrdersToReconTrade` untouched).
- **Dependencies:** none — parallel-safe with every other FE unit. Independent of FE-3(d) (that unit deletes *test* files for a surface that was never built; this unit rewires *shipped, live* code and deletes only the mock data file behind it).
- **Explicitly NOT touched:** the page itself, `lib/pages-config.ts` (no nav entry, no `ROLE_DEFAULT_PAGE.MOBO` change), `lib/mobo/types.ts` (`ReconView`/`ReconTrade` keep being the bundle shape — they are populated from a real source now, not removed), and the backend `/reconciliation` route's deletion in BE-4 (unaffected — this page never called it; it was always mock-backed, and now becomes trade-records-backed instead).

**The chain, traced end to end, and why the swap is a straight substitution, not a redesign:**

```
lib/mock/mobo-data.ts                  <- own header: "THROWAWAY MOCK — delete on API integration"
  └─ ONLY consumer: lib/mobo/reconciliation.ts::loadReconciliation()
       └─ ONLY consumer: app/(roles)/mobo/recon-overview/page.tsx:17,80

reconciliation.ts's own header, verbatim: "When the backend API arrives, only the
body of `loadReconciliation` changes (fetch → deserialize into `Order` / `Execution`
→ `mapOrdersToReconTrade`)... PURGE TEST (acceptance): deleting `lib/mock` and
pointing the provider at a real API must require ZERO edits here or in any
component — only the body of `loadReconciliation`."

The real API to point at already exists and is live: GET /api/mobo/trade-records,
consumed today by trade-reconciliation/page.tsx via useTradeRecords().
```

**The shape gap is real but degrades honestly, not lossily.** `TradeRecordRowDTO` (`lib/mobo/types.ts:351-368`) is flat and single-source by its own comment: *"There is no reconciliation behind these rows: `sys` is always 'CRM' and `status` always 'Confirmed' until a second source is wired."* `ReconTrade` (`types.ts:286-...`) carries a richer per-leg model — `ti`/`ic` legs, each a `ReconLeg` with `state: MatchState`, `breakType?`, `fields: CompareField[]`. With only one source, every trade genuinely is clean: `trade-reconciliation/page.tsx`'s own comment confirms *"every break counter is 0 and the verdict is always clean"* under this same data reality **today**, on the page already shipped. The new mapper reports the same true state for the dashboard — it does not fabricate a "matched" verdict where one isn't earned, it reflects the one that already exists.

**Contract (required code):**

```ts
// lib/mobo/reconciliation.ts — new mapper, alongside the existing mapOrdersToReconTrade
/**
 * Maps a single-source trade-records row into a ReconTrade view model.
 * DATA REALITY: with only CRM wired, nothing can disagree — both legs are
 * always `"ok"`, no `breakType`, `fields: []`. This is not a placeholder;
 * it is the correct verdict for today's actual data (see trade-reconciliation
 * page's own "every break counter is 0" reality).
 */
export function mapTradeRecordToReconTrade(row: TradeRecordRowDTO): ReconTrade {
  const okLeg: ReconLeg = { state: "ok", ls: null, rs: null, fields: [] };
  return {
    id: row.tradeId,
    inst: row.stock,
    book: AWAITING_SOURCE,          // no book/account field on this DTO yet
    ib: row.ref,
    ti: okLeg,
    ic: okLeg,
    // ...remaining ReconTrade fields set from row/AWAITING_SOURCE per the
    // existing field-by-field pattern in mapOrdersToReconTrade.
  };
}

// lib/mobo/reconciliation.ts — loadReconciliation() becomes a hook
/**
 * THE SINGLE DATA PROVIDER. Every MOBO screen calls this — now async.
 * Sources from GET /api/mobo/trade-records via the existing useTradeRecords
 * hook; the mock body is retired.
 */
export function useReconciliation(): {
  data: ReconView | null;
  loading: boolean;
  error: string | null;
} {
  const { data: records, loading, error } = useTradeRecords();
  const view: ReconView | null = records
    ? (() => {
        const trades = records.rows.map(mapTradeRecordToReconTrade);
        return {
          settleDay: records.day,
          trades,
          counters: deriveCounters(trades),        // unchanged — consumes ReconTrade[] only
          exceptions: [],                          // no source yet, honestly empty
          feeds: [],                               // no source yet, honestly empty
          eod: { ...EMPTY_EOD, byType: deriveEodByType(trades) },  // unchanged derivation
        };
      })()
    : null;
  return { data: view, loading, error };
}
```

```tsx
// app/(roles)/mobo/recon-overview/page.tsx — before
const { settleDay, counters, trades } = loadReconciliation();

// app/(roles)/mobo/recon-overview/page.tsx — after
const { data, loading, error } = useReconciliation();
if (loading) return <RouteSkeleton />;      // reuses FE-13's skeleton for this route
if (error || !data) return <ErrorState message={error ?? "No data"} />;
const { settleDay, counters, trades } = data;
```

**Behavior / invariants:**
- `grep -rn "mock/mobo-data" admin-frontend --include=*.ts --include=*.tsx` (excluding `tests/`) returns zero hits after this unit; `lib/mobo/reconciliation.ts` no longer imports from `../mock/mobo-data`.
- The page, its route, and its `pages-config.ts` entry are **byte-for-byte present** — a diff showing any of them removed means the earlier (rejected) framing was applied by mistake.
- `ROLE_DEFAULT_PAGE.MOBO` is **unchanged** — still `"mobo.recon-overview"`.
- With trade-records data present, `counters` shows `matched = reconciled, breaks = 0, unmatched = 0` — the honest single-source state, not a fabricated one.
- `npx tsc --noEmit` is clean: `ReconView`, `ReconTrade`, `loadReconciliation`'s former call sites all still resolve, now through `useReconciliation()`.
- If FE-13 lands first, this page's loading state reuses its route skeleton rather than introducing a second loading pattern; if FE-10 lands first, a minimal inline loading state is acceptable and FE-13 replaces it later. State the order actually taken in the execution schedule, not here.

**Done when:** `lib/mock/mobo-data.ts` no longer exists, `recon-overview/page.tsx` renders real trade-records data (or its loading/error states) with the page and nav otherwise unchanged, `tests/lib/mobo/FE-4.reconciliation-mapper.test.ts` covers `mapTradeRecordToReconTrade`, and `npx tsc --noEmit && npx vitest run` are both clean.

---

#### Superseded history — the withdrawal this ID originally recorded

**This sub-history is retained for traceability; it no longer describes what FE-10 does — it is the first of two superseded framings.** The proposal's first draft asked this unit to delete `hooks/api/useReconciliationFlow` and `app/(roles)/mobo/trade-reconciliation/actions.ts` — the live trade-records page's own action file. Verified 2026-08-03; confirmed independently by the BE agent and the coordinator; resolved by **D-12**:

| Proposal originally said | Reality on `main` | Outcome |
|---|---|---|
| Delete `hooks/api/useReconciliationFlow` | **Does not exist.** `admin-frontend/hooks/api/` holds 16 hooks; none is `useReconciliationFlow`. `grep -rn "useReconciliationFlow\|getFlow\|getReconciliation\|getEod\|flow-types" admin-frontend/{app,lib,server,hooks,components}` → **zero hits**. It exists only as a spec-ahead *test*. | Nothing to delete. Dropped from the file list — specifying the deletion of a nonexistent file is how a unit "passes" without doing anything. |
| Delete `app/(roles)/mobo/trade-reconciliation/actions.ts` | **Exists and is live.** Exports `getRecords`, imported by `hooks/api/useTradeRecords.ts:4`, which drives `app/(roles)/mobo/trade-reconciliation/page.tsx` — a page rendering real data. | **Retained.** Deleting it fails `npx tsc --noEmit` immediately (dangling import), violating §3.2. |
| "and the stale tests importing them" | Correct — 11 files. | **Done by FE-3(d)**, which owns the whole spec-ahead deletion cluster. Doing it twice is a merge conflict, not a safeguard. |

**The seam question that made this a blocker, and how D-12 answered it.** The page's data comes from `GET /api/mobo/trade-records`, declared at `api-backend/app/libs/reconciliation/router.py:52` — inside the package BE C-5 was originally going to delete whole:

```
app/(roles)/mobo/trade-reconciliation/page.tsx      (a real, rendering page)
  └─ hooks/api/useTradeRecords.ts:4
       └─ app/(roles)/mobo/trade-reconciliation/actions.ts::getRecords
            └─ server/mobo/index.ts::getTradeRecords
                 └─ GET /api/mobo/trade-records
```

A consumer scan split the router's two routes cleanly, and **D-12 keeps the one with a consumer**:

```
GET /api/mobo/reconciliation  -> no consumer anywhere        => DELETED by BE
GET /api/mobo/trade-records   -> useTradeRecords -> live page => KEPT
```

BE C-5 now deletes **only the `get_reconciliation` handler** (`reconciliation/router.py:38-51`). `router.py`, its `include_router` at `app/main.py:26,75`, and every module below it are retained. **Route count is 94 → 93, not 94 → 92.**

Consequences for this layer, all of them "no change":

- The trade-reconciliation page, its `actions.ts`, `useTradeRecords`, `server/mobo`'s `getTradeRecords` and the trade-record types in `lib/mobo/types.ts` **all stay**.
- **FE-13 covers 18 routes**, including row 8 (trade reconciliation). No amendment.
- No admin nav entry changes. No user-visible page disappears on this branch — which keeps the layer consistent with the proposal's § Non-Goals.

**What FE-3(d) alone was owed under the first withdrawn scope:** after FE-3(d) deletes the 11 spec-ahead test files, verify the deletion is **import-closed** — that no surviving source symbol was orphaned by it. That remains true and is still FE-3's own "Done when"; it is independent of FE-10's current scope and requires no coordination with it.

**Invariants that were true under the first withdrawn scope (kept for the record):**
- `grep -rn "useReconciliationFlow\|getFlow\|getReconciliation\|getEod\|flow-types" admin-frontend/{app,lib,server,hooks,components}` returns zero hits — this was already true before this branch and is unrelated to FE-10's current work.
- `app/(roles)/mobo/trade-reconciliation/` still contains both `page.tsx` and `actions.ts` at the end of the branch — unchanged by FE-10, which touches `recon-overview`, not `trade-reconciliation`.
- The `RECON_VIEW` action stays in the BE (proposal C-5). Nothing in the frontend references it.

#### Second superseded framing — page deletion, rejected 2026-08-03

A later draft of this unit specced deleting `recon-overview/page.tsx` outright, on the reasoning that its data source (the mock) was being purged and the page had no other consumer. The human rejected this directly: *"Why is recon-overview page being deleted? Do not delete any page on the frontend."* The correct resolution — confirmed by the human — is to rewire the page onto `GET /api/mobo/trade-records` rather than remove it, since that endpoint already exists and already serves the sibling `trade-reconciliation` page. This is recorded because it is the second time this unit's scope was corrected by evidence found one step too late, and the pattern (verify against source AND against the human's actual intent before specifying a deletion) is the thing worth remembering, not just the outcome.

**End of superseded history.** FE-10's live "Done when" is the one stated in its contract section above — not the withdrawn-stub language or the deletion language either earlier framing carried.

---

### FE-11 — `optimizePackageImports` + `--turbo` in both apps, with a recorded measurement (Yes — user req.)

- **Proposal ref:** § Layer 3 A-5; decision **D-6**.
- **Working dir:** **BOTH** `admin-frontend/` and `client-frontend/`.
- **Module:** §5.6
- **Files:** `modify: admin-frontend/next.config.mjs`, `client-frontend/next.config.mjs`, `admin-frontend/package.json:6`, `client-frontend/package.json:6`; conditionally `client-frontend/package.json:17`, `admin-frontend/tsconfig.json`.
- **Dependencies:** none — parallel-safe. **§3.3's "before" row must be filled first.**

**Contract (required code):**

*(1) The two lines. Both `next.config.mjs` files are currently 7 lines and byte-identical:*

```diff
 /** @type {import('next').NextConfig} */
 const nextConfig = {
   output: "standalone",
+  experimental: {
+    optimizePackageImports: ["lucide-react"],
+  },
 };

 export default nextConfig;
```

*(2) The dev flag:*

```diff
--- a/admin-frontend/package.json
+++ b/admin-frontend/package.json
-    "dev": "next dev -p 3001",
+    "dev": "next dev --turbo -p 3001",

--- a/client-frontend/package.json
+++ b/client-frontend/package.json
-    "dev": "next dev",
+    "dev": "next dev --turbo",
```

Target: `admin-frontend/lib/icons.ts` (162 lines, ~145 `lucide-react` re-exports, 62 importers) and `client-frontend/lib/icons.ts` (~60 icons × 19 importers). Neither `lib/icons.ts` is edited — the barrel is fine; what was missing was telling the bundler to tree-shake through it.

*(3) Measure, then stop.* Re-run §3.3's protocol and fill the "After" column. **The measurement is part of this unit's deliverable, not a follow-up.** Then take the candidate list only as far as the numbers justify:

| # | Candidate | Cost | Take it when |
|---|---|---|---|
| i | Remove `"lucide": "^1.3.0"` from `client-frontend/package.json:17` | XS | **Unconditional** — verified zero imports repo-wide, and it is a distinct package from `lucide-react`. Correctness, not speed; no measurement needed. |
| ii | Add `"target": "ES2017"` to `admin-frontend/tsconfig.json` `compilerOptions` (absent today → defaults to ES5) | XS | Admin's warm recompile is still materially worse than client's after (1)+(2). Note `client-frontend/tsconfig.json` should be checked for the same omission. |
| iii | Move `lib/mock/*-data.ts` (~1111 lines of fixtures) out of the build graph | S | (ii) did not close it, and a bundle inspection actually implicates the mocks. Several are still imported by live code (`lib/mock/rm-data.ts` types are used by `lib/rm/subscriptions.ts:8`) — this is not a pure deletion. |
| iv | `next/dynamic` around recharts (`StackedBarChart.tsx`, `portfolio/page.tsx`) | S | Only if the *route-level* timing for a chart route is the outlier. Zero dynamic imports exist in either app today, so this introduces a new pattern. |
| v | Reduce `"use client"` sprawl (112/182 admin files, all 20 `page.tsx`) | L | **Explicitly NOT attempted on this branch.** Converting a page to a server component changes where data is fetched and where hooks may run — that is an architectural change wearing a performance costume, on a branch whose § Non-Goals forbids behaviour change. If the measurement implicates it, it gets its own proposal. |

**Behavior / invariants:**
- **Zero runtime behaviour change.** `optimizePackageImports` is a compile-time import rewrite; `--turbo` affects `next dev` only and never `next build` or `next start`. No rendered output may differ.
- `next build` must still succeed in both apps — `--turbo` on the dev script does not exempt the production path from verification.
- Candidate (i) is a dependency removal: `npm ci` in `client-frontend` must succeed and the lockfile must be updated in the same commit.
- If the measured improvement is negligible, **record that** and stop at (1)+(2)+(i). A recorded null result is the point of D-6; it is what stops the next person from re-litigating it.

**Done when:** both `next.config.mjs` files carry the key, both dev scripts carry `--turbo`, `client-frontend/package.json:17` no longer lists `lucide`, §3.3's After column is filled with the same method as Before, and each candidate (ii)–(v) is marked taken-with-reason or skipped-with-reason.

---

### FE-12 — Port the `Skeleton` primitive to admin, verbatim (Yes — user req.)

- **Proposal ref:** § Layer 3 A-6 part 1; decision **D-11**.
- **Working dir:** `admin-frontend/` — **admin-only.** `client-frontend/components/ui/skeleton.tsx` is the source and is **read-only**.
- **Module:** §5.5
- **Files:** `create: admin-frontend/components/ui/skeleton.tsx`.
- **Dependencies:** none. **Blocks FE-13.**

**Contract (required code) — the whole file, copied character for character:**

```tsx
// admin-frontend/components/ui/skeleton.tsx
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["animate-pulse rounded bg-surface-highest", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
```

**Token check (done — no Tailwind config change needed):** `bg-surface-highest` resolves in admin at `admin-frontend/tailwind.config.ts:34` (`highest: "rgb(var(--color-surface-highest) / <alpha-value>)"`), inside the same `surface` scale client-frontend uses. `animate-pulse` and `rounded` are Tailwind built-ins. **The port needs no adaptation** — verify the token still resolves rather than assuming, then copy.

**Behavior / invariants:**
- No `"use client"` directive. The primitive is a pure server-renderable function with no hooks, which is what lets `loading.tsx` (a server component) render it — adding the directive would silently pull every route's `loading.tsx` into the client bundle.
- Verbatim means verbatim: identical class string, identical prop spread, identical name. Two divergent copies of an 8-line primitive is the exact defect class FE-6 and FE-8 exist to close; do not open a new one in the same branch.
- `className` is appended, so per-instance sizing (`h-4 w-32`) composes and callers can override `rounded` with `rounded-full`.

**Done when:** the file exists at `admin-frontend/components/ui/skeleton.tsx`, `diff` against the client-frontend original is empty, and it renders in a smoke test with the expected three classes.

---

### FE-13 — One `Skeleton.tsx` per admin route, rendered from both `loading.tsx` and the page's `loading` flag (Yes — user req.)

- **Proposal ref:** § Layer 3 A-6 parts 2–3; decision **D-11**.
- **Working dir:** `admin-frontend/` — **admin-only. `client-frontend` is NOT retrofitted** (D-11): it keeps its `loading.tsx`-only behaviour, and admin's coverage becomes strictly better. That asymmetry is deliberate and must not be "fixed" by a passing implementer.
- **Module:** §5.5
- **Files:** per route — `create: app/(roles)/<role>/<route>/Skeleton.tsx`, `create: app/(roles)/<role>/<route>/loading.tsx`, `modify: .../page.tsx`.
- **Dependencies:** **FE-12.** FE-10 keeps `recon-overview` (it rewires the page, it does not delete it) — the route list below covers all **18 admin routes**; D-12 separately keeps trade-reconciliation in scope.

**The 20 admin `page.tsx` files (enumerated, verified by `find app -name page.tsx`).** 18 get skeletons; 2 are excluded with reason:

| # | Route | Path | Has a hook `loading` flag today? |
|---|---|---|---|
| 1 | Admin · Enroll user | `app/(roles)/admin/enroll-user/page.tsx` | no |
| 2 | Admin · System config | `app/(roles)/admin/system-config/page.tsx` | via `AdminStoreContext` |
| 3 | Compliance · Overview | `app/(roles)/compliance/overview/page.tsx` | no |
| 4 | Compliance · Review | `app/(roles)/compliance/review/page.tsx` | no |
| 5 | MOBO · Commission tracking | `app/(roles)/mobo/commission-tracking/page.tsx` | no |
| 6 | MOBO · Post-trade allocation | `app/(roles)/mobo/post-trade-allocation/page.tsx` | **yes** |
| 7 | MOBO · Recon overview | `app/(roles)/mobo/recon-overview/page.tsx` | **yes, once FE-10 lands** — FE-10 converts it to an async `useReconciliation()` hook and needs a loading state; this row's skeleton is that state. If FE-13 lands first, FE-10 reuses it; if FE-10 lands first, it ships a minimal inline loading state that FE-13 then replaces. Page is **retained** (D-12 correction — no page is deleted in this layer). |
| 8 | MOBO · Trade reconciliation | `app/(roles)/mobo/trade-reconciliation/page.tsx` | **yes** — inline `Loader2` spinner at :197-201, inside the table body. Replace it with the route skeleton, same as row 12's one-off. **This route is retained (D-12)** and is in scope. |
| 9 | PC · Allocation matrix | `app/(roles)/pc/allocation-matrix/page.tsx` | **yes** |
| 10 | PC · Allotment / redemption | `app/(roles)/pc/allotment-redemption/page.tsx` | no |
| 11 | PC · Model management | `app/(roles)/pc/model-management/page.tsx` | no |
| 12 | RM · Client info (list) | `app/(roles)/rm/client-info/page.tsx` | **yes** — the existing one-off at **:352-354**, `{loading && !data && <div …>Loading…</div>}`. **Fold this into the pattern**; do not leave it beside it. |
| 13 | RM · Client info (detail) | `app/(roles)/rm/client-info/[id]/page.tsx` | **yes** |
| 14 | RM · Model subscription | `app/(roles)/rm/model-subscription/page.tsx` | no |
| 15 | RM · Onboarding / renewal | `app/(roles)/rm/onboarding-renewal/page.tsx` | no |
| 16 | RM · Requests (list) | `app/(roles)/rm/requests/page.tsx` | no |
| 17 | RM · Requests (detail) | `app/(roles)/rm/requests/[ref]/page.tsx` | **yes** |
| 18 | Shared · Monthly reports | `app/(shared)/monthly-reports/page.tsx` | no (mock-backed today) |
| — | Login | `app/(auth)/login/page.tsx` | **excluded** — a form, no data fetch; a skeleton would flash for nothing |
| — | Root | `app/page.tsx` | **excluded** — a role redirect, renders no content |

Where the "hook `loading` flag" column says *no*, write the `Skeleton.tsx` + `loading.tsx` pair anyway (that half of the gap is real) and add the page-side render only if/when that page gains a hook. Do **not** invent a loading flag to have something to gate on.

**Contract (required code) — the three-file shape, shown for one route:**

*(a) The skeleton — one component, the only place this markup exists.*

```tsx
// app/(roles)/pc/model-management/Skeleton.tsx
// Server component: no "use client", no hooks, no props. Rendered from BOTH
// loading.tsx and page.tsx so the two ends of the gap can never drift apart.
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelManagementSkeleton() {
  return (
    /* Outer wrapper MIRRORS page.tsx's own wrapper element and classes exactly. */
    <div className="flex flex-col gap-8 pb-20">

      {/* Page header — real chrome, skeletonized text */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Model table — SAME grid column count as the real table (5) */}
      <div className="border border-outline-variant rounded-lg overflow-hidden">
        <div className="bg-surface-container px-5 py-3 grid grid-cols-5 gap-4 border-b border-outline-variant">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-[18px] grid grid-cols-5 gap-4 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

*(b) `loading.tsx` — exactly two lines. This is the whole file.*

```tsx
// app/(roles)/pc/model-management/loading.tsx
import Skeleton from "./Skeleton";
export default Skeleton;
```

*(c) The page renders the same component while its hook is loading.*

```tsx
// app/(roles)/pc/model-management/page.tsx  (excerpt)
import ModelManagementSkeleton from "./Skeleton";
// …
const { data, loading, error } = useModels();
if (loading && !data) return <ModelManagementSkeleton />;
```

`loading && !data` — **not** bare `loading` — so a background refetch does not blank a populated screen. That is the same guard `rm/client-info/page.tsx:353` already uses; keep it.

**Why one component, not two copies.** The naive version writes the markup twice per route. Extracting it means 18 definitions instead of 36, `loading.tsx` is trivially reviewable, and the two ends **cannot** drift — they are literally the same JSX on both sides of the mount boundary, which is what makes the handoff visually seamless. `loading.tsx` alone covers only the RSC-payload/chunk fetch and unmounts the instant the client component mounts — *before* the hook's data arrives, which is exactly the gap users perceive as "nothing is happening".

**The client-frontend pattern, stated precisely — so this is implementable without opening `client-frontend`.** Distilled from all 8 files, with `app/(dashboard)/overview/loading.tsx` (117 lines) as the reference:

1. **Server component.** No `"use client"`, no hooks, no props. Default-exported, named `<Route>Loading` there / `<Route>Skeleton` here.
2. **Exactly one import:** `import { Skeleton } from "@/components/ui/skeleton";`. Nothing else — no icons, no UI components, no `clsx`.
3. **The outer wrapper is copied from the real page**, element and classes both (`<div className="flex flex-col gap-8 pb-20">`). If the skeleton's wrapper differs, the content jumps at handoff and the whole exercise is wasted.
4. **Real chrome is rendered for real.** Borders (`border border-outline-variant`), backgrounds (`bg-surface-lowest`, `bg-surface-container`), radii (`rounded-lg`), padding and dividers are the *actual* classes — not skeletonized. Only text and data slots become `<Skeleton>`.
5. **Grid column counts match the real table exactly.** `grid-cols-5` in the skeleton iff the real table has 5 columns; the header row maps `Array.from({length: 5})`.
6. **Repetition via `Array.from({ length: N }).map((_, i) => …)`** with `key={i}`. `N` is a plausible row count for that screen (3–6), not the real count.
7. **Sizes are explicit Tailwind width/height utilities** conveying the real content's shape: `h-10 w-72` for an h1, `h-5 w-96` for a subtitle, `h-4 w-24` for a cell, `h-5 w-20 rounded-full` for a status chip, `h-9 w-9 rounded-full` for an avatar, `h-3.5 w-full` for a column header.
8. **JSX region comments** name each block (`{/* Page header */}`, `{/* Account Summary + stat cards */}`, `{/* Left */}` / `{/* Right */}`). They are how a reviewer diffs the skeleton against the page without rendering either.

**Behavior / invariants:**
- **One definition per route.** `grep -rn "animate-pulse" app/` must show hits only inside `Skeleton.tsx` files — never inline in a `page.tsx` or `loading.tsx`.
- Every `loading.tsx` is exactly the two-line re-export. If one grows a third line, the markup has started to fork.
- **No new visual language** (proposal § Non-Goals). Every colour, radius and spacing token in a skeleton already appears in the page it mirrors.
- Route 12's existing text spinner at `rm/client-info/page.tsx:352-354` is **replaced**, not supplemented.
- No skeleton imports from `@/lib/icons` — that would pull the 145-icon barrel into the loading chunk and undo FE-11.
- The route table is **20 rows total, 18 live**: row 7 (`recon-overview`) is retained — FE-10 rewires it rather than deleting it, per the human's explicit instruction; D-12 keeps `GET /api/mobo/trade-records` and therefore keeps route 8 as well.

**Done when:** 18 routes each have a `Skeleton.tsx` and a two-line `loading.tsx`; every page with a hook `loading` flag renders the same component behind `loading && !data`; the `animate-pulse` grep invariant holds; and navigating to each route shows a skeleton continuously from click to data, with no flash of empty page at the mount boundary.

---

### FE-14 — One download helper (Recommend)

- **Proposal ref:** § Layer 3 C-2.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.7
- **Files:** `delete: lib/downloadFile.ts`; `modify: app/(shared)/monthly-reports/page.tsx:6` and its `downloadAs` call sites.
- **Dependencies:** none — parallel-safe.

**Contract (required code):**

`lib/download.ts` is the keeper — it matches how admin actually fetches files (every download is proxied through a Node server action as base64, because the cookie `id_token` cannot ride a plain `<a href>`):

```ts
// admin-frontend/lib/download.ts — unchanged, the single helper
export function saveBase64File(filename: string, contentType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
```

`lib/downloadFile.ts`'s `downloadAs(url, filename)` fetches a URL client-side and is used by exactly one file, `app/(shared)/monthly-reports/page.tsx:6` — which is mock-backed (`MOCK_EOM_REPORTS`, imported at :7) and has no authenticated endpoint behind it.

**The two are not drop-in equivalent** — `downloadAs` takes a URL, `saveBase64File` takes bytes. Repointing means giving `monthly-reports` a server action that returns `{filename, contentType, base64}`, exactly like `server/onboarding/index.ts::downloadDocumentRm`. Two honest options; pick and record:

| Option | When |
|---|---|
| **A — repoint properly.** Add the server-action proxy, call `saveBase64File`. | The monthly-report download is meant to hit a real endpoint. Larger than "Recommend/XS" implies. |
| **B — inline the four lines.** `monthly-reports` is mock-backed; drop `lib/downloadFile.ts` and let the one call site do its own `fetch`+`URL.createObjectURL` locally, with a `// ponytail:` comment noting it becomes `saveBase64File` when the page moves off mocks. | The page stays mock-backed for now. Achieves the stated goal — **one shared** download helper — for the price of a local function. |

Both satisfy the actual requirement (*there is exactly one download helper in `lib/`*). Do not do a mechanical import swap: `saveBase64File(url, …)` would compile and then hand `atob` a URL at runtime.

**Note for a future branch, not this one** (verbatim from the proposal, so it is not lost): admin round-trips every file through a Node server action as base64 (~33% inflation, full buffering — the zip-all path is the worst case) while the client portal streams directly. Unifying on streaming is a separate proposal.

**Behavior / invariants:**
- `lib/downloadFile.ts` no longer exists; `grep -rn "downloadFile\|downloadAs" admin-frontend/{app,lib,components,hooks,server}` returns nothing.
- The monthly-reports download still produces a file with the same filename and MIME type as before.

**Done when:** the file is deleted, the one call site works, the grep is empty, and the chosen option is named in the commit message.

---

### FE-15 — Delete `rm-data.ts`'s dead code; relocate its real types out of `lib/mock/` (Yes — user req.)

> **Added 2026-08-03**, after the human asked where else the codebase still feeds on mock data and this doc's answer required a full consumer trace. One near-miss during that trace: `RM_CLIENTS`/`CLIENT_EXTRA` looked dead by external grep alone (zero importers outside `rm-data.ts`), but both feed `getMockOverlay()`'s `OVERLAY_ROTATION` internally and are live. Every export below was checked for internal use before being called dead — see proposal **D-13**.

- **Proposal ref:** § Layer 3 C-0b.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.7 (extends its ownership; see updated line below)
- **Files:** `modify: lib/mock/rm-data.ts` (delete the dead cluster; delete the `RequestTicket` re-export at :500; delete the type definitions being relocated); `create: lib/rm/types.ts` (new home for `SummaryItem`, `CountItem`, `ClientDoc`, `HistoryEntry`); `modify: lib/rm/subscriptions.ts` (now defines `SubClient`, `SubModel`, `TxnRow` instead of importing them); `modify: hooks/api/useRmTickets.ts` (repoint `RequestTicket` to `@/lib/rm/tickets`); `modify:` the 7 remaining external import sites listed below.
- **Dependencies:** none — parallel-safe with every other FE unit, including FE-10 (different files; both touch `lib/mock/` but not the same file — FE-10 touches `mobo-data.ts`/`reconciliation.ts`, this touches `rm-data.ts`).

**The three-way split, exactly as classified in the proposal — do not re-derive it, use this table:**

| Disposition | Exports | Action |
|---|---|---|
| **Dead** | `getClientDetail()`, `ClientDetail`, `ClientPreferences`, `EMPTY_PREFERENCES`, `clientContactLog()`, mock `ContactLogEntry`, `KNOWN_CLIENT_IDS`, `SUB_CLIENTS` | Delete outright |
| **Relocate — real types, wrong home** | `SubClient`, `SubModel`, `TxnRow` → `lib/rm/subscriptions.ts`; `SummaryItem`, `CountItem`, `ClientDoc`, `HistoryEntry` → new `lib/rm/types.ts`; `RequestTicket` re-export → delete (real definition already lives in `lib/rm/tickets.ts`) | Move, then repoint every importer |
| **Stays — genuinely mock, no backend, out of scope here** | `RENEWALS_DUE`, `getMockOverlay()` (+ its `RM_CLIENTS`/`CLIENT_EXTRA` inputs), `MODEL_SIZES`/`MODEL_SIZE_LIST`, `OB_MODEL_CATALOG` | Do not touch |

**Import sites to repoint (verified, not assumed):**

| File | Change |
|---|---|
| `components/rm/SubscriptionAccordion.tsx:10` | `SubClient, SubModel, TxnRow` from `@/lib/mock/rm-data` → `@/lib/rm/subscriptions` |
| `lib/rm/subscriptions.ts:8` | deletes its own `import type {...} from "@/lib/mock/rm-data"` — becomes the definer |
| `components/rm/SubscriptionFormModal.tsx` | none — it only imports `MODEL_SIZES`, which stays |
| `app/(roles)/rm/model-subscription/page.tsx:14` | `SubClient` → `@/lib/rm/subscriptions`; `OB_MODEL_CATALOG` import is untouched, stays from `@/lib/mock/rm-data` |
| `app/(roles)/rm/client-info/page.tsx:26` | split: `SummaryItem`/`CountItem` → `@/lib/rm/types`; `RENEWALS_DUE`/`getMockOverlay` stay from `@/lib/mock/rm-data` |
| `app/(roles)/rm/client-info/[id]/page.tsx:20` | `ClientDoc, HistoryEntry` → `@/lib/rm/types` |
| `hooks/api/useSubscriptions.ts:7` | `SubClient` → `@/lib/rm/subscriptions` |
| `hooks/api/useRmTickets.ts:6` | `RequestTicket` → `@/lib/rm/tickets` (the real, already-canonical home) |
| `components/rm/SummaryCard.tsx:8` | `SummaryItem, CountItem` → `@/lib/rm/types` |

**Contract (required code):**

```ts
// lib/rm/types.ts — new file
export type SummaryItem = { id: string; c: string; d?: string; s?: string; t: ChipTone };
export type CountItem = { id: string; c: string; n: number; t: "primary" | "muted" };
export type ClientDoc = { name: string; status: string; tone: ChipTone; icon: string };
export type HistoryEntry = { t: string; d: string; accent?: boolean; detail?: string[] };
```

```ts
// lib/rm/subscriptions.ts — before (header comment + import)
// Reuses the EXISTING SubClient/SubModel/TxnRow types from lib/mock/rm-data.ts
// verbatim -- this file produces values of those types, it does not redefine them.
import type { SubClient, SubModel, TxnRow } from "@/lib/mock/rm-data";

// lib/rm/subscriptions.ts — after
// SubClient/SubModel/TxnRow's canonical home (moved from lib/mock/rm-data.ts,
// which no longer has any mock subscription data to anchor them to — see
// lib/rm/tickets.ts for the identical precedent with RequestTicket).
export type TxnRow = [/* unchanged shape */];
export type SubModel = { /* unchanged shape */ };
export type SubClient = { /* unchanged shape */ };
```

```ts
// lib/mock/rm-data.ts — after: only genuinely-mock content remains exported
export const RM_CLIENTS: RmClient[] = [ /* unchanged — feeds RENEWALS_DUE + OVERLAY_ROTATION */ ];
export const CLIENT_EXTRA: Record<string, ClientExtra> = { /* unchanged — feeds OVERLAY_ROTATION */ };
export const RENEWALS_DUE: SummaryItem[] = /* unchanged; SummaryItem now imported from lib/rm/types */;
export const MODEL_SIZES: Record<string, number> = { /* unchanged */ };
export const MODEL_SIZE_LIST = /* unchanged */;
export const OB_MODEL_CATALOG: ModelCatalogEntry[] = [ /* unchanged */ ];
export function getMockOverlay(id: string): MockOverlay { /* unchanged; ClientDoc/HistoryEntry now imported */ }
// getClientDetail, ClientDetail, ClientPreferences, EMPTY_PREFERENCES,
// clientContactLog, the mock ContactLogEntry, KNOWN_CLIENT_IDS, SUB_CLIENTS,
// and the `export type { RequestTicket } from "@/lib/rm/tickets"` re-export
// are ALL DELETED — no trace, no re-export, no `// removed` comment.
```

**Behavior / invariants:**
- `grep -rn "getClientDetail\|KNOWN_CLIENT_IDS\|SUB_CLIENTS\b" admin-frontend --include=*.ts --include=*.tsx` returns zero hits after this unit — the dead cluster is gone, not commented out.
- `RM_CLIENTS`, `CLIENT_EXTRA`, `getMockOverlay`, `RENEWALS_DUE`, `MODEL_SIZES`, `MODEL_SIZE_LIST`, `OB_MODEL_CATALOG` **all still exist in `lib/mock/rm-data.ts` and are byte-for-byte unchanged in behavior, as of this unit** — FE-15 relocates types and deletes dead code, it does not touch a single still-mock value. **FE-16, a separate unit, resolves and deletes all of these** — do not treat this invariant as true after FE-16 has landed; it describes FE-15's own boundary, not the file's final state.
- `getMockOverlay()`'s output is identical before and after **this unit** — same hash, same rotation index, same fields — since `OVERLAY_ROTATION`'s construction is untouched here; only the *type* of `ClientDoc`/`HistoryEntry` it returns now resolves from a different import path. FE-16 deletes `getMockOverlay()` entirely.
- `npx tsc --noEmit` is clean: no import from `@/lib/mock/rm-data` for any of the 8 relocated/repointed names survives.
- `lib/mock/eom-reports.ts` is **not touched** by this unit — it wasn't part of the trace that produced this classification (it has its own, simpler split: `MOCK_EOM_REPORTS` stays mock, only the `EomReport` type *could* relocate, and that is explicitly left for a later pass, not bundled in here).

**Done when:** the dead cluster is gone, `lib/rm/types.ts` exists with the four relocated types, `lib/rm/subscriptions.ts` defines `SubClient`/`SubModel`/`TxnRow` instead of importing them, all 8 import sites in the table above are repointed, `lib/mock/rm-data.ts` exports only genuinely-mock content, and `npx tsc --noEmit && npx vitest run` are both clean.

---

### FE-16 — Wire model catalog + size to real data; resolve the client-overlay's 3 live fields; delete `lib/mock/rm-data.ts` (Yes — user req.)

> **Added 2026-08-03**, immediately after FE-15, when the human asked to resolve the remaining "still-mock, out of scope" bucket rather than leave it. Tracing further found: (a) a real backend for the model catalog already exists and both mock call sites already anticipated the swap in their own comments; (b) `getMockOverlay()` computes 15 fields but its one call site reads 3; (c) once those 3 become honest, everything else in the file was already dead. The scope grew from "wire two fields" to "delete the file" over the course of that trace — recorded here so the size of the change is not a surprise relative to how it was asked for.

- **Proposal ref:** § Layer 3 C-0c.
- **Working dir:** `admin-frontend/` — **admin-only.**
- **Module:** §5.7
- **Files:** `modify: app/(roles)/rm/model-subscription/page.tsx` (real `useModels()` instead of `OB_MODEL_CATALOG`); `modify: components/rm/SubscriptionFormModal.tsx` (`availableModels` gains `size`; fix the name-keyed lookup bug); `modify: app/(roles)/rm/client-info/page.tsx` (delete the `getMockOverlay` call and the `RENEWALS_DUE` import; inline honest fallbacks); `delete: lib/mock/rm-data.ts` (now empty of any export nothing else needs).
- **Dependencies:** **FE-15** (deletes the file FE-15 trimmed and relocated types out of — must land first, or in the same commit) **and FE-6** (this unit imports `DEFAULT_MGMT_FRACTION`/`DEFAULT_INCENTIVE_FRACTION` and `formatFeePercent` from `lib/fee.ts`, both of which only exist post-FE-6; importing the pre-FE-6 names would be wrong-scale by construction). **Shares a file with FE-6, no line overlap:** FE-6 touches `SubscriptionFormModal.tsx:154-155` (the fee-input parse on submit); this unit touches `:77` (the `availableModels` prop type), `~:100` (the `modelSize` computation), and `:125-126` (`onModelChange`) — different regions of the same file. `DEFAULT_MGMT_FRACTION`/`DEFAULT_INCENTIVE_FRACTION` (used below) are the constants FE-6 renames `lib/pc/models.ts:21-22` to — this unit assumes FE-6 has landed, since importing the old `DEFAULT_MGMT_PCT` names would be wrong-scale by definition.

**Contract (required code):**

```ts
// app/(roles)/rm/model-subscription/page.tsx — before
import { OB_MODEL_CATALOG, type SubClient } from "@/lib/mock/rm-data";
const availableModels = OB_MODEL_CATALOG.map((m) => ({
  id: m.model_id, name: m.name, mgmtFee: m.mgmtFee, incentiveFee: m.incentiveFee,
}));

// app/(roles)/rm/model-subscription/page.tsx — after
import { useModels } from "@/hooks/api/useModels";
import { formatFeePercent } from "@/lib/fee";           // per FE-6 — same fraction-scale formatter
// ...
const { data: models } = useModels();
const availableModels = (models ?? []).map((m) => ({
  id: m.id, name: m.name, size: m.size,
  mgmtFee: formatFeePercent(m.mgmt_fee ?? DEFAULT_MGMT_FRACTION),
  incentiveFee: formatFeePercent(m.incentive_fee ?? DEFAULT_INCENTIVE_FRACTION),
}));
```

```tsx
// components/rm/SubscriptionFormModal.tsx — before
availableModels?: { id: string; name: string; mgmtFee: string; incentiveFee: string }[];
// ...
const modelSize = locked ? (context.modelSize ?? 0) : (MODEL_SIZES[model] ?? 0);  // name-keyed, buggy

// components/rm/SubscriptionFormModal.tsx — after
availableModels?: { id: string; name: string; mgmtFee: string; incentiveFee: string; size: number }[];
// ...
const modelSize = locked
  ? (context.modelSize ?? 0)
  : (availableModels.find((m) => m.id === modelId)?.size ?? 0);   // id-keyed, matches the
                                                                    // existing mgmtFee/incentiveFee lookup
```

```tsx
// app/(roles)/rm/client-info/page.tsx — before
import { RENEWALS_DUE, getMockOverlay } from "@/lib/mock/rm-data";
// ...
const mockOverlay = getMockOverlay(r.id);
const ob = onboardingByUserId.get(r.id);
const overlay = ob
  ? { ...mockOverlay, status: COLUMN_LABELS[ob.status], tone: ONBOARDING_TONE[ob.status] }
  : mockOverlay;

// app/(roles)/rm/client-info/page.tsx — after
// RENEWALS_DUE is a local literal, not imported: no backend field for a
// subscription renewal date exists anywhere in the app (proposal § C-0c).
const renewalsDue: SummaryItem[] = [];
// ...
const NO_ONBOARDING_FALLBACK = { status: "—", tone: "neutral" as ChipTone, renewal: "—" };
const ob = onboardingByUserId.get(r.id);
const overlay = ob
  ? { ...NO_ONBOARDING_FALLBACK, status: COLUMN_LABELS[ob.status], tone: ONBOARDING_TONE[ob.status] }
  : NO_ONBOARDING_FALLBACK;
```

```
// lib/mock/rm-data.ts — deleted in full. After FE-15 + FE-16, nothing in this
// file has a live consumer: RM_CLIENTS/CLIENT_EXTRA/OVERLAY_ROTATION/hashString/
// EMPTY_OVERLAY/clientDocs/clientHistory/ClientModel/MockOverlay/OverlayCore/
// getMockOverlay/RENEWALS_DUE/MODEL_SIZES/MODEL_SIZE_LIST/OB_MODEL_CATALOG/
// ModelCatalogEntry are all either dead or replaced above.
```

**Behavior / invariants:**
- `SubscriptionFormModal`'s model-size lookup is keyed by `modelId`, never by display name — the class of bug the original comment admitted ("names don't cover live model names") cannot recur, because there is no name-keyed path left.
- `client-info/page.tsx`'s "Renewals Due" KPI tile shows `0` / `"0 overdue"` with an empty drill-down list — an honest empty state, not a fabricated count. This is a **visible content change**, confirmed with the human, not a silent regression.
- Onboarding-derived `status`/`tone` are **unchanged** when an onboarding record exists — only the no-record fallback source changed, not the override logic itself.
- `grep -rln "lib/mock/rm-data" admin-frontend --include=*.ts --include=*.tsx` returns zero hits.
- `ls admin-frontend/lib/mock/` shows only `eom-reports.ts` after this unit — the directory is not empty, but nothing dead remains in it.
- `npx tsc --noEmit` is clean.

**Done when:** `lib/mock/rm-data.ts` no longer exists, the model-subscription page and modal source model data (including size) from `useModels()`, the client-info list shows honest placeholders/empty states for the fields with no backend, and `npx tsc --noEmit && npx vitest run` are both clean.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4. Cross-layer seam (frozen here) § 4.1 — The wire contract)

**(a) Fee unit — canonical form is the decimal fraction.**

```
Everywhere, at every layer, in every DTO and every column:
    0.020000  means 2%
    0.200000  means 20%

DB      : Numeric(9, 6)              -- unchanged type, corrected scale
API DTO : float | Decimal            -- raw fraction, never pre-multiplied
UI input: user types "2.0" in a field labelled "%"  -> divide by 100 before send
UI output: value * 100, then format  -> "2.00%"

Rationale for fraction over percent: it is what docs/proposals/007:84-85
specifies, what the 013 onboarding seam froze, and what Numeric(9,6) was
sized for (percent scale wastes 2 digits of the 3-digit integer part).
```

**(b) Storage bucket — a closed enum, one root per bucket.**

```python
# app/core/storage.py
class Bucket(StrEnum):
    MARKETING   = "marketing"      # model_materials.storage_key
    KYC         = "kyc"            # onboarding_documents.storage_key
    CONTACT_LOG = "contact_log"    # client_contact_logs.doc_storage_key
    REPORTS     = "reports"        # eod_records.file_storage_key  (EoD + EoM)
    LEGAL       = "legal"          # read-only drop zone, no metadata table
    STATEMENTS  = "statements"     # read-only drop zone, no metadata table

def get_storage(bucket: Bucket) -> FileStorage: ...

# storage_key is BUCKET-RELATIVE. It never contains the bucket name.
#   before:  "client_kyc_docs/Cathy_Client_ke-uid-1/ab12..._passport.pdf"
#   after:   "Cathy_Client_ke-uid-1/ab12..._passport.pdf"   (in the KYC bucket)
# The bucket is derived from the calling context (each column belongs to
# exactly one bucket), never parsed from the key.
```

**(c) Error envelope — one shape, `detail` always a string.**

```jsonc
// EVERY non-2xx response, without exception:
{
  "detail": "Human-readable message.",   // ALWAYS a string
  "code":   "matrix_changed_since_read", // optional; machine-readable slug
  "errors": [                            // optional; 422 field errors only
    { "loc": ["body", "mgmt_fee"], "msg": "...", "type": "..." }
  ]
}
```

Status-code conventions, applied to the outliers listed in Layer 2 C-3:

| Class of failure | Code |
|---|---|
| Malformed / out-of-range request input | `422` |
| Missing or invalid credentials | `401` |
| Authenticated but not permitted | `403` |
| Named resource does not exist | `404` |
| "No data for this date/period" on a **collection** endpoint | `200` + empty collection |
| Illegal state transition / conflicting write | `409` |
| Unexpected server fault | `500`, `detail` is a fixed generic string — never `str(exc)` |

### 7.2 How this layer honours the seam

**What this layer contributes:**

| Seam part | This layer's obligation | Units |
|---|---|---|
| (a) Fee unit | Divide by 100 on **input** (`parseFeePercent`, one definition) and multiply by 100 on **display** (`formatFeePercent`, one definition). Every value on the wire is a raw fraction; the frontend never pre-multiplies before sending, and never renders a raw fraction as a percent. | FE-6 |
| (b) Storage bucket | **Nothing.** No frontend code constructs, parses or displays a `storage_key`; downloads are addressed by resource id (`/pc/models/{id}/materials/{materialId}/download`). Verified: `grep -rn "storage_key" admin-frontend client-frontend` → zero hits. §7.1(b) is reproduced verbatim only because the seam is copied whole; **no FE unit implements it.** | — |
| (c) Error envelope | Read `detail` as a string from **every** non-2xx, lift `code` where present, and never render the raw body. Preserve the `401` short-circuit ahead of envelope parsing. | FE-7, FE-8, FE-9 |

**What this layer assumes from the other side** — these are **test assumptions**, faked with `vi.mock`/`vi.fn` per §8, never a runtime dependency on sibling code:

1. Every fee field on every DTO (`ModelDTO.mgmt_fee`, `ModelDTO.incentive_fee`, `ClientSubscriptionRowDTO.mgmt_fee`/`incentive_fee`, `AllotRdmptDTO`'s fee fields) arrives as a **decimal fraction** — `0.02`, never `2`.
2. Every non-2xx body is `application/json` with `detail: string`, optionally `code: string`, optionally `errors: […]`.
3. Unauthenticated failures arrive as **`401`**, not `403` — specifically the five sites BE C-3 corrects (`auth/deps.py:32,40`, `auth/status.py:14,17,20`).
4. A `500` carries a fixed generic `detail`, never `str(exc)`.

**Explicitly NOT assumed** (FE code must survive its absence, because this branch may merge first):

- That the envelope has already landed. `parseErrorEnvelope` (FE-7) keeps a non-JSON fallback to `res.statusText` and a defensive array branch for a raw Pydantic 422. Both are deliberate belt-and-braces, called out in FE-7.

**Change protocol:** any edit to §7.1 requires editing the **proposal** first; this section is then re-copied. Never edit §7.1 in isolation, and never negotiate it directly with the DB or BE impl doc.

### 7.3 Seam risks specific to this layer

| Risk | Mitigation |
|---|---|
| This branch merges before the BE branch → admin divides by 100 against a percent-storing backend, showing `0.02%` | Not solvable in this layer. Proposal § Execution Phase 2 sequences DB B-1 + BE C-1/C-2 + FE-6 as one change set on the parent branch. The execution schedule must carry this forward as a merge-ordering constraint. |
| The envelope lands but `code` collides with the existing `HTTP_<status>` convention in `APIResult.code` | FE-7 step (4): widen every `.code ===` comparison rather than replacing it. `lib/admin/AdminStoreContext.tsx:223-226` is the known instance. |
| §7.1(b) is copied here but has no frontend obligation, and a reader assumes it does | Stated explicitly in §7.2's table. No unit references it. |

---

## 8. Internal unit testing

### 8.1 Test setup

- **Framework / runner:** `vitest` — command `npx vitest run`, **run once per working directory** (`admin-frontend/`, then `client-frontend/`). Both already declare `"test": "vitest run"` and carry a `vitest.config.ts`.
- **Fixtures / seed:** jsdom environment (`jsdom@^29`), `@testing-library/react@^16` for component units, `@testing-library/jest-dom` matchers. `fetch` is stubbed per-test with `vi.spyOn(globalThis, "fetch")`; no network, no backend, no live cookies.
- **Isolation:** hermetic and parallel-safe. Note the module-registry hazard FE-5 row 1 exposes — any test using `vi.doMock` must call `vi.resetModules()` first, or it silently reads the previous test's module instance.
- **Layer isolation (critical):** tests may import only from their own working dir plus standard libraries and test doubles. They must **not** import from `api-backend/`, from the sibling frontend, spin up a backend, or hit a real endpoint. Where a test needs the other side of the seam it **mocks the seam** with `vi.mock` / `vi.fn`, using §7.1 as the fake's shape. Cross-layer integration belongs to a separate track.
- **Test location:** `admin-frontend/tests/**` and `client-frontend/tests/**`, mirroring the source path. Never co-located with source.
- **Commit policy — the one place this doc diverges from the template, deliberately (see FE-1):**
  - The **existing** suites — `admin-frontend/tests/**` (78 files) and `client-frontend/tests/**` (21 files) — are the tracked **regression baseline**. `client-frontend`'s is already tracked; FE-1 tracks admin's. They are committed.
  - **`test-gen` output for the units in this doc is NOT committed.** It is written under the same `tests/` trees, git-ignored by path (or under `tests/_generated/`), run locally as a pre-commit gate, and never staged.
  - The implementer must be able to state, for any file under `tests/`, which of the two it is. If that is ambiguous, put generated output in `tests/_generated/` and ignore that one path.
- **Code generation:** concrete test code is written by the `test-gen` skill (`lite` | `standard` | `thorough`) from §8.2/§8.3. **This doc contains no test code.**

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `tests/` is not git-ignored; all 78 files are tracked; no test file content changed | none |
| FE-2 | The client suite reaches 0 failures / 0 unhandled errors; the four purge invariants (no `postBackendRegister` export, no `signUpWithEmailPassword` on context, no `/api/dev/register` request, generic mapping for `auth/email-already-in-use`) each still have a live assertion; the rewritten negative assertion fails if the symbol is reintroduced | none |
| FE-3 | The 23 provider failures, 17 navigation failures and 15 hook-export failures are gone; every first-party `vi.mock` uses `importOriginal`; adding a new export to a mocked hook module breaks nothing; the 11 spec-ahead files are gone and orphan no source symbol | none |
| FE-4 | The ~38 drifted assertions match current source-derived output; `ptaMoney`'s three cases behave per the recorded verdict; the docstring and the code agree | none |
| FE-5 | Each of the three has a recorded verdict; each test passes; row 3 still proves staged-beats-published; row 1's verdict is committed **before** FE-7 | none |
| FE-6 | `parseFeePercent("2.0") === 0.02`; `formatFeePercent(0.02) === "2%"`; round-trip identity; the four display/input sites emit fraction-scale values; exactly one exported definition of each function | **Yes** — §7.1(a): fixtures supply DTOs with fee fields as fractions |
| FE-7 | An envelope body yields the bare `detail` and lifts `code`; a non-JSON body yields `statusText`; an empty body yields `HTTP <status>`; no produced message contains `{`; all three wrappers plus the four onboarding proxies behave identically; `.code ===` consumers still fire on 409 | **Yes** — §7.1(c): mocked `Response` objects |
| FE-8 | All six sites produce `parseApiError`'s message; `parseApiError` is exported; one `statusText` occurrence remains under `lib/` | **Yes** — §7.1(c) |
| FE-9 | A `401` yields `{success:false, code:"UNAUTHORIZED"}` from all three wrappers; the 401 check precedes envelope parsing; `apiClientConditional`'s 304 precedes its 401 | **Yes** — §7.1(c) status table |
| FE-10 | `lib/mock/mobo-data.ts` is gone; `recon-overview/page.tsx` renders real trade-records data via `useReconciliation()`; the page, its nav entry, and `ROLE_DEFAULT_PAGE.MOBO` are all byte-for-byte unchanged; `trade-reconciliation/{page.tsx,actions.ts}` and `useTradeRecords` are untouched and still type-check | none |
| FE-11 | Both configs carry `optimizePackageImports: ["lucide-react"]`; both dev scripts carry `--turbo`; `lucide` is gone from client deps; rendered output is unchanged; §3.3 is filled in | none |
| FE-12 | The primitive renders a `div` with `animate-pulse rounded bg-surface-highest`; `className` composes; extra props pass through; no `"use client"` | none |
| FE-13 | Every listed route has a `Skeleton.tsx` and a two-line `loading.tsx` re-exporting it; both ends render the **same** component; `animate-pulse` appears only in `Skeleton.tsx` files; pages with a hook flag gate on `loading && !data`; no skeleton imports `@/lib/icons` | none |
| FE-14 | `lib/downloadFile.ts` is gone; no reference to `downloadAs` remains; the monthly-reports download still yields the same filename and MIME type | none |
| FE-15 | The dead `getClientDetail` cluster is gone from `rm-data.ts`; `SubClient`/`SubModel`/`TxnRow` are defined in `lib/rm/subscriptions.ts`; `SummaryItem`/`CountItem`/`ClientDoc`/`HistoryEntry` are defined in `lib/rm/types.ts`; all 8 import sites repointed; `RM_CLIENTS`/`CLIENT_EXTRA`/`getMockOverlay`/`RENEWALS_DUE`/`MODEL_SIZES`/`OB_MODEL_CATALOG` all unchanged in value **as of this unit** | none |
| FE-16 | `lib/mock/rm-data.ts` no longer exists; model-subscription page + modal source model data (incl. size) from `useModels()`; the modal's model-size lookup is id-keyed, not name-keyed; client-info's Renewals Due tile and status/tone fallback are honest empty/placeholder states | none |

### 8.3 Test goals (per unit) — prose only, no code

#### FE-1
- **Positive:** `tests/` is absent from `.gitignore`; every one of the 78 test files is reported by `git ls-files`; the tracked count matches the on-disk count.
- **Negative:** no test file's content differs from its pre-commit state — this unit stages, it does not edit. A content diff in this commit is a failure.
- **Invariants:** the distinction the commit message must make explicit — the tracked set is the regression baseline, and any `test-gen` output for this branch is excluded by path.
- **Seam mocks:** none. This unit touches no runtime code.

#### FE-2
- **Positive:** the client suite finishes with zero failures and zero unhandled errors; the surviving FE-16 file still asserts each of the four purge properties.
- **Negative:** the rewritten negative assertion must **fail** if `postBackendRegister` were reintroduced to `lib/auth-api.ts` — verify by temporarily adding a stub export and observing red. That is the only proof the rewrite fixed anything: the old assertion could not observe absence at all, because the exhaustive mock factory threw on unknown-property access instead of yielding `undefined`.
- **Invariants:** the mock over `@/lib/auth-api` is partial (`importOriginal` spread), so an export added to the real module never breaks this file again; login-path coverage in `AuthProvider.test.tsx` is unchanged in count.
- **Seam mocks:** none. `postBackendLogin`'s `fetch` is stubbed locally; no backend shape is assumed.

#### FE-3
- **Positive:** components under the `useCanEdit` gate render through the shared `AuthProvider` wrapper; a component calling `useSearchParams` renders; a component using `useContactLogs` or `usePostTradeAllocationHistory` renders.
- **Negative:** a component rendered *without* the wrapper still throws the `useAuth must be used within AuthProvider` error — the helper must not be a global that hides the gate.
- **Invariants:** the defect-class check — adding a new export to any first-party hook module must not break any test. Prove it by adding a throwaway export to a mocked module and confirming the suite stays green. An exhaustive factory fails this; the `importOriginal` spread passes it. Also: every symbol imported by a deleted spec-ahead file either does not exist in source or is covered elsewhere.
- **Seam mocks:** none — this is intra-layer test hygiene.

#### FE-4
- **Positive:** each updated assertion matches the value the current source produces, and the source was read to confirm that value is intended.
- **Negative:** for `ptaMoney`, the case that motivated `4825f10` (a small allocation that would otherwise render `$0k`) must still be covered — whichever verdict is taken, do not regress the thing that commit was fixing.
- **Invariants:** `ptaMoney`'s docstring and its code agree after this unit. If the `k` branch keeps three decimals, the docstring's "rounded" wording is corrected; if it returns to rounding, the docstring is already right. A formatter whose comment contradicts it is how this drift started.
- **Seam mocks:** none — pure formatting and DOM assertions.

#### FE-5
- **Positive:** all three tests pass, and each passes for the reason its verdict states.
- **Negative:** for row 1, the test must still fail if `toErrorResult` is removed from `actions.ts` — otherwise the rewrite proved the wrong thing and the swallowed-error question is still open. For row 3, the test must still fail if staged-over-published precedence is inverted in `AdminStoreContext`.
- **Invariants:** every `vi.doMock` in the affected files is preceded by `vi.resetModules()`, so no test can observe a prior test's module instance. That is the general defect row 1 exposes, and it is worth sweeping the whole admin suite for.
- **Seam mocks:** none. Row 1's mock is over `@/server/admin`, which is same-layer code, not the seam.

#### FE-6
- **Positive:** `parseFeePercent` maps `"2"`, `"2.0"` and `"2.0%"` all to `0.02`, and `"20%"` to `0.2`. `formatFeePercent` maps `0.02` to `"2%"` and `0.015` to `"1.5%"`, trimming trailing zeros. The round trip `formatFeePercent(parseFeePercent(s))` is the identity on any well-formed percent string. `OverviewTab` renders `"2%"` for a model whose `mgmt_fee` is `0.02`. `computeFees` returns the same absolute dollar figure for `{mgmt: 0.02, size: 1e6}` as the old code did for `{mgmt: 2, size: 1e6}` — `$20,000` — which is the single sharpest proof the scale change did not move any number a user sees. `SubscriptionFormModal` submits `0.01` for the input `"1.0%"`.
- **Negative:** `parseFeePercent("")` and `parseFeePercent("abc")` throw, and no call site converts that throw into `0`. Every empty-input call site yields `null` (inherit the default), never `0`.
- **Invariants:** exactly one exported `parseFeePercent` and one exported `formatFeePercent` in `admin-frontend`, both in `lib/fee.ts` — assert this as a source-text/glob check, because it is proposal Goal 1 and it is the thing that regresses silently. No frontend site produces a fee value `>= 1` from a plausible percent input. `client-frontend` contains zero fee references before and after.
- **Seam mocks:** §7.1(a). Every DTO fixture supplies fees as **fractions**: `ModelDTO` as `{ id, name, mgmt_fee: 0.02, incentive_fee: 0.2, model_size: 1000000, … }`; `ClientSubscriptionRowDTO` as `{ model_id, model_name, mgmt_fee: 0.015, incentive_fee: 0.2, units, amount, ib_account }`. The hook/server-action layer is faked with `vi.fn()` returning `{success: true, data: <that fixture>}` — no HTTP, no backend.

#### FE-7
- **Positive:** given a `Response` whose body is `{"detail":"An override already exists for this user and page","code":"override_exists"}` with status 409, the result is `{success:false, error:"An override already exists for this user and page", code:"override_exists"}`. Given `{"detail":"Model not found"}` with 404, `error` is `"Model not found"` and `code` falls back to `HTTP_404`. Given a 422 whose `detail` is still a raw Pydantic array, the result is a readable joined string, not `statusText`. All three wrappers, plus the four `server/onboarding/index.ts` proxies and `server/pc/index.ts`'s download path, behave identically on the same input.
- **Negative:** a plain-text `Internal Server Error` body (Starlette's un-handled 500 — the pre-envelope reality) yields `res.statusText`, not a thrown exception and not the raw text. An empty body yields `HTTP <status>`. A body of `{"detail": null}` falls back rather than rendering `"null"`.
- **Invariants:** the produced `error` never contains `{` — assert it across every fixture, since that is the user-visible acceptance criterion. `APIResult.error` is always a `string`. `code` is always a non-empty string. Consumers branching on `HTTP_409` still fire when the server supplies a `code` slug instead.
- **Seam mocks:** §7.1(c). Mock `Response` objects, not the backend: `{ ok: false, status, statusText, json: async () => <envelope>, text: async () => <raw> }`. Include one whose `json()` rejects, to exercise the non-JSON path.

#### FE-8
- **Positive:** each of the six call sites, given a 400 with `{"detail":"No file uploaded for this document"}`, throws an `Error` whose message contains that detail. `parseApiError` is importable from `@/lib/auth-api`.
- **Negative:** a non-JSON body still yields `statusText`; a 404 still yields the special-cased hint (this is a behaviour *gain* for the six — assert it deliberately so it reads as intended, not as a leak).
- **Invariants:** exactly one `res.statusText` occurrence remains under `client-frontend/lib`. No seventh copy is introduced. Behaviour is identical across all six — parametrize over them rather than writing six near-duplicate tests.
- **Seam mocks:** §7.1(c), same mocked-`Response` shape as FE-7.

#### FE-9
- **Positive:** a `401` from each of the three wrappers yields `{success:false, error:"Unauthorized", code:"UNAUTHORIZED"}` regardless of body content — including when the body is a well-formed envelope with a different `detail`. That is the ordering proof.
- **Negative:** a `403` does **not** produce `UNAUTHORIZED`; it flows through the envelope parser and keeps the server's message. The two must not be conflated — the whole point of BE C-3's correction is that they are different classes.
- **Invariants:** in `apiClientConditional`, a `304` is handled before the `401` check; the `401` check precedes the `!res.ok` branch in all three wrappers. Both survive FE-7's rewrite — this is the regression this unit exists to prevent.
- **Seam mocks:** §7.1(c) status table. Mocked `Response`s at 401, 403 and 304. The five BE paths that change from 403 to 401 are **not** reachable from this layer and are represented only by the 401 fixture.

#### FE-10
- **Positive:** `mapTradeRecordToReconTrade` turns a `TradeRecordRowDTO` into a `ReconTrade` with both legs `state: "ok"`, no `breakType`, `fields: []` — the honest single-source verdict. `useReconciliation()`, given a mocked `useTradeRecords` returning a populated `TradeRecordsViewDTO`, returns a `ReconView` whose `counters` show `matched === reconciled`, `breaks === 0`, `unmatched === 0`, and whose `settleDay` equals the DTO's `day`.
- **Negative:** `useReconciliation()` given `useTradeRecords`'s `loading: true` returns `{data: null, loading: true}` — the page must not render stale or undefined fields during the fetch. Given an error result, `error` is surfaced and `data` stays `null`.
- **Invariants:** the page, its `pages-config.ts` entry, and `ROLE_DEFAULT_PAGE.MOBO` are unchanged before and after this unit — assert this by snapshotting `lib/pages-config.ts`'s `mobo.recon-overview` entry and `ROLE_DEFAULT_PAGE.MOBO`'s value, not by re-deriving it. `deriveCounters`/`deriveEodByType` are reused unmodified — a test asserting their behavior changed is testing the wrong unit.
- **Seam mocks:** `useTradeRecords` (BE seam via `/trade-records`) is mocked with `vi.mock`, returning a fixed `TradeRecordsViewDTO`, per §7.1's DTO shape. `lib/mock/mobo-data.ts` must NOT be imported by any test written for this unit — a test that imports it is testing the file this unit deletes.

#### FE-11
- **Positive:** both `next.config.mjs` files parse and expose `experimental.optimizePackageImports` containing `"lucide-react"`; both dev scripts contain `--turbo`; `client-frontend/package.json` no longer lists `lucide`.
- **Negative:** `next build` still succeeds in both apps; no rendered component output changes (a snapshot of one icon-heavy component before and after is sufficient, and cheap).
- **Invariants:** zero runtime behaviour change. The performance claim itself is **not** a unit test — it is the §3.3 measurement table, filled by hand with a stated method. Do not write a timing assertion; it would be flaky and would prove nothing about the user's machine.
- **Seam mocks:** none.

#### FE-12
- **Positive:** renders a single `div` carrying `animate-pulse`, `rounded` and `bg-surface-highest`; a passed `className` is appended, not replaced; arbitrary props (`data-testid`, `aria-hidden`) pass through.
- **Negative:** passing `className={undefined}` produces no trailing space and no `"undefined"` in the class string — that is what the `.filter(Boolean)` is for.
- **Invariants:** the file is byte-identical to `client-frontend/components/ui/skeleton.tsx`; it contains no `"use client"`, so it stays server-renderable.
- **Seam mocks:** none.

#### FE-13
- **Positive:** for each listed route, `Skeleton.tsx` renders without error and contains at least one `Skeleton`; `loading.tsx` renders **the same component** (assert identity of the default export, not markup similarity — markup similarity is exactly the drift this design prevents); a page with a hook `loading` flag renders the skeleton while loading and the real content once data arrives.
- **Negative:** a page with data present but a refetch in flight does **not** blank to the skeleton — the `loading && !data` guard. Assert it on at least one route; it is the single most likely implementation slip.
- **Invariants:** `animate-pulse` appears only inside `Skeleton.tsx` files (source-text check across `app/`); every `loading.tsx` is a two-line re-export; no skeleton imports `@/lib/icons`; the route list is complete against `find app -name page.tsx` minus the two documented exclusions.
- **Seam mocks:** none — but each page-level test fakes its **own** hook with `vi.fn()` returning `{data: null, loading: true}` then `{data: <fixture>, loading: false}`. That is same-layer mocking, not seam mocking.

#### FE-14
- **Positive:** the monthly-reports download produces a file with the expected filename and MIME type (assert against a stubbed `URL.createObjectURL` and a captured anchor element).
- **Negative:** no import of `@/lib/downloadFile` resolves anywhere; the module is gone.
- **Invariants:** exactly one download helper remains under `admin-frontend/lib`.
- **Seam mocks:** none.

#### FE-15
- **Positive:** `getMockOverlay(id)` returns byte-identical output before and after this unit for a fixed set of sample ids — same hash-derived rotation index, same fields, same `docs`/`history` content — proving the relocation changed only import paths, not values. `RENEWALS_DUE` is unchanged.
- **Negative:** none of `getClientDetail`, `ClientDetail`, `ClientPreferences`, `clientContactLog`, the mock `ContactLogEntry`, `KNOWN_CLIENT_IDS`, `SUB_CLIENTS` resolves as an import from anywhere in source after this unit — a test importing any of them should fail to compile, which is the point.
- **Invariants:** `lib/mock/rm-data.ts` still exports `RM_CLIENTS`, `CLIENT_EXTRA`, `getMockOverlay`, `RENEWALS_DUE`, `MODEL_SIZES`, `MODEL_SIZE_LIST`, `OB_MODEL_CATALOG` — this unit's whole premise is that these are untouched. A test asserting any of them changed shape or value is testing the wrong claim.
- **Seam mocks:** none — this unit touches only frontend-internal type/value locations, no BE seam.

#### FE-16
- **Positive:** with `useModels()` mocked to return a fixed `Model[]`, `model-subscription/page.tsx`'s `availableModels` carries `{id, name, mgmtFee, incentiveFee, size}` for each, `mgmtFee`/`incentiveFee` formatted via `formatFeePercent` (fraction → "N%"). Selecting a model in `SubscriptionFormModal` via `onModelChange` sets `modelSize` from `availableModels.find(m => m.id === modelId)?.size`, matching the mocked model's real `size`, not a name-keyed lookup.
- **Negative:** a `modelId` with no matching entry in `availableModels` yields `modelSize === 0`, not a thrown error or `undefined` propagating into the notional calculation. `client-info/page.tsx` renders `"—"` for status/tone/renewal when `onboardingByUserId.get(r.id)` is absent — not a crash, not a fabricated value.
- **Invariants:** the Renewals Due tile's count and drill-down list are always `0`/`[]` — there is no code path that produces a non-empty value, because no data source for it exists. Onboarding-derived status/tone are byte-identical to pre-FE-16 behavior when an onboarding record exists — only the no-record fallback changed.
- **Seam mocks:** `useModels()` (BE seam via the real models endpoint) is mocked with `vi.mock`, returning a fixed `Model[]` per §7.1's shape assumptions carried through from FE-6/FE-11's fraction-scale fee contract.

### 8.4 Aggregate gate

- All unit tests green is a **local gate**, run in **both** working dirs before commit / PR hand-off (§3.2). A red test blocks the unit.
- The *committed* baseline suites (§8.1 commit policy) also run in this gate and must be green — that is the whole point of FE-1. `test-gen` output runs alongside them but is never staged.
- **The gate is the ungrepped command.** `npx vitest run && npx tsc --noEmit && npx next lint`, per dir, with no `grep -v "^tests/"` anywhere in the pipeline. Ending that workaround is a deliverable of this layer, not a side effect.
- Target coverage for changed lines: **≥ 90%** of new/changed statements in `lib/fee.ts`, `server/api-client.ts` and `components/ui/skeleton.tsx`. The 18 route skeletons are exempt from a coverage target — a render-without-error smoke test each is proportionate; a coverage number on static JSX measures nothing.
- Chosen `test-gen` level for this layer: **`standard`** — with **`thorough`** for FE-6 and FE-7 specifically. Those two are the money path (a 100× scale error) and the trust boundary (every error a user sees); the rest are deletions, config, and static markup.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**

- [ ] Every §6 unit committed on the layer branch.
- [ ] `npx vitest run && npx tsc --noEmit && npx next lint` green in **`admin-frontend/`**, ungrepped, with **0 test failures** (from 117).
- [ ] Same command green in **`client-frontend/`**, ungrepped, with **0 test failures and 0 unhandled errors** (from 5 + 2).
- [ ] `admin-frontend/tests/` is tracked in git (proposal Goal 7) and the FE-1 commit records the file count.
- [ ] `grep -rn "parseFeePercent" admin-frontend --include=*.ts --include=*.tsx` (excluding `tests/`) returns **exactly one** definition (proposal Goal 1).
- [ ] No admin error surface renders raw JSON — no produced message contains `{` (proposal Goal 5).
- [ ] §3.3's Before **and** After rows are filled with the same stated method; each FE-11 candidate (ii)–(v) is marked taken-with-reason or skipped-with-reason (D-6).
- [ ] Every admin route in FE-13's table shows a skeleton continuously from navigation to data, with no flash of empty page at the mount boundary (proposal Goal 8).
- [ ] **All three FE-5 verdict cells are filled in this document**, with evidence, and the row-1 verdict was committed before FE-7 (D-8, Q-3, Q-7).
- [ ] FE-4's `ptaMoney` verdict is recorded in its commit message.
- [ ] FE-10: `lib/mock/mobo-data.ts` is gone; `recon-overview/page.tsx` still exists, still renders, and is unchanged in `lib/pages-config.ts` (no entry removed, `ROLE_DEFAULT_PAGE.MOBO` still `mobo.recon-overview`); the live `trade-reconciliation/{page.tsx,actions.ts}` and `useTradeRecords` are verifiably untouched.
- [ ] FE-14's Option A / B decision is recorded.
- [ ] FE-15: the dead `getClientDetail` cluster is gone from `lib/mock/rm-data.ts`; `lib/rm/types.ts` exists with `SummaryItem`/`CountItem`/`ClientDoc`/`HistoryEntry`; `lib/rm/subscriptions.ts` defines `SubClient`/`SubModel`/`TxnRow`; all 8 listed import sites repointed; `getMockOverlay`'s output is unchanged for a sample of ids.
- [ ] FE-16: `lib/mock/rm-data.ts` no longer exists; `model-subscription/page.tsx` and `SubscriptionFormModal.tsx` source model data (including size) from `useModels()`, id-keyed not name-keyed; `client-info/page.tsx`'s Renewals Due tile and status/tone fallback render honest empty/placeholder states, confirmed with the human as an intended visible change.
- [ ] §7.1 matches the proposal's frozen seam verbatim — checked against the proposal on the parent branch, **not** against sibling branches.
- [ ] PR opened. **The human owns the merge** (standing rule).

**Rollback:**

Every unit in this layer is **code-only and reverts cleanly with the branch**. Nothing here writes to a database, moves a file on disk, or mutates persisted state. There is no down-step and nothing lossy.

Three notes on reverting individual commits:

1. **FE-6 must be reverted whole.** Reverting part of it re-creates the two-scale divergence in the opposite direction — the failure mode is silent and 100×.
2. **Reverting FE-1 alone hides 117 failures again** rather than fixing anything. If the test work has to come out, revert FE-1 through FE-5 together.
3. **No page is deleted anywhere in this layer.** FE-10 rewires `recon-overview` onto real trade-records data and deletes only the mock file behind it — the page, its nav entry, and the MOBO default redirect are all unchanged. Every unit in this layer is additive, a rewire, formatting, or test cleanup.

**Cross-branch caveat (not a rollback step, a merge-ordering constraint):** FE-6 is correct only once DB B-1 and BE C-1/C-2 land. If this branch merges to the parent alone, admin displays fees 100× too small until the other two follow. Proposal § Execution Phase 2 owns that sequencing; the execution schedule must carry it as a constraint rather than leaving it to discovery at merge time.
