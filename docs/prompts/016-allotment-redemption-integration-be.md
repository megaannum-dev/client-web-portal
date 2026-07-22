# 016 — Allotment & Redemption Integration · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/016-allotment-redemption-integration-be.md` (waves) over `docs/implementations/016-allotment-redemption-integration-be.md` (units).
> Layer: **Backend** — one layer per prompt. Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `allotment-redemption-integration-be` — cut from parent `allotment-redemption-integration`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/016-allotment-redemption-integration-be.md` | *what* to build (unit IDs BE-1…BE-5 + contracts) |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-be.md` | *what order* (waves W1-W4 + W-final, gates, collision protocol) |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 2 — Backend" | *why* + frozen cross-layer seam |
| This prompt | this file | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 **and §3/§7's note on BE-4/BE-5** (wave graph, including the combined-wave resolution — see §3 and §8 of this prompt). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as the branch this one was cut from (record it from the impl doc's front matter or ask the human — do not guess).
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from the correct parent).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back to the parent branch. Stop at "PR opened."
- **Precondition (must hold before dispatching BE-2 onward):** the DB layer's migration widening `AllotRdmpStatus` (+ `awaiting_pc`/`awaiting_co`/`approved`/`rejected`) and adding `reject_reason`/`decided_by`/`decided_at`/`emergent` columns to `client_allotment_redemptions` must be present in the ORM model this layer's tests build from. This layer's own tests never touch the live DB (see §5) — they use the in-memory SQLite fixture in `api-backend/tests/libs/onboarding/conftest.py`, which calls `Base.metadata.create_all()` and therefore picks up the widened `ClientAllotmentRedemption`/`AllotRdmpStatus` model automatically once the DB layer's model changes land on `app/models/onboarding.py`. This is intra-repo schema state (a code precondition), not a wait-on-sibling-schedule.

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 016. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Invoke `test-gen thorough` on `docs/implementations/016-allotment-redemption-integration-be.md` (impl doc §8.4 pins the `thorough` level for this layer — money-moving logic). No feature wave dispatches before this step completes.
3. Walk the schedule's wave graph (schedule §4): W1(`BE-1`) → W2(`BE-2`) → W3(`BE-3`) → W4(`BE-4`+`BE-5`, **combined**) → W-final.
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature — **except W4**: `BE-4` and `BE-5` are dispatched and committed together as one atomic pair (schedule §3/§7). Do **not** dispatch `BE-4` alone and wait for its gate before dispatching `BE-5` — `BE-4`'s `pc_decide_redemption` calls `_execute_redemption_approval`, which only exists once `BE-5`'s contract lands, so a lone `BE-4` commit fails `mypy app`.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. Advance to the next wave.
7. After W4's gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv at `api-backend/.venv/`) |
| Env activation | No `source`/activate needed — call venv executables directly, e.g. `.\.venv\Scripts\python.exe`, from `api-backend/` (PowerShell) |
| Package manager | pip (`api-backend/requirements.txt`) |
| DB URL env var | `DATABASE_URL` (creds portal/portalsecret, local `portal` database) — **this layer's own unit tests never use it; see §5** |
| Shell | PowerShell primary; Bash (Git Bash) also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` = `allotment-redemption-integration` |

**CI gate command** (from `api-backend/`):
- PowerShell: `.\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\pytest.exe -q`
- Bash: `ruff check . && ruff format --check . && mypy app && pytest -q`

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** router → service → repository. `router.py` depends only on `OnboardingService` via `Depends`; `OnboardingService` depends only on `OnboardingRepository` (plus `self.db` for the rare direct read, matching existing `_approve_initial`/`_allotment_to_dto` style). No unit adds a new module — everything extends the existing `app/libs/onboarding` package.
- **Single-commit-with-rollback:** every write path that spans more than one table follows the existing pattern verbatim:
  ```python
  try:
      ...  # all repo writes for this unit of work
      self.db.commit()
  except Exception:
      self.db.rollback()
      raise
  ```
- **Precision & types:** every amount/multiplier column and DTO field uses `Decimal`, matching the existing `Numeric(28, 10)` columns (`ClientSubscription.multiplier`, `ClientAllotmentRedemption.multiplier`/`agg_before`/`agg_after`, `ClientPortfolio.cash_deposit`/`amount_in_trade`/`previous_amount_in_trade`). The $300,000 threshold comparison and the `multiplier × model.model_size` amount computation are done in `Decimal` arithmetic, never `float` — `float` only appears at the DTO boundary (`AllotRdmptDTO.units`/`amount`), same as the existing `_allotment_to_dto`.
- **RBAC action reuse (no new `Action` added):** the proposal's seam (§4.2) pins RM submit to `CLIENT_VIEW`, PC decide to `ALLOTMENT_ACKNOWLEDGE`, CO decide to `ONBOARDING_REVIEW` — all three already exist in `ROLE_ACTIONS` and are already granted to the roles that need them. **Flag, not silently fixed:** gating a *write* route behind `CLIENT_VIEW` — an action named for a read capability — is semantically loose. Follow the proposal's frozen seam as written; do **not** "helpfully" swap in a different action (e.g. `ONBOARDING_MANAGE`/`CLIENT_MANAGE`) or add a new one — a genuine change here requires a proposal addendum, not a unilateral swap by a sub-agent.
- **Additive & backward-compatible first** (impl doc §3.2): prefer additive changes; contract/removal steps come last in the schedule. All 4 routes are new; no existing route's shape changes; `AllotRdmpStatus`/`AllotRdmpKind` Literal widening in `schemas.py` is additive.
- **Frozen seam (multi-layer):** the cross-layer contract in proposal §4.1/§4.2 is fixed. If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **BE-4/BE-5 combined-wave invariant:** `BE-4` (`pc_decide_redemption`) and `BE-5` (`co_decide_redemption`, `_execute_redemption_approval`, `shift_portfolio_for_redemption`) share a real code dependency that runs opposite to the impl doc's stated `Dependencies:` lines (impl doc §6 states `BE-4: Dependencies: BE-3` and `BE-5: Dependencies: BE-3, BE-4`, but `BE-4`'s code calls `_execute_redemption_approval`, which is only defined in `BE-5`'s contract). Per schedule §3/§7, `BE-4` and `BE-5` MUST be dispatched and committed as one atomic pair in wave W4 — never `BE-4` alone followed later by `BE-5`. Committing `BE-4` alone leaves the branch red at `mypy app` (`OnboardingService has no attribute _execute_redemption_approval`), which violates the "leaves the branch green" rule.
- **Test-DB safety:** this layer's own unit tests run exclusively against the in-memory SQLite fixture pattern in `api-backend/tests/libs/onboarding/conftest.py` (`sqlite:///:memory:`, `StaticPool`, `Base.metadata.create_all`). Tests **never** point at the live `portal` database (`DATABASE_URL`) under any circumstance.

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
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/` (mirroring the source path, e.g. `api-backend/tests/libs/onboarding/`), never co-located next to source.
- **Tests are NEVER committed.** The `tests/` dir is git-ignored. Feature agents write and run tests but never stage or commit them.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7). Across waves, always wait for the previous wave's commits + gate before dispatching. **W4 exception:** `BE-4` and `BE-5` are not independently parallel-safe — dispatch them per §7.2 below as one combined delivery, and apply the wave-barrier gate only once, after both are committed.

### 7.1 Brief template (fill and send) — used for W1 (`BE-1`), W2 (`BE-2`), W3 (`BE-3`)

```
You are a feature sub-agent for the Backend layer of proposal 016.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python venv at api-backend/.venv/ — call executables
  directly, e.g. .\.venv\Scripts\python.exe (from api-backend/, PowerShell)
- Shell: PowerShell primary; Bash also available
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: router -> service -> repository. router.py depends only on
  OnboardingService via Depends; OnboardingService depends only on
  OnboardingRepository (plus self.db for rare direct reads).
- Single-commit-with-rollback: try: ...; self.db.commit() except Exception:
  self.db.rollback(); raise -- for every multi-table write path.
- Precision: every amount/multiplier is Decimal (Numeric(28,10) columns).
  Never float except at the DTO float boundary (AllotRdmptDTO.units/amount).
- RBAC: CLIENT_VIEW (RM submit) / ALLOTMENT_ACKNOWLEDGE (PC decide) /
  ONBOARDING_REVIEW (CO decide) are the proposal's frozen, flagged-loose
  action choices -- use them as-is, do not substitute a "better-named" action.
- Test-DB safety: tests run ONLY against the in-memory SQLite fixture in
  api-backend/tests/libs/onboarding/conftest.py. NEVER against the live
  portal database / DATABASE_URL, under any circumstance.

TASK:
- Feature ID: <BE-1 | BE-2 | BE-3>
- Spec: read `docs/implementations/016-allotment-redemption-integration-be.md`
  §6 <unit ID>. That section is the CONTRACT -- implement it as specified.
  Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <unit ID>.
4. Write the unit test(s) for <unit ID> from impl doc §8 into
   `api-backend/tests/libs/onboarding/` (mirror the source path; never
   co-locate next to source). Tests were already scaffolded by test-gen
   thorough (orchestrator step 0) -- extend/complete them, don't discard.
5. Run the layer's CI gate command:
   .\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check . ; .\.venv\Scripts\mypy.exe app ; .\.venv\Scripts\pytest.exe -q
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files -- tests/ is git-ignored; tests stay local.
7. Commit with message: `feat(onboarding): <summary> (<unit ID>)`.
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (admin-frontend/, docs/, DB migration files).
- Reading the schedule doc or other unit specs — you own exactly <unit ID>.
```

### 7.2 W4 combined dispatch — `BE-4` + `BE-5` (special case)

W4 does **not** use two independent copies of the §7.1 template dispatched in parallel, because `BE-4`'s code references a symbol only `BE-5` defines. Use one of these two patterns (orchestrator's choice, per schedule §7):

**Pattern A — one combined sub-agent (preferred, simplest):** dispatch a single sub-agent with a brief that is the §7.1 template but with:
- `Feature ID: BE-4 + BE-5 (combined atomic pair — see impl doc §6 BE-4/BE-5, schedule §3/§7)`
- `Spec:` impl doc §6 `BE-4` **and** `BE-5`, both read in full before writing any code.
- `Files:` `api-backend/app/libs/onboarding/service.py` (modify), `api-backend/app/libs/onboarding/repository.py` (modify).
- Step 3 instructs: implement `shift_portfolio_for_redemption` (repository) and `_execute_redemption_approval` (service, BE-5's helper) **first**, then `pc_decide_redemption` (BE-4) and `co_decide_redemption` (BE-5) referencing it.
- Step 4 writes tests for both `BE-4` and `BE-5` from impl doc §8.
- Single commit (or two sequential commits with no gate run between them) — either way, the wave barrier/gate (schedule §6) is applied only once, after everything in this dispatch is on the branch.

**Pattern B — two sequenced sub-agents, no barrier between them:** if dispatched as two separate Agent calls, the second (`BE-5`, defining `_execute_redemption_approval`) must land first or the two must be explicitly sequenced so `BE-4`'s reference resolves before either commit is gated. Do not run the wave gate after the first commit — only after both.

In either pattern: **the orchestrator applies schedule §6's wave gate exactly once for W4, after both BE-4 and BE-5 are committed** — never after BE-4 alone.

### 7.3 W-final agents (validation + test)

Dispatched once, in parallel, after W4's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4, §3, §7 (note: BE-4/BE-5 inversion + combined-wave resolution)
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

# Step 0 — test scaffolding (impl doc §8.4: level = thorough)
invoke test-gen thorough on docs/implementations/016-allotment-redemption-integration-be.md
  (money-moving logic — subscription multiplier and portfolio balances — before any
  feature-wave sub-agent is dispatched)

for wave in [W1(BE-1), W2(BE-2), W3(BE-3), W4(BE-4+BE-5 combined), W_final]:
    if wave == W4:
        dispatch BE-4 and BE-5 together as ONE combined delivery (§7.2) —
        never BE-4 alone followed by a wait, then BE-5
    else:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen thorough` invoked before any feature-wave dispatch.
- [ ] Every unit `BE-1`…`BE-5` has a commit on `${LAYER_BRANCH}`.
- [ ] `BE-4` and `BE-5` were dispatched/committed as one atomic pair in W4 — never `BE-4` alone with a gate run before `BE-5` landed.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
