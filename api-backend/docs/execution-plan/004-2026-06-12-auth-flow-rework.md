# 004 — Execution & Scheduling Plan (Authentication Flow Rework)

**Date:** 2026-06-12
**Author:** QinQipeng
**Status:** Execution scheduling (ready to run)
**Drives:** [004 — Implementation Plan](004-2026-06-12-implementation-plan.md) · [Design](004-2026-06-11-auth-flow-rework.md) · [Requirements (R1–R7)](../requirements/auth-module.md)

> The implementation plan answers **what** to build (8 branches, their steps, priorities, DoDs).
> This document answers **how to run it**: which steps execute concurrently, who (which agent) owns
> each, how work is isolated and merged, what gates each transition, and which tests must be green
> before the next thing starts. It adds no new design and changes no step — it sequences them into a
> controlled, parallel execution.

---

## 0. Execution model in one picture

```
                      ┌─────────────── integration branch: auth-flow-rework ───────────────┐
 WAVE 0   B0 test-harness ║ B8.1 secure-default            (2 agents, no deps)
   │      ── barrier: harness green, assertion test green ──
 WAVE 1   B1 schema-gate  ║ B2 firebase-identity           (2 agents)
   │      ══ GATE A (human): B1 MariaDB rehearsal green → apply 0004 to staging ══
 WAVE 2   B4 client-onboard ║ B5 admin-enroll → B6 bootstrap  (B6 trails B5 primitives)
   │      ── barrier: birth-path integration flows green ──
 WAVE 3   B7 user-account-sync ║ B8.2–B8.5 devmode + dev-reg  (both depend on Wave 2)
   │      ── barrier: dev-reg + sweep flows green; dev seed (B6.3) present ──
 WAVE 4   B3 gateway-core  (KILL-SWITCH — the cutover)
          ══ GATE B (human): full 004 §8 verification green → apply 0004 to prod → merge to main ══
                      └────────────────────────────────────────────────────────────────────┘
```

Two orderings are deliberately distinct (impl plan §0.1): **significance** (P0/P1/P2) ranks what
matters; **waves** rank what can run *now*. `gateway-core` is the most significant branch and the
last to merge.

### Git branch topology (what you push)

**One git branch per wave**, not per feature. Each wave is a pushable, reviewable branch; the
impl-plan B-units (B0, B8.1, …) become **squash-merged commits inside it**. This supersedes the
"eight feature branches" framing of impl §11 — the eight B-units are the *units of work*, now grouped
into five wave branches.

| Git branch | Cut from (at) | Commits (one per B-unit) | PR'd into | Lands |
|---|---|---|---|---|
| `wave/0-foundations` | `auth-flow-rework` | B0, B8.1 | `auth-flow-rework` | end W0 barrier |
| `wave/1-primitives` | `auth-flow-rework` tip (post-W0) | B1, B2 | `auth-flow-rework` | end W1, after **Gate A** |
| `wave/2-birth-paths` | `auth-flow-rework` tip (post-W1) | B4, B5, B6 | `auth-flow-rework` | end W2 barrier |
| `wave/3-dev-sync` | `auth-flow-rework` tip (post-W2) | B7, B8.2–B8.5 | `auth-flow-rework` | end W3 barrier |
| `wave/4-cutover` | `auth-flow-rework` tip (post-W3) | B3 | `auth-flow-rework` → **`main`** | **Gate B** |

- Each wave branch is cut from the **current tip of `auth-flow-rework`**, so it already contains every
  prior merged wave — the dependency chain is satisfied by construction.
- **Per-wave review happens on the integration branch.** Each wave branch is pushed by agents with a
  drafted PR; **the author reviews (and merges) that PR into `auth-flow-rework`** — five small,
  focused reviews instead of one monster diff. By cutover everything has already been vetted.
- **Exactly one `→ main` event: the gated cutover.** Nothing reaches `main` until Gate B, when the
  author opens a single `auth-flow-rework → main` PR. Agents never PR or merge to `main` (§1).

### Why one merge to `main`, not several (decided 2026-06-12)

`main` **is the production deploy source** (confirmed). That makes incremental wave-merges to `main`
actively unsafe, not merely noisy:

- **No half-open prod window.** Wave 2 mounts the live provisioning endpoints (`POST
  /api/admin/clients`, `/api/admin/staff`); B3 — which closes the old auto-create loophole — is
  deliberately **last**. Merging waves to `main` one at a time would run prod with **both** the new
  provisioning surfaces **and** the old loophole active for weeks — *more* account-creation paths than
  today, the exact surface this rework shrinks. A single cutover merge makes "new paths appear + old
  loophole closes" **atomic** in prod.
- **The live migration rides with the feature.** B1's prod migration lands at cutover, not weeks early
  — schema change committed exactly when the feature is.
- **One clean rollback point** — revert one merge commit, not an unwound chain.
- Granular review is preserved by reviewing each wave's PR *into `auth-flow-rework`* (above), so the
  single `main` PR is a coherence + §8-verification check, not a first read.
- A B-unit is **one commit** on its wave branch. Within-wave parallelism still uses isolated worktrees
  (§4); the worktrees just *land* as ordered squash commits onto the wave branch.

---

## 1. The three agent roles

Every branch is executed by a small fixed cast, not one agent doing everything. Separation of duties
is the point: the agent that writes code is not the agent that certifies it.

| Role | Count | Responsibility | Tools / isolation |
|---|---|---|---|
| **Implementer** | 1 per active B-unit | Build that B-unit's steps in its own git worktree; write Tier-1 unit tests; self-report the DoD checklist. | Worktree off the current wave branch; full edit/test tools. |
| **Verifier** | 1 per B-unit (fresh, adversarial) | After the implementer reports DoD, independently check the work **against the proposal and the four latent traps A1–A4** — the bugs that pass single-threaded unit tests. Returns a structured verdict (pass / findings). | Read + test only; **no edit** — it judges, it doesn't fix. |
| **Integrator** | 1 per wave | Land the wave's verified B-units as ordered **squash commits onto the wave branch**, reconcile the known file collisions (§4), run Tier-2 integration tests, **push the wave branch + draft its PR description**. Never merges to `main`. | Owns the wave branch + drafts the PR; resolves conflicts. The author owns the merge to `main`. |

A B-unit is **not done** until: implementer DoD reported → verifier passes → integrator squash-commits
it onto the wave branch → Tier-2 green. Implementer-green alone never advances a wave.

> **Agent responsibility boundary (hard rule).** No agent ever opens a pull request to `main` or
> merges to `main` — that is **exclusively the human's** (the author's). An agent's terminal
> deliverable for a wave is: the wave branch **pushed to remote**, green at its barrier, with a
> filled DoD checklist and a **drafted PR description** for the author to review. The author opens
> the PR, reviews, and merges. Agents may merge wave branches into the integration branch
> `auth-flow-rework` (not `main`); only the final `auth-flow-rework` → `main` PR + merge at Gate B is
> the human's — and if the author prefers, the integration-branch PRs can be theirs too (a config
> choice, not a structural one).

---

## 2. Wave schedule (delegation table)

Each row is one B-unit = one implementer agent = **one squash commit on the wave's git branch**.
"Predecessor" is the hard edge that must already be in the wave branch (or a prior wave); B-units in
the same wave with no edge between them run fully concurrently in separate worktrees.

### Wave 0 — Foundations · `wave/0-foundations` *(no dependencies — start both immediately)*
| B-unit (commit) | Steps | Predecessor | DoD source |
|---|---|---|---|
| B0 `auth/test-harness` | B0.1–B0.4 | — | impl §B0 |
| B8.1 `secure-default` (fast-track) | B8.1 only | — | impl §B8 row 8.1 |

> B8.1 is carved out of B8 and run here because it is P0, one file, dependency-free, and hardens
> every interim state. The rest of B8 (8.2–8.5) waits for Wave 3.

### Wave 1 — Primitives · `wave/1-primitives`
| B-unit (commit) | Steps | Predecessor | DoD source |
|---|---|---|---|
| B1 `auth/schema-status-gate` | B1.1–B1.4 | B0 (harness) | impl §B1 |
| B2 `auth/firebase-identity` | B2.1–B2.4 | B0 (fakes/factories) | impl §B2 |

> B1 builds the migration **and rehearses it**, but the live apply is **Gate A**, not an agent
> action. B2 delivers `ensure_identity` + the `created` flag that A1's fix depends on.

### Wave 2 — Birth paths · `wave/2-birth-paths`
| B-unit (commit) | Steps | Predecessor | DoD source |
|---|---|---|---|
| B4 `auth/client-onboarding` | B4.1–B4.4 | B1 (`status`,`authorized_by`) + B2 (`ensure_identity`) | impl §B4 |
| B5 `auth/admin-enrollment` | B5.1–B5.6 | B1 (`is_active`) + B2 | impl §B5 |
| B6 `auth/bootstrap` | B6.1–B6.4 | **B5 primitives** (intra-wave edge) + B2 | impl §B6 |

> B4 ∥ B5 are independent. B6 reuses `StaffService` primitives (B6.2), so it **trails B5** within the
> wave — its implementer starts once B5's service layer is mergeable, not at wave open. B6.3 (dev
> seed) is built here and is the unblocker for B3.6 two waves later.

### Wave 3 — Dev surface + reconciliation · `wave/3-dev-sync`
| B-unit (commit) | Steps | Predecessor | DoD source |
|---|---|---|---|
| B7 `auth/user-account-sync` | B7.1–B7.5 | B2 + B4 + B5 + B1 (`disabled`/quarantine) | impl §B7 |
| B8 `auth/devmode-flag` (rest) | B8.2–B8.5 | B4 + B5 (B8.4 reuses their primitives) | impl §B8 rows 8.2–8.5 |

> Both consume Wave 2. B8.4 (`/api/dev/register`) + B6.3 (dev seed, already merged) together satisfy
> the **A3** predecessor for B3.6 — so they must be green *before* Wave 4 opens.

### Wave 4 — Cutover · `wave/4-cutover` *(serial, single B-unit, human-gated)*
| B-unit (commit) | Steps | Predecessor | DoD source |
|---|---|---|---|
| B3 `auth/gateway-core` | B3.1–B3.6 | **B4+B5+B6** (kill-switch, hard rule 1) **and** B8.4+B6.3 for **B3.6** (hard rule 2 / A3) | impl §B3, §11 |

> B3 is the kill-switch. Its predecessor set is the *entire spine*; B3.6 has a stricter set still.
> This is why it is alone in its wave and behind a human gate.

---

## 3. Gates & checkpoints (the "controlled" part)

Two kinds of stop. **Barriers** are automated green-lights between waves; **gates** are human
decisions on irreversible / live-data actions.

### Automated wave barriers (5)
A wave opens only when the prior wave is **all-green**: every branch verifier-passed, merged, and the
barrier's Tier-2 integration suite passing. A red barrier blocks the next wave entirely — no partial
advance.

| Barrier | Green condition |
|---|---|
| End of W0 | `pytest` green on empty suite; B8.1 startup-assertion test (prod marker + bypass ⇒ no boot) passes. |
| End of W1 | gate-function unit tests (pending/active/disabled, is_active T/F) green; identity fake create/delete/idempotency green. |
| End of W2 | birth-path integration flows green (RM→`201`/`pending`; non-RM→`403`; PM target→`422`; saga compensation fires `created`-guarded; bootstrap idempotent). |
| End of W3 | dev `/register`→`201` + `409` on repeat; sweep classifier A/B/C + quarantine idempotent; **dev seed present** (A3 precondition for W4). |
| Pre-cutover | full 004 §8 verification table green on the integration branch (see Tier 4). |

### Human gates (2 — the only manual stops)
| Gate | When | Decision | Why human |
|---|---|---|---|
| **Gate A — live migration** | After B1 rehearsal green (end W1) | Apply `0004` to **staging** now; production apply deferred to Gate B. Confirm the **grandfather decision** (5 live clients backfill → `active`, permanently bypassing the new gate — impl §12.2). | Touches the live 15-row DB; CI cannot vouch for MariaDB-only DDL (impl §B1 rehearsal gate). |
| **Gate B — cutover** | After pre-cutover barrier; `wave/4-cutover` pushed + green | **Human-only:** the author opens the `auth-flow-rework` → `main` PR, reviews it, applies `0004` to **production**, merges to `main`, and the kill-switch goes live. Agents do not PR or merge to `main`. | The moment the auto-create loophole closes and auth behavior changes for real users. Irreversible in practice. |

Between gates, Waves 0→3 run agent-autonomous, pausing only at the automated barriers.

---

## 4. Isolation & merge mechanics (worktree model)

Each implementer works in its **own git worktree** off the current wave branch. This is required, not
cosmetic: same-wave B-units edit overlapping files and would corrupt each other in a shared tree.
Each verified worktree is then **squash-merged as one commit onto the wave branch** (so a B-unit = a
commit), and the wave branch is what PRs into `auth-flow-rework`.

**Known collision hotspots** (the integrator reconciles these at each barrier):

| File | Touched by | Wave | Reconciliation note |
|---|---|---|---|
| `app/main.py` (router mounts) | B4.4, B5.4, B8.5 | W2, W3 | Append-only router includes; order-independent. Merge sequentially. |
| `app/models/users.py` | B1.2 only (in its wave) | W1 | Sole writer that wave — no contention. |
| `app/libs/auth/deps.py` | B1.4 (add gate fn), then B3.3/B3.4/B3.6 | W1, W4 | Different waves — no concurrent edit. B3 builds on B1.4's merged result. |
| `app/libs/users/repository.py` | B5.1 (staff repo), B5.5/B5.6 | W2 | Single branch — internal ordering only. |
| `app/core/config.py` | B8.1 (W0), B6.1 (W2), B7.4/B8.x (W3) | multi | Additive settings fields; merge sequentially, watch for duplicate keys. |
| `app/schemas/*` | per-branch new files | — | New files per feature; low collision risk. |

**Commit order within a wave:** verified B-units land **smallest-surface-first** so collisions
surface early against a still-small diff; the integrator runs Tier-2 after *each* commit lands, not
just at the end, so a conflict is attributed to the B-unit that introduced it. Only once all the
wave's commits are on the branch and Tier-2 is green does the wave branch PR into `auth-flow-rework`.

---

## 5. Test tiers (mapped to gates)

Four tiers, each gating a different transition. Tiers 1–2 are the spine; 3–4 are the live-safety
backstops.

| Tier | Scope | Substrate | Gates | Owner |
|---|---|---|---|---|
| **T1 — Unit** | per-step service guards, gate function, idempotency, saga compensation logic | SQLite `create_all` + `FakeFirebaseIdentityService` (B0.3) | branch → integration merge | Implementer |
| **T2 — Integration** | cross-branch endpoint flows (TestClient) — onboarding, enrollment, dev-reg, sweep | SQLite + TestClient + fakes | wave → wave barrier | Integrator |
| **T3 — Migration rehearsal** | `alembic upgrade` **and** `downgrade` + `_require()` assertions | **real MariaDB**, loaded with a live-shaped 15-row dump | **Gate A** | Human + B1 implementer |
| **T4 — End-to-end verification** | the full 004 §8 table as automated tests | integration branch, SQLite + fakes | **pre-cutover barrier → Gate B** | Integrator |

**Why T3 is special:** the SQLite test path (B0.1) builds via `create_all` and **never runs the
MariaDB-only migration DDL** (impl §B1). So no amount of CI green proves the migration. T3 against a
real MariaDB clone is the *only* evidence — it is a human-gated manual rehearsal, not a CI step.

**What the verifier specifically hunts (per branch):** the A1–A4 traps are concurrency/sequencing
bugs that pass single-threaded T1 tests. The verifier must exercise:
- **A1** (B2/B4/B5): concurrent same-email onboard — assert compensation fires only when
  `created is True`; the adopted/winner uid survives.
- **A2** (B5.3): two concurrent demotions of *different* ADMINs — assert exactly-one-ADMIN holds
  (the `SELECT … FOR UPDATE` works); zero-admin state is unreachable.
- **A3** (B3.6): offline dev after kill-switch — assert a seeded `dev-user` admin still resolves and
  unknown token → `403`.
- **A4** (B4.3/B5.2): first token after provisioning carries the portal (+role) claim — no claimless
  slow path.

---

## 6. Orchestration substrate

Run as **worktree-isolated Claude agents** (the chosen model). Concretely:

- One **implementer agent per branch**, spawned with its branch section + the global principles
  (impl §1) + the KEEP list + the frozen `UserOut` contract as its brief; isolation = `worktree`.
- One **verifier agent per branch** spawned after the implementer reports, read/test-only, briefed
  with the proposal section + the relevant A-trap(s).
- The wave structure is deterministic (fixed DAG, fixed barriers), so it maps directly onto a
  **Workflow script** if you later want to automate the fan-out: each wave is a `parallel()` of
  implementer→verifier pipelines; barriers are the awaits between waves; the two human gates are
  explicit pause points (the workflow stops and surfaces the rehearsal/cutover decision rather than
  proceeding autonomously). That conversion is optional — the same schedule runs equally well as
  hand-dispatched `Agent` calls, one wave at a time.

**Agent contract (every implementer returns):** the diff, its T1 tests, and a filled-in copy of its
branch DoD checklist with each line marked met/not-met + evidence. That checklist is the verifier's
input and the integrator's merge precondition.

---

## 7. Definition of done (execution-level)

- All 8 B-units executed through implementer → verifier → integrator; none advanced on
  implementer-green alone.
- **Five wave branches** (`wave/0-foundations` … `wave/4-cutover`), each a squash-commit-per-B-unit,
  pushed by agents with drafted PRs; the author reviews and merges. `main` updated **once**, at Gate B,
  **by the author only** — no agent opens a PR to or merges to `main`.
- All 5 automated barriers passed in order; no wave opened over a red barrier.
- Gate A: `0004` rehearsed on real MariaDB (T3 green), grandfather decision consciously recorded,
  applied to staging.
- Gate B: 004 §8 table green (T4), `0004` applied to production, `auth-flow-rework` merged to `main`,
  B3 kill-switch live.
- The four latent traps each have a verifier-owned concurrency/sequencing test, not just a unit test.
- Maps cleanly back to impl §13 — every whole-feature DoD line has an owning wave and gate here.
