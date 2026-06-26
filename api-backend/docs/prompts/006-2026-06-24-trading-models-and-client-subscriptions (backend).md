# 006 · Backend — Prompts

Dispatchable agent prompts for the backend component. Each prompt **references** its work unit(s) in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>)
by ID and carries only role, a non-normative one-line TL;DR, sequencing constraints, and guardrails —
**no spec is copied**, so changing a spec detail never touches this file. Each unit's spec and its
**Verification checks** live in the implementation doc; the wave checkpoints live in
[execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>).
Run in the order the schedule sets.

**Delegation model:** a single **feature agent** (see _Feature agent_ below) owns the whole backend
component — it executes the per-wave steps in schedule order, then makes **one feature commit** to the
current branch and quits. The per-wave `P-BE-*` sections are that agent's internal plan, **not** separate
dispatches.

> TL;DR lines are **non-normative** — a human-skim convenience only. The authority is the referenced
> work unit; if a TL;DR ever disagrees with the impl doc, the impl doc wins.

**Shared guardrails (prepend to every prompt):**
> You are working in the `api-backend` service on the branch already checked out for this session —
> commit to **that** branch; do not switch branches or assume a specific branch name. Follow the
> conventions in the implementation doc (feature package, thin router, service-owned logic,
> `require_action` guards). The DB migration `0008` is already applied — the ORM classes and indexes
> exist. Do not open or merge any PR. Do not edit frontend code. Report what you ran and its output;
> never claim a test passed without running it.

---

## Feature agent (single delegate) — owns the whole backend feature

> **Role:** feature owner for the entire backend component. **One delegated agent owns this feature end
> to end**; the `P-BE-*` sections below are its internal plan, not separate dispatches.
> **Entry precondition:** `GATE-D` cleared — migration `0008` is applied and the ORM classes/indexes exist.
> **Lifecycle:** initiated → implement → commit → quit.
> 1. **Implement** every wave in
>    [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>),
>    in the order it sets (`B-W1 → B-W6`), building each `BE-n` unit exactly as written in the impl doc.
>    Independent waves may be built concurrently, but this stays **one delegate and one commit**.
> 2. **Verify** via `B-W7` (the impl doc's `## Verification` section on a seeded scratch DB), **including
>    its Teardown** — drop the scratch DB/seed/smoke and commit nothing from verification.
> 3. **Commit** all the feature's source changes to the **current branch** (the branch checked out for
>    this session)
>    as a **single feature commit** — not one per wave:
>    > ```
>    > feat(pc): backend — 006 trading models & client subscriptions
>    >
>    > Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
>    > ```
>    Stage only the intended `006` changes (verification artifacts already removed).
> 4. **Quit.** Surface `CP-B4` and the ETag/`If-None-Match` contract for the frontend. Do **not** push or
>    open/merge a PR — the human owns `main`. Stop after the commit.

---

### Execution plan — the feature agent's per-wave steps

The `P-BE-*` sections below are the feature agent's checklist, one per wave, run in schedule order. They
are **not** separately dispatched; role labels describe the nature of each step.

## P-BE-1 — Scaffold package, storage adapter, authz (Wave B-W1)

> **Role:** implementer.
> **TL;DR (non-normative):** create the `app/libs/pc/` skeleton + storage adapter, and the PC authz actions.
> **Task:** Implement **`BE-1`** and **`BE-2`** exactly as written in the implementation doc.
> **Acceptance:** matches the `BE-1`/`BE-2` spec (package imports; storage round-trips; `AdminRole.PC`
> maps to the PC actions).

## P-BE-2 — Repositories incl. watermark probes (Wave B-W2)

> **Role:** implementer.
> **TL;DR (non-normative):** DB-access repositories, including the cache watermark probes.
> **Task:** Implement **`BE-3`** exactly as written in the implementation doc — DB access only, no
> business logic.
> **Acceptance:** every method in the `BE-3` spec exists and returns the documented shape; the watermark
> probes use the `DB-6` indexes.

## P-BE-3 — Services, uncached (Wave B-W3)

> **Role:** implementer (may fan out to two agents — one per service).
> **TL;DR (non-normative):** build the model-book and allocation services, without caching yet.
> **Task:** Implement **`BE-4`** and **`BE-5`** exactly as written in the implementation doc.
> **Sequencing:** build the open-matrix derivation **uncached** here; caching is a separate unit (`BE-6`).
> **Acceptance:** satisfies the `BE-4`/`BE-5` Verification checks in the impl doc (incl. the
> seeded-dataset regression equalling the frontend mock's totals).

## P-BE-4 — Open-matrix cache + ETag (Wave B-W4)

> **Role:** implementer.
> **TL;DR (non-normative):** wrap the derivation with the ETag cache + conditional GET.
> **Task:** Implement **`BE-6`** exactly as written in the implementation doc. **Sequencing:** do not
> change any route signature — the only external surface is the `ETag` header and `304` handling.
> **Acceptance:** satisfies the `BE-6` Verification checks (cache hit on identical reads; an input
> change moves the ETag and forces recompute; `If-None-Match` returns `304`).

## P-BE-5 — Scheduler (Wave B-W5)

> **Role:** implementer.
> **TL;DR (non-normative):** the period auto-open job, fail-safe on collision.
> **Task:** Implement **`BE-7`** exactly as written in the implementation doc.
> **Acceptance:** matches the `BE-7` spec (auto-open only when none is open; a collision fails safe;
> manual override still works).

## P-BE-6 — Schemas, router, mount (Wave B-W6)

> **Role:** implementer.
> **TL;DR (non-normative):** Pydantic schemas + the guarded router, mounted in `app/main.py`.
> **Task:** Implement **`BE-8`** exactly as written in the implementation doc.
> **Acceptance:** matches the `BE-8` spec (routes resolve under `/api/pc/…`; non-PC/ADMIN gets 403; the
> allocation GET emits an `ETag` and honours `If-None-Match`).

## P-BE-7 — Full verification (Wave B-W7)

> **Role:** verifier (report mismatches against the relevant `BE-n` ID — do not silently patch the spec).
> **TL;DR (non-normative):** run the whole backend verification checklist on a seeded DB.
> **Task:** Run the **B-W7** checklist in
> [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>),
> asserting the implementation doc's Verification checks. Report each result with command output.
> **Teardown:** the seeded scratch DB, the seed script, and any smoke snippet are throwaway — drop/delete
> them and confirm `git status` is clean (commit **nothing** from verification) before reporting.
> **Acceptance:** every B-W7 check passes. When green, make the **feature commit** (see _Feature agent_
> above) on the current branch, surface CP-B4 and the ETag/`If-None-Match` contract for the frontend, and
> **quit** — do **not** push or open/merge a PR (human owns `main`).
