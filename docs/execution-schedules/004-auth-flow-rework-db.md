# 004 — Authentication Flow Rework · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/004-auth-flow-rework-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: Database — **one layer per file.** The Backend layer runs on its own branch from its own schedule doc.
> Branch: `rework-authentication-module-db` — cut from the current/parent branch `rework-authentication-module` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/004-auth-flow-rework-db.md` |
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4.6, § 4.11, § 6 (2026-07-18 revision: single `users.status` column, not per-profile-table) |
| Sibling layer schedules | `docs/execution-schedules/004-auth-flow-rework-be.md` (Backend) |
| Prompt (dispatch harness) | `docs/prompts/004-auth-flow-rework-db.md` (not yet authored) |

**Unit ID space this schedule sequences:** `DB-1 … DB-3` (definitions live in the impl doc — not restated here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc § 2 preconditions all green: Alembic head on the target DB/branch is `d06ece9f47be` (0016) — verify with `alembic current` before authoring the new revision.
- [ ] Impl doc § 7 (frozen seam) taken as agreed — this layer does not renegotiate it.
- [ ] Live row counts for `client_profiles`, `admin_profiles`, `users` are treated as **unknown until re-queried** — no wave may substitute the proposal's stale "5 client / 10 admin" figures for a real count.
- [ ] Layer branch `rework-authentication-module-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Backend layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in each impl doc's § 7; the Backend layer may run before, after, or concurrent with this one. The Backend layer's status-gate-wiring unit (`BE-9` per its impl doc) depends on this layer's migration being **applied** to its target environment and on the `assert_can_authenticate` function existing — that is a precondition on the Backend layer's schedule, not something this schedule waits on.

**Exit signal:** `DB-1`, `DB-2`, `DB-3` all committed on the layer branch; `DB-2`'s MariaDB rehearsal gate passed (§ 6); § 8 unit tests for `DB-1`/`DB-3` green; PR opened against `rework-authentication-module`. **The orchestrator does not push, does not merge.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — ORM column additions (`AccountStatus` enum, `User.status`, `User.authorized_by`) on `app/models/users.py`, no upstream dependency |
| `DB-2` | `DB-1` | the migration's DDL encodes the exact same column shapes `DB-1` declares on the ORM; authoring the migration first would risk drift between DDL and ORM |
| `DB-3` | `DB-1` | `assert_can_authenticate` reads `User.status` (single shared column, not `ClientProfile.status`/`AdminProfile.is_active`), which only exists on the ORM once `DB-1` lands — parallel-safe with `DB-2` (no shared file, no shared runtime dependency between the migration and the pure gate function) |

**Graph invariants:** acyclic; both edges terminate at `DB-1`; `DB-2` and `DB-3` have no edge between each other.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1` | no (single unit) | — |
| W2 | `DB-2`, `DB-3` | yes (2 units, 2 parallel dispatches) | W1 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W2 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against rework-authentication-module
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-1` | impl § 6 DB-1 — `AccountStatus` enum + `User.status` / `User.authorized_by` columns (single shared column, `client_profiles`/`admin_profiles` untouched) | `modify: api-backend/app/models/users.py` | commit exists on layer branch; `mypy app` + `ruff check .` pass; SQLite `create_all` builds clean |

**Barrier before W2:** the row above must show a commit on the layer branch AND wave-gate checks (§ 6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-2` | impl § 6 DB-2 — Alembic migration `0017_auth_status_columns`, revises `d06ece9f47be` | `create: api-backend/alembic/versions/<new_rev>_0017_auth_status_columns.py` | commit exists on layer branch; **mandatory MariaDB rehearsal** (§ 6 human gate) passed — `upgrade`/`downgrade` both clean against a live-shaped dump with re-queried row counts |
| `DB-3` | impl § 6 DB-3 — `assert_can_authenticate` pure gate function | `create: api-backend/app/libs/auth/status.py` | commit exists on layer branch; unit tests per impl § 8.3 DB-3 pass |

**Barrier before W-final:** both rows above committed AND `DB-2`'s human-gated MariaDB rehearsal signed off.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `ruff check . && ruff format --check .`
2. **Type-check** — `mypy app`
3. **Unit tests** — `pytest -q` (impl doc § 8 — only `DB-1`/`DB-3` tests apply; `DB-2` is exempt from this automated gate, see below)
4. **Build / import smoke** — fresh in-memory SQLite `Base.metadata.create_all()` builds without error

**Human gates** (a wave cannot advance past these without human sign-off):
- [ ] **`DB-2`'s MariaDB rehearsal, before W-final.** The SQLite test path in gate 3 above never executes this migration's DDL (`create_all` only builds the ORM end-state, not `op.execute` DDL) — so `DB-2` cannot be vouched for by the routine `pytest -q` run. A human (or a dedicated CI job with real MariaDB) must run `alembic upgrade head` then `alembic downgrade -1` against an instance loaded with a dump shaped like current live data, re-querying row counts at rehearsal time, before W-final dispatches. This is the only migration in the entire 004 rework touching live production data.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of § 5 "Files touched" per wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | — | — | none — W1 has one unit; W2's two units (`DB-2`, `DB-3`) touch entirely disjoint files (`alembic/versions/...` vs. `app/libs/auth/status.py`) |

**The map is empty for every wave — all units are truly parallel-safe within their wave.**

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc § 6 / § 9:
- [ ] `DB-1`, `DB-2`, `DB-3` each have at least one commit on the layer branch.
- [ ] `app/models/users.py` matches impl § 6 DB-1's contract: `AccountStatus` enum, `User.status` (default `disabled`), `User.authorized_by` (with `ON DELETE SET NULL`) all present with the stated types/defaults; `ClientProfile`/`AdminProfile` carry no status field.
- [ ] The migration file exists at `api-backend/alembic/versions/<new_rev>_0017_auth_status_columns.py`, `down_revision == "d06ece9f47be"`, and both `upgrade()`/`downgrade()` are defined.
- [ ] `api-backend/app/libs/auth/status.py` exists, exports `assert_can_authenticate(user, db) -> None` matching impl § 6 DB-3's signature.
- [ ] Migration head invariant: exactly one Alembic head after this branch's migration lands (no branch split).
- [ ] No import from this layer reaches into any Backend-layer module (`app/libs/auth/deps.py`, `app/libs/clients/`, `app/libs/staff/`, etc.) — layer isolation held.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs `pytest -q` (impl doc § 8): covers `DB-1` (ORM/enum shape tests) and `DB-3` (`assert_can_authenticate` coverage matrix — active/disabled/missing-profile × client/admin).
- Confirms `DB-2`'s MariaDB rehearsal (§ 6 human gate) was performed and signed off — this agent does not itself have MariaDB access; it checks for the rehearsal sign-off artifact/confirmation rather than re-running it.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**, AND the `DB-2` human rehearsal sign-off must be present. If any fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave.

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** add to the impl doc first (e.g. `DB-4`), then extend § 3/§ 4/§ 5 of this file.
- **Scope change:** any edit to the impl doc's § 7 seam suspends this run — the Backend layer must acknowledge the seam change before resuming, since it consumes `assert_can_authenticate` and the two new `users` columns (`status`, `authorized_by`).

---

## 10. Definition of done

- [ ] Wave W1, W2 committed on the layer branch; each wave gate green.
- [ ] `DB-2`'s mandatory MariaDB rehearsal passed and signed off.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `rework-authentication-module`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
