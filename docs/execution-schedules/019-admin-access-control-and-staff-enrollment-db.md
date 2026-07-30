# 019 — Admin Access Control & Staff Enrollment · Execution Schedule — Layer: Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Database — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-db` — cut from parent `claude/admin-pages-backend-proposal-f0c9fc` and merged back into it (**the human owns the merge**).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` |
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 1 — Database" |
| Sibling layer schedules | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md`, `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/019-admin-access-control-and-staff-enrollment-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-7` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions** (impl doc §2):
- [ ] `alembic heads` reports `b34f8c1a9d27` as the **single** head — run from `api-backend/` via `.\.venv\Scripts\alembic.exe` (this repo's Python environment is the venv at `api-backend\.venv\`; the system Python has no deps). If a sibling branch has since added a head, re-chain rather than guess — that is a §9 change, not a runtime workaround.
- [ ] The frozen seam in impl doc §7 (verbatim copy of proposal § 4.1/4.2) is agreed and not under renegotiation.
- [ ] A scratch MariaDB database is reachable via `DATABASE_URL` for the up/down/up rehearsal.
- [ ] Layer branch `claude/admin-pages-backend-proposal-f0c9fc-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order, and no schedule step here assumes one.

**Safety note (critical — impl doc §2, §3.2, §9).** Every wave and every gate in this schedule runs against a **scratch** database only. **No step here may point any agent at the live `portal` database.** Applying this revision to `portal` — including the review of DB-7's 55-row seed — is the proposal's human gate (b) / phase 4, and it is **downstream of the PR**, outside this schedule entirely. See §6.

**Exit signal (what this run produces):** DB-1 … DB-7 committed on the layer branch, the W-final validation and test wave green, PR opened against `claude/admin-pages-backend-proposal-f0c9fc`. **The orchestrator does not push, does not merge, does not apply the migration to any live database — the human owns all three.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two `DB-*` units. No edge references a `BE-*` or `FE-*` id; the cross-layer contract is impl doc §7 and this layer builds against that contract, not against a sibling's progress.

Edges are taken verbatim from each unit's `Dependencies:` field in impl §6 — none are invented and none are dropped.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — impl §6 states "none — parallel-safe (first unit in the new file)"; creates `app/models/access.py` and the two level enums |
| `DB-2` | `DB-1` | impl §6: same file, and `OverrideLevel` is declared in DB-1's enum block — DB-2's table references a symbol DB-1 introduces |
| `DB-3` | `DB-1` | impl §6: same file, shared imports — DB-3's two tables are appended to the module DB-1 creates |
| `DB-4` | — | root — impl §6 states "none — parallel-safe (independent of DB-1…DB-3)"; touches only `users.py` |
| `DB-5` | `DB-1` | impl §6: the module must exist to be imported — `main.py`'s registration line names `app.models.access` |
| `DB-6` | `DB-1`, `DB-2`, `DB-3`, `DB-4` | impl §6: the migration is the schema those four ORM units describe; authoring it first risks divergence |
| `DB-7` | `DB-6` | impl §6: same file — the seed `INSERT` is the last statement of DB-6's `upgrade()` |

**Graph invariants:**
- No cycles; the DAG is acyclic as stated.
- Every edge is intra-layer.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel — *logically*. File-level contention is a separate concern, resolved in §7 (DB-2 and DB-3 are logically independent of one another but share one file).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1`, `DB-4` | yes (2 parallel dispatches — different files) | — |
| W2 | `DB-2`, `DB-3`, `DB-5` | partly — `DB-5` in parallel; `DB-2` then `DB-3` **serialized** on `access.py` (§7) | W1 committed |
| W3 | `DB-6` | single dispatch | W2 committed |
| W4 | `DB-7` | single dispatch | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

W3 and W4 are single-unit waves by force of the DAG: DB-6 consumes all four ORM units, and DB-7 writes into the file DB-6 creates. Splitting the one Alembic revision across two waves (schema, then seed) is exactly the impl doc §3.2 commit discipline — schema first, seed second, against one file — and it is what keeps the shared migration file collision-free.

### Algorithm (pseudocode)

```
# W1
dispatch DB-1 and DB-4 IN PARALLEL
wait for BOTH to commit (barrier)
run wave gate checks (§6) — if red, STOP and report

# W2
dispatch DB-2 and DB-5 IN PARALLEL
wait for DB-2 to commit
dispatch DB-3 (rebases onto DB-2's commit first — §7)
wait for DB-3 and DB-5 to commit (barrier)
run wave gate checks (§6) — if red, STOP and report

# W3
dispatch DB-6
wait for DB-6 to commit (barrier)
run wave gate checks (§6) — if red, STOP and report

# W4
dispatch DB-7
wait for DB-7 to commit (barrier)
run wave gate checks (§6) — if red, STOP and report

# W-final
dispatch Validation agent and Test agent IN PARALLEL
wait for both to report
if both PASS: open PR against claude/admin-pages-backend-proposal-f0c9fc
else: STOP and report failures
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-1` | impl §6 DB-1 | `create: api-backend/app/models/access.py` | commit exists on layer branch |
| `DB-4` | impl §6 DB-4 | `modify: api-backend/app/models/users.py` | commit exists on layer branch |

**Barrier before W2:** both rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-2` | impl §6 DB-2 | `modify: api-backend/app/models/access.py` | commit exists on layer branch |
| `DB-3` | impl §6 DB-3 | `modify: api-backend/app/models/access.py` (same file as DB-2) | commit exists on layer branch, dispatched only after `DB-2`'s commit lands (§7) |
| `DB-5` | impl §6 DB-5 | `modify: api-backend/app/main.py` | commit exists on layer branch |

**Barrier before W3:** all three rows show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-6` | impl §6 DB-6 | `create: api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py` | commit exists on layer branch; the revision applies, reverses and re-applies cleanly on a **scratch** DB and `alembic heads` reports one head |

**Barrier before W4:** the row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W4
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-7` | impl §6 DB-7 | `modify: api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py` (the file `DB-6` created) | commit exists on layer branch; the seed's asserted counts hold on a **scratch** DB (impl §6 DB-7 "Done when") |

**Barrier before W-final:** the row above shows a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order from `api-backend/` — a failure blocks the next wave:

1. **Lint** — `ruff check .`
2. **Format check** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point; they run against the scratch/ephemeral DB only, never `portal`)

Combined CI gate command (impl doc §3.2), run from `api-backend/`:

```
ruff check . && ruff format --check . && mypy app && pytest -q
```

**Environment note:** this repo's Python environment is the venv at `api-backend\.venv\` — the system Python has no dependencies installed. Invoke the tools from that venv (e.g. `.\.venv\Scripts\alembic.exe`, and `ruff`/`mypy`/`pytest` likewise) rather than from a bare `python`.

**Gate coverage note (impl doc §3.2, pre-existing house carve-out):** `ruff` and `mypy` both exclude `alembic/`, so the W3 and W4 gates cover the revision file through `pytest -q` (§8) only. That is the existing convention, not a gap this schedule introduces — it is why W3's and W4's done-conditions name the scratch-DB rehearsal and the seed counts explicitly rather than leaning on lint.

**Human gates:**
- [ ] **None inside W1 → W-final.** Every wave is fully automated to PR against a scratch database.
- [ ] **Downstream of the PR, human-owned, and outside this schedule entirely: proposal phase 4 — applying the migration to the LIVE `portal` database after reviewing DB-7's 55-row seed.** No wave, gate or agent in this schedule performs it, and no step here may connect to `portal`. The human runs `alembic upgrade head` against the live DB and confirms the seed role by role against B-1's table, with the review question being *"is every difference on B-1's change list?"* — not *"did anything change"*. The deliberate day-one access changes to confirm at that gate: **D-10** PC × `mobo.post-trade-allocation` is `view` (a working read, mutations still 403); **D-13** PC keeps `edit` on `shared.monthly-reports` while RM and MOBO drop to `view` (the seed's only narrowing); **D-12** PM holds zero grants. Ordering rule from impl §9: the migration is applied **before** the Backend branch is deployed — the code that reads `page_access` must never be live while `page_access` is absent.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; a file listed by ≥ 2 units *in the same wave* must be resolved):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | — | — | none: `DB-1` creates `access.py`, `DB-4` modifies `users.py`. Truly parallel-safe. |
| W2 | `api-backend/app/models/access.py` | `DB-2`, `DB-3` | **Serialize within the wave.** Dispatch `DB-2` first, wait for its commit, then dispatch `DB-3`, which rebases onto it and re-reads the file. Both still land in W2 — a file-collision resolution, not a logical dependency, so §3 records no `DB-3 → DB-2` edge. `DB-5` (`main.py`) runs in parallel with both. |
| W3 | — | — | none: `DB-6` is the wave's only unit, and the revision file it creates is touched by no other unit in W3. |
| W4 | — | — | none: `DB-7` is the wave's only unit. |

**The single Alembic revision file** `api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py` is written by **two** units — `DB-6` (schema) and `DB-7` (seed). That is the layer's other real contention point, and it is already resolved by the `DB-7 → DB-6` dependency edge in §3, which puts the two units in **different waves** (W3, then W4). Serializing is the right answer for one Alembic revision: two agents editing one `upgrade()` body concurrently would produce a revision whose statement order is decided by a merge, and the proposal mandates exactly one revision, so the file cannot be split. No further action is needed in §7 — the wave boundary *is* the serialization.

**Rebase discipline within a wave** (applies to W2's `DB-2` → `DB-3`):
1. `DB-3`'s agent waits until `DB-2`'s commit is on the layer branch.
2. It runs `git pull --rebase` (against the **layer branch**, not `main`), re-reads `api-backend/app/models/access.py` (now carrying `PageAccessOverride`), then appends its two tables.
3. If the rebase conflicts, it resolves, re-runs unit tests, then commits. It **does not push**.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID in §3 (`DB-1` … `DB-7`) has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified as specified): `app/models/access.py` created; `app/models/users.py` and `app/main.py` modified; exactly one new file under `api-backend/alembic/versions/`.
- [ ] Public surface (impl §5 modules) matches the impl doc — imports resolve, `Base.metadata` carries all four new table names after importing the app bootstrap, no dangling references.
- [ ] **DB-specific invariants:**
  - [ ] The revision's `down_revision` is `b34f8c1a9d27`, and `alembic heads` reports a **single** head.
  - [ ] On a **scratch** DB: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` all clean, run in sequence without manual cleanup; after the downgrade none of the four tables and none of the four columns remains.
  - [ ] Post-upgrade schema has no autogenerate diff against `Base.metadata` for the four tables and four columns.
  - [ ] Seed counts on the scratch DB: **55 rows total**; by level `edit` **30** / `view` **25**; by role RM **7** / MOBO **10** / PM **0** / PC **10** / COMPLIANCE **12** / ADMIN **16**; ADMIN's 16 rows are all `edit`, one per page.
  - [ ] The three deliberate cells hold: `('mobo.post-trade-allocation','PC') = view` (D-10); `('shared.monthly-reports', RM|MOBO) = view` while `('shared.monthly-reports','PC') = edit` (D-13); PM has zero rows (D-12).
  - [ ] `AccessLevel` has exactly 2 members and `OverrideLevel` exactly 3 (the D-3 asymmetry); `AccountStatus` still has exactly 2 members; `grep -r "password_expires_at" api-backend/` returns nothing.
  - [ ] No step in this run connected to, migrated, or wrote to the live `portal` database.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q` (from `api-backend/`, via the `api-backend\.venv\` environment), against the ephemeral/scratch test DB only.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `DB-8`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Head moved:** if `alembic heads` no longer reports `b34f8c1a9d27` as the sole head when W3 starts, stop and report — re-chaining `down_revision` is an impl-doc edit (impl §6 DB-6), not an in-wave decision.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Waves W1 → W4 committed on the layer branch (`DB-1`,`DB-4` → `DB-2`,`DB-3`,`DB-5` → `DB-6` → `DB-7`, with `DB-2`/`DB-3` serialized per §7); every wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `claude/admin-pages-backend-proposal-f0c9fc`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened worktrees, or applied the migration to the live `portal` DB. The live apply and the seed review are the human's phase-4 gate, downstream of this PR. Hand-off complete.
