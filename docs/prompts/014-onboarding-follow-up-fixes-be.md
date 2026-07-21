# 014 — `Client Onboarding Follow-Up Fixes` · Prompt — `Backend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/014-onboarding-follow-up-fixes-be.md` (waves) over `docs/implementations/014-onboarding-follow-up-fixes-be.md` (units BE-1..BE-9).
> Layer: `Backend` — **one layer per prompt.** Paste into a **fresh** Claude Code session. No prior conversation is assumed.
> Branch: `onboarding-subsystem-fixing` — **override, no `-be` branch is cut.** This is a fix/patch pass on an already-in-progress branch, not a fresh feature build; see §2.
> Worktrees: **none.** All work happens in the main working tree, on the branch already checked out.

<!--
OVERRIDE NOTICE — read before following §2/§6 below:
This proposal's impl doc and schedule doc both state explicitly: there is NO
per-layer branch to cut and NO worktree to open. The orchestrator works
directly on `onboarding-subsystem-fixing`, which is ALREADY checked out.
Do not run `git worktree add`. Do not create or switch to any `-be` branch.
Non-collision with the sibling Frontend dispatch comes from disjoint
directories (api-backend/ here, admin-frontend/ there), not from git isolation.
-->

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/014-onboarding-follow-up-fixes-be.md` | *what* to build (unit IDs BE-1..BE-9 + contracts) |
| Execution schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` | *why* + frozen cross-layer seam (§4) |
| This prompt | `docs/prompts/014-onboarding-follow-up-fixes-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body (§6 of the impl doc) up front — pull each unit's contract lazily, right before dispatching its sub-agent.

---

## 2. Branch & session contract (OVERRIDDEN — no layer branch, no worktree)

- **Layer:** `Backend`.
- **First action (mandatory):** confirm you are already on the correct branch — do **not** cut a new one.
  ```bash
  git rev-parse --abbrev-ref HEAD   # must print: onboarding-subsystem-fixing
  ```
  If it prints anything else, **stop and report** — do not `git checkout -b` a new branch and do not proceed. This proposal's branch was already established before this prompt was written; a mismatch means the session was started in the wrong place, not that a new branch should be created.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `onboarding-subsystem-fixing`.
  - No other prompt session (this one or the sibling Frontend dispatch) is actively dispatching a wave at this exact moment — a quick `git log --oneline -5` sanity check is enough; the two layers touch disjoint directories (`api-backend/**` vs `admin-frontend/**`), so true interleaving is safe, this check is just against a genuinely concurrent double-dispatch of *this same* prompt.
- **No worktrees.** Do not run `git worktree add` — there is no per-layer branch to isolate in the first place under this override.
- **No push, no merge.** The human owns the merge to `main`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Backend` layer of proposal 014. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule doc §4) — for this layer, that's **one wave (W1)**: `BE-5` runs concurrently with a **serialized chain** `BE-2 → BE-1 → BE-3 → BE-4 → BE-6 → BE-7 → BE-8 → BE-9` (the chain exists because those eight units all edit a small, overlapping set of shared files — see schedule §7; it is not a logical dependency).
3. Dispatch `BE-5` as its own sub-agent, in parallel with a **single sub-agent** that runs the eight-unit chain sequentially, committing after each unit (see §7 below for exactly how to brief that agent).
4. Wait for both dispatches to finish; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Dispatch the two W-final agents (validation + test) in parallel per schedule §8.
6. Open a PR against `main`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 |
| Env activation | `.\.venv\Scripts\Activate.ps1` (PowerShell) — venv already exists at `api-backend\.venv\`; system Python has no project deps installed |
| Package manager | `pip` (via the existing venv; no `uv`/`poetry` lockfile in this repo) |
| Migration tool | **n/a for this proposal** — 014 makes zero DB schema changes (confirmed in impl doc §1/§9); do not run `alembic` for anything in this layer |
| DB URL env var | `DATABASE_URL` (only relevant if a unit's test needs a real DB — most of §8's tests use an in-memory/SQLite fixture per the existing `tests/libs/onboarding/` convention) |
| Shell | PowerShell primary; Bash also available (Git Bash) |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `main` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router.py` → `service.py` → `repository.py`; a router function only calls its own service, a service only calls its own repository — plus, where already established, another feature's *model* (e.g. `onboarding/repository.py` importing `app.models.pc.Model` and, new in this proposal, `app.models.post_trade_allocation.ClientPortfolio`), never another feature's repository/service directly.
- **RBAC:** every route is gated with `Depends(require_action(Action.<X>))` — never trust a role name directly. This proposal adds **zero** new `Action` values; every new route reuses `ONBOARDING_MANAGE` or `CLIENT_VIEW`, both already registered.
- **Return/error envelope:** FastAPI's existing `{"detail": "<message>"}` envelope via `HTTPException`; `409` for a state-guard violation, `422` for a validation failure (e.g. the AUM floor), `404` for "doesn't exist" — match the existing codes' meanings exactly, don't invent a new status code for a case already covered.
- **Precision & types:** `Numeric(28,10)` for multiplier/amount-shaped values, `Numeric(9,6)` for fee fractions — this proposal introduces **no new column**, so this only matters for values passed through existing columns (e.g. `client_portfolios.cash_deposit`/`amount_in_trade`).
- **Naming:** snake_case throughout (Python convention); enum values persist lowercase.
- **Additive & backward-compatible first:** every unit in this layer is additive except BE-4's storage-root rename, which is a deliberate, called-out exception (config default change + a deploy-time directory `mv`) — not a merge-path step, see BE-4's own contract.
- **Frozen seam:** the cross-layer contract in proposal §4.1 (re-pinned in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. The one seam widening already applied (`ClientSubscriptionRowDTO.amount`, BE-9) is already reflected in both impl docs' §7 — no further seam change is expected mid-run; if one surfaces, stop and report rather than resolving it unilaterally.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `main`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command — doubly so under this proposal's override, since there is no per-layer branch to isolate in the first place.
- **No new branch.** Do not `git checkout -b` anything. Work happens directly on `onboarding-subsystem-fixing`.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change under `admin-frontend/`, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/`.** Every generated/written test goes there, mirroring the source path (e.g. `api-backend/tests/libs/onboarding/test_service.py`), never co-located next to source.
- **Tests are NEVER committed.** `tests/` is git-ignored; sub-agents write and run tests but never stage or commit them.
- **This is a Backend layer — no preview-server rule applies** (that restriction is Frontend-only, see the sibling prompt).

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule for this layer's one wave:** `BE-5` gets its own sub-agent, dispatched **in the same message** as the sub-agent that owns the eight-unit chain (`BE-2 → BE-1 → BE-3 → BE-4 → BE-6 → BE-7 → BE-8 → BE-9`) — two Agent tool calls total, sent together. The chain is run by **one sub-agent working through all eight units itself, committing after each**, because schedule §7 shows every one of those eight units contends on at least one shared file with at least one other — a fresh sub-agent per unit would spend its first turn on a rebase against the previous unit's just-landed commit for almost no isolation benefit. Do not split the chain across multiple sub-agents.

**Test-gen note:** impl doc §8.4 states the chosen level is **`standard`**, bumped to **`thorough`** for `BE-1` and `BE-8` specifically (the observed active→reviewing regression, and the money-math AUM-floor validation). Before dispatching either sub-agent, invoke the `test-gen` skill against `docs/implementations/014-onboarding-follow-up-fixes-be.md` at level `standard` (its own per-unit escalation for BE-1/BE-8 is already noted in impl doc §8.4 — pass that through if `test-gen` accepts a per-unit override, otherwise run the whole layer at `thorough` rather than under-testing those two). This generates the test files into `api-backend/tests/` **before** fan-out; sub-agents then make the already-generated tests for their unit(s) pass, rather than writing tests from scratch.

### 7.1 Brief template — `BE-5` (parallel, isolated)

```
You are a feature sub-agent for the Backend layer of proposal 014.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, .\.venv\Scripts\Activate.ps1
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: onboarding-subsystem-fixing (already checked out — do NOT create a branch, do NOT open a worktree)
- Merge target (DO NOT push, DO NOT switch to): main

TEST HARNESS:
- Tests for BE-5 were generated by test-gen (standard level) into api-backend/tests/libs/identity/
  before you were dispatched — do not write tests from scratch; read what's there and make it pass.
- A red generated test means either a real bug in your implementation OR a wrong §8.3 goal —
  if you believe it's the latter, STOP and report; do not edit the test file to make it pass.

INVARIANTS (hold at every step):
- Layering: router.py -> service.py -> repository.py; a module may import another
  feature's MODEL directly, never another feature's service/repository.
- RBAC: every route gated by Depends(require_action(Action.<X>)); zero new Action
  values in this proposal.
- Error envelope: HTTPException with the existing {"detail": "..."} shape; 409 for
  state-guard violations, 422 for validation, 404 for not-found.
- Precision: Numeric(28,10) for amounts, Numeric(9,6) for fee fractions (no new
  columns in this unit).
- Additive & backward-compatible first.
- Frozen seam (proposal §4.1 / impl doc §7) is fixed — if this unit's contract
  seems to conflict with it, STOP and report; do not silently diverge.

TASK:
- Feature ID: BE-5
- Spec: read docs/implementations/014-onboarding-follow-up-fixes-be.md §6 BE-5. That
  section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch:
  - api-backend/app/libs/identity/service.py — modify
- Dependencies (already committed): none.

STEPS:
1. Read api-backend/app/libs/identity/service.py in full.
2. Implement the contract from impl doc §6 BE-5 (default password on create_user).
3. Confirm/complete the tests already generated in api-backend/tests/libs/identity/ —
   run them; if any test doesn't exist yet for this unit's goals (impl doc §8.3 BE-5),
   flag it rather than silently skip it.
4. Run the layer's CI gate: ruff check . && ruff format --check . && mypy app && pytest -q
   (run from api-backend/). If red, fix and re-run. Do not commit red.
5. Stage ONLY api-backend/app/libs/identity/service.py (no git add -A). Do NOT stage
   or commit anything under api-backend/tests/ — it is git-ignored, tests stay local.
6. Commit: "fix(be): attach Email/Password provider with a default password (BE-5)"
7. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, git checkout -b, --no-verify, --amend past a hook failure.
- Editing any file outside api-backend/app/libs/identity/service.py.
- Editing files under admin-frontend/.
- Reading the schedule doc or other unit specs — you own exactly BE-5.
```

### 7.2 Brief template — the eight-unit chain (single sub-agent, sequential)

```
You are a feature sub-agent for the Backend layer of proposal 014. Unlike a typical
one-unit dispatch, you own a SEQUENCE of eight units, because schedule doc §7 shows
they all contend on a small set of shared files (service.py, router.py, repository.py,
schemas.py, and two clients/ files) — running them as eight separate sub-agents would
mean constant rebasing for no real isolation benefit. Work through them IN THIS ORDER,
committing after each one before starting the next:

  BE-2 -> BE-1 -> BE-3 -> BE-4 -> BE-6 -> BE-7 -> BE-8 -> BE-9

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, .\.venv\Scripts\Activate.ps1
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: onboarding-subsystem-fixing (already checked out — do NOT create a branch, do NOT open a worktree)
- Merge target (DO NOT push, DO NOT switch to): main

TEST HARNESS:
- Tests for BE-1..BE-9 (excluding BE-5) were generated by test-gen (standard level,
  thorough for BE-1 and BE-8 specifically) into api-backend/tests/libs/onboarding/ and
  api-backend/tests/libs/clients/ before you were dispatched. For each unit below,
  read and make green the tests already generated for that unit's ID — do not write
  tests from scratch, and do not edit a generated test to force it green; a red test
  means either a real bug or a wrong §8.3 goal — if the latter, STOP and report.

INVARIANTS (hold at every step, for every unit in this chain):
- Layering: router.py -> service.py -> repository.py; a module may import another
  feature's MODEL directly (e.g. app.models.post_trade_allocation.ClientPortfolio
  for BE-8), never another feature's service/repository — except BE-9's own local
  import of app.libs.clients.repository.ClientRepository, which the impl doc §6 BE-9
  explicitly specifies and justifies (a local import to avoid a module-level
  circular dependency) — this is the one sanctioned exception, not a pattern to reuse
  elsewhere.
- RBAC: every route gated by Depends(require_action(Action.<X>)); zero new Action
  values in this proposal — every new route in this chain reuses ONBOARDING_MANAGE
  or CLIENT_VIEW.
- Error envelope: HTTPException with the existing {"detail": "..."} shape; 409 for
  state-guard violations (BE-1, BE-2's mirrored guard is inherited, BE-9 n/a), 422
  for validation (BE-8's AUM floor), 404 for not-found (BE-3 zero-uploads, BE-7's
  by-client-onboarding route for a client with no cycle).
- Precision: Numeric(28,10) for amounts, Numeric(9,6) for fee fractions — no new
  columns anywhere in this chain (BE-8 seeds an EXISTING table, client_portfolios;
  it does not add a column to client_onboardings).
- Additive & backward-compatible first, except BE-4's storage-root rename, which is
  a stated, deliberate exception (see BE-4's own contract in the impl doc).
- Frozen seam (proposal §4.1 / impl doc §7) is fixed. BE-9 in particular must match
  the WIDENED seam exactly — ClientSubscriptionRowDTO carries an `amount` field;
  do not implement an older, narrower version of this DTO.

FOR EACH UNIT IN THE CHAIN, IN ORDER:
1. Read docs/implementations/014-onboarding-follow-up-fixes-be.md §6 <UNIT-ID> — that
   section is the CONTRACT. Do not exceed scope.
2. Read every file the unit's "Files" list names (create or modify).
3. If the unit touches the seam, re-read impl doc §7 first.
4. Before editing, run: git pull --rebase (picks up nothing new here since you are
   the only agent touching these files, but keep this step for hygiene — if a
   sibling agent's Frontend commit landed in the meantime, this rebase is a silent
   no-op since it never touches your files).
5. Implement the contract.
6. Run/confirm the tests already generated for THIS unit's ID (impl doc §8.3
   <UNIT-ID>) in api-backend/tests/ — make them green.
7. Run the layer's CI gate: ruff check . && ruff format --check . && mypy app && pytest -q
   (run from api-backend/). If red, fix and re-run. Do not commit red.
8. Stage ONLY the files this unit's impl doc entry names (no git add -A). Do NOT
   stage or commit anything under api-backend/tests/.
9. Commit with a one-line message: "fix(be): <one-line summary of the unit> (<UNIT-ID>)".
10. Move to the next unit in the chain.

After all eight units are committed, report back: one commit SHA per unit ID, the
full list of files changed across the chain, and a combined test summary. Exit.

FORBIDDEN:
- git push, git worktree add, git checkout -b, --no-verify, --amend past a hook failure.
- Editing any file not named in the CURRENT unit's "Files" list (i.e. don't
  jump ahead and touch a later unit's files early).
- Editing files under admin-frontend/.
- Reading the schedule doc — you already have your order (above); you own exactly
  BE-1, BE-2, BE-3, BE-4, BE-6, BE-7, BE-8, BE-9.
- Skipping a unit or reordering the chain — the order above matches the shared-file
  serialization in schedule doc §7 exactly; reordering risks a rebase conflict that
  a fresh sub-agent (with no memory of the earlier units' edits) would have to
  resolve blind.
```

### 7.3 W-final agents (validation + test)

Dispatched once, in parallel, after both `BE-5` and the eight-unit chain have committed and the wave gate (schedule §6) is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1/§7.2 above (env facts + invariants) so those two agents also inherit them.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
confirm HEAD == onboarding-subsystem-fixing (§2) — do NOT cut a branch, do NOT open a worktree

# W1 (this layer's only feature wave):
dispatch, in a single message:
  - sub-agent A: BE-5 (§7.1 brief)
  - sub-agent B: the BE-2->BE-1->BE-3->BE-4->BE-6->BE-7->BE-8->BE-9 chain (§7.2 brief)
wait until BOTH sub-agents report all their commits on onboarding-subsystem-fixing
run wave gate (schedule §6) — if red: STOP, report to human, exit

# W-final:
dispatch validation + test agents in parallel (§7.3)
if either fails: STOP, report to human, exit

open PR against main
report: units committed (BE-1..BE-9), gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit BE-1..BE-9 has a commit on `onboarding-subsystem-fixing`.
- [ ] The wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `main`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, created a new branch, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
