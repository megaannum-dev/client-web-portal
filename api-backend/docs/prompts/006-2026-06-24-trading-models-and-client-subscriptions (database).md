# 006 · Database — Prompts

Dispatchable agent prompts for the database component. Each prompt **references** its work unit(s) in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (database).md>)
by ID and carries only role, a non-normative one-line TL;DR, sequencing constraints, and guardrails —
**never a copy of the schema**, so changing a spec detail never touches this file. Each unit's spec and
its **Verification checks** live in the implementation doc; the wave checkpoints live in
[execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (database).md>).
Run in the order the schedule sets.

**Delegation model:** a single **feature agent** (see _Feature agent_ below) owns the whole database
component — it executes the per-wave steps in schedule order, then makes **one feature commit** to the
current branch and quits at `GATE-D`. The per-wave `P-DB-*` sections are that agent's internal plan,
**not** separate dispatches.

> TL;DR lines are **non-normative** — a human-skim convenience only. The authority is the referenced
> work unit; if the TL;DR ever disagrees with the impl doc, the impl doc wins.

**Shared guardrails (prepend to every prompt):**
> You are working in the `api-backend` service on the branch already checked out for this session —
> commit to **that** branch; do not switch branches or assume a specific branch name. Follow the repo
> conventions stated in the implementation doc. All changes must be additive. Do not open or merge any
> PR — the human owns `main`. Do not edit frontend code. Report what you changed and the verification
> output; do not mark anything "verified" you did not actually run.

---

## Feature agent (single delegate) — owns the whole database feature

> **Role:** feature owner for the entire database component. **One delegated agent owns this feature end
> to end**; the `P-DB-*` sections below are its internal plan, not separate dispatches.
> **Lifecycle:** initiated → implement → commit → quit (at `GATE-D`).
> 1. **Implement** every wave in
>    [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (database).md>),
>    in the order it sets (`D-W1 → D-W4`), building each `DB-n` unit exactly as written in the impl doc.
> 2. **Verify** via `D-W5` step 1 (the impl doc's `## Verification` section on a throwaway scratch DB),
>    **including its Teardown** — drop the scratch DB and commit nothing from verification.
> 3. **Commit** the feature's source changes (model code + the staged migration `0008`) to the **current
>    branch** (the branch checked out for this session) as a **single feature commit** — not one per wave:
>    > ```
>    > feat(pc): database — 006 trading models & client subscriptions
>    >
>    > Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
>    > ```
>    Stage only the intended `006` changes (verification artifacts already removed).
> 4. **Quit at `GATE-D`.** Applying `0008` to the live/shared DB (`alembic upgrade head`) is the
>    **human's** action — leave the migration staged with the dry-run evidence. Do **not** push or
>    open/merge a PR — the human owns `main`. Stop after the commit.

---

### Execution plan — the feature agent's per-wave steps

The `P-DB-*` sections below are the feature agent's checklist, one per wave, run in schedule order. They
are **not** separately dispatched; role labels describe the nature of each step.

## P-DB-1 — Author the model layer (Wave D-W1)

> **Role:** implementer.
> **TL;DR (non-normative):** create the PC tables + enums and the client IB-account column.
> **Task:** Implement **`DB-1`, `DB-1a`, `DB-1b`, `DB-2`, `DB-3`, `DB-4`, `DB-5`** exactly as written in
> the implementation doc, satisfying each unit's stated columns/constraints.
> **Sequencing:** do **not** author the cache indexes (`DB-6`) or the migration (`DB-8`) yet, unless you
> are also assigned the next prompt.
> **Acceptance:** matches each unit's spec in the impl doc; `python -c "import app.models.pc"` succeeds.

## P-DB-2 — Cache indexes + wiring (Waves D-W2, D-W3)

> **Role:** implementer.
> **TL;DR (non-normative):** add the watermark/derivation indexes and wire the models for Alembic.
> **Task:** Implement **`DB-6`** and **`DB-7`** exactly as written in the implementation doc.
> **Acceptance:** matches the `DB-6`/`DB-7` spec; `Base.metadata` lists every PC table and `alembic/env.py`
> imports the new module.

## P-DB-3 — Author migration 0008 (Wave D-W4)

> **Role:** implementer.
> **TL;DR (non-normative):** one additive migration that creates everything from `DB-1…DB-6`.
> **Task:** Implement **`DB-8`** exactly as written in the implementation doc.
> **Acceptance:** matches the `DB-8` spec; `upgrade()`/`downgrade()` are mirror images and `revises`
> points at the current head.

## P-DB-4 — Verify migration (Wave D-W5, steps 1–2)

> **Role:** verifier (read + run only; report mismatches against the relevant `DB-n` ID — do not edit the
> spec to make it pass).
> **TL;DR (non-normative):** dry-run the migration up and down on a scratch DB.
> **Task:** Run the **D-W5 steps 1–2** checklist in
> [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (database).md>),
> asserting the implementation doc's Verification checks. **Do not** touch the live database — that is
> the human gate `GATE-D`.
> **Teardown:** the scratch DB and any verification snippet are throwaway — drop/delete them and confirm
> `git status` is clean (commit **nothing** from verification) before reporting.
> **Acceptance:** every D-W5 check passes; report the exact command output.

> After P-DB-4 passes, make the **feature commit** (see _Feature agent_ above) on the current branch,
> then surface CP-D3 + the staged migration for the human `GATE-D` (live migration) and **quit**. Backend
> work begins only after a human applies `0008` to the live DB.
