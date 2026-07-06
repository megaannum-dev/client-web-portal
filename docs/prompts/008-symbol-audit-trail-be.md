# 008 — `Distinctive Symbols Column` · Prompt — `Backend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/008-symbol-audit-trail-be.md` (waves) over `docs/implementations/008-symbol-audit-trail-be.md` (units).
> Layer: `Backend` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch.
> Branch: `distinctive-symbol-sections-be` — cut from `distinctive-symbol-sections`.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/008-symbol-audit-trail-be.md` | *what* to build (BE-1…BE-5 + contracts) |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-be.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/008-symbol-audit-trail-be.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 → impl doc §7 (frozen seam) → schedule doc §1-4. Do **not** read every feature body up front — pull per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Backend`.
- **First action (mandatory):**
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)   # expect: distinctive-symbol-sections
  LAYER_BRANCH="${PARENT_BRANCH}-be"
  ```
  If already on `${LAYER_BRANCH}`, record `PARENT_BRANCH` as `distinctive-symbol-sections`.
- **Confirm branch state**: working tree clean, HEAD is `${LAYER_BRANCH}`, no other prompt session dispatching here.
- **Precondition (intra-repo state, not a sibling branch):** the DB migration (`model_symbols.active` + `model_symbol_audit`) must be **applied to the dev DB this session runs against** — see impl §2. This is repo/DB state, not a dependency on the `-db` branch's schedule.
- **No worktrees.** Schedule §7 handles same-file collisions (BE-2 & BE-4 both edit `service.py` → serialize).
- **No push, no merge.** Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Backend` layer of proposal `008`. Your job:

1. Read the impl + schedule docs once (§1 read order).
2. Walk the schedule's wave graph.
3. For every unit in the current wave, spawn **one sub-agent** via the Agent tool using the §7 brief. Each implements exactly one feature.
4. Wait for the wave to commit; run the wave gate (schedule §6). If red, stop and report.
5. Advance to the next wave.
6. After the last feature wave is green, dispatch the two W-final agents (validation + test) in parallel per schedule §8.
7. Open a PR against `${PARENT_BRANCH}`. Report. Stop.

You **do not** edit source files, push, merge, or open worktrees.

---

## 4. Environment facts (inherited by every sub-agent)

| Fact | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal` |
| Layer working dir | `api-backend/` |
| Runtime | Python (venv-managed); FastAPI + SQLAlchemy 2.0 + Pydantic v2 |
| Env activation | venv at `api-backend\.venv\` — call `api-backend\.venv\Scripts\python.exe` directly (system Python has no deps) |
| Package manager | pip (inside the venv) |
| Migration tool | `alembic` (owned by the DB layer; BE assumes the migration is applied) |
| DB URL env var | `DATABASE_URL`; dev creds portal/portalsecret, root/rootsecret |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`distinctive-symbol-sections`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** `router → service → ORM`. Routes are thin; logic lives in `ModelService`. Routes guarded by `require_action(Action.X)` — writes → `MODEL_MANAGE`, reads → `MODEL_VIEW`.
- **Actor & serialization:** `actor` passed as `actor.firebase_uid` (string); Pydantic v2 DTOs use `model_config = {"from_attributes": True}` and `field_validator(..., mode="before")` for coercion.
- **Errors:** `HTTPException(status.HTTP_4xx, "msg")`; `get_model` already raises 404.
- **Naming:** snake_case; the detail endpoint attaches optional collections via the `include=` query param.
- **Additive & backward-compatible first:** new routes alongside existing; `edit_model` extended (adds audit) without changing its response shape. Close the two `ponytail:` markers rather than re-deferring.
- **Frozen seam:** the cross-layer contract in proposal §4 (= impl §7) is fixed. If a unit conflicts with it, **stop and report** — do not diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Stop at "PR opened against `${PARENT_BRANCH}`."
- **No push** (orchestrator or sub-agent). `git push` hard-forbidden.
- **No worktrees.** `git worktree add` hard-forbidden.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` forbidden. On a hook failure, fix and make a **new** commit — never `--amend` past it.
- **No `git add -A` / `git add .`** — explicit file lists from the impl doc unit.
- **Do not read every impl feature up front.** Load bodies lazily per dispatch.
- **Red gate = stop.** No cross-wave fixes, no invented units.
- **Never modify sibling-layer files.** Scope is `api-backend/`. Do not touch `app/models/pc.py` (DB layer owns the ORM/migration) or `admin-frontend/**`. If a unit needs changes outside `app/libs/trade_models/`, stop and report.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent call per unit. Within a wave, dispatches go in a **single message** with parallel Agent calls — **except** BE-2 & BE-4, which share `service.py` and must be serialized per schedule §7 (BE-2 first, then BE-4 after BE-2 commits + `git pull --rebase`). Across waves, always wait for the previous wave's commits + gate.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Backend layer of proposal 008.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/ (all edits under app/libs/trade_models/)
- Runtime + env: venv at api-backend\.venv\ — use .\.venv\Scripts\python.exe (run from api-backend/)
- DB URL env var: DATABASE_URL (migration assumed already applied)
- Shell: PowerShell (Bash also available); OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}  (distinctive-symbol-sections-be)
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}  (distinctive-symbol-sections)

INVARIANTS (hold at every step):
- Layering: router → service → ORM; routes thin, logic in ModelService; guarded by require_action (writes MODEL_MANAGE, reads MODEL_VIEW).
- actor passed as actor.firebase_uid; Pydantic v2 model_config = {"from_attributes": True}; validators mode="before".
- Errors via HTTPException(status.HTTP_4xx, "msg"); detail endpoint uses include= query param.
- Additive first: new routes alongside existing; edit_model extended without changing its response shape; delete the two ponytail: markers.
- Frozen seam (proposal §4 = impl §7) is fixed — if a contract conflicts, STOP and report.

TASK:
- Feature ID: <e.g. BE-2>
- Spec: read `docs/implementations/008-symbol-audit-trail-be.md` §6 <BE-2>. That section is the CONTRACT — implement as specified, do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <unit IDs or "none">.

STEPS:
1. Read every file listed above.
2. Read the frozen seam in impl doc §7 if this unit touches it.
3. Implement the contract from impl doc §6 <BE-2>.
4. Write the unit test(s) for <BE-2> from impl doc §8 into the layer's test dir.
5. Run the gate: cd api-backend; .\.venv\Scripts\python.exe -c "import app.main"; then .\.venv\Scripts\python.exe -m pytest -q app/libs/trade_models (if a runner is configured; else the manual §8 checks). If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no git add -A / git add .).
7. Commit with the message from impl doc §6 <BE-2> (or `<type>(be): <summary> (<BE-ID>)`).
8. Report back: commit SHA, files changed, test summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list; editing app/models/pc.py (DB layer) or admin-frontend/** (FE layer).
- Reading the schedule doc or other unit specs — you own exactly <BE-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W3's gate is green. Use schedule §8.1 (validation) and §8.2 (test) as the briefs verbatim, each prefixed with the CONTEXT block from §7.1.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in schedule.waves + [W_final]:
    for unit in wave.units:
        # BE-2 & BE-4 share service.py → serialize per schedule §7
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl §6 (BE-1…BE-5) has a commit on `${LAYER_BRANCH}`.
- [ ] Both `ponytail:` markers deleted.
- [ ] Every wave gate (schedule §6) green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
