# 010 — RM Client Book: Live Search Against `client_profiles` · Prompt — Backend

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/010-rm-client-search-backend-be.md` (waves) over `docs/implementations/010-rm-client-search-backend-be.md` (units).
> Layer: Backend — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch. No prior conversation is assumed.
> Branch: `searchbar-client-book-be` — cut from parent `searchbar-client-book`. This prompt captures the actual parent branch at session start.
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/010-rm-client-search-backend-be.md` | *what* to build (unit IDs + contracts) |
| Execution schedule | `docs/execution-schedules/010-rm-client-search-backend-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/010-rm-client-search-backend-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 (identity, branch contract, conventions) → impl doc §7 (frozen seam) → schedule doc §1-4 (wave graph). Do **not** read every feature body up front — pull them per dispatch.

---

## 2. Branch & session contract

- **Layer:** Backend.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, the parent is `searchbar-client-book` — confirmed from this prompt's front matter and the impl doc's branch contract (§2). Do not guess otherwise.
- **Confirm the branch state** before dispatching anything:
  - Working tree clean (`git status` empty).
  - HEAD is `${LAYER_BRANCH}` (or the layer branch has been cut from `searchbar-client-book`).
  - No other prompt session is dispatching on this branch.
- **No worktrees.** Do not run `git worktree add`. All sub-agents share this working tree; the schedule doc §7 confirms every wave in this layer is single-unit, so there is no same-file collision to arbitrate.
- **No push, no merge.** The human owns the merge back to `searchbar-client-book`. Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the Backend layer of proposal 010. Your job is to:

1. Read the impl doc and schedule doc once (see §1 read order).
2. Walk the schedule's wave graph (schedule §4): W1 → W2 → W3 → W4 → W-final. Every feature wave in this layer is a single unit (BE-1..BE-4 form a strict chain), so each wave dispatches exactly one sub-agent.
3. For the unit in the current wave, spawn **one sub-agent** via the Agent tool, using the brief template in §7 of this prompt.
4. Wait for the wave to commit; run the wave gate from schedule §6. If red, stop and report — do not attempt cross-wave fixes.
5. Advance to the next wave.
6. After BE-4 commits and its gate is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report status. Stop.

You **do not** edit source files yourself. You **do not** push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/JohnQin/Desktop/John's Megaanuum working repository/client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python 3.13 (CPython, per `api-backend/.venv/pyvenv.cfg`) |
| Env activation | `api-backend\.venv\Scripts\activate` (PowerShell: `api-backend\.venv\Scripts\Activate.ps1`) — the system Python has no project dependencies installed; the venv is mandatory. |
| Package manager | `pip` against `api-backend/requirements.txt` (no lockfile/poetry/uv in this layer) |
| Migration tool | Not used by this layer — no new Alembic migration (proposal is DB-schema-frozen). If ever needed: `.\api-backend\.venv\Scripts\alembic.exe`, run from `api-backend/`. |
| DB URL env var | `DATABASE_URL` (not `SQLALCHEMY_*`) |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (expected: `searchbar-client-book`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router → service → repository`. Router does auth (`Depends(require_action(...))`) + response_model + delegates. Service raises `HTTPException` for business errors and translates repo results to Pydantic. Repository owns all `db.query(...)` — no other layer touches SQLAlchemy.
- **Return/error envelope:** Pydantic-serialized DTO on 200; `HTTPException(status_code=…)` for anything else. `require_action` handles 401/403. Response envelopes are bespoke and non-generic (mirrors `ModelsListOut`) — do **not** introduce a `Page[T]` generic.
- **Precision & types:** UUIDs are typed `uuid.UUID` on FastAPI path params (422 on malformed input, free of charge); serialized as `str` on the wire (`ClientListItemOut.id: str`).
- **Naming:** `app/libs/clients/{__init__.py, router.py, service.py, repository.py, schemas.py}`; router mounted under prefix `/api` in `app/main.py`.
- **Additive & backward-compatible first:** every unit in this layer is additive — no existing route, model, or migration is edited except the one-line `include_router(...)` addition to `app/main.py`.
- **Frozen seam:** the cross-layer contract in proposal §4.1 is fixed (reproduced verbatim in impl doc §7). If a unit's contract seems to conflict with the seam, **stop and report** — do not silently diverge. Seam changes come from the proposal, not from this layer.
- **Role-based scoping is ADMIN-only, not COMPLIANCE.** `FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}` (impl doc BE-2). `AdminRole.COMPLIANCE` is explicitly out of scope for this proposal — it keeps its current zero granted actions in `app/libs/auth/actions.py` and gets a 403 from both routes, unchanged from today. Do **not** add `COMPLIANCE` to `FULL_VISIBILITY_ROLES` or to `ROLE_ACTIONS` — this was deliberately reverted from an earlier draft; re-adding it is out of scope for this dispatch.
- **No `app/libs/auth/actions.py` edit at all.** RM and ADMIN already carry `Action.CLIENT_VIEW` (RM explicitly, ADMIN via `set(Action)`). BE-1 does not touch this file.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Agents stop at "PR opened against `${PARENT_BRANCH}`."
- **No push.** Not the orchestrator, not any sub-agent. `git push` is a hard-forbidden command in this session.
- **No worktrees.** `git worktree add` is a hard-forbidden command.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` are forbidden. If a pre-commit hook fails, the sub-agent fixes the underlying issue and creates a **new** commit — never `--amend` past a hook failure.
- **No `git add -A` / `git add .`** in sub-agent commits — file lists are explicit, taken from the impl doc unit.
- **Do not read every impl feature up front.** Load feature bodies lazily per dispatch — protects orchestrator context.
- **Red gate = stop.** A failed wave gate halts the algorithm at that wave. The orchestrator reports the failure and waits for the human; it does not attempt cross-wave fixes or invent new units.
- **Never modify sibling-layer files.** This session is scoped to `api-backend/`. If a unit seems to require a change outside that dir, the impl doc is wrong — stop and report. In particular, never touch `admin-frontend/`.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent tool call per unit. Since every wave in this layer is single-unit (BE-1..BE-4 form a strict chain per schedule §3), dispatches are sequential across waves, not parallel within a wave.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 010.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env activation: Python 3.13, activate api-backend\.venv\Scripts\Activate.ps1 (PowerShell) before any command
- Shell: PowerShell primary; Bash also available
- DB URL env var: DATABASE_URL
- Branch you are committing to: ${LAYER_BRANCH}
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}

INVARIANTS (hold at every step):
- Layering: router → service → repository; repository owns all db.query(...).
- Return/error envelope: Pydantic DTO on 200, HTTPException otherwise; bespoke
  non-generic envelopes only (no Page[T]).
- UUIDs: uuid.UUID on path params, str on the wire.
- Module layout: app/libs/clients/{__init__,router,service,repository,schemas}.py.
- Additive-first: no existing route/model/migration is edited except the one-line
  include_router(...) in app/main.py.
- Frozen seam (proposal §4.1 / impl doc §7) is fixed — if your unit's contract
  seems to conflict with it, STOP and report, do not silently diverge.
- FULL_VISIBILITY_ROLES = {AdminRole.ADMIN} only. COMPLIANCE is explicitly
  out of scope — do not grant it CLIENT_VIEW, do not add it to
  FULL_VISIBILITY_ROLES, do not touch app/libs/auth/actions.py at all.

TASK:
- Feature ID: <e.g. BE-2>
- Spec: read `docs/implementations/010-rm-client-search-backend-be.md` §6 <BE-2>.
  That section is the CONTRACT — implement it as specified. Do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify | delete>
  - <path> — <create | modify | delete>
- Dependencies (already committed on ${LAYER_BRANCH}): <list of unit IDs or "none">.

STEPS:
1. Read every file listed above (create or modify).
2. Read the frozen seam in impl doc §7 if this unit touches the seam.
3. Implement the contract from impl doc §6 <BE-2>.
4. Write the unit test(s) for <BE-2> from impl doc §8 into api-backend/tests/
   (mirror the existing trade_models test layout).
5. Run the layer's CI gate command:
   ruff check . && ruff format --check . && mypy app && pytest -q
   (run from api-backend/, venv activated). If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no `git add -A`, no `git add .`).
7. Commit with a one-line `<type>(<scope>): <summary> (<UNIT-ID>)` message,
   e.g. "feat(clients): repository with role-based scoping (BE-2)".
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list above.
- Editing files in admin-frontend/ or any other sibling-layer directory.
- Adding AdminRole.COMPLIANCE to FULL_VISIBILITY_ROLES or ROLE_ACTIONS.
- Reading the schedule doc or other unit specs — you own exactly <BE-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after BE-4's gate is green. Use schedule doc §8.1 (validation) and §8.2 (test) as the sub-agent briefs verbatim, prefixed with the same CONTEXT block from §7.1 above (so those two agents also inherit env + invariants). The validation agent's checklist explicitly includes confirming `app/libs/auth/actions.py` was **not** modified and `FULL_VISIBILITY_ROLES` contains only `AdminRole.ADMIN`.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in [W1(BE-1), W2(BE-2), W3(BE-3), W4(BE-4), W_final]:
    for unit in wave.units:   # exactly one unit per feature wave in this layer
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until the dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report to human, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit BE-1..BE-4 has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) was green when crossed.
- [ ] W-final validation agent: PASS — including confirming no `actions.py` change and `FULL_VISIBILITY_ROLES == {AdminRole.ADMIN}`.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
