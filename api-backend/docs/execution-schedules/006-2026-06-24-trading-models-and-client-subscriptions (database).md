# 006 · Database — Execution schedule

Sequencing for the database component. References work units `DB-1 … DB-8` defined in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (database).md>); it does **not** restate their content. Tuning any `DB-n`
detail leaves this schedule valid.

**Entry precondition:** your database feature branch is checked out (forked from the integration branch);
commit to whatever branch is checked out — do not assume a branch name. Alembic head is `d4e5f6a7b8c9`
(0007). Confirm with `alembic current` before starting.

**Exit signal (handed to Backend):** migration `0008` applied to the target DB; all tables, columns,
and indexes present; `alembic downgrade -1` proven to revert cleanly on a scratch DB.

---

## Waves

| Wave | Work units | Parallel? | Depends on | Notes |
|---|---|---|---|---|
| D-W1 | `DB-1` (incl. `DB-1a`, `DB-1b`), `DB-2`, `DB-3`, `DB-4`, `DB-5` | **Yes** — independent files/columns | entry precond. | Pure model authoring in `app/models/pc.py` + one column in `users.py`. No interdependencies; can be one agent or fanned out. |
| D-W2 | `DB-6` | No | D-W1 | Indexes attach to tables/columns from D-W1. |
| D-W3 | `DB-7` | No | D-W1, D-W2 | Wiring requires all classes to exist. |
| D-W4 | `DB-8` | No | D-W1…D-W3 | Migration reflects the final model set + all indexes. |
| D-W5 | **Verify + Gate** | No | D-W4 | See below. |

> Single-agent path is fine: author D-W1 models, add D-W2 indexes, wire D-W3, write the D-W4 migration,
> then verify. Fan-out only buys time if multiple agents author the five tables in parallel; if so, one
> integrator does D-W2→D-W4.

## D-W5 — Verification & human gate

1. **Run the impl doc's `## Verification` section on a throwaway scratch DB** — units `DB-1…DB-8` plus
   `DB-IV`, exactly as written in
   [implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (database).md>)
   (static import/metadata checks + `alembic upgrade head` / `downgrade -1`). Report each result.
   **Teardown:** the scratch DB and any verification snippet are throwaway — drop/delete them and
   confirm `git status` is clean (commit **nothing** from verification) before reporting.
2. **🔒 Human gate — live migration.** Applying `0008` to the **live/shared database** is a human
   action, same posture as 005's cutover (per memory `db_foundation_005`). The agent stops here with the
   migration staged and the dry-run evidence; a human runs `alembic upgrade head` against the live DB.

No backfill step exists (additive only). Rollback at any point: `alembic downgrade -1`.

## Checkpoints

- ✅ CP-D1: `app/models/pc.py` + `ib_account` authored, imports clean (after D-W1).
- ✅ CP-D2: indexes + wiring in place (after D-W3).
- ✅ CP-D3: migration dry-run upgrade+downgrade green on scratch DB (after D-W5 step 1); the feature
  agent makes the **single feature commit** on the current branch here, then quits — no push/PR.
- 🔒 GATE-D: live migration applied by human (after D-W5 step 2) → **release Backend**.
