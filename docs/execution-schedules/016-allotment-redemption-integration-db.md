# 016 — Allotment & Redemption Integration · Execution Schedule — Layer: Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/016-allotment-redemption-integration-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Database — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `allotment-redemption-integration-db` — cut from parent `allotment-redemption-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/016-allotment-redemption-integration-db.md` |
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 1 — Database" |
| Sibling layer schedules | `docs/execution-schedules/016-allotment-redemption-integration-be.md`, `docs/execution-schedules/016-allotment-redemption-integration-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/016-allotment-redemption-integration-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-2` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Migration `deb8fd8a60b6` (0021_neutralize_recovered_head) is the current Alembic head on `main`/the parent branch, and the live `portal` DB is stamped at it (`alembic current` → `deb8fd8a60b6`). Any new revision authored in this layer must set `down_revision = "deb8fd8a60b6"` — never `"02f0f4296350"` directly (impl doc §3.1, §9).
- [ ] `api-backend/db-backups/portal_pre-016_2026-07-22.sql` exists and is untouched by this layer's work (impl doc §2).
- [ ] The frozen seam in impl doc §7 (verbatim copy of proposal § 4.1/4.2) is agreed and not under renegotiation.
- [ ] Layer branch `allotment-redemption-integration-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into the parent branch — the human decides the merge order, and no schedule step here assumes one.

**Safety note (critical — carried forward from impl doc §8.1/§9):** all tests in this layer run against an isolated/ephemeral test DB (in-memory SQLite, a throwaway schema, or a transaction rolled back at test end). **No step in this schedule may point any agent at the live `portal` database.** Applying the new migration to `portal` is a separate, human-owned action outside this schedule's scope entirely.

**Exit signal (what this run produces):** DB-1 and DB-2 committed on the layer branch, the W-final validation and test wave green, PR opened against `allotment-redemption-integration`. **The orchestrator does not push, does not merge, does not apply the migration to any live database — the human owns all three.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root — widens `AllotRdmpStatus`; impl doc §6 states "none — parallel-safe with DB-2 at the Python level" |
| `DB-2` | — | root — adds 4 columns + new Alembic revision; impl doc §6 states "none — parallel-safe with DB-1"; DB-2's migration references the DB-1 enum only in commentary, not a runtime dependency |

**Graph invariants:**
- No cycles.
- Both units are logically independent (no dependency edge between them) — but see §7: they are **not file-parallel-safe**, since both modify `api-backend/app/models/onboarding.py`. That collision is resolved at the wave-serialization level, not by adding a dependency edge — the impl doc is explicit that neither unit's *logic* depends on the other.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1`, `DB-2` | **no — serialized within the wave** (shared-file collision, §7); DB-1 commits first, then DB-2 | — |
| **W-final** | Validation + Test | yes (two dispatches) | W1 committed |

### Algorithm (pseudocode)

```
# W1: no true parallel dispatch — DB-1 and DB-2 both touch onboarding.py
dispatch DB-1 to its own agent
wait for DB-1 to commit
dispatch DB-2 to its own agent (rebases onto DB-1's commit first — see §7)
wait for DB-2 to commit
run wave gate checks (§6) — if red, STOP and report; do not advance

# W-final
dispatch Validation agent and Test agent IN PARALLEL
wait for both to report
if both PASS: open PR against allotment-redemption-integration
else: STOP and report failures
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-1` | impl §6 DB-1 — widen `AllotRdmpStatus` enum | `modify: api-backend/app/models/onboarding.py` | commit exists on layer branch |
| `DB-2` | impl §6 DB-2 — add 4 columns to `ClientAllotmentRedemption` + new Alembic revision (down_revision `deb8fd8a60b6`) | `modify: api-backend/app/models/onboarding.py` (same file as DB-1); `create: api-backend/alembic/versions/<new_hex>_0022_allotment_redemption_approval_columns.py` | commit exists on layer branch, dispatched only after DB-1's commit lands (§7) |

**Barrier before W-final:** both rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of the feature wave, run in order — a failure blocks W-final:

1. **Lint** — `ruff check .` (from `api-backend/`)
2. **Format check** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl doc §8 — DB-1's and DB-2's tests, run against the ephemeral/scratch test DB only, never `portal`)

Combined CI gate command (impl doc §3.2): `ruff check . && ruff format --check . && mypy app && pytest -q`

**Human gates:**
- [ ] none for W1 → W-final — fully automated to PR.
- [ ] **Outside this schedule's scope entirely:** applying the new migration to the live `portal` DB is a separate, explicit, human-owned step — never bundled into any wave or gate here.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `api-backend/app/models/onboarding.py` | `DB-1, DB-2` | **Serialize within the wave.** Dispatch `DB-1` first (simpler, foundational — pure enum-member widening, no new file). Wait for `DB-1`'s commit on the layer branch. Then dispatch `DB-2`, which rebases onto `DB-1`'s commit, re-reads `onboarding.py` (now containing the widened enum), and adds its 4 ORM columns to `ClientAllotmentRedemption` in the same file, plus the new Alembic revision file (`api-backend/alembic/versions/<new_hex>_0022_allotment_redemption_approval_columns.py`, untouched by DB-1). Both units still land in W1 — this is a file-collision resolution, not a logical dependency, so §3 records no edge between them. |

**Rebase discipline within W1 (DB-1 → DB-2):**
1. `DB-2`'s agent waits until `DB-1`'s commit is on the layer branch.
2. `DB-2`'s agent runs `git pull --rebase` (against the layer branch, not `main`), re-reads `api-backend/app/models/onboarding.py`, then adds its columns.
3. If `DB-2`'s rebase conflicts (unlikely — additive enum members vs. additive columns in different parts of the file), it resolves, re-runs unit tests, then commits. `DB-2`'s agent **does not push**.

**No other file is shared** — the Alembic revision file created by `DB-2` is new and touched by no other unit.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] `DB-1` and `DB-2` each have at least one commit on the layer branch.
- [ ] `api-backend/app/models/onboarding.py` reflects both: the 6-member `AllotRdmpStatus` enum (impl §6 DB-1) and the 4 new columns on `ClientAllotmentRedemption` (impl §6 DB-2).
- [ ] A single new file exists under `api-backend/alembic/versions/` with `down_revision = "deb8fd8a60b6"` (confirmed by inspection, not `"02f0f4296350"`).
- [ ] `alembic history` (against a scratch DB) shows one linear head — no branch point.
- [ ] `alembic upgrade head` and `alembic downgrade -1` both succeed against a scratch DB stamped at `deb8fd8a60b6`.
- [ ] No step in this run connected to, migrated, or wrote to the live `portal` database.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q` (from `api-backend/`), against the ephemeral/rolled-back test DB only.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `DB-3`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Wave W1 committed on the layer branch (`DB-1` then `DB-2`, serialized per §7); wave gate (§6) green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `allotment-redemption-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened worktrees, or applied the migration to the live `portal` DB. Hand-off complete.
