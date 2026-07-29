# 018 — Client Portal ↔ Backend Integration · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/018-client-portal-integration-be.md` (waves) over `docs/implementations/018-client-portal-integration-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `client-portal-integration-be` — cut from `client-portal-integration` (the confirmed current branch at doc-generation time). This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/018-client-portal-integration-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/018-client-portal-integration-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body (§6, BE-1…BE-14) up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, capture `PARENT_BRANCH` as `client-portal-integration` (per impl doc §2 branch contract) rather than guessing.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from `client-portal-integration`).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; schedule doc §7 handles same-file collisions by wave placement or in-wave serialization.
- **No push, no merge.** The human owns the merge back into `client-portal-integration`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 018. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Invoke `test-gen standard` on `docs/implementations/018-client-portal-integration-be.md` **before dispatching any feature wave** — see §7.1's TEST HARNESS block for why.
3. Walk the schedule's wave graph (§4 of the schedule).
4. For every unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt. Each sub-agent implements exactly one feature.
5. Wait for the whole wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
6. Advance to the next wave.
7. After the last feature wave (`W4`, unit `BE-14`) commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
8. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv at `api-backend\.venv\` — system Python has no dependencies installed) |
| Env activation | PowerShell: `& api-backend\.venv\Scripts\Activate.ps1` |
| Package manager | pip |
| Migration tool | not applicable to this layer — Backend consumes the DB layer's schema via the ORM only; it does not run migrations. Applying DB migration `a9317a31b484` to the target environment is a human-owned precondition (impl doc §2, schedule §2/§6), not a step this session performs. |
| DB URL env var | not applicable to this layer for the same reason — no unit here opens a raw DB connection string; tests run against a scratch/seeded DB per impl doc §8.1. |
| Shell | PowerShell primary; Bash tool also available |
| OS | Windows 11 |
| CI gate command (verified against `api-backend/pyproject.toml` — `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]` all present) | `ruff check . && ruff format --check . && mypy app && pytest -q` |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`client-portal-integration`) |

---

## 5. Global invariants (inherited by every sub-agent)

Copied verbatim from impl doc §3.1/§3.2:

- **Layering:** `router → service → repository → app/models/*`, exactly as `app/libs/onboarding/` and `app/libs/trade_models/` already do. A router function does dependency resolution and response-model wiring only; a service function does every derivation and every cross-cutting guard; a repository function issues exactly one query shape and returns ORM rows or lightweight row tuples, never a DTO.
- **Dependency direction across packages:** `client_portal.service` may import `app.libs.onboarding.service.OnboardingService` and `app.libs.onboarding.repository.OnboardingRepository` (read/delegate, never subclass) and `app.libs.trade_models.storage.get_storage`. Nothing in `app.libs.onboarding` or `app.libs.trade_models` imports `client_portal` — the dependency arrow points one way, same rule the proposal states in § Layer 2 A.
- **DTO naming:** `...DTO` for responses, `...Req`/`...Patch` for request bodies — matches `OnboardingDTO`/`StartOnboardingReq`/`VerdictReq` etc.
- **Enums on the wire:** a `str, Enum` class when the value set is genuinely new to this proposal (`TicketKind`, `TicketStatus`, per proposal § 4.1 — not a `Literal`, matching the proposal's own schema text verbatim); a `Literal[...]` when mirroring an existing SQLAlchemy-enum's value set inline (`KycPanelDTO.overall`, `upload_blocked_reason`), matching `OnboardingStatus`/`DocStatus`'s existing `Literal` convention in `onboarding/schemas.py`.
- **Money/precision:** `Decimal` end-to-end in repository/service; float only at the Pydantic DTO boundary — same convention as `AllotRdmptDTO`/`TransactionDetailDTO`.
- **Settings vs. `os.getenv` constants:** a value that genuinely varies per deployment and has a natural home next to sibling settings goes on `Settings` (`legal_docs_subdir`, `client_statements_subdir`, alongside `storage_root`). A tunable that gates one feature's own runtime behavior and has no other consumer follows the existing bare-module-constant convention (`ONBOARDING_SETTLEMENT_DAYS` in `onboarding/service.py`, `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS` in `onboarding/scheduler.py`) — `CLIENT_UPLOAD_WINDOW_DAYS` follows this second pattern, as a module constant in `client_portal/service.py`.
- **Error envelope:** unchanged — `HTTPException(status_code, "message")`, FastAPI's default `{"detail": "..."}` JSON.
- **Subject resolution:** every `/client/*` route depends on `get_current_client_user` and passes `user.id` into the service; **no route parameter ever names a client, onboarding, or storage path** (C-14). Every `/rm/tickets*` route depends on `require_action(Action.CLIENT_VIEW)` (existing action, already granted to RM and ADMIN) plus a local role lookup, then the service filters by the `assigned_rm_uid` snapshot unless the caller's role is in `FULL_VISIBILITY_ROLES`.
- **Additive & backward-compatible first** (impl doc §3.2 CI/CD): each BE-* unit is one atomic, self-reviewable commit that leaves the branch green; the new `client_portal` package is entirely additive alongside the existing `onboarding` and `trade_models` packages; contract/removal steps come last (BE-1's route relocation removes two handlers from `onboarding/router.py` only after `client_portal` already serves them).
- **Frozen seam:** the cross-layer contract in proposal § 4 is fixed and re-pinned verbatim in impl doc §7. If a unit's contract seems to conflict with it, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.

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
- **Tests live in the layer's `tests/` dir.** Every generated/written test goes under `api-backend/tests/libs/client_portal/` (or the relevant mirrored path per impl doc §8.1), never co-located next to source.
- **Tests are NEVER committed — any layer.** The `tests/` dir is git-ignored; feature agents write and run tests but never stage or commit them. They stay local.
- **Backend layer — no preview-server line applies.** (That guardrail is frontend-only; omitted here.)

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Within a wave, all dispatches go in a **single message** with multiple parallel Agent tool calls (barring same-file serialization per schedule §7). Across waves, always wait for the previous wave's commits + gate before dispatching.

**Before Wave W1 — test-gen must run first:** the pipeline state for this layer has no `tests` entry yet, meaning `test-gen` has not been run against this impl doc. Per impl doc §8.1/§8.4, the chosen level is **`standard`** (happy path + main negative + role/permission per goal), with a noted option to re-run `test-gen thorough` scoped to just `BE-4` and `BE-7` afterward if the standard pass leaves gaps in their edge-case density. **Invoke `test-gen standard` on `docs/implementations/018-client-portal-integration-be.md` before dispatching Wave W1.** Only after that completes does fan-out begin.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 018.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python venv — PowerShell: & api-backend\.venv\Scripts\Activate.ps1
- Package manager: pip
- Shell: PowerShell primary; Bash tool also available
- OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

TEST HARNESS (read before writing any test code):
- test-gen standard has already been run against docs/implementations/018-client-portal-integration-be.md
  before your dispatch (orchestrator step). Generated test files live under
  api-backend/tests/libs/client_portal/ (mirroring the source path per impl doc §8.1).
- Your job for <UNIT-ID> is to make its generated test(s) pass WITHOUT editing the test files.
- A red generated test is either a real bug in your implementation, or a sign the impl doc's
  §8.3 goal for <UNIT-ID> is itself wrong. If you believe it's the latter: STOP and report —
  do not rewrite the test to make it pass.
- If no generated test exists yet for <UNIT-ID> (e.g. it was out of the initial test-gen scope),
  write the unit test(s) from impl doc §8.3 <UNIT-ID> yourself into
  api-backend/tests/libs/client_portal/ (mirror the source path; never co-locate next to source).

INVARIANTS (hold at every step):
<paste the invariant lines from §5 of this prompt verbatim>

TASK:
- Feature ID: <e.g. BE-3>
- Spec: read `docs/implementations/018-client-portal-integration-be.md` §6 <BE-3>. That section is
  the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit / schedule §5 per-wave table):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">, per schedule §3.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-3>.
4. Make this unit's tests pass per the TEST HARNESS block above.
5. Run the layer's CI gate command: ruff check . && ruff format --check . && mypy app && pytest -q.
   If red, fix and re-run. Do not commit red.
6. Stage ONLY the source files listed above (no `git add -A`, no `git add .`).
   Do NOT stage or commit test files — the `tests/` dir is git-ignored;
   tests stay local.
7. Commit with the message from impl doc §6 <BE-3> (or a one-line
   `<type>(<scope>): <summary> (<UNIT-ID>)` if the impl doc does not specify).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in sibling-layer directories (client-frontend/, admin-frontend/, or the DB
  layer's migration files).
- Editing generated test files to force a pass.
- Reading the schedule doc or other unit specs — you own exactly <BE-3>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after Wave W4 (`BE-14`)'s gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants + the test-harness note).

---

## 8. Execution loop

The orchestrator executes this loop; it is a rehearsal of schedule §4's algorithm, not a replacement.

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

invoke test-gen standard on docs/implementations/018-client-portal-integration-be.md   # before W1

for wave in [W1, W2, W3, W4, W_final]:      # schedule §4
    for unit in wave.units:
        # Same-file collisions in this wave? Serialize per schedule §7.
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] `test-gen standard` invoked against the impl doc before Wave W1 dispatch.
- [ ] Every unit BE-1…BE-14 in impl doc §6 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
