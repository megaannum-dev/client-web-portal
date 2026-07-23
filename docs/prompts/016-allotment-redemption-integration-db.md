# 016 — Allotment & Redemption Integration · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/016-allotment-redemption-integration-db.md` (waves) over `docs/implementations/016-allotment-redemption-integration-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-db` — see `templates/implementation_details.md` §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/016-allotment-redemption-integration-db.md` | *what* to build (unit IDs + contracts: DB-1, DB-2) |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-db.md` | *what order* (W1 serialized, W-final; collision protocol §7) |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 1 — Database" | *why* + frozen cross-layer seam (§4.1/4.2) |
| This prompt | `docs/prompts/016-allotment-redemption-integration-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull DB-1/DB-2 bodies per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` from the impl doc's front matter (`allotment-redemption-integration`) — do not guess.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; DB-1/DB-2 are serialized within W1 per schedule §7 (shared-file collision on `api-backend/app/models/onboarding.py`).
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 016. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Invoke the `test-gen` skill (arg `standard`) on `docs/implementations/016-allotment-redemption-integration-db.md` — **before dispatching any feature-wave sub-agents.** This layer has no `tests` entry in the pipeline state yet; test-gen has not run.
3. Walk the schedule's wave graph (§4 of the schedule): W1 (`DB-1` then `DB-2`, serialized — same-file collision), then W-final.
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. After W1's gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees. You **never** point any agent at the live `portal` database.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv at `api-backend/.venv/`) |
| Env activation | No `source`/activate needed — call venv executables directly, e.g. `.\.venv\Scripts\alembic.exe`, `.\.venv\Scripts\python.exe`, `.\.venv\Scripts\pytest.exe` (from `api-backend/`, PowerShell) |
| Package manager | pip (`api-backend/requirements.txt`, no lockfile-based tool) |
| Migration tool | alembic; command: `.\.venv\Scripts\alembic.exe upgrade head` (from `api-backend/`) |
| DB URL env var | `DATABASE_URL` (points at the local `portal` MariaDB/MySQL DB, creds portal/portalsecret — **never used by tests**, see §5) |
| Shell | PowerShell primary; Bash (Git Bash) also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

**CI gate command** (verified present in `api-backend/pyproject.toml`: `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]`):
- PowerShell: `.\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\pytest.exe -q`
- Git Bash equivalent: `ruff check . && ruff format --check . && mypy app && pytest -q`
Use whichever shell tool this session runs.

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1:

- ORM style: SQLAlchemy 2.0 `Mapped`/`mapped_column`, as used throughout `api-backend/app/models/onboarding.py`.
- Enums are Python `str, enum.Enum` subclasses persisted with `SAEnum(..., native_enum=False, values_callable=lambda e: [m.value for m in e])` — i.e. VARCHAR-backed, not a Postgres/MySQL native enum type. Widening the enum is a pure Python-level change; no `ALTER TYPE`/`ALTER COLUMN` for the enum itself is needed, only a migration revision that documents the contract.
- Migrations live under `api-backend/alembic/versions/`, one file per revision, named `<revision>_<NNNN>_<slug>.py`.
- **Revision IDs are random hex, never hand-invented.** Generate with:
  ```bash
  python -c "import secrets; print(secrets.token_hex(6))"
  ```
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be `"deb8fd8a60b6"` — never `"02f0f4296350"` directly. `deb8fd8a60b6` exists specifically to give stale unmerged DB-layer branches a single, unambiguous rebase point (see that revision's own docstring). Authoring against `02f0f4296350` would silently recreate a multi-head history.
- Additive-only migration discipline: nullable columns, `server_default` for the one NOT NULL column (`emergent`), no drops, no narrowing, no destructive backfill.

**DB-safety facts every sub-agent must hold (from a real incident this session — do not soften):**

- **`down_revision` constraint (repeated):** the new Alembic revision (DB-2) MUST set `down_revision = "deb8fd8a60b6"` — NEVER `"02f0f4296350"` directly. `deb8fd8a60b6` is the no-op checkpoint revision (`0021_neutralize_recovered_head.py`) that exists specifically to give stale unmerged DB-layer branches a single unambiguous rebase point. Authoring against `02f0f4296350` would silently recreate a prior multi-head incident.
- **Live-DB backup exists — do not touch it:** a full backup of the live `portal` database already exists at `api-backend/db-backups/portal_pre-016_2026-07-22.sql` (gitignored). This file must **never** be modified or deleted — it is the fallback restore point.
- **Tests must NEVER run against the live `portal` database.** Every DB-layer test in this dispatch uses an isolated/ephemeral scratch DB (in-memory SQLite, a throwaway schema, or a transaction rolled back at test end) — never connect to, migrate, or write to the live `portal` DB under any circumstance.
- **Applying the finished migration to the LIVE `portal` DB is explicitly a human-owned step** — never something a sub-agent or the orchestrator does automatically in this session.
- **Frozen seam:** the cross-layer contract in proposal §4.1/4.2 (re-pinned verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load DB-1/DB-2 bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/`.** Every generated/written test goes under that dir (mirroring the source path), never co-located next to source.
- **Tests are NEVER committed.** `api-backend/tests/` is git-ignored; feature agents write and run tests but never stage or commit them. They stay local.
- **Live DB is off-limits, always.** No sub-agent, at any step, connects to, migrates, or writes to the live `portal` database. Ephemeral/scratch DB only.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within W1, `DB-1` and `DB-2` are **serialized, not parallel** (shared-file collision on `api-backend/app/models/onboarding.py` per schedule §7): dispatch `DB-1`, wait for its commit, then dispatch `DB-2` (which rebases onto `DB-1`'s commit first). W-final's two agents (validation + test) dispatch in parallel, in a single message.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 016.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python venv at api-backend/.venv/; call executables
  directly, e.g. .\.venv\Scripts\alembic.exe, .\.venv\Scripts\python.exe,
  .\.venv\Scripts\pytest.exe (from api-backend/, PowerShell) — or the Git Bash
  equivalents without the .exe/.\ prefix if using Bash.
- Shell: PowerShell primary; Bash also available.
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- SQLAlchemy 2.0 Mapped/mapped_column style, as used throughout
  api-backend/app/models/onboarding.py.
- Enums are (str, enum.Enum) subclasses persisted via
  SAEnum(..., native_enum=False, values_callable=lambda e: [m.value for m in e])
  — VARCHAR-backed, not a native DB enum type.
- Migrations live under api-backend/alembic/versions/, one file per revision.
- Revision IDs are random hex via `python -c "import secrets; print(secrets.token_hex(6))"`
  — never hand-invented.
- HARD CONSTRAINT: any new Alembic revision's down_revision MUST be
  "deb8fd8a60b6" — NEVER "02f0f4296350" directly. deb8fd8a60b6 is a no-op
  checkpoint revision that exists to give stale unmerged DB-layer branches a
  single unambiguous rebase point; authoring against 02f0f4296350 would
  silently recreate a prior multi-head incident.
- Additive-only migration discipline: nullable columns, server_default, no
  drops, no narrowing, no destructive backfill.
- A full backup of the live portal database exists at
  api-backend/db-backups/portal_pre-016_2026-07-22.sql (gitignored). NEVER
  modify or delete this file — it is the fallback restore point.
- TESTS MUST NEVER RUN AGAINST THE LIVE portal DATABASE. Use an isolated
  ephemeral scratch DB (in-memory SQLite, throwaway schema, or a transaction
  rolled back at test end) — never connect to, migrate, or write to the live
  portal DB under any circumstance.
- Applying any migration to the live portal DB is a human-owned step — you
  never do this, automatically or otherwise.

TEST HARNESS:
- The orchestrator ran `test-gen standard` on
  docs/implementations/016-allotment-redemption-integration-db.md before
  dispatching this wave. Generated test files live under api-backend/tests/
  (mirroring app/models/onboarding.py and the migration path) — read them for
  your unit before writing new code. Make the tests for your unit pass
  WITHOUT editing the test files themselves. A red test is either a real bug
  in your implementation or a wrong impl-doc §8.3 goal — if you believe it's
  the latter, STOP and report; do not rewrite the test to make it pass.
- Tests go into api-backend/tests/ (git-ignored) and are NEVER staged or
  committed. They stay local.

TASK:
- Feature ID: <DB-1 | DB-2>
- Spec: read `docs/implementations/016-allotment-redemption-integration-db.md`
  §6 <DB-1 | DB-2>. That section is the CONTRACT — implement it as specified.
  Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <"none" for DB-1 |
  "DB-1 (rebase first)" for DB-2>.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. If this is DB-2: `git pull --rebase` against ${LAYER_BRANCH} (not main)
   first, then re-read api-backend/app/models/onboarding.py so you see DB-1's
   widened enum before adding your columns.
4. Implement the contract from impl doc §6 <DB-1 | DB-2>.
5. Run/extend the unit's test(s) under api-backend/tests/ per the TEST
   HARNESS block above.
6. Run the layer's CI gate command (see CONTEXT above / §4 of the prompt):
   .\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ;
   .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\pytest.exe -q
   (or `ruff check . && ruff format --check . && mypy app && pytest -q` in Bash).
   If red, fix and re-run. Do not commit red.
7. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — api-backend/tests/ is git-ignored;
   tests stay local.
8. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message
   (or the message impl doc §6 specifies, if any).
9. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories.
- Connecting to, migrating, or writing to the live portal database, ever.
- Modifying or deleting api-backend/db-backups/portal_pre-016_2026-07-22.sql.
- Authoring down_revision as "02f0f4296350".
- Reading the schedule doc or the other unit's spec — you own exactly your
  Feature ID.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W1's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT + INVARIANTS blocks from §7.1 above (so those two agents also inherit env facts and the live-DB ban).

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# Step 0 — test-gen (mandatory, has not run for this layer)
invoke test-gen skill, arg "standard", on
  docs/implementations/016-allotment-redemption-integration-db.md

for wave in [W1, W_final]:
    if wave == W1:
        dispatch DB-1 sub-agent (§7.1 brief)
        wait for DB-1 commit on LAYER_BRANCH
        dispatch DB-2 sub-agent (§7.1 brief, rebases onto DB-1's commit)
        wait for DB-2 commit on LAYER_BRANCH
    else:
        dispatch Validation agent and Test agent in parallel (§7.2)
        wait for both to report
    run wave gate (schedule §6) — if red: STOP, report to human, exit

open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` invoked on the impl doc before any feature-wave dispatch.
- [ ] `DB-1` and `DB-2` each have a commit on `${LAYER_BRANCH}` (serialized per schedule §7).
- [ ] W1 wave gate (lint → format → type-check → unit tests) was green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] No step in the run connected to, migrated, or wrote to the live `portal` database.
- [ ] `api-backend/db-backups/portal_pre-016_2026-07-22.sql` untouched.
- [ ] New migration's `down_revision` confirmed `"deb8fd8a60b6"` by inspection.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or applied the migration to the live `portal` DB.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
