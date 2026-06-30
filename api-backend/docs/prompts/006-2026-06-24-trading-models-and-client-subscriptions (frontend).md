# 006 · Frontend — Prompts

Dispatchable agent prompts for the frontend component. Each prompt **references** its work unit(s) in
[implementation.md](<../implementations/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>)
by ID and carries only role, a non-normative one-line TL;DR, sequencing constraints, and guardrails —
**no spec is copied**, so changing a spec detail never touches this file. Each unit's spec and its
**Verification checks** live in the implementation doc; the wave checkpoints live in
[execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>).
Run in the order the schedule sets.

**Delegation model:** a single **feature agent** (see _Feature agent_ below) owns the whole frontend
component — it executes the per-wave steps in schedule order, then makes **one feature commit** to the
current branch and quits. The per-wave `P-FE-*` sections are that agent's internal plan, **not** separate
dispatches.

> TL;DR lines are **non-normative** — a human-skim convenience only. The authority is the referenced
> work unit; if a TL;DR ever disagrees with the impl doc, the impl doc wins.

**Shared guardrails (prepend to every prompt):**
> You are working in the `admin-frontend` service on the branch already checked out for this session —
> commit to **that** branch; do not switch branches or assume a specific branch name. Build the layered
> fetch stack described in the implementation doc; create every layer in this repo (none pre-exist). Do
> not change the PC screens' visual design/layout (parity, not redesign). `lib/pc/types.ts` is permanent.
> Do not open or merge any PR — the human owns `main`. Report what you ran; never claim the build/screens
> work without running them.

---

## Feature agent (single delegate) — owns the whole frontend feature

> **Role:** feature owner for the entire frontend component. **One delegated agent owns this feature end
> to end**; the `P-FE-*` sections below are its internal plan, not separate dispatches.
> **Entry precondition:** `CP-B4` cleared — backend routes are live under `/api/pc/…` and the
> ETag/`If-None-Match` contract is published.
> **Lifecycle:** initiated → implement → commit → quit.
> 1. **Implement** every wave in
>    [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>),
>    in the order it sets (`F-W0 → F-W5`), building each `FE-n` unit exactly as written in the impl doc.
> 2. **Verify** via `F-W6` (the impl doc's `## Verification` section — manual smoke + `next build`),
>    **including its Teardown** — delete throwaway scratch/smoke and commit nothing from verification.
> 3. **Commit** all the feature's source changes (including the deleted mock) to the **current branch**
>    (the branch checked out for this session) as a **single feature commit** — not one per wave:
>    > ```
>    > feat(pc): frontend — 006 trading models & client subscriptions
>    >
>    > Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
>    > ```
>    Stage only the intended `006` changes (verification artifacts already removed; `git status` clean
>    otherwise).
> 4. **Quit.** Do **not** push or open/merge a PR — the human owns `main`. Stop after the commit.

---

### Execution plan — the feature agent's per-wave steps

The `P-FE-*` sections below are the feature agent's checklist, one per wave, run in schedule order. They
are **not** separately dispatched; role labels describe the nature of each step.

## P-FE-0 — Correct the stale prototype (Wave F-W0)

> **Role:** implementer.
> **TL;DR (non-normative):** fix the prototype's stale logic + vocabulary against the existing mock.
> **Task:** Implement **`FE-7`** exactly as written in the implementation doc. **Sequencing:** do it
> against the existing mock (a pure UI correction) and do **not** delete the mock yet.
> **Acceptance:** satisfies the `FE-7` spec and the impl doc's correction Verification checks; both
> screens still render against the mock; build passes.

## P-FE-1 — Transport, endpoints, id-token cookie (Wave F-W1)

> **Role:** implementer.
> **TL;DR (non-normative):** the server-only HTTP client, the endpoints map, and the id-token cookie.
> **Task:** Implement **`FE-1`** exactly as written in the implementation doc.
> **Acceptance:** matches the `FE-1` spec (PC endpoints resolve to `/api/pc/…`; the id-token cookie is
> written on auth-state change and attached as a Bearer token).

## P-FE-2 — Server functions + actions (Wave F-W2)

> **Role:** implementer.
> **TL;DR (non-normative):** typed per-endpoint server functions + thin action wrappers.
> **Task:** Implement **`FE-2`** and **`FE-3`** exactly as written in the implementation doc.
> **Acceptance:** matches the `FE-2`/`FE-3` spec (incl. the allocation function plumbing the ETag both
> ways and surfacing `304`).

## P-FE-3 — Seam mappers + format (Wave F-W3)

> **Role:** implementer.
> **TL;DR (non-normative):** turn the seams into pure DTO→view mappers; move formatters + change-log
> templates out.
> **Task:** Implement **`FE-5`** exactly as written in the implementation doc.
> **Acceptance:** matches the `FE-5` spec (mappers do shaping/formatting only — no derivation; the
> change-log renderer lives frontend-side; types evolve as specified).

## P-FE-4 — Hooks with allocation cache (Wave F-W4)

> **Role:** implementer.
> **TL;DR (non-normative):** the `useModels`/`useAllocation` hooks, with the conditional ETag cache.
> **Task:** Implement **`FE-4`** exactly as written in the implementation doc.
> **Acceptance:** satisfies the `FE-4` Verification checks (a no-change revisit keeps the cached view
> via `304`; an upstream change yields a fresh `200` + new ETag).

## P-FE-5 — Wire screens, delete mock (Wave F-W5)

> **Role:** implementer.
> **TL;DR (non-normative):** swap screens onto the hooks, wire the write handlers, delete the mock.
> **Task:** Implement **`FE-6`** exactly as written in the implementation doc. **Sequencing:** requires
> `FE-7` (P-FE-0) complete before the mock is deleted.
> **Acceptance:** matches the `FE-6` spec (both screens on live API data, layout unchanged; mock removed
> with no dangling imports; build passes).

## P-FE-6 — Verify + finish (Wave F-W6)

> **Role:** verifier.
> **TL;DR (non-normative):** run the whole frontend verification checklist; then make the feature commit.
> **Task:** Run the **F-W6** checklist in
> [execution-schedule.md](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>),
> asserting the implementation doc's Verification checks. Report each with evidence (network-panel
> ETag/`304`, build output).
> **Teardown:** any throwaway smoke/scratch file made for the checks is not part of the deliverable —
> delete it and confirm `git status` shows only the intended `006` changes (commit **nothing** from
> verification) before reporting.
> **Acceptance:** every F-W6 check passes. Then perform the **feature commit** (see _Feature agent_
> above) on the current branch and **quit** — do **not** push or open/merge a PR (human owns `main`).
