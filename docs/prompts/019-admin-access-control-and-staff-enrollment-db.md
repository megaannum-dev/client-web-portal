# 019 — Admin Access Control & Staff Enrollment · Prompt — Layer: Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md` (waves) over `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` (units).
> Layer: `Database` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `<parent-branch>-db` — cut from the parent branch this session captures at session start (expected: `claude/admin-pages-backend-proposal-f0c9fc` — if `git rev-parse --abbrev-ref HEAD` disagrees, trust the live repo, not this line). See [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` | *why* + frozen cross-layer seam (§4) + the phase-4 human gate |
| This prompt | `docs/prompts/019-admin-access-control-and-staff-enrollment-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions §3.1, CI gate §3.2) → impl doc §7 (frozen seam) → impl doc §8.4 (chosen test-gen level) → schedule doc §1-4 (wave graph: `DB-1`…`DB-7` across W1–W4 plus W-final). Do **not** read every feature body up front — pull each unit's §6 section from the impl doc per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Database`.
- **First action (mandatory):** capture the parent branch name live — do not hardcode it.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  Sanity check: `PARENT_BRANCH` is expected to read `claude/admin-pages-backend-proposal-f0c9fc` (impl doc §2). If it doesn't, stop and confirm with the human before proceeding — do not silently substitute the expected value for the captured one.
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` per the impl doc §2 branch contract — do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles the layer's two same-file collisions (`DB-2`→`DB-3` on `access.py` within W2; `DB-6`/`DB-7` on the one Alembic revision file, resolved by wave placement).
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Database` layer of proposal `019`. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 → W2 → W3 → W4 → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After W4 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees. You **do not** apply the migration to any live or shared database — the live `portal` apply (proposal phase 4, reviewing DB-7's 55-row seed, including the D-10/D-12/D-13 deliberate exceptions) is a human gate that happens **after** this run's PR is opened, on a separate occasion, by the human. Nothing in this session's scope touches it.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\.claude\worktrees\admin-pages-backend-proposal-f0c9fc` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv-managed; the system Python interpreter has no project dependencies installed) |
| Env activation / tool invocation — **read this before running anything** | **Never invoke bare `python`, `alembic`, `pytest`, `ruff`, or `mypy`.** The system Python has none of these packages; a bare invocation will appear to run and then fail confusingly. Always call the venv's own executables from `api-backend/`: `.\.venv\Scripts\alembic.exe`, `.\.venv\Scripts\ruff.exe`, `.\.venv\Scripts\mypy.exe`, and `.\.venv\Scripts\python.exe -m pytest`. (Uniform alternative: `.\.venv\Scripts\python.exe -m <tool>` for all four.) This is a documented gotcha — 11 failed commands were burned rediscovering it in a prior session. |
| Package manager | pip (venv already provisioned — no fresh install expected) |
| Migration tool | alembic, via `.\.venv\Scripts\alembic.exe` (run from `api-backend/`): `.\.venv\Scripts\alembic.exe upgrade head`, `.\.venv\Scripts\alembic.exe downgrade -1`, `.\.venv\Scripts\alembic.exe heads` (must report a single head) |
| DB URL env var | `DATABASE_URL` — **not** `SQLALCHEMY_DATABASE_URL`, which `app/core/config.py` silently ignores. Local default: `mysql+pymysql://portal:portalsecret@localhost:3306/portal`. For the scratch-DB up/down/up rehearsal (DB-6/DB-7), point it at a scratch database name instead, e.g. (PowerShell): `$env:DATABASE_URL="mysql+pymysql://portal:portalsecret@localhost:3306/<scratch>"` before running upgrade/downgrade. Create/drop the scratch DB via `.\.venv\Scripts\python.exe` + `pymysql`, not the system interpreter. **Never** point `DATABASE_URL` at the shared `portal` database from this session. |
| Shell | PowerShell primary (Bash tool also available for anyone who prefers it — this repo's example commands below are PowerShell). PowerShell 5.1 chains unconditionally with `;`, not `&&`. If a command is copied from a doc written with `&&` (bash / PowerShell 7 syntax), translate to `;` before running it in this shell. |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

**CI gate command** (impl doc §3.2 / schedule §6), run from `api-backend/`:
```
.\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\python.exe -m pytest -q
```
(Equivalent bash / PowerShell-7 form, if ever run outside this shell: `.\.venv\Scripts\ruff.exe check . && .\.venv\Scripts\ruff.exe format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\python.exe -m pytest -q` — the schedule doc's §6 states it with `&&`; use `;` here since this session's primary shell is Windows PowerShell 5.1.) Note the house carve-out (impl doc §3.2): `ruff`/`mypy` exclude `alembic/`, so the migration file is covered by `pytest -q` only.

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1 ("Codebase conventions") — do not paraphrase:

- **ORM style:** SQLAlchemy 2.0 `Mapped` / `mapped_column`, as used throughout `api-backend/app/models/*.py`.
- **Enum columns are never native.** Every string-backed enum column in this codebase follows one fixed shape:
  ```python
  SAEnum(
      <PyEnum>,
      native_enum=False,
      length=<N>,
      values_callable=lambda enum_cls: [member.value for member in enum_cls],
  )
  ```
  This persists and reads by enum **value**, not member name — the convention documented inline on `User.portal` (`app/models/users.py:38-47`) and repeated on `AdminProfile.role`, `User.status`, and every enum column in `onboarding.py`/`pc.py`. `AccessLevel` and `OverrideLevel` (DB-1/DB-2) follow it exactly. Deviating here is the specific mistake this codebase's own comments warn against.
- **Migration-side enum columns are plain `sa.String(length=N)`**, never `sa.Enum(...)` — the ORM owns the enum type, the migration owns the underlying `VARCHAR`. Same split as `client_tickets.kind/status`, `client_onboardings.kind/status`, `onboarding_documents.status`.
- **UUID primary keys** use `Uuid(native_uuid=False)` with `default=uuid.uuid4` on the ORM side and `sa.Uuid()` in the migration — the shape used by `users.id` and `client_tickets.id`. The proposal writes these columns as `CHAR(36)`; `sa.Uuid()` with a non-native backend renders `CHAR(32)` (hex, no dashes). **The house type wins** — a second UUID storage shape in one schema is worse than a 4-character discrepancy in a proposal sketch, and `OverrideOut.id` is a string on the wire either way.
- **New module, not an append.** Unlike proposal 018 (where new tables joined an existing domain file), the proposal explicitly names a **new** `app/models/access.py` for all four tables (Layer 1 § A). Access control is its own domain and has no FK-free reason to sit inside `users.py`; the four tables are added there in `# --------- DB-N — <table> ---------` sections mirroring the existing header style.
- **Nullable actor FKs use `ondelete="SET NULL"`**, following `User.authorized_by` (`users.py:73-81`) — not SQLAlchemy's default RESTRICT. The one exception is `page_access_overrides.user_id`, which is `CASCADE` (B-2: an override without a subject is meaningless).
- **Naming:** indexes `ix_<table>_<col>`, unique constraints `uq_<table>_<cols…>`, foreign keys `fk_<table>_<col>` — as in `ix_client_profiles_updated_at`, `uq_client_tickets_linked_allotment_id`, `fk_client_tickets_linked_allotment_id`. The proposal does not pin index/constraint names; the names in impl doc §6 are chosen to that pattern and are stated per unit so a reviewer can check them mechanically.
- **Migrations** live at `api-backend/alembic/versions/<revision>_<NNNN>_<slug>.py`, one file per revision, with the `Union[str, Sequence[str], None]` typed `revision`/`down_revision`/`branch_labels`/`depends_on` block.
- **Revision ids are random hex, never hand-invented.** Generated for this layer with `.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(6))"` → `5cd1cc1948cc` (already fixed for DB-6 — do not regenerate).
- **`page_id` is an opaque `VARCHAR(64)`** carrying a `PageId` literal, with **no** FK and no pages table (proposal D-8). Paths, labels, icons and grouping stay in `pages-config.ts`; drift between the three registries is caught by tests in the sibling layers, not by a constraint here.
- **Additive & backward-compatible first** (impl doc §3.2): DB-1…DB-5 are pure additive ORM/registration commits; DB-6/DB-7 are pure additive schema (four `CREATE TABLE`, four nullable `ADD COLUMN`, one `INSERT`) — no existing column, constraint, or row is altered or dropped. The branch is migratable at every commit.
- **Frozen seam:** the cross-layer contract in proposal §4 (re-pinned verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Human gate (non-negotiable):** applying the `0028_admin_access_control` revision to the live `portal` database — and reviewing DB-7's 55-row seed, including the D-10/D-12/D-13 deliberate exceptions — is the proposal's phase-4 human gate, downstream of this run's PR. It is never performed by a wave or an agent in this session; every up/down/up rehearsal in this layer runs against a **scratch** database only.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/` (mirroring the source path — e.g. `tests/models/test_access.py`, `tests/alembic/test_0028_admin_access_control.py`), never co-located next to source.
- **Tests are NEVER committed — any layer.** `api-backend/tests/` is git-ignored; feature agents write and run tests but never stage or commit them. They stay local (a verification aid, not a branch artifact).
- **Not applicable to this layer:** the "no preview server" guardrail in the template is a Frontend-only rule (no dev-server concept applies to a DB/migrations layer) — omitted here; no DB-layer equivalent is substituted.
- **Live-DB gate (DB layer only):** never connect, migrate, or write to the live `portal` database from this session, ever — only a scratch/ephemeral database (§4/§5 above). The live apply is the human's phase-4 gate, not a step this session performs.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls, except where schedule §7 requires in-wave serialization (`DB-2` then `DB-3` in W2, both on `app/models/access.py` — see schedule §3/§7 for the collision analysis; it is not restated here). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Orchestrator fan-out order (mandatory, before the first dispatch):**
1. **Invoke `test-gen standard`** on `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` — no `tests` entry exists yet for this layer in the pipeline state, so test-gen has not been run for this layer. The level (`standard`) is impl doc §8.4's chosen level, justified there by the seed matrix and the enum-asymmetry invariant being the places a silent error becomes a security-relevant access mistake. This must complete **before** any feature sub-agent (`DB-1`…`DB-7`) is dispatched — it is step 0 of §8's execution loop below, not folded into wave dispatch.
2. Dispatch feature agents per wave, each told to make its unit's generated tests pass.
3. After W4's gate is green, dispatch the W-final validation + test agents per schedule §8.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 019.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + tool invocation: Python venv at api-backend\.venv\ — the system
  Python has no project deps. NEVER call bare python/alembic/pytest/ruff/mypy.
  Use .\.venv\Scripts\alembic.exe, .\.venv\Scripts\ruff.exe,
  .\.venv\Scripts\mypy.exe, and .\.venv\Scripts\python.exe -m pytest
  (all relative to api-backend/).
- DB URL env var: DATABASE_URL (NOT SQLALCHEMY_DATABASE_URL — silently
  ignored). For any migration rehearsal, point it at a scratch database,
  never the live `portal` DB: $env:DATABASE_URL="mysql+pymysql://portal:portalsecret@localhost:3306/<scratch>"
- Shell: PowerShell primary (chains with `;`, not `&&`); Bash tool also available.
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- test-gen has been run at level `standard` (impl doc §8.4) before this
  dispatch. Generated test files live under api-backend/tests/ (mirroring
  app/models/access.py, app/models/users.py, and the migration path) —
  read the ones covering your unit ID before writing code.
- Make the generated tests for your unit pass WITHOUT editing the test
  files. A red test means either a real bug in your implementation or a
  wrong §8.3 goal — if you believe it's the latter, STOP and report; do not
  rewrite the test yourself.

INVARIANTS (hold at every step):
- ORM style: SQLAlchemy 2.0 Mapped/mapped_column, as used throughout
  api-backend/app/models/*.py.
- Enum columns are never native: SAEnum(<PyEnum>, native_enum=False,
  length=<N>, values_callable=lambda enum_cls: [member.value for member in
  enum_cls]) — persists/reads by enum VALUE, not member name.
- Migration-side enum columns are plain sa.String(length=N), never
  sa.Enum(...) — the ORM owns the enum type, the migration owns the VARCHAR.
- UUID primary keys use Uuid(native_uuid=False) with default=uuid.uuid4 on
  the ORM side and sa.Uuid() in the migration (renders CHAR(32) hex on a
  non-native backend — the house type wins over the proposal's CHAR(36)).
- New module, not an append: all four tables live in the new
  app/models/access.py, not inside users.py.
- Nullable actor FKs use ondelete="SET NULL" (per User.authorized_by),
  EXCEPT page_access_overrides.user_id, which is CASCADE.
- Naming: indexes ix_<table>_<col>, unique constraints uq_<table>_<cols>,
  foreign keys fk_<table>_<col>.
- Migrations live at api-backend/alembic/versions/<revision>_<NNNN>_<slug>.py.
  Revision ids are random hex; this layer's is already fixed: 5cd1cc1948cc
  (do not regenerate).
- page_id is an opaque VARCHAR(64) PageId literal — no FK, no pages table.
- Additive & backward-compatible first: no existing column, constraint, or
  row is ever altered or dropped by this layer.
- Frozen seam: the cross-layer contract in proposal §4 / impl doc §7 is
  fixed. If your unit's contract seems to conflict with it, STOP and
  report — do not silently diverge.
- Human gate: NEVER connect, migrate, or write to the live `portal` DB.
  Only ever run alembic upgrade/downgrade against a scratch/ephemeral DB.
  The live apply + seed review is the human's phase-4 gate, downstream of
  this PR, and out of scope for this session entirely.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md`
  §6 <DB-2>. That section is the CONTRACT — implement it as specified. Do
  not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <DB-2>.
4. Run the generated tests for <DB-2> from api-backend/tests/ (see TEST
   HARNESS above) — make them pass without editing them.
5. Run the layer's CI gate command (see §4 of this prompt for the PowerShell
   form): .\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\python.exe -m pytest -q
   (run from api-backend/). If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — api-backend/tests/ is git-ignored;
   tests stay local.
7. Commit with the message from impl doc §6 <DB-2> (or a one-line
   `<type>(<scope>): <summary> (<UNIT-ID>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories.
- Connecting to, migrating, or writing to the live `portal` DB, ever.
- Reading the schedule doc or other unit specs — you own exactly <DB-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W4's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT + TEST HARNESS blocks from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read impl doc §8.4 (chosen test-gen level)
read schedule doc §1-4

capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# step 0 — test harness must exist before any feature dispatch
invoke test-gen standard on docs/implementations/019-admin-access-control-and-staff-enrollment-db.md

for wave in [W1, W2, W3, W4, W_final]:
    for unit in wave.units:
        # Same-file collisions in this wave? Serialize per schedule §7
        # (DB-2 -> DB-3 in W2, on app/models/access.py).
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` was invoked on the impl doc before feature fan-out.
- [ ] Every unit in impl doc §6 (`DB-1`…`DB-7`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed, across W1–W4.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or connected to / migrated / written to the live `portal` DB. The phase-4 live apply and seed review (D-10/D-12/D-13) are the human's gate, downstream of this PR — not a step this session performs.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
