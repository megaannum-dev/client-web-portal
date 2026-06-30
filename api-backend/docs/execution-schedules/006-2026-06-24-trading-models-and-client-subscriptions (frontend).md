# 006 · Frontend — Execution schedule

Sequencing for the frontend component. References work units `FE-1 … FE-7` from
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>); does not restate them.

**Entry precondition:** `CP-B4` cleared — the backend routes are live under `/api/pc/…` and the
allocation GET's `ETag` / `If-None-Match` contract (`BE-6`) is published. `NEXT_PUBLIC_API_BASE_URL`
points at the running backend.

**Exit signal:** both PC screens run on real API data with the layout unchanged; the mock is deleted;
the cache behaviour (`304` on no-change, recompute on upstream change) is observable. One **feature
commit** on the current branch (the branch checked out for this session); **stop — do not push/PR; human
owns `main`.**

---

## Waves

| Wave | Work units | Parallel? | Depends on | Notes |
|---|---|---|---|---|
| F-W0 | `FE-7` (prototype correction) | independent of backend | entry precond. (or earlier — runs against the mock) | Pure UI correction; can start before the backend is ready. Must finish before `FE-6` deletes the mock. |
| F-W1 | `FE-1` (transport/endpoints/cookie) | No | entry precond. | Create api-client + endpoints map + id-token cookie wiring. |
| F-W2 | `FE-2` (`server/pc`), `FE-3` (actions) | **Yes** | F-W1 | Server functions + thin action wrappers. |
| F-W3 | `FE-5` (seam mappers + format.ts) | No | F-W2 | Mappers consume the DTO shape `FE-2` returns. |
| F-W4 | `FE-4` (hooks incl. allocation cache) | No | F-W2, F-W3 | Hooks call actions, then mappers; `useAllocation` adds the ETag cache. |
| F-W5 | `FE-6` (screen wiring + delete mock) | No | F-W3, F-W4, **F-W0** | Swap `useMemo`→hooks, wire writes, delete mock. Requires `FE-7` done. |
| F-W6 | **Verify** | No | all | See below. |

> `FE-7` (F-W0) is sequenced first/parallel deliberately: it has no backend dependency and, done early,
> turns the seam flip into a clean data-source swap with no concurrent UI churn.

## F-W6 — Verification

Run the impl doc's **`## Verification`** section — units `FE-7`, `FE-1…FE-6` plus the `FE-IV`
integration check, exactly as written in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>).
Report each with evidence (network-panel ETag/`304`, `next build` output).

**Teardown:** any throwaway smoke/scratch file created for the checks is not part of the deliverable —
delete it and confirm `git status` shows only the intended `006` changes (commit **nothing** from
verification) before reporting.

## Checkpoints

- ✅ CP-F0: prototype corrected against the mock (after F-W0).
- ✅ CP-F1: transport + cookie wired (after F-W1).
- ✅ CP-F2: fetch layers + hooks build (after F-W4).
- ✅ CP-F3: screens on live data, mock deleted, cache observed (after F-W6).
- 🏁 DONE: single feature commit on the current branch, **stop** (human owns `main`; push/PR is the human's).
