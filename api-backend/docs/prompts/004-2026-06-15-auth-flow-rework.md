# 004 — Execution Prompt: Authentication Flow Rework (Wave-by-Wave, Agent-Orchestrated)

**Date:** 2026-06-15
**Implements:** [Execution & Scheduling Plan](../execution-plan/004-2026-06-12-execution-scheduling-plan.md) · [Implementation Plan](../implementations/004-2026-06-12-implementation-plan.md) · [Design](../proposals/004-2026-06-11-auth-flow-rework.md) · [Requirements R1–R7](../requirements/auth-module.md)
**Integration branch:** `auth-flow-rework` (already checked out; cut off the `003 → 005` tree, head `8f2a1c9d4b6e`)
**Nature:** 8 units of work → **5 wave branches**, each built by isolated worktree agents under an implementer → verifier → integrator protocol, **PR'd one wave at a time into `auth-flow-rework`**, with **2 human gates** on live-data / cutover actions.
**Author-review contract:** **You stop at the end of every wave.** Each wave ends with the wave branch pushed and a PR drafted; the author reviews and merges it before the next wave is cut. Nothing reaches `main` except the single gated cutover PR — opened, reviewed, and merged **by the author only**.

---

## 0. You are the orchestrator — read this first

You drive this rework wave by wave. You do **not** write all the code yourself: for each wave you **spawn isolated worktree agents** (implementer → verifier → integrator) per the roles in §2, collect their structured deliverables, and enforce the barriers and gates. The execution plan is the source of truth for *how to run it*; the implementation plan is the source of truth for *what each step builds* (real files + acceptance). **Do not re-argue or re-design** — sequence and execute.

**Operating rules — non-negotiable:**

1. **Human owns `main` (standing rule).** No agent — and not you — ever opens a PR to `main` or merges to `main`. Your terminal deliverable for every wave is: wave branch **pushed**, green at its barrier, DoD checklist filled, **PR description drafted**. The author opens/reviews/merges. (Agents *may* merge wave branches into `auth-flow-rework` only if the author delegates it; default is the author merges every wave PR too — see rule 2.)
2. **Stop at every wave boundary.** After a wave is green and its PR is drafted, **HALT and report**. Do not cut the next wave branch until the author confirms the current wave's PR is merged into `auth-flow-rework`. The next wave is cut from the **new tip** of `auth-flow-rework`, so it inherits all prior waves by construction.
3. **Never advance on implementer-green alone.** A B-unit is done only when: implementer reports DoD → a **fresh, adversarial verifier** passes it → integrator squash-commits it onto the wave branch → Tier-2 green. No exceptions.
4. **Two human gates are hard pauses** (§7). At Gate A (live migration) and Gate B (cutover) you stop and surface the decision; you do not proceed autonomously past either.
5. **If any barrier, gate, verifier check, or test is red: stop and report.** Do not improvise around a failed assertion. Fix forward within the wave, or surface the blocker.
6. **Decisions are locked.** Requirements R1–R7 are approved; the grandfather decision, the external-cron scheduler, and the single-cutover-merge are all settled. Do not re-litigate.

**Environment facts** (verified 2026-06-15):
- Working dir: `api-backend/`. Current branch: `auth-flow-rework`. Integration head: `8f2a1c9d4b6e` (005 cutover applied; 5 client / 10 admin rows live).
- Python: use `.venv/Scripts/python.exe`; alembic via `-m alembic`; `ruff`, `mypy`, `pytest`/`httpx` present.
- `app/libs/auth/{deps,router,service,actions}.py` exist; `app/libs/users/` exists; **no `tests/` directory yet** (B0 creates it).
- Existing per-feature convention: `app/libs/<feature>/{router,service,repository}.py` + `app/schemas/<feature>.py`. New modules introduced: `identity` (B2), `clients` (B4), `staff` (B5), `dev` (B8), `sync` (B7), `app/cli/` (B6/B7), `tests/` (B0).

---

## 1. Invariants every agent inherits (paste into every brief)

These are global engineering principles (impl §1); hold every step to them.

- **Strict layering:** router (HTTP/validation only) → service (business rules + txn boundary + cross-system orchestration) → repository (persistence only). No business logic / `HTTPException` / Firebase calls in repositories.
- **One provisioning chokepoint per portal.** Creation is an explicit, named, authority-gated service call — **never** a side effect of authentication, in *any* mode.
- **Secure-by-default & fail-closed.** Defaults deny; a prod marker plus any dev bypass must refuse to boot (startup assertion, not just a default value).
- **Saga/compensation for cross-system writes:** create identity → single DB transaction → on failure compensate (best-effort identity delete) **only when the identity was minted this request** (`created is True`). All provisioning idempotent (keyed by email pre-bind).
- **Least privilege:** every mutating endpoint behind a `require_action(...)` RBAC gate; authority is the route/action, never a body field.
- **Frozen public contract:** `UserOut` = `{firebase_uid, email, role}`, unchanged; public key stays `firebase_uid`. New columns (`status`, `is_active`, `authorized_by`) are **internal only**.
- **Preserve the KEEP list:** Firebase verify core, `extract_uid_email`, value-based enum persistence (`values_callable`), RBAC, portal gates, `set_portal_claims`/`portal_from_claims`.
- **No branch merges without tests:** T1 unit tests for service guards + idempotency + saga logic; T2 integration tests per endpoint (TestClient + SQLite + faked identity).

---

## 2. The agent cast & the done-protocol

Every B-unit runs through a fixed three-role cast. Separation of duties is the point: **the agent that writes code never certifies it.**

| Role | Count | Does | Isolation / tools |
|---|---|---|---|
| **Implementer** | 1 per active B-unit | Builds the B-unit's steps in its own worktree; writes T1 unit tests; self-reports the DoD checklist with evidence per line. | `isolation: worktree` off the current wave branch; full edit/test tools. |
| **Verifier** | 1 per B-unit (**fresh, adversarial**) | After implementer reports, independently checks the work against the proposal + the relevant **A1–A4 traps**. Returns a structured verdict: `pass` or `findings[]`. | **Read + test only — no edit.** It judges; it does not fix. |
| **Integrator** | 1 per wave | Lands verified B-units as ordered **squash commits** onto the wave branch (smallest-surface-first), reconciles the §4 collisions, runs T2 after *each* commit, pushes the wave branch, **drafts the PR**. | Owns the wave branch + PR draft; resolves conflicts. Never merges to `main`. |

**Done-protocol per B-unit (hard order):** implementer DoD reported → verifier `pass` → integrator squash-commits → T2 green. A verifier `findings` verdict bounces back to the implementer (same worktree) for a fix, then re-verify. **Loop until the verifier passes; never override a verifier finding to advance.**

**Implementer return contract (every implementer):** the diff, its T1 tests, and a filled copy of its branch DoD checklist with every line marked met / not-met + evidence. That checklist is the verifier's input and the integrator's merge precondition.

---

## 3. Worktree & merge mechanics

- Each implementer works in its **own git worktree** off the current wave branch — required, not cosmetic: same-wave B-units edit overlapping files and would corrupt a shared tree.
- Each verified worktree is **squash-merged as exactly one commit** onto the wave branch (a B-unit = a commit).
- **Commit order within a wave: smallest-surface-first**, so collisions surface early against a small diff. The integrator runs T2 **after each commit lands**, not just at the end, so a conflict is attributed to the B-unit that introduced it.
- Only when all the wave's commits are on the branch **and** T2 is green does the wave branch get pushed + PR'd into `auth-flow-rework`.

**Known collision hotspots — integrator reconciles at the barrier:**

| File | Touched by | Note |
|---|---|---|
| `app/main.py` (router mounts) | B4.4, B5.4, B8.5 | Append-only includes; order-independent; merge sequentially. |
| `app/core/config.py` | B8.1 (W0), B6.1 (W2), B7.4/B8.x (W3) | Additive settings fields; watch for duplicate keys. |
| `app/libs/auth/deps.py` | B1.4 (gate fn), then B3.3/B3.4/B3.6 (W4) | Different waves — B3 builds on B1.4's merged result. |
| `app/models/users.py` | B1.2 only (in W1) | Sole writer that wave. |
| `app/libs/users/repository.py` | B5.1, B5.5/B5.6 | Single branch — internal ordering only. |

---

## 4. THE WAVE PLAYBOOK

> Run waves **strictly in order**. For each wave: cut the branch → spawn implementer(s) → verifier(s) → integrator → hit the barrier → **STOP for author review**. Every B-unit's "what to build + where + acceptance" lives in the cited impl §B-section — give the implementer that section verbatim; do **not** restate or reinvent it here.

---

### WAVE 0 — Foundations · branch `wave/0-foundations` *(no deps — start both B-units immediately)*

**Cut from:** `auth-flow-rework` (current tip).

| B-unit (→ 1 commit) | Steps | Predecessor | Brief = impl section |
|---|---|---|---|
| **B0** `auth/test-harness` | B0.1–B0.4 | — | impl §B0 |
| **B8.1** `secure-default` (fast-track, P0) | B8.1 only | — | impl §B8 row 8.1 |

- B0 builds `tests/` (SQLite `create_all` engine, `Session` + `TestClient` fixtures, `FakeFirebaseIdentityService`, factories). B8.1 flips `dev_mode` default `True`→`False`, adds `app_env`, and adds the **fail-closed startup assertion** (prod + any bypass ⇒ refuse to boot).
- These two are independent → spawn both implementers concurrently in separate worktrees.

**Barrier (End of W0) — all must be green:**
- `pytest` green on the empty/initial suite.
- B8.1 startup-assertion test: `app_env=="production"` + (`dev_mode` or `firebase_auth_disabled`) ⇒ app does **not** boot.

**⏸ STOP — author review checkpoint (what you can check):**
> Wave branch `wave/0-foundations` pushed + PR drafted into `auth-flow-rework`. **You can now inspect:** the test scaffold (`tests/conftest.py`, `tests/fakes.py`, `tests/factories.py`) runs green, and that a production marker with any bypass enabled refuses to start. Two small commits (B0, B8.1). **Merge this PR, then tell me to start Wave 1.**

---

### WAVE 1 — Primitives · branch `wave/1-primitives`

**Cut from:** `auth-flow-rework` tip (post-W0 merge).

| B-unit (→ 1 commit) | Steps | Predecessor | Brief = impl section |
|---|---|---|---|
| **B1** `auth/schema-status-gate` | B1.1–B1.4 | B0 (harness) | impl §B1 |
| **B2** `auth/firebase-identity` | B2.1–B2.4 | B0 (fakes/factories) | impl §B2 |

- B1 adds `ClientStatus` enum, `ClientProfile.status` / `AdminProfile.is_active` / `User.authorized_by` (self-FK **`ON DELETE SET NULL`**, placed *before* the timestamp columns), the Alembic `0004` migration **with `_require()` assertions + reversible downgrade**, and the pure `assert_can_authenticate(user)` gate function — **not wired yet** (wiring is B3).
- B2 delivers `FirebaseIdentityService` (the **only** module calling `auth.create_user`/`delete_user`/`generate_*_link`), the load-bearing `ensure_identity(email) -> (uid, created)` idempotency primitive, the `firebase_auth_disabled` stub, and the `get_identity_service` DI provider.

**Verifier focus (this wave):**
- **A1 setup** — confirm `ensure_identity` returns `created` correctly: `True` on mint, `False` on adopt (`EmailAlreadyExistsError`/lookup hit). This flag is what compensation in W2 depends on.

**Barrier (End of W1):**
- Gate-function unit tests green across all branches: client `pending`/`active`/`disabled`, admin `is_active` T/F, missing profile.
- Identity fake create/delete/idempotency green.

**🔴 GATE A — live migration (human, after barrier green):**
> B1 builds **and rehearses** `0004`, but the live apply is human-only. Surface to the author: run T3 — `alembic upgrade` **and** `downgrade` against a **real MariaDB** instance loaded with a live-shaped 15-row dump, `_require()` assertions green (CI cannot vouch for MariaDB-only DDL). On green, the author applies `0004` to **staging** (production apply deferred to Gate B) and **consciously records the grandfather decision** (5 live clients backfill → `active`, permanently bypassing the new gate — impl §12.2). **Do not apply to any live DB yourself.**

**⏸ STOP — author review checkpoint (what you can check):**
> Wave branch `wave/1-primitives` pushed + PR drafted. **You can now inspect:** the migration up/down + assertions, the new internal columns (and that `UserOut` is unchanged), the gate function's truth table, and `ensure_identity`'s `created` semantics. **This is also Gate A** — rehearse `0004` on MariaDB, record the grandfather decision, apply to staging. **Merge the PR + complete Gate A, then tell me to start Wave 2.**

---

### WAVE 2 — Birth paths · branch `wave/2-birth-paths`

**Cut from:** `auth-flow-rework` tip (post-W1 merge).

| B-unit (→ 1 commit) | Steps | Predecessor | Brief = impl section |
|---|---|---|---|
| **B4** `auth/client-onboarding` | B4.1–B4.4 | B1 (`status`,`authorized_by`) + B2 (`ensure_identity`) | impl §B4 |
| **B5** `auth/admin-enrollment` | B5.1–B5.6 | B1 (`is_active`) + B2 | impl §B5 |
| **B6** `auth/bootstrap` | B6.1–B6.4 | **B5 primitives** (intra-wave edge) + B2 | impl §B6 |

- **B4 ∥ B5 are independent** → spawn both implementers concurrently. **B6 trails B5**: its implementer starts once B5's `StaffService`/repository layer is mergeable (B6.2 reuses those primitives), not at wave open.
- B4 = `POST /api/admin/clients` (`require_action(CLIENT_MANAGE)`), RM-literal guard, saga onboard with claim stamping. B5 = `POST/PATCH /api/admin/staff` (`require_action(USER_MANAGE)`), enroll + update, retires `PATCH /users/{uid}/role`, last-active-ADMIN guard. B6 = idempotent CLI bootstrap of the first ADMIN + **dev seed `dev-user`** (B6.3 — the unblocker for B3.6 in W4).

**Verifier focus — exercise the concurrency/sequencing traps (these pass single-threaded T1 tests):**
- **A1** (B4.3/B5.2): concurrent same-email onboard — compensation fires **only** when `created is True`; the adopted/winner uid survives (never delete an adopted identity).
- **A2** (B5.3): two concurrent demotions of *different* ADMINs — assert exactly-one-ADMIN holds (the `SELECT … FOR UPDATE` works); zero-admin state unreachable.
- **A4** (B4.3/B5.2): first token after provisioning carries the portal (+role) claim — no claimless slow path.

**Barrier (End of W2) — birth-path integration flows green:**
- RM → `201` + `status=pending`; non-RM (e.g. MOBO) → `403`; PM target → `422`; saga compensation fires `created`-guarded; bootstrap idempotent (re-run = no-op); dev seed present under `firebase_auth_disabled`.

**⏸ STOP — author review checkpoint (what you can check):**
> Wave branch `wave/2-birth-paths` pushed + PR drafted. **You can now inspect, live (gate still open, so these mount alongside the old paths):** create a client via `POST /api/admin/clients` as an RM → `201`/`pending`; confirm non-RM `403`, PM `422`; run the bootstrap CLI twice (second = no-op); see the dev seed produce `dev-user`. Three commits (B4, B5, B6). **Merge the PR, then tell me to start Wave 3.**

---

### WAVE 3 — Dev surface + reconciliation · branch `wave/3-dev-sync`

**Cut from:** `auth-flow-rework` tip (post-W2 merge).

| B-unit (→ 1 commit) | Steps | Predecessor | Brief = impl section |
|---|---|---|---|
| **B7** `auth/user-account-sync` | B7.1–B7.5 | B2 + B4 + B5 + B1 (`disabled`/quarantine) | impl §B7 |
| **B8 (rest)** `auth/devmode-flag` | B8.2–B8.5 | B4 + B5 (B8.4 reuses their primitives) | impl §B8 rows 8.2–8.5 |

- Both consume Wave 2 → can run concurrently in separate worktrees.
- B7 = reconciliation classifier (classes A/B/C) + quarantine-before-delete sweep + grace config + `python -m app.cli.reconcile` (external-cron model, **not** in-app scheduler — decided). B8 = canonical `DEV_MODE` name, root `.env` seam/gitignore, **`POST /api/dev/register`** (third *provisioning* surface, binds the legacy `requested_role` trust here where it dies), mounted **iff `dev_mode`**.
- **Critical for W4:** B8.4 (`/api/dev/register`) + B6.3 (dev seed, already merged) together satisfy the **A3** predecessor for B3.6 — they must be green **before** Wave 4 opens.

**Verifier focus:**
- **A3 precondition** (toward B3.6): a seeded `dev-user` admin resolves and `/api/dev/register` works against a frontend-minted token under `dev_mode`.

**Barrier (End of W3):**
- dev `/register` → `201` + `409` on repeat; sweep classifier A/B/C + quarantine idempotent (A-orphan quarantined→deleted after grace, never promoted; B/C surfaced); **dev seed present** (A3 precondition for W4 confirmed).

**⏸ STOP — author review checkpoint (what you can check):**
> Wave branch `wave/3-dev-sync` pushed + PR drafted. **You can now inspect:** `POST /api/dev/register` → `201` then `409` on repeat (and that it's **absent / `404`** when `dev_mode` is off); run `python -m app.cli.reconcile` and read the operator report (A/B/C classes, quarantine idempotent). Two commits (B7, B8.2–B8.5). **Merge the PR, then tell me to start Wave 4.**

---

### WAVE 4 — Cutover · branch `wave/4-cutover` *(serial, single B-unit, human-gated)*

**Cut from:** `auth-flow-rework` tip (post-W3 merge).

| B-unit (→ 1 commit) | Steps | Predecessor | Brief = impl section |
|---|---|---|---|
| **B3** `auth/gateway-core` (**KILL-SWITCH**) | B3.1–B3.6 | **B4+B5+B6** (hard rule 1) **and** B8.4+B6.3 for **B3.6** (hard rule 2 / A3) | impl §B3, §11 |

- B3 is the kill-switch — it removes the live auth-bypass vulnerabilities (G3 auto-create, G6 scattered creation, G7 unguarded admin-mint). It is **last** and **alone** because flipping it before the birth paths exist would brick all account creation.
- Steps: split auth into `/api/auth/client/login` + `/api/auth/admin/login`; replace `login_or_register` with `login_and_bind` (**delete the create branch**); `_resolve_user` removes the auto-create branch (unknown token → `403`); wire the B1.4 status gate into per-portal current-user deps; retire `POST /api/auth/register` + old `/login` + `requested_role` body-trust; **B3.6** makes the `firebase_auth_disabled` branch bind-only (depends on B8.4 + dev seed — A3).
- **Sequencing gate (enforce):** do not enable the B3.2/B3.3 removals until **B4+B5+B6** are in `auth-flow-rework`; do not enable the **B3.6** removal until **B8.4 + dev seed** are in. Both are satisfied by waves 2–3 being merged before this wave is cut — verify before building.

**Verifier focus:**
- **A3** (B3.6): offline dev after kill-switch — a seeded `dev-user` admin still resolves; unknown token → `403`.
- All §8 verification rows: unknown bearer token → `403` on every route; `/api/auth/register` → `404`; admin-create-via-login gone; portal gate intact; status gate active.

**Pre-cutover barrier:**
- Full **004 §8 verification table** green as automated tests (T4) on the integration branch.

**🔴 GATE B — cutover (human-only — the single `→ main` event):**
> After the pre-cutover barrier is green and `wave/4-cutover` is pushed + PR-drafted **into `auth-flow-rework`**: surface to the author. **The author** opens the `auth-flow-rework → main` PR, reviews it (coherence + §8 check), applies `0004` to **production**, merges to `main`, and the kill-switch goes live. **You and every agent do NOT open or merge the `main` PR.** This is the moment the auto-create loophole closes and auth changes for real users — irreversible in practice; one clean revert point (the single merge commit).

**⏸ STOP — final report:**
> `wave/4-cutover` pushed + PR drafted into `auth-flow-rework`; pre-cutover §8 table green. Report the full §8 verification result + diffstat and hand off to the author for Gate B. **Do not touch `main` or production.**

---

## 5. Test tiers (which tier gates which transition)

| Tier | Scope | Substrate | Gates | Owner |
|---|---|---|---|---|
| **T1 — Unit** | per-step service guards, gate fn, idempotency, saga compensation logic | SQLite `create_all` + `FakeFirebaseIdentityService` | B-unit → integrator merge | Implementer |
| **T2 — Integration** | cross-branch endpoint flows (TestClient): onboarding, enrollment, dev-reg, sweep | SQLite + TestClient + fakes | wave → wave barrier | Integrator |
| **T3 — Migration rehearsal** | `alembic upgrade` **and** `downgrade` + `_require()` assertions | **real MariaDB**, 15-row live-shaped dump | **Gate A** | Human + B1 implementer |
| **T4 — E2E verification** | the full 004 §8 table as automated tests | integration branch, SQLite + fakes | **pre-cutover → Gate B** | Integrator |

**Why T3 is special:** the SQLite test path builds via `create_all` and **never runs the MariaDB-only migration DDL** — no amount of CI green proves the migration. T3 against a real MariaDB clone is the only evidence, and it is a **human-gated manual rehearsal**, not a CI step.

---

## 6. The four latent traps the verifier must hunt (concurrency/sequencing bugs that pass single-threaded T1)

| # | Trap | Where | Verifier must prove |
|---|---|---|---|
| **A1** | Compensation deletes an *adopted* identity | B2.2 / B4.3 / B5.2 | concurrent same-email onboard: delete fires **iff `created is True`**; winner/adopted uid survives. |
| **A2** | Last-ADMIN guard TOCTOU | B5.3 | two concurrent demotions of different ADMINs → exactly-one-ADMIN holds (`SELECT … FOR UPDATE`); zero-admin unreachable. |
| **A3** | Kill-switch bricks *dev* | B3.6 | after kill-switch, a seeded `dev-user` admin still resolves; unknown token → `403`. (B3.6 gated on B8.4 + dev seed.) |
| **A4** | Claimless first login | B4.3 / B5.2 | first token after provisioning carries portal (+role) claim — no claimless slow path. |

---

## 7. The two human gates (the only manual stops between barriers)

| Gate | When | Author does | Why human |
|---|---|---|---|
| **Gate A — live migration** | After W1 barrier green | Rehearse `0004` on real MariaDB (T3); record grandfather decision; apply to **staging** (prod apply deferred). | Touches the live 15-row DB; CI can't vouch for MariaDB-only DDL. |
| **Gate B — cutover** | After pre-cutover barrier; `wave/4-cutover` pushed + green | Open `auth-flow-rework → main` PR, review, apply `0004` to **production**, merge to `main`; kill-switch goes live. | The moment the loophole closes + auth changes for real users; irreversible. |

Between gates, Waves 0→3 run agent-autonomous **except** for the per-wave author-review stop (rule 2). You pause at every barrier *and* every wave PR.

---

## 8. Reusable agent briefs (templates you fill per dispatch)

**Implementer brief:**
> You are the **implementer** for B-unit **`<id> <name>`** in worktree off `wave/<n>-<name>`. Build exactly the steps in **impl §<section>** (pasted below) — each step's *what / where / acceptance*. Hold to the global invariants (§1 of the prompt, pasted) and the KEEP list. Write T1 unit tests for every service guard, idempotency path, and saga branch. **Do not** wire anything outside your step list; **do not** merge or push. Return: the diff, your T1 tests, and a filled DoD checklist (every line met/not-met + evidence). Watch the trap(s) assigned to your B-unit: `<A-traps>`.
> *(paste: impl §<section>, §1 invariants, KEEP list, frozen `UserOut` contract)*

**Verifier brief (fresh agent, read+test only):**
> You are an **adversarial verifier** for B-unit **`<id>`**. You did not write this code. Read the diff + DoD against **proposal §<refs>** and the traps **`<A-traps>`**. Specifically construct the concurrency/sequencing test for each assigned trap (not just re-run the implementer's unit tests). Return a structured verdict: `pass`, or `findings[]` with file:line + repro. **You may not edit code** — judge only.

**Integrator brief (1 per wave):**
> You are the **integrator** for `wave/<n>-<name>`. For each verifier-passed B-unit, squash-merge its worktree as **one commit** onto the wave branch, **smallest-surface-first**. Reconcile §3 collision hotspots. Run T2 **after each commit**. When all commits are on + T2 green: push the branch and **draft** (do not open against `main`) the PR description into `auth-flow-rework` summarizing the B-units, DoD evidence, and barrier results. **Never merge to `main`.**

---

## 9. Definition of done (execution-level)

- All 8 B-units ran implementer → verifier → integrator; none advanced on implementer-green alone.
- **Five wave branches** pushed with drafted PRs; the author reviewed + merged each into `auth-flow-rework`. `main` updated **once**, at Gate B, **by the author only**.
- All **5 automated barriers** passed in order; no wave opened over a red barrier; **you stopped for author review at every wave boundary**.
- **Gate A:** `0004` rehearsed on real MariaDB (T3 green), grandfather decision recorded, applied to staging.
- **Gate B:** 004 §8 table green (T4), `0004` applied to production, `auth-flow-rework` merged to `main`, B3 kill-switch live.
- Each of A1–A4 has a verifier-owned concurrency/sequencing test, not just a unit test.
- `UserOut` unchanged; KEEP-list components intact; no code path creates a user from a token in any mode.
