# 017 — `Transaction Details Wiring` · Prompt — `Database`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/017-transaction-details-wiring-db.md` (waves) over `docs/implementations/017-transaction-details-wiring-db.md` (units).
> Layer: `Database` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `transaction-details-wiring-db` — cut from parent `transaction-details-wiring`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/017-transaction-details-wiring-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` | *why* + frozen cross-layer seam |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Database`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
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

You are the **orchestrator** for the `Database` layer of proposal 017. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule) — this layer has a single feature wave (DB-1 alone).
3. Spawn **one sub-agent** via the Agent tool for DB-1, using the brief template in §7 of this prompt.
4. Wait for the wave to commit; run the wave gate from schedule §6. If red, stop and report.
5. Dispatch the two W-final agents (validation + test) in parallel per schedule §8.
6. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (`api-backend/.venv` — verified `.venv\Scripts\python.exe --version` → 3.13.13) |
| Env activation | `.venv\Scripts\Activate.ps1` (PowerShell), or invoke tool binaries directly: `.venv\Scripts\alembic.exe`, `.venv\Scripts\pytest.exe`, `.venv\Scripts\ruff.exe`, `.venv\Scripts\mypy.exe` |
| Package manager | pip (`api-backend/requirements.txt`) — system Python has no deps installed; the venv does |
| Migration tool | alembic; command: `.venv\Scripts\alembic.exe upgrade head` (run from `api-backend/`) |
| DB URL env var | `DATABASE_URL` (creds for local/dev: `portal`/`portalsecret`, `root`/`rootsecret` — see project memory) |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

- **Model placement:** new tables are added as `class X(Base): __tablename__ = "..."` in the domain-relevant existing models file — `settlement_details`/`transaction_details` (the new table) is added to `app/models/onboarding.py`, immediately after `ClientAllotmentRedemption`, not a new module.
- **Migration revision IDs are random hex, never hand-invented:** generate with `python -c "import secrets; print(secrets.token_hex(6))"`.
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be the current, sole Alembic head — verify with `alembic heads` immediately before authoring the revision file; do not trust a value written in an older doc without re-checking.
- **Additive-only migration discipline:** this layer creates one brand-new table — no existing table, column, or constraint may be touched, dropped, or narrowed.
- **FK + UNIQUE convention:** a 1:1 child table is expressed as a FK column carrying `unique=True` (matches the existing `ClientAllotmentRedemption.source_onboarding_id` precedent) — not a separate `UniqueConstraint`.
- **Frozen seam:** the cross-layer contract in proposal §4 is fixed. If DB-1's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, fix the underlying issue and create a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. Report and wait for the human.
- **Never modify sibling-layer files** (`admin-frontend/**`). This session is scoped to `api-backend/`.
- **Tests live in `api-backend/tests/`** (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** `api-backend/tests/` is git-ignored — tests are run locally, never staged/committed.
- **NEVER connect to, migrate, or write to the live `portal` database from a test.** Every test uses an ephemeral in-memory SQLite (or throwaway schema) fixture.
- **Applying the new migration to the live `portal` DB is a human-owned gate** — this session authors and validates the migration against a scratch DB only; it does not run `alembic upgrade head` against `portal`.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. This layer has exactly one unit (DB-1) in its only feature wave, so there is nothing to parallelize within the wave — dispatch it alone, wait for its commit + gate, then proceed to W-final.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 017.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, api-backend/.venv (.venv\Scripts\Activate.ps1,
  or invoke .venv\Scripts\<tool>.exe directly)
- Migration tool: alembic — .venv\Scripts\alembic.exe (run from api-backend/)
- DB URL env var: DATABASE_URL (never point this at the live `portal` DB for tests)
- Shell: PowerShell primary; Bash tool also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- New tables go in the domain-relevant existing models file (app/models/onboarding.py
  for this table), not a new module.
- Migration revision IDs are random hex via `python -c "import secrets; print(secrets.token_hex(6))"`.
- down_revision MUST be the CURRENT Alembic head — verify with `alembic heads`
  immediately before writing the revision file; do not trust a hardcoded value from
  the impl doc without re-checking against the live repo state.
- Additive-only: no existing table/column/constraint is touched, dropped, or narrowed.
- 1:1 child tables use a FK column with `unique=True`, not a separate UniqueConstraint.
- Frozen seam (proposal §4) is fixed — if DB-1's contract conflicts with it, STOP and report.

TEST HARNESS:
- No tests exist yet for this layer's units. Before implementing, invoke the
  `test-gen` skill on `docs/implementations/017-transaction-details-wiring-db.md`
  at level `standard` (per its §8.4) to generate test goals into
  `api-backend/tests/` BEFORE you write the feature code — then implement DB-1
  to make those generated tests pass. A red test after implementation is either
  a real bug in your implementation or a wrong §8.3 goal; if you believe it's the
  latter, STOP and flag it rather than editing the generated test to force a pass.

TASK:
- Feature ID: DB-1
- Spec: read `docs/implementations/017-transaction-details-wiring-db.md` §6 DB-1.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - api-backend/app/models/onboarding.py — modify
  - api-backend/alembic/versions/<new_hex>_0025_transaction_details.py — create
- Dependencies (already committed on ${LAYER_BRANCH}): none.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 — this unit's table IS the seam's DB row.
3. Run `alembic heads` from api-backend/ to confirm the current head before
   picking `down_revision`.
4. Implement the contract from impl doc §6 DB-1 (model class + migration).
5. Ensure the test-gen output for DB-1 in api-backend/tests/ passes.
6. Run the layer's CI gate command (from api-backend/):
   ruff check . && ruff format --check . && mypy app && pytest -q
   If red, fix and re-run. Do not commit red.
7. Stage ONLY the two source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — api-backend/tests/ is git-ignored.
8. Commit with a one-line `db(transaction-details): create transaction_details table (DB-1)`
   message (or the exact message from the impl doc unit if it specifies one).
9. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files under admin-frontend/.
- Running the migration against the live `portal` database.
- Reading the schedule doc or other unit specs — you own exactly DB-1.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after DB-1's wave gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1 (DB-1 alone), W_final]:
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

- [ ] DB-1 has a commit on `${LAYER_BRANCH}`.
- [ ] The feature wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Orchestrator has **not** applied the migration to the live `portal` DB.
- [ ] Final report delivered: unit committed, gate summary, PR URL.
