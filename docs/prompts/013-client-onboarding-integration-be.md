# 013 — Client Onboarding Integration · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/013-client-onboarding-integration-be.md` (waves) over `docs/implementations/013-client-onboarding-integration-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `${PARENT_BRANCH}-be` — see [templates/implementation_details.md](../../templates/implementation_details.md) §2 for the naming convention. This prompt captures the actual parent branch at session start.
> Worktrees: **not needed for this layer's actual waves — but permitted as fallback.** The user authorized worktree use across this dispatch as available policy (a subagent may isolate in its own worktree to resolve a same-file collision within a wave). Schedule §7 confirms every wave in this layer's 5-wave schedule (W1: BE-1/BE-2/BE-4 → W2: BE-3 → W3: BE-5 → W4: BE-6/BE-7 → W5: BE-8) already touches a distinct file per unit — no wave has ever needed a worktree, and none is expected to. If a future schedule revision introduces a same-file collision this policy doesn't anticipate, see §2 below for the fallback.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/013-client-onboarding-integration-be.md` | *what* to build (BE-1..BE-8 unit contracts) |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` | *why* + frozen cross-layer seam (§4, incl. 2026-07-20 widening D-9) |
| Sibling layer prompt (worktree mechanics reference only) | `docs/prompts/013-client-onboarding-integration-db.md` §7.3 | the exact Windows worktree protocol, if this layer ever needs it (see §2) |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every unit's contract body up front — pull each one lazily, immediately before dispatching it.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `client-onboarding-integration` (per the impl doc's front matter) rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from `client-onboarding-integration`).
  - No other prompt session is dispatching on this branch.
- **Preconditions from schedule §2** (verify, don't assume): the DB layer's `0018` migration (four new tables + the two `client_subscriptions.*_override` columns) is applied to whatever DB this layer's tests run against. This is environment state, not a wait on the DB branch merging.
- **Worktrees — no worktree needed for this layer's actual waves.** Every wave in schedule §4 (W1 through W5) has each unit touching a distinct file (schedule §7's shared-file map is empty) — the main working tree handles full in-wave parallelism as-is. The orchestrator MAY open a temporary worktree for one sub-agent if a same-file collision is discovered at dispatch time that this schedule didn't anticipate — in that case, do not improvise the mechanics; read `docs/prompts/013-client-onboarding-integration-db.md` §7.3 for the exact Windows worktree protocol (junction/teardown order etc.) and follow it verbatim rather than re-deriving it. Absent such a discovery, this layer runs entirely in the main working tree.
- **No push, no merge.** The human owns the merge back to `${PARENT_BRANCH}`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 013. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 (`BE-1, BE-2, BE-4` parallel) → W2 (`BE-3`) → W3 (`BE-5`) → W4 (`BE-6, BE-7` parallel) → W5 (`BE-8`).
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one unit.
4. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After BE-8 (the last unit, W5) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or (absent the §2 fallback case) open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv-managed) |
| Env activation | venv at `api-backend/.venv/` already exists with all deps installed — system Python has none. Activate via `api-backend\.venv\Scripts\Activate.ps1` (PowerShell), or invoke tools directly via `api-backend\.venv\Scripts\python.exe` / `api-backend\.venv\Scripts\ruff.exe` / `api-backend\.venv\Scripts\mypy.exe` / `api-backend\.venv\Scripts\pytest.exe` without activating. |
| Package manager | pip (no lockfile manager detected) |
| Migration tool | Not this layer's concern — Database layer owns `0018`. This layer assumes the migration is already applied to whatever DB its tests run against (schedule §2 preconditions). |
| DB URL env var | `DATABASE_URL` — must be set before running pytest against a real/scratch DB. Do **not** hardcode credentials in any prompt, brief, or committed file. |
| Shell | PowerShell primary; Bash tool also available. |
| OS | Windows 11 Pro. |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` |

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1:

- **Layering / dependency direction:** `router.py` (thin HTTP boundary, `Depends(require_action(...))` / `Depends(get_current_client_user)`) → `service.py` (one class per feature, `db: Session` in `__init__`, owns the single-commit transaction boundary, rollback on exception) → `repository.py` (pure DB access, `@dataclass(frozen=True)` row shapes, `_base_query()` pattern, **never commits**) → `models`. Mirrors `app/libs/clients/{service,repository}.py` exactly.
- **DI pattern:** `Annotated[Type, Depends(...)]` throughout routes, matching the existing codebase convention (see impl doc §6 BE-6 for the exact shape).
- **RBAC gating:** admin routes gate with `Depends(require_action(Action.X))`; client routes use `Depends(get_current_client_user)` scoped to `user.id` — **never** accept a client-supplied `user_id`/`client_id` query param.
- **Return/error envelope:** bare `HTTPException(status_code, detail=<string>)` — matches proposal §4.1's stated envelope. No new error shape.
- **Precision & types:** money/fee fields are `Decimal`, never `float`. `units`/`multiplier` is `Decimal` → `Numeric(28,10)`; `mgmt_fee`/`incentive_fee` is `Decimal` → `Numeric(9,6)`, matching `Model.mgmt_fee`/`Model.incentive_fee` exactly so BE-5's fee-override compare-and-set never trips on a spurious scale mismatch.
- **Naming:** one directory per feature area under `app/libs/` (`app/libs/onboarding/`); schemas use `pydantic.BaseModel` with `In`/`Out`-suffix DTO naming per the impl doc's field-name ↔ column-name map (§4.1 / impl doc §7.1).
- **Additive & backward-compatible first** (impl doc §3.2): zero changes to existing routes/services; one new package, three new `Action` members, one new scheduler, 14 new routes.
- **Frozen seam:** the cross-layer contract in impl doc §7 (verbatim from proposal §4.1/§4.2, including the 2026-07-20 widening D-9) is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Layer-specific risk note (BE-5):** the atomic `approve()` branches on `kind` and, for `kind="initial"`, must read `agg_before` (via `sum_subscription_multiplier`) **before** the `client_subscriptions` upsert — but the actual safety guarantee against a duplicate allotment is the DB's `client_allotment_redemptions.source_onboarding_id UNIQUE` constraint (DB B-3), not the `kind` branch itself. See impl doc §6 BE-5 for the full mechanism — the sub-agent dispatched to BE-5 reads that unit's contract in full; this is a reminder, not a restatement.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main`** (and owns merges into `${PARENT_BRANCH}`). Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktree needed for this layer's actual waves.** Every wave in the current 5-wave schedule already runs fully parallel (or is a single unit) in the main working tree — schedule §7's shared-file map is empty for every wave. `git worktree add` is not part of this layer's normal path. The orchestrator MAY create one if a same-file collision is discovered at dispatch time that the schedule didn't anticipate — in that case, follow the mechanics in `docs/prompts/013-client-onboarding-integration-db.md` §7.3 verbatim rather than improvising; do not invoke this path speculatively.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every unit's contract up front.** Load unit bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report.
- **Tests live in `api-backend/tests/libs/onboarding/`** (impl doc §8.1), mirroring the source path, never co-located next to source.
- **Tests are NEVER committed.** `tests/` is git-ignored on every layer; sub-agents write and run tests but never stage or commit them.
- **Test harness state — check before fan-out.** `.claude/plugin-state/docgen-013-client-onboarding-integration.json` has an empty `"prompts": []` array and **no `"tests"` entry** — `test-gen` has not been run for this layer yet. Impl doc §8 states goals but has no generated test code. **Before dispatching W1, invoke the `test-gen` skill at level `thorough`** (impl doc §8.4: "Chosen `test-gen` level for this layer: `thorough`") against `docs/implementations/013-client-onboarding-integration-be.md`, per the skill's own instructions. Do not fan out BE-1..BE-8 until this has run.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (schedule §7 confirms no in-wave file collision exists in this layer, so no serialization is needed). Across waves, always wait for the previous wave's commits + gate before dispatching.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 013 (Client
Onboarding Integration).

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python venv at api-backend/.venv/ — invoke
  api-backend\.venv\Scripts\python.exe / ruff.exe / mypy.exe / pytest.exe
  directly, or Activate.ps1 first.
- Shell: PowerShell primary; Bash tool also available. OS: Windows 11 Pro.
- DB URL env var: DATABASE_URL (must be set before running pytest against a
  real/scratch DB; never hardcode credentials).
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}
- No worktree needed — work directly in the main working tree unless the
  orchestrator explicitly told you otherwise for a same-file collision.

INVARIANTS (hold at every step):
<paste the nine bullets from §5 verbatim>

TASK:
- Unit ID: <e.g. BE-3>
- Spec: read `docs/implementations/013-client-onboarding-integration-be.md`
  §6 <BE-3>. That section is the CONTRACT — implement it as specified. Do
  not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit, schedule §5):
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-3>.
4. Write the unit test(s) for <BE-3> from impl doc §8.3 into
   `api-backend/tests/libs/onboarding/` (mirror the source path; never
   co-locate next to source). If test-gen already generated a starting file
   for this unit, extend/verify it rather than duplicating it.
5. Run the layer's CI gate command:
   cd api-backend && ruff check . && ruff format --check . && mypy app && pytest -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — `tests/` is git-ignored; tests stay local.
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message
   (or the exact message impl doc §6 <BE-3> specifies, if any).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add (unless the orchestrator explicitly instructed
  a worktree for a collision it found — see this prompt's §2/§6), --no-verify,
  --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, client-frontend/,
  and anything the Database layer owns, e.g. alembic migrations).
- Reading the schedule doc or other units' contracts — you own exactly <BE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after BE-8 (W5)'s gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)
verify test harness state (§6) — run test-gen thorough if not yet run

for wave in [W1{BE-1,BE-2,BE-4}, W2{BE-3}, W3{BE-5}, W4{BE-6,BE-7}, W5{BE-8}, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent (single message, multiple Agent calls)
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen thorough` has been run against the impl doc before fan-out.
- [ ] Every unit BE-1 through BE-8 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6: lint/format, mypy, pytest, import smoke) was green when crossed.
- [ ] W-final validation agent: PASS (schedule §8.1 — unit coverage, package layout, DTO field widths, 14-route count, RBAC action sets, `main.py` wiring).
- [ ] W-final test agent: PASS (schedule §8.2 — full pytest suite, the two-cycles-one-allotment-row scenario, the duplicate `source_onboarding_id` IntegrityError scenario, the `agg_before` ordering invariant, `ONBOARDING_SETTLEMENT_DAYS` override).
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree (absent an unanticipated same-file collision, per §2/§6).
- [ ] Final report delivered: units committed, gate summaries, PR URL.
</content>
