# 020 — Schema / Format Cleanup Refactor · Execution Schedule — Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/020-schema-format-cleanup-refactor-db.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: **Database** — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `schema-repository-refactor-bugfix-db` — cut from `schema-repository-refactor-bugfix` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/020-schema-format-cleanup-refactor-db.md` |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 1 — Database |
| Sibling layer schedules | `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md`, `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/020-schema-format-cleanup-refactor-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-5` (definitions live in the impl doc — do not restate them here). **DB-4 is withdrawn** (proposal D-12, impl §1.1(3)) — it has no work unit and is not scheduled in any wave; it is retained below only as a zero-commit stub for traceability.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Alembic head on the target/scratch DB is `c72e91a4f6b3` (`0030_client_contact_logs`).
- [ ] A scratch MySQL database is reachable via `DATABASE_URL` and is disposable.
- [ ] The proposal's §4 seam is frozen; impl doc §7 is a verbatim copy of it.
- [ ] Layer branch `schema-repository-refactor-bugfix-db` cut from `schema-repository-refactor-bugfix` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the `-be` or `-fe` schedules. The seam is frozen in the proposal and re-pinned in impl doc §7. All three layer branches merge back into `schema-repository-refactor-bugfix` in whatever order the human chooses.

**Exit signal:** DB-1, DB-2, DB-3 and DB-5 committed on the layer branch; `alembic downgrade base && alembic upgrade head` green against the scratch DB; the §3.2 gate green; PR opened against `schema-repository-refactor-bugfix`. **The orchestrator does not push, does not merge.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | Root and prerequisite. Fixes the `0027` downgrade ordering bug; nothing else's rollback is verifiable without it. |
| `DB-2` | `DB-1` | Rollback verifiability — DB-2's `downgrade()` is only trustworthy once DB-1's ordering fix is in place. |
| `DB-3` | `DB-1` | Same rollback-verifiability reason. Independent of DB-2 and DB-5. |
| `DB-5` | `DB-1` | Same rollback-verifiability reason. Independent of DB-2 and DB-3. |
| `DB-4` | — | **Withdrawn.** No commit, no wave. Retained as a heading only (impl §6). |

**Graph invariants:** no cycles; every edge intra-layer; absence of an edge = safe to run in parallel **subject to the §7 shared-file resolution below** (DB-2/DB-3/DB-5 share one revision file).

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1` | n/a (single unit) | — |
| W2 | `DB-2`, `DB-3`, `DB-5` | **serialized** (shared file — see §7) | W1 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W2 committed |

### Algorithm (pseudocode)

```
dispatch DB-1 alone; wait for commit; run wave gate (§6)
for unit in [DB-2, DB-3, DB-5]:            # serialized, not parallel — shared file
    dispatch unit; wait for commit
run wave gate (§6) — if red, STOP
dispatch Validation + Test in parallel; wait for both
if both PASS: open PR against schema-repository-refactor-bugfix
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-1` | Reorder `0027`'s `downgrade()`: FK before unique constraint | `modify: api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py` (`downgrade()`, `:61-68`); `audit (read-only): api-backend/alembic/versions/*.py` | commit exists on layer branch; `alembic downgrade base && alembic upgrade head` round-trip green |

**Barrier before W2:** DB-1 committed AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-2` | Migrate fee columns to the decimal-fraction scale | `create: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`; `modify: api-backend/app/models/pc.py` (`:102-103`, `:224-225`), `api-backend/app/models/onboarding.py` (`:92-93`) | commit exists; **human row-count review** (impl §6 step 5 log output) signed off before the next unit edits the same file |
| `DB-3` | Strip bucket prefixes from three `storage_key` columns | `modify: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py` | commit exists on layer branch |
| `DB-5` | `client_profiles`: drop `id`, promote `user_id` to primary key | `modify: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`, `api-backend/app/models/users.py` (`:143-149`) | commit exists on layer branch |

**Dispatch order within W2 (serialized, not parallel — see §7):** DB-2 → DB-3 → DB-5.

**Barrier before W-final:** all three rows above show a commit on the layer branch AND wave-gate checks (§6) pass.

*Not scheduled — DB-4 (withdrawn):* no commit is produced. The one residual assertion its withdrawal leaves behind (`recon_sessions`, `algotrade_orders`, `algotrade_executions` all still exist after `upgrade()`; `allocation_model_snapshots` keeps its composite PK) is folded into the W-final test wave, not a wave of its own.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `.\.venv\Scripts\ruff.exe check .` && `.\.venv\Scripts\ruff.exe format --check .` (run from `api-backend/`; `alembic/` is excluded by `pyproject.toml`, so this stage is a no-op for migration files and real for `app/models/*.py`).
2. **Type-check** — `.\.venv\Scripts\mypy.exe app` (run from `api-backend/`; `alembic` excluded).
3. **Unit tests** — `.\.venv\Scripts\python.exe -m pytest -q` (run from `api-backend/`). **Caveat carried from impl §3.2:** until BE-1 (sibling layer) lands, this stage aborts at collection with 6 import errors — treat a green run here as "collection succeeded and the migration tests passed", not as the full suite.
4. **Migration round-trip smoke** — `alembic downgrade base && alembic upgrade head` against the scratch DB. This is DB-1's own acceptance criterion (§8.3) and must be re-run at every wave boundary, not only at the end.

**Human gates:**
- [ ] **DB-2's row-count review (within W2).** The migration logs five row-count values at INFO (impl §6 step 5) before it is committed. A human reviews these counts before DB-3 or DB-5 touch the same revision file — a surprising number here is the last chance to catch it before the file grows further.
- [ ] **DB-3's deploy-time directory move is NOT a wave gate.** It is a physical filesystem move (`crm_filesystem/models_mrkt_materials/*` → the marketing bucket root, etc.) that must be paired with DB-3's UPDATE statements **at actual deploy time**, after this branch merges — not during this schedule's build waves. Flagged here so the human doesn't mistake DB-3's green wave gate for "safe to deploy standalone."

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py` | `DB-2, DB-3, DB-5` | Serialize: dispatch DB-2 first, then DB-3, then DB-5 — each commits its own `# --- DB-N ---` banner block (impl §3.2) into the same growing file before the next starts. |

**W1 has no shared files — trivially parallel (single unit).**

**Rebase discipline within W2:**
1. DB-3 waits until DB-2's commit is on the layer branch; DB-5 waits until DB-3's commit is on the layer branch.
2. Each waiting agent runs `git pull --rebase` (against the layer branch, not `main`), re-reads `a3f7c1d9e824_0031_schema_format_cleanup.py`, then adds its own `upgrade()`/`downgrade()` block.
3. If a rebase conflicts, the agent resolves, re-runs the migration round-trip smoke test, then commits. It does **not** push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

- [ ] DB-1, DB-2, DB-3, DB-5 each have at least one commit on the layer branch.
- [ ] `api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py` contains three separately-bannered blocks (`# --- DB-2 ---`, `# --- DB-3 ---`, `# --- DB-5 ---`).
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state.
- [ ] No revision in `alembic/versions/` (old or new) drops an index/unique constraint before the FK that depends on it — the invariant DB-1 exists to establish repo-wide.
- [ ] `recon_sessions`, `algotrade_orders`, `algotrade_executions` all still exist; `allocation_model_snapshots` still carries its composite PK `(period_id, user_id, model_id)` — the DB-4-withdrawal guard, asserted once here rather than as its own unit.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs `.\.venv\Scripts\python.exe -m pytest -q` from `api-backend/`, plus the explicit `alembic downgrade base && alembic upgrade head` round-trip against the scratch DB (impl §8.3 DB-1's acceptance criterion — the aggregate pytest exit code alone does not prove this).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails: do not open a PR; report every failure to the human; fixes are dispatched as a follow-up wave.

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** A red gate halts the algorithm at that wave.
- **New units mid-run:** add to the impl doc first (e.g. `DB-6`), then extend §3/§4/§5 here. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (the seam) suspends this run until the `-be`/`-fe` layers acknowledge it.

---

## 10. Definition of done

- [ ] W1 and W2 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `schema-repository-refactor-bugfix`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
