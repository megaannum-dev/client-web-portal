# 006 · Backend — Execution schedule

Sequencing for the backend component. References work units `BE-1 … BE-8` from
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>); does not restate them.

**Entry precondition:** `GATE-D` cleared — migration `0008` applied to the target DB (see
[database.md](<006-2026-06-24-trading-models-and-client-subscriptions (database).md>)). The ORM classes
(`DB-1…DB-5`) and indexes (`DB-6`) exist.

**Exit signal (handed to Frontend):** all routes in `BE-8` live under `/api/pc/…`, guarded by `BE-2`
actions; the allocation GET returns an `ETag` and honours `If-None-Match` (`BE-6`); seeded-dataset
regression assertions green.

---

## Waves

| Wave | Work units | Parallel? | Depends on | Notes |
|---|---|---|---|---|
| B-W1 | `BE-1` (layout + storage), `BE-2` (authz) | **Yes** | entry precond. | Scaffolding + the action enum. Independent of each other. |
| B-W2 | `BE-3` (repositories) | No | B-W1 | Includes the watermark probes `BE-6` depends on. |
| B-W3 | `BE-4` (ModelService), `BE-5` (AllocationService) | **Yes** | B-W2 | Two independent services; can fan out to two agents. |
| B-W4 | `BE-6` (cache + ETag) | No | B-W5 derivation in `BE-5` | Wraps `BE-5`'s open-matrix derivation; add after it works uncached. |
| B-W5 | `BE-7` (scheduler) | No (small) | `BE-5` | Reuses `create_period`/confirm invariants. Can overlap B-W4. |
| B-W6 | `BE-8` (schemas + router + mount) | No | B-W3, B-W4 | Wires services to HTTP; threads the ETag header. |
| B-W7 | **Verify** | No | all | See below. |

> Note the deliberate order: build `BE-5` derivation **uncached first**, prove it against the seed,
> then add `BE-6` caching as a wrapper. This keeps "is the math right" and "is the cache right" as
> separate, independently debuggable steps — and matches the decoupling intent (caching is its own unit).

## B-W7 — Verification

Run the impl doc's **`## Verification`** section against a seeded scratch DB — units `BE-1…BE-8` plus
the `BE-IV` integration check, exactly as written in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>).
Report each result with command output.

**Teardown:** the seeded scratch DB, the seed script, and any smoke snippet are throwaway — drop/delete
them and confirm `git status` is clean (commit **nothing** from verification) before reporting.

## Checkpoints

- ✅ CP-B1: package + authz scaffolded (after B-W1).
- ✅ CP-B2: services pass the regression assertions **uncached** (after B-W3).
- ✅ CP-B3: cache + ETag behaviour verified (after B-W4; the `BE-6` check is asserted in `B-W7`).
- ✅ CP-B4: all routes mounted, full verification green (after B-W7); the feature agent makes the
  **single feature commit** on the current branch here, then quits (no push/PR) → **release Frontend**
  (publish the ETag/`If-None-Match` contract to the frontend team/agent).
