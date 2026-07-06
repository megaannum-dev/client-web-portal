# 008 — `Distinctive Symbols Column` · Prompt — `Database`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/008-symbol-audit-trail-db.md` (waves) over `docs/implementations/008-symbol-audit-trail-db.md` (units).
> Layer: `Database` — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch.
> Branch: `distinctive-symbol-sections-db` — cut from `distinctive-symbol-sections`.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/008-symbol-audit-trail-db.md` | *what* to build (DB-1…DB-3 + contracts) |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-db.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/008-symbol-audit-trail-db.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 → impl doc §7 (frozen seam) → schedule doc §1-4. Do **not** read every feature body up front — pull per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Database`.
- **First action (mandatory):** capture the parent branch name.
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)   # expect: distinctive-symbol-sections
  LAYER_BRANCH="${PARENT_BRANCH}-db"
  ```
  If already on `${LAYER_BRANCH}`, record `PARENT_BRANCH` as `distinctive-symbol-sections` (from this doc's front matter) — do not guess.
- **Confirm branch state** before dispatching: working tree clean (`git status`), HEAD is `${LAYER_BRANCH}` (or cut it from the correct parent), no other prompt session dispatching here.
- **No worktrees.** All sub-agents share this working tree; schedule §7 handles same-file collisions (DB-1 & DB-2 both edit `pc.py` → serialize).
- **No push, no merge.** Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Database` layer of proposal `008`. Your job:

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
| Runtime | Python (venv-managed) |
| Env activation | venv at `api-backend\.venv\` — call tools directly: `api-backend\.venv\Scripts\python.exe`, `api-backend\.venv\Scripts\alembic.exe` (system Python has no deps) |
| Package manager | pip (inside the venv) |
| Migration tool | `alembic`; command: `.\.venv\Scripts\alembic.exe upgrade head` (run from `api-backend/`) |
| DB URL env var | `DATABASE_URL` (not `SQLALCHEMY_*`); dev creds portal/portalsecret, root/rootsecret |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`distinctive-symbol-sections`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Layering / dependency direction:** ORM models (`app/models/pc.py`) define shapes; the Alembic revision realizes them as DDL. Migration depends on the model shapes, never vice-versa.
- **Enums stored non-native:** `SAEnum(E, native_enum=False, values_callable=lambda e: [m.value for m in e])` → VARCHAR (matches `ModelStatus`, `ModelChangeKind`).
- **Precision & types:** UUID PKs `Uuid(native_uuid=False), default=uuid.uuid4`; timestamps `DateTime(timezone=True), server_default=func.now()`.
- **Column ordering:** `created_at`/`updated_at` are always last; a new attribute is inserted **before** that timestamp block (`model_symbols` has none, so `active` goes after `weight`).
- **Additive & backward-compatible first:** `active` is `NOT NULL DEFAULT true`; new table is additive; the destructive/contract step (none here) would come last.
- **Frozen seam:** the cross-layer contract in proposal §4 (= impl §7) is fixed. If a unit seems to conflict with it, **stop and report** — do not diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Stop at "PR opened against `${PARENT_BRANCH}`."
- **No push** (orchestrator or sub-agent). `git push` is hard-forbidden.
- **No worktrees.** `git worktree add` is hard-forbidden.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` forbidden. On a hook failure, fix the issue and make a **new** commit — never `--amend` past it.
- **No `git add -A` / `git add .`** — file lists are explicit, from the impl doc unit.
- **Do not read every impl feature up front.** Load bodies lazily per dispatch.
- **Red gate = stop.** No cross-wave fixes, no invented units.
- **Never modify sibling-layer files.** Scope is `api-backend/`. If a unit needs changes outside it, the impl doc is wrong — stop and report.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent call per unit. Within a wave, dispatches go in a **single message** with parallel Agent calls — **except** DB-1 & DB-2, which share `pc.py` and must be serialized per schedule §7 (DB-1 first, then DB-2 after DB-1 commits + `git pull --rebase`). Across waves, always wait for the previous wave's commits + gate.

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Database layer of proposal 008.

CONTEXT (do not re-derive):
- Layer working dir: api-backend/
- Runtime + env: venv at api-backend\.venv\ — use .\.venv\Scripts\python.exe and .\.venv\Scripts\alembic.exe (run from api-backend/)
- DB URL env var: DATABASE_URL
- Shell: PowerShell (Bash also available); OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}  (distinctive-symbol-sections-db)
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}  (distinctive-symbol-sections)

INVARIANTS (hold at every step):
- ORM models define shapes; the Alembic revision realizes them. Migration depends on models, never vice-versa.
- Enums non-native: SAEnum(E, native_enum=False, values_callable=lambda e: [m.value for m in e]) → VARCHAR.
- UUID PKs Uuid(native_uuid=False), default=uuid.uuid4; timestamps DateTime(timezone=True), server_default=func.now().
- Column ordering: created_at/updated_at last; new attribute inserted before them (model_symbols has none → active after weight).
- Additive first: active is NOT NULL DEFAULT true; audit table additive.
- Frozen seam (proposal §4 = impl §7) is fixed — if a contract conflicts, STOP and report.

TASK:
- Feature ID: <e.g. DB-1>
- Spec: read `docs/implementations/008-symbol-audit-trail-db.md` §6 <DB-1>. That section is the CONTRACT — implement as specified, do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <unit IDs or "none">.

STEPS:
1. Read every file listed above.
2. Read the frozen seam in impl doc §7 if this unit touches it.
3. Implement the contract from impl doc §6 <DB-1>.
4. Add/adjust the unit test(s) for <DB-1> from impl doc §8.
5. Run the gate: cd api-backend; .\.venv\Scripts\python.exe -c "import app.models.pc"  (DB-3 also: .\.venv\Scripts\alembic.exe upgrade head; then downgrade -1; then upgrade head, against a dev-DB copy). If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no git add -A / git add .).
7. Commit with the message from impl doc §6 <DB-1> (or `<type>(db): <summary> (<DB-ID>)`).
8. Report back: commit SHA, files changed, test/gate summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list, or in sibling-layer dirs (app/libs/**, admin-frontend/**).
- Reading the schedule doc or other unit specs — you own exactly <DB-1>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W2's gate is green. Use schedule §8.1 (validation) and §8.2 (test) as the briefs verbatim, each prefixed with the CONTEXT block from §7.1.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in schedule.waves + [W_final]:
    for unit in wave.units:
        # DB-1 & DB-2 share pc.py → serialize per schedule §7
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl §6 (DB-1…DB-3) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
