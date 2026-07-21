# 013 — Client Onboarding Integration · Prompt — Database

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/013-client-onboarding-integration-db.md` (waves) over `docs/implementations/013-client-onboarding-integration-db.md` (units).
> Layer: Database — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-db` — see [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention. This prompt captures the actual parent branch at session start. Expected parent: `client-onboarding-integration`.
> Worktrees: **none, by default** — except Wave W2, which uses a temporary, per-unit worktree override (see §7.3). This is an explicit, narrowly-scoped exception for this dispatch only; every other wave (W1, W3) runs in the main working tree, and worktrees are torn down before W3 begins.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/013-client-onboarding-integration-db.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/013-client-onboarding-integration-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph) → schedule doc §7 (the worktree override — required reading before Wave W2). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Database.
- **First action (mandatory):** capture the parent branch name.
  ```powershell
  $PARENT_BRANCH = git rev-parse --abbrev-ref HEAD
  $LAYER_BRANCH = "$PARENT_BRANCH-db"
  ```
  If already on `$LAYER_BRANCH`, capture `$PARENT_BRANCH` as the branch this one was cut from (record it from the impl doc's front matter — `client-onboarding-integration` — do not guess).
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `$LAYER_BRANCH` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **Worktrees are scoped to Wave W2 only.** Do not run `git worktree add` for W1, W3, or W-final — those waves share the main working tree; same-file collisions (there are none outside W2) would otherwise be handled by schedule §7 in-wave serialization. Wave W2's worktree protocol is in §7.3 below — read it before Wave W2 begins, not at session start.
- **No push, no merge.** The human owns the merge back to `$PARENT_BRANCH`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Database layer of proposal 013. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's revised wave graph — **3 waves**, per schedule §4's "Superseded for this dispatch" note and §7's worktree override: **W1 {DB-1, DB-5} → W2 {DB-2, DB-3, DB-4 — worktree-parallel} → W3 {DB-6, DB-7}**. (The schedule's original §4 table, which serialized DB-2/DB-3 into their own wave ahead of DB-4, is superseded for this run — do not follow it.)
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7.1. Each sub-agent implements exactly one feature. For Wave W2, additionally follow the worktree protocol in §7.3 — each of DB-2/DB-3/DB-4 runs in its own temporary worktree, merged back to `$LAYER_BRANCH` in unit-ID order before the wave barrier closes.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After Wave W3's gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `$PARENT_BRANCH`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push or merge to `$PARENT_BRANCH`. You **may** create and tear down the three temporary worktrees for Wave W2 only, per §7.3 — this is the one narrow exception to "no worktrees" for this dispatch.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (version per `api-backend/.venv`; not otherwise pinned in this repo — check `api-backend/.venv/pyvenv.cfg` if the exact version is needed) |
| Env activation | `api-backend/.venv/` already exists with all deps installed — system Python has none. Activate via `api-backend\.venv\Scripts\Activate.ps1` (PowerShell), or invoke tools directly via `api-backend\.venv\Scripts\python.exe` / `api-backend\.venv\Scripts\alembic.exe` / `api-backend\.venv\Scripts\ruff.exe` / `api-backend\.venv\Scripts\pytest.exe` without activating — whichever is more reliable in a non-interactive session |
| Package manager | pip (no lockfile manager detected — do not assume uv/poetry) |
| Migration tool | alembic; run as `api-backend\.venv\Scripts\alembic.exe upgrade head` / `downgrade -1` (cwd = `api-backend/`) |
| DB URL env var | `DATABASE_URL` — must be set in the environment before running alembic or pytest against a real/scratch DB; never hardcode credentials in any prompt or committed file |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 Pro |
| Merge target (DO NOT push here) | `$PARENT_BRANCH` |

---

## 5. Global invariants (inherited by every sub-agent)

<!-- Copied verbatim from impl doc §3.1. -->

- One model file per feature area under `api-backend/app/models/`. This layer adds `api-backend/app/models/onboarding.py` (new — four classes + four enums) and modifies `api-backend/app/models/pc.py` (two new nullable columns on the existing `ClientSubscription` class only — no other class in that file is touched).
- UUID PKs via `Uuid(native_uuid=False), default=uuid.uuid4` — followed here throughout `onboarding.py`.
- DB enums as `class X(str, enum.Enum)` persisted via `SAEnum(X, native_enum=False, length=N, values_callable=lambda e: [m.value for m in e])` — every one of the five new enums (`OnboardingStatus`, `OnboardingKind`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`) follows this exact shape, values persisted lowercase per the proposal's §4.1 `Literal` blocks.
- `Mapped[T]` + `mapped_column` (SQLAlchemy 2.0 style) throughout; no legacy `Column(...)` declarations.
- FKs declared by table-name string (`ForeignKey("client_onboardings.id")`), never by importing the sibling ORM class — avoids import cycles.
- `created_at`/`updated_at` via `DateTime(timezone=True), server_default=func.now()` (+ `onupdate=func.now()` only on tables whose rows are mutated post-insert — `client_onboardings` and `onboarding_documents` get both; `client_allotment_redemptions` and `client_events` are insert-only/append-only and get `created_at` alone).
- Migration files: `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head (`817926e7604a`).
- `app/models/__init__.py` re-exports every model class — this layer's eight new names (four classes + four persisted enums surfaced at module level) must be added there too, so `Base.metadata` picks them up for `create_all` in tests.
- **Additive & backward-compatible first**: four brand-new tables plus two new nullable columns on one existing table; zero touch to any existing row or existing column.
- **Frozen seam:** the cross-layer contract in impl doc §7 / proposal §4 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `$PARENT_BRANCH`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees outside Wave W2.** `git worktree add` is forbidden for W1, W3, and W-final. It is permitted **only** inside Wave W2, and only per the exact protocol in §7.3.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/`.** Every generated/written test goes there (mirroring the source path — e.g. `tests/models/test_onboarding.py`), never co-located next to source.
- **Tests are NEVER committed.** `api-backend/.gitignore` already ignores `/tests/` — feature agents write and run tests but never stage or commit them. They stay local.
- **Do not apply the `0018` migration to any shared/staging/live DB.** That is a human-owned gate (per `git_workflow_human_owns_main`). This session only verifies `upgrade head` / `downgrade -1` against a disposable scratch DB.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within Wave W1 and Wave W3, all dispatches go in a **single message** with multiple parallel Agent tool calls (no same-file collisions in either wave). Wave W2 uses the worktree protocol in §7.3 instead — three parallel dispatches, each pointed at its own worktree path. Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 013.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/ (or the worktree-local equivalent — see below for W2 units)
- Runtime + env activation: Python via api-backend/.venv/ — use api-backend\.venv\Scripts\python.exe /
  alembic.exe / ruff.exe / pytest.exe directly, or Activate.ps1 first
- Shell: PowerShell primary; Bash also available
- DB URL env var: DATABASE_URL (must be set before running alembic/pytest against a real/scratch DB)
- Branch you are committing to: $LAYER_BRANCH (or a throwaway worktree branch — see W2 notes)
- Merge target (DO NOT push, DO NOT switch to): $PARENT_BRANCH

TEST HARNESS (do not re-derive):
- test-gen has NOT yet been run for this layer as of dispatch (no `tests` entry in
  .claude/plugin-state/docgen-013-client-onboarding-integration.json). The orchestrator
  runs `test-gen standard` against the impl doc (impl doc §8.4: chosen level is `standard`)
  BEFORE fanning out any feature agent. By the time you receive this brief, test files for
  your unit should already exist under api-backend/tests/models/test_onboarding.py (per
  impl doc §8.1's test location) — mirroring the coverage matrix in impl doc §8.2/§8.3 for
  your unit ID.
- Make the tests for your unit pass WITHOUT editing test files. A red test is either a real
  bug in your implementation or a wrong §8.3 goal — in the latter case, STOP and flag it to
  the orchestrator; do not rewrite the test yourself.

INVARIANTS (hold at every step):
- One model file per feature area under api-backend/app/models/; this layer's file is
  api-backend/app/models/onboarding.py (new) and api-backend/app/models/pc.py (modify,
  ClientSubscription only).
- UUID PKs via Uuid(native_uuid=False), default=uuid.uuid4.
- DB enums as class X(str, enum.Enum) persisted via
  SAEnum(X, native_enum=False, length=N, values_callable=lambda e: [m.value for m in e]).
- Mapped[T] + mapped_column (SQLAlchemy 2.0 style) throughout; no legacy Column(...).
- FKs declared by table-name string (ForeignKey("client_onboardings.id")), never by
  importing the sibling ORM class.
- created_at/updated_at via DateTime(timezone=True), server_default=func.now() (+
  onupdate=func.now() only on tables whose rows are mutated post-insert).
- Additive & backward-compatible first; frozen seam in impl doc §7 is not renegotiable
  from this layer — stop and report on any apparent conflict.

TASK:
- Feature ID: <e.g. DB-2>
- Spec: read `docs/implementations/013-client-onboarding-integration-db.md` §6 <DB-2>. That
  section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
- Dependencies (already committed on the branch you're building from): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <DB-2>.
4. Confirm/complete the unit test(s) for <DB-2> already generated at
   api-backend/tests/models/test_onboarding.py per impl doc §8 — do not co-locate tests
   next to source.
5. Run the layer's CI gate command: cd api-backend && ruff check . && ruff format --check .
   && mypy app && pytest -q. If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`). Do NOT stage
   or commit test files — api-backend/tests/ is git-ignored; tests stay local.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message (or the message
   given by the impl doc if it specifies one).
8. Report back: commit SHA (and, for W2 units, the worktree path/branch it was made on),
   files changed, test summary. Exit.

FORBIDDEN:
- git push, --no-verify, --amend past a hook failure.
- git worktree add (UNLESS this brief is a Wave W2 unit and the orchestrator has already
  created your worktree per §7.3 — you do not create your own worktree).
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (anything outside api-backend/).
- Reading the schedule doc or other unit specs — you own exactly <DB-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after Wave W3's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT and TEST HARNESS blocks from §7.1 above.

### 7.3 Worktree protocol for Wave W2

Wave W2 {DB-2, DB-3, DB-4} is the one exception to "no worktrees" in this prompt, per the schedule's §7 override: all three units append to the same file (`api-backend/app/models/onboarding.py`) but have no logical dependency on each other (all depend only on DB-1, already committed after Wave W1), so they run concurrently, each isolated in its own worktree, and are merged back sequentially.

**1. Longpaths guard (before creating any worktree).** Windows has a `MAX_PATH` limit; check and set repo-level `core.longpaths` if not already on (repo or global):
```powershell
git config --get core.longpaths
# if empty or false, and not already set true globally:
git config core.longpaths true
```

**2. Create worktrees under a short path root** — not nested inside this repo's own long working-directory path:
```powershell
git worktree add -b temp-db-2 C:\wt\013-db-2 $LAYER_BRANCH
git worktree add -b temp-db-3 C:\wt\013-db-3 $LAYER_BRANCH
git worktree add -b temp-db-4 C:\wt\013-db-4 $LAYER_BRANCH
```
Each worktree is created from a **new throwaway local branch** (`temp-db-2`/`temp-db-3`/`temp-db-4`) tipped off the current `$LAYER_BRANCH` HEAD — not three worktrees sharing `$LAYER_BRANCH` directly, which would conflict. Each sub-agent commits to its own throwaway branch, inside its own worktree; the orchestrator merges each throwaway branch back onto the real `$LAYER_BRANCH` afterward.

**3. Wire up the shared venv.** `api-backend/.venv/` is gitignored and is NOT copied into a fresh worktree (worktrees only copy git-tracked files). Create a junction to the shared venv immediately after each worktree is created (the `api-backend/` directory exists post-checkout; create the junction before the sub-agent tries to activate it):
```powershell
New-Item -ItemType Junction -Path "C:\wt\013-db-2\api-backend\.venv" -Target "<repo root>\api-backend\.venv"
New-Item -ItemType Junction -Path "C:\wt\013-db-3\api-backend\.venv" -Target "<repo root>\api-backend\.venv"
New-Item -ItemType Junction -Path "C:\wt\013-db-4\api-backend\.venv" -Target "<repo root>\api-backend\.venv"
```
(`<repo root>` = the value from §4's Environment facts table.)

**4. Dispatch.** Send all three sub-agent briefs (§7.1, filled per unit) in a single message, each pointed at its own worktree path (`C:\wt\013-db-2`, etc.) as its working directory and its own throwaway branch as "the branch you are committing to."

**5. Merge back in unit-ID order — DB-2, then DB-3, then DB-4 — as each reports a commit.** No worktree fights over `onboarding.py` because each worked from an independent copy; each unit appends a distinct class to the end of the shared file, so conflicts are not expected, but if a later merge does conflict against an earlier one, resolve it directly on `$LAYER_BRANCH` in the main working tree (not inside a worktree) before merging the next.
```powershell
git checkout $LAYER_BRANCH
git merge temp-db-2 --no-ff
git merge temp-db-3 --no-ff
git merge temp-db-4 --no-ff
```

**6. Teardown — this exact order, per worktree, immediately after its merge lands.** Unlinking the venv junction BEFORE removing the worktree is CRITICAL: `git worktree remove` (or a recursive delete) can otherwise recurse into the junction target and delete/corrupt the shared `.venv`.
```powershell
cmd /c rmdir "C:\wt\013-db-2\api-backend\.venv"
git worktree remove C:\wt\013-db-2 --force
git branch -d temp-db-2
```
Repeat for `013-db-3` and `013-db-4`. Note the bare `rmdir` with **no** `/S` flag — `/S` would recurse and could delete the real shared venv through the junction; a bare `rmdir` on a junction point only removes the link itself.

**7. Barrier.** All three worktrees must be fully torn down (junction unlinked, worktree removed, throwaway branch deleted) before advancing to Wave W3. Then run the Wave W2 gate (schedule §6) against the merged state on `$LAYER_BRANCH` in the main working tree.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4 and §7 (worktree override)
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# test harness
if no `tests` entry for Database in .claude/plugin-state/docgen-013-client-onboarding-integration.json:
    invoke test-gen standard against docs/implementations/013-client-onboarding-integration-db.md

# Wave W1
dispatch DB-1, DB-5 in parallel (main working tree)
wait for both commits on LAYER_BRANCH
run wave gate (schedule §6) — if red: STOP, report, exit

# Wave W2 — worktree-parallel (see §7.3)
set core.longpaths, create 3 worktrees + venv junctions off LAYER_BRANCH
dispatch DB-2, DB-3, DB-4 in parallel, each in its own worktree/throwaway branch
as each reports a commit: merge its throwaway branch onto LAYER_BRANCH, in order DB-2 -> DB-3 -> DB-4
tear down all 3 worktrees (unlink junction, remove worktree, delete throwaway branch) — in that order, per worktree
run wave gate (schedule §6) against merged LAYER_BRANCH — if red: STOP, report, exit

# Wave W3
dispatch DB-6, DB-7 in parallel (main working tree)
wait for both commits on LAYER_BRANCH
run wave gate (schedule §6) — if red: STOP, report, exit

# W-final
dispatch validation + test agents in parallel (schedule §8.1/§8.2)
if either fails: STOP, report, do not open PR

open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit DB-1..DB-7 has a commit on `$LAYER_BRANCH`.
- [ ] Every wave gate (schedule §6) was green when crossed, for all 3 waves.
- [ ] All three Wave W2 worktrees (`C:\wt\013-db-2`, `-3`, `-4`) were torn down — junction unlinked before worktree removal — and no worktree survived past the W2 barrier.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `$PARENT_BRANCH`.
- [ ] Orchestrator has **not** pushed, force-pushed, or merged to `$PARENT_BRANCH`, and has left no worktree behind.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
