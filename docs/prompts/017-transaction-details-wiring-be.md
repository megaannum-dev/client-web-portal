# 017 — `Transaction Details Wiring` · Prompt — `Backend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/017-transaction-details-wiring-be.md` (waves) over `docs/implementations/017-transaction-details-wiring-be.md` (units).
> Layer: `Backend` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `transaction-details-wiring-be` — cut from parent `transaction-details-wiring`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/017-transaction-details-wiring-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` | *why* + frozen cross-layer seam |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Backend`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `transaction-details-wiring` (recorded in the impl doc's front matter) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Backend` layer of proposal 017. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule) — this layer is **five waves**: W1 (BE-1) → W2 (BE-2) → W3 (BE-3) → W4 (BE-4) → W-final. Every feature wave here is a single unit — `BE-2`/`BE-3` are forced sequential by real dependency edges, and `BE-4`, though dependency-free, shares files (`schemas.py`, `service.py`) with the earlier units so the schedule places it in its own trailing wave rather than risk an in-wave collision.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After BE-4 (the last feature wave) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (`api-backend/.venv` — verified `.venv\Scripts\python.exe --version` → 3.13.13) |
| Env activation | `.venv\Scripts\Activate.ps1` (PowerShell), or invoke tool binaries directly: `.venv\Scripts\pytest.exe`, `.venv\Scripts\ruff.exe`, `.venv\Scripts\mypy.exe` |
| Package manager | pip (`api-backend/requirements.txt`) — system Python has no deps installed; the venv does |
| Migration tool | N/A for this layer (DB layer owns migrations; this layer assumes the DB layer's migration is already applied to the target DB per its precondition) |
| DB URL env var | `DATABASE_URL` (never point tests at the live `portal` DB) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** router → service → repository. `router.py` depends only on `OnboardingService` via `Depends`; `OnboardingService` depends only on `OnboardingRepository` (plus `self.db` for the rare direct read). No new module — everything extends the existing `app/libs/onboarding` package.
- **Single-commit-with-rollback:** every write path spanning more than one repository call follows `try: ...; self.db.commit() except Exception: self.db.rollback(); raise` verbatim.
- **Precision & types:** `settlement_amount` uses `Decimal` end-to-end in the service/repository (matching `Numeric(28, 10)`); `float` only appears at the DTO boundary.
- **RBAC action reuse:** reuse `Action.CLIENT_VIEW` for the new RM-write routes — do not add a new `Action` member for this feature.
- **Idempotency:** check for an existing `transaction_details` row before inserting (explicit 409), not just relying on the DB's UNIQUE constraint as the only signal.
- **Additive & backward-compatible first:** both new routes are new; `AllotRdmptDTO` gains one field (`has_transaction_detail: bool = False`) with a default that keeps every existing caller compiling.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. Report and wait for the human.
- **Never modify sibling-layer files** (`admin-frontend/**`, migration files under `api-backend/alembic/**`). This session is scoped to the Backend service/router/schema/repository code.
- **Tests live in `api-backend/tests/`** (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** `api-backend/tests/` is git-ignored — tests are run locally, never staged/committed.
- **Same-file serialization within a wave:** this layer's schedule places every feature unit in its own single-unit wave specifically to avoid same-file collisions (BE-1/BE-4 share `schemas.py`; BE-2/BE-3/BE-4 share `service.py`) — do not attempt to parallelize units the schedule has serialized.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Every wave in this layer's schedule is single-unit, so there is no in-wave parallel dispatch to coordinate — dispatch the wave's one unit, wait for its commit + gate, then advance.

### 7.1 Brief template (fill and send — repeat per unit: BE-1, then BE-2, then BE-3, then BE-4)

```
You are a feature sub-agent for the Backend layer of proposal 017.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, api-backend/.venv (.venv\Scripts\Activate.ps1,
  or invoke .venv\Scripts\<tool>.exe directly)
- DB URL env var: DATABASE_URL (never point tests at the live `portal` DB)
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: router → service → repository; no new module, extend app/libs/onboarding.
- Single-commit-with-rollback: try/commit/except-rollback-raise for every multi-write path.
- Decimal precision: settlement_amount is Decimal in service/repository, float only at
  the DTO boundary.
- RBAC: reuse Action.CLIENT_VIEW — do not add a new Action member.
- Idempotency: explicit check-then-409 before insert, not just the DB UNIQUE constraint.
- Additive & backward-compatible first: new routes are new; AllotRdmptDTO's new field
  defaults to False.
- Frozen seam (proposal §4) is fixed — if this unit's contract conflicts with it, STOP
  and report.

TEST HARNESS:
- No tests exist yet for this layer's units. Before implementing the FIRST unit (BE-1),
  invoke the `test-gen` skill on `docs/implementations/017-transaction-details-wiring-be.md`
  at level `standard` (per its §8.4) to generate test goals for ALL BE-* units into
  `api-backend/tests/`. For each unit you implement, make ONLY that unit's already-generated
  tests pass — do not implement ahead of the unit you were dispatched for. A red test after
  implementation is either a real bug in your implementation or a wrong §8.3 goal; if you
  believe it's the latter, STOP and flag it rather than editing the generated test to force
  a pass.

TASK:
- Feature ID: <BE-1 | BE-2 | BE-3 | BE-4 — fill per dispatch>
- Spec: read `docs/implementations/017-transaction-details-wiring-be.md` §6 <unit ID>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit — read the unit's own
  "Files:" line, do not assume):
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <from impl doc unit's
  "Dependencies:" line — e.g. BE-2 depends on BE-1; BE-3 depends on BE-1, BE-2;
  BE-1 and BE-4 have none>.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 — this unit implements part of it.
3. Implement the contract from impl doc §6 <unit ID>.
4. Ensure the test-gen output for this unit in api-backend/tests/ passes.
5. Run the layer's CI gate command (from api-backend/):
   ruff check . && ruff format --check . && mypy app && pytest -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — api-backend/tests/ is git-ignored.
7. Commit with a one-line `be(transaction-details): <summary> (<UNIT-ID>)` message
   (or the exact message from the impl doc unit if it specifies one).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files under admin-frontend/ or api-backend/alembic/.
- Reading the schedule doc or other unit specs — you own exactly the one unit ID above.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after BE-4's wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(BE-1), W2(BE-2), W3(BE-3), W4(BE-4), W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] BE-1, BE-2, BE-3, BE-4 each have a commit on `${LAYER_BRANCH}`, in that order.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
