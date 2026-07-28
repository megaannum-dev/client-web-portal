# 018 — Client Portal ↔ Backend Integration · Prompt — Layer: Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/018-client-portal-integration-db.md` (waves) over `docs/implementations/018-client-portal-integration-db.md` (units).
> Layer: `Database` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `client-portal-integration-db` — cut from parent `client-portal-integration`. See [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/018-client-portal-integration-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/018-client-portal-integration-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph: 2 feature waves — W1, W2 — plus W-final). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Database`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `client-portal-integration` (per impl doc §2 branch contract) — do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions (the shared migration file) by wave placement and in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Database` layer of proposal `018`. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (§4 of the schedule): W1 → W2 → W-final.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After the last feature wave (W2) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv at `api-backend\.venv\` — system Python has no deps) |
| Env activation | PowerShell: `& api-backend\.venv\Scripts\Activate.ps1` (no bash-style `source .venv/bin/activate` on this Windows box) |
| Package manager | pip (use whatever `api-backend/` already has installed; check for a requirements file if in doubt, but do not block on it) |
| Migration tool (DB layer only) | alembic; command: `.\.venv\Scripts\alembic.exe upgrade head` (run from `api-backend/`) |
| DB URL env var (if any) | `DATABASE_URL` (dev creds: portal/portalsecret, root/rootsecret) — tests use a scratch/ephemeral DB, never the live `portal` DB |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`client-portal-integration`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **ORM style:** SQLAlchemy 2.0 `Mapped`/`mapped_column`, as used throughout `api-backend/app/models/*.py`.
- **Enum columns are never `native_enum=True`.** Every string-backed enum column follows one fixed shape: `SAEnum(<PyEnum>, native_enum=False, length=<N>, values_callable=lambda e: [m.value for m in e])`. This persists/reads by enum **value** (lowercase strings), not member name.
- **Migration-file columns for an enum are plain `sa.String(<N>)`, never `sa.Enum(...)`** — the ORM layer owns the enum type; the migration only owns the underlying `VARCHAR`.
- **New tables/columns are added to the domain-relevant existing model file**, immediately after the table/section they relate to, rather than a new module.
- **Migrations live under `api-backend/alembic/versions/`,** one file per revision, named `<revision>_<NNNN>_<slug>.py`.
- **Revision IDs are random hex, never hand-invented** — generated via `python -c "import secrets; print(secrets.token_hex(6))"`.
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be `"fa66b2f3aee6"` — the current, sole Alembic head. Verify with `alembic heads` before authoring the revision file; if a sibling branch has since added a new head, rebase against that instead of guessing.
- **Money/quantity precision:** `Numeric(28, 10)` is the house convention for any currency or multiplier value.
- **Data-mutating migrations self-assert:** a revision that writes to an existing table's rows includes a pre- and/or post-condition check that raises `RuntimeError` rather than leaving a half-migrated schema.
- **Additive & backward-compatible first** (impl doc §3.2 CI/CD): DB-1, DB-2, DB-5, DB-6 are pure additive schema; DB-4 only ever moves a column from `NULL` to a value on a narrow, already-`NULL` filter — no existing non-NULL value is ever touched. The branch is deployable (migratable) at every commit.
- **Frozen seam:** the cross-layer contract in proposal §4 (re-pinned verbatim in impl doc §7) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Human gate (DB-specific, non-negotiable):** applying the new Alembic revision to the live `portal` DB is **human-owned** — never done by a wave, never done from an agent session (impl doc §3.2, §9; schedule doc §6). This session's waves only ever run `alembic upgrade`/`downgrade` against a scratch/ephemeral DB.

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
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/` (mirroring `app/models/*.py` and the migration path), never co-located next to source.
- **Tests are NEVER committed — any layer.** `api-backend/tests/` is git-ignored; feature agents write and run tests but never stage or commit them. They stay local.
- **Not applicable to this layer:** the "no preview server" guardrail is a Frontend-only rule (no dev-server concept exists for a DB/migrations layer) — omitted here.
- **Live-DB gate (DB layer only):** never run `alembic upgrade`/`downgrade` against the live `portal` DB from an agent session, ever — only against a scratch/ephemeral DB (§5 above).

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7 — the shared migration file in W1 contends across `DB-1`/`DB-2`/`DB-4`/`DB-5`). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Orchestrator fan-out order (mandatory, before the first dispatch):**
1. **Invoke `test-gen standard`** on `docs/implementations/018-client-portal-integration-db.md` — no `tests` entry exists yet for this layer in the pipeline state, so test-gen has not been run. The level (`standard`) is impl doc §8.4 "Chosen test-gen level for this layer." This must happen **before** any feature sub-agent is dispatched.
2. Dispatch feature agents per wave, each told to make its unit's generated tests pass.
3. After W2's gate is green, dispatch the W-final validation + test agents per schedule §8.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 018.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python venv at api-backend\.venv\ — PowerShell:
  & api-backend\.venv\Scripts\Activate.ps1
- Migration tool: alembic; command: .\.venv\Scripts\alembic.exe upgrade head
  (run from api-backend/)
- DB URL env var: DATABASE_URL — use a scratch/ephemeral DB only, NEVER the
  live `portal` DB
- Shell: PowerShell primary; Bash tool also available
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS:
- test-gen has been run at level `standard` (impl doc §8.4) before this
  dispatch. Generated test files live under api-backend/tests/ (mirroring
  app/models/*.py and the migration path) — read the ones covering your
  unit ID before writing code.
- Make the generated tests for your unit pass WITHOUT editing the test
  files. A red test means either a real bug in your implementation or a
  wrong §8.3 goal — if you believe it's the latter, STOP and report; do not
  rewrite the test yourself.

INVARIANTS (hold at every step):
- ORM style: SQLAlchemy 2.0 Mapped/mapped_column, as used throughout
  api-backend/app/models/*.py.
- Enum columns are never native_enum=True — every string-backed enum
  column follows: SAEnum(<PyEnum>, native_enum=False, length=<N>,
  values_callable=lambda e: [m.value for m in e]). Persists/reads by enum
  VALUE (lowercase strings), not member name.
- Migration-file columns for an enum are plain sa.String(<N>), never
  sa.Enum(...) — the ORM layer owns the enum type, the migration only owns
  the underlying VARCHAR.
- New tables/columns are added to the domain-relevant existing model file,
  immediately after the table/section they relate to.
- Migrations live under api-backend/alembic/versions/, one file per
  revision, named <revision>_<NNNN>_<slug>.py. Revision IDs are random hex
  (python -c "import secrets; print(secrets.token_hex(6))"), never
  hand-invented.
- Hard constraint: the new revision's down_revision MUST be
  "fa66b2f3aee6" — verify with `alembic heads` before authoring; if a
  sibling branch has since added a new head, stop and report rather than
  guessing.
- Money/quantity precision: Numeric(28, 10) is the house convention for
  any currency or multiplier value.
- Data-mutating migrations self-assert: a revision writing to an existing
  table's rows includes a pre-/post-condition check that raises
  RuntimeError rather than leaving a half-migrated schema.
- Additive & backward-compatible first: the branch is deployable
  (migratable) at every commit.
- Frozen seam: the cross-layer contract in proposal §4 / impl doc §7 is
  fixed. If your unit's contract seems to conflict with it, STOP and
  report — do not silently diverge.
- Human gate: NEVER apply the migration to the live `portal` DB. Only
  run alembic upgrade/downgrade against a scratch/ephemeral DB.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/018-client-portal-integration-db.md` §6
  <DB-2>. That section is the CONTRACT — implement it as specified. Do not
  exceed scope.
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
5. Run the layer's CI gate command: ruff check . && ruff format --check . && mypy app && pytest -q
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
- Applying any migration to the live `portal` DB, ever.
- Reading the schedule doc or other unit specs — you own exactly <DB-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W2's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT + TEST HARNESS blocks from §7.1 above (so those two agents also inherit env + invariants).

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

invoke test-gen standard on the impl doc (before any feature dispatch)

for wave in [W1, W2, W_final]:
    for unit in wave.units:
        # Same-file collisions in this wave? Serialize per schedule §7
        # (the shared migration file contends across DB-1/DB-2/DB-4/DB-5 in W1).
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
- [ ] Every unit in impl doc §6 (`DB-1`…`DB-6`) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened a worktree, or applied the migration to the live `portal` DB.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
