# 018 — Client Portal ↔ Backend Integration · Execution Schedule — Layer: Database

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/018-client-portal-integration-db.md` (the impl doc). This file does not restate the spec — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Database — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-portal-integration-db` — cut from parent `client-portal-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/018-client-portal-integration-db.md` |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § "Layer 1 — Database" |
| Sibling layer schedules | `docs/execution-schedules/018-client-portal-integration-be.md`, `docs/execution-schedules/018-client-portal-integration-fe.md`, `docs/execution-schedules/018-client-portal-integration-admin-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/018-client-portal-integration-db.md` |

**Unit ID space this schedule sequences:** `DB-1 … DB-6` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Migration `fa66b2f3aee6` (0025_transaction_details) is the current Alembic head on `main`/the parent branch (`alembic heads` → `fa66b2f3aee6 (head)`, no branch point) — impl doc §2.
- [ ] The frozen seam in proposal §4.1/§4.2 is agreed — impl doc §7 is a verbatim copy, not a negotiation with a sibling layer.
- [ ] Layer branch `client-portal-integration-db` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `client-portal-integration` — the human decides the merge order, and no schedule step here assumes one.

**Exit signal (what this run produces):** DB-1 through DB-6 committed on `client-portal-integration-db`; the single new Alembic revision (`a9317a31b484_0026_client_portal_integration.py`) round-trips `upgrade`/`downgrade`/`upgrade` cleanly against a scratch DB; unit tests (impl §8) green; PR opened against `client-portal-integration`. **The orchestrator does not push, does not merge, does not apply the migration to the live `portal` DB — the human owns all three.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two Database-layer unit IDs. No edge may reference a sibling layer's unit ID.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `DB-1` | — | root; touches `onboarding.py` + the shared migration file, no dependency on any other unit's file state |
| `DB-2` | — | root; touches `users.py` + the shared migration file |
| `DB-3` | — | root; touches `post_trade_allocation.py` only, comment-only, no migration |
| `DB-4` | — | root within this layer (its only real precondition — Backend C-6 — is a **cross-layer deploy-order note**, not an intra-layer edge; see below) |
| `DB-5` | — | root; touches `pc.py` + the shared migration file |
| `DB-6` | `DB-2` | impl doc §6 DB-6 states its ORM block is "added immediately after `date_of_birth` (DB-2)" and explicitly reuses DB-2's `date`/`Date` import edit to `app/models/users.py` rather than repeating it (impl doc line: "DB-6 needs the same two names — since DB-2 lands first in file order, DB-6's contract does not repeat this import edit; it is done once, here"). This is a real file-ordering dependency in `app/models/users.py` even though the impl doc's own DB-6 "Dependencies:" line says "none" — overridden here per judgment call, not copied verbatim. |

**Cross-layer note (not a graph edge):** DB-4's backfill has a **deploy-order precondition** on Backend C-6 (the `set_verdict` write path) landing "with or before" this migration is applied to any *shared* DB — impl doc §6 DB-4 Dependencies. This is not an intra-layer edge (Backend C-6 is a different layer's unit) and does not block DB-4's *authorship* in this schedule; it only constrains when the resulting migration may be **applied** to a shared/live database, which is itself a human-owned gate (§6 below). No wave in this schedule waits on it.

**Graph invariants:**
- No cycles.
- The one real edge (`DB-6 → DB-2`) is confined to file-ordering within `app/models/users.py`, not a behavioral dependency — DB-6's columns do not read or reference DB-2's columns at runtime.
- Absence of an edge = safe to run in parallel, subject to the shared-migration-file collision protocol in §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `DB-1`, `DB-2`, `DB-3`, `DB-4`, `DB-5` | serialized within the wave for the shared migration file (§7) — `DB-3` is fully parallel (different file) | — |
| W2 | `DB-6` | solo (depends on `DB-2`'s file state) | W1 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W2 committed |

**Why not one flat wave:** the impl doc's per-unit "Dependencies: none" lines suggest a single wave, but §3's `DB-6 → DB-2` edge (file-ordering + import reuse in `app/models/users.py`) forces `DB-6` after `DB-2` is committed. Everything else in W1 has no such edge, but W1 itself requires internal serialization because five of its six units (`DB-1`, `DB-2`, `DB-4`, `DB-5`, plus `DB-6` in W2) all write to the **same single migration file** (§7) — only `DB-3` is untouched by that constraint.

### Algorithm (pseudocode)

```
for wave in [W1, W2, W_final]:
    dispatch every unit in wave (subject to §7 serialization within the wave)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-portal-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `DB-3` | impl §6 DB-3 — document `client_portfolios` missing-row invariant (comment only) | `api-backend/app/models/post_trade_allocation.py` | commit exists on layer branch; independent commit, no migration touched |
| `DB-1` | impl §6 DB-1 — `client_tickets` table + `TicketKind`/`TicketStatus` enums | `api-backend/app/models/onboarding.py`; `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | commit exists on layer branch |
| `DB-2` | impl §6 DB-2 — `client_profiles.occupation` + `.date_of_birth` | `api-backend/app/models/users.py`; `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | commit exists on layer branch |
| `DB-4` | impl §6 DB-4 — backfill `onboarding_documents.expires_at` | `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` (no model file) | commit exists on layer branch |
| `DB-5` | impl §6 DB-5 — `models.model_limit` nullable column | `api-backend/app/models/pc.py`; `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | commit exists on layer branch |

**Practical execution note for W1:** because `DB-1`, `DB-2`, `DB-4`, `DB-5` share the one migration file and the impl doc treats them as a single deploy unit (one Alembic revision, one shared `upgrade()`/`downgrade()`), the recommended dispatch is **one agent authors the full revision file incorporating all four units' DDL/backfill in one pass**, sequenced as: model-file edits for `DB-1`/`DB-2`/`DB-5` first (three different model files, truly parallel-safe), then a single serialized pass over the shared migration file adding all four units' `upgrade()`/`downgrade()` blocks in the order DB-1 → DB-2 → DB-4 → DB-5 (matching the impl doc's own presentation order), ending in one commit for the migration file. `DB-3` is dispatched independently and commits separately (no migration involvement).

**Barrier before W2:** every unit above shows a commit on the layer branch, `app/models/users.py` reflects DB-2's `date`/`Date` import edit, and wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `DB-6` | impl §6 DB-6 — seven RM relationship-management columns on `client_profiles`, added immediately after `date_of_birth`, reusing DB-2's import edit | `api-backend/app/models/users.py`; `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | commit exists on layer branch; migration's `downgrade()` includes DB-6's seven-column reversal alongside DB-1/DB-2/DB-4/DB-5's |

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `ruff check . && ruff format --check .` (run from `api-backend/`; note `pyproject.toml` excludes `alembic`, `.venv`, `pc_storage` — the migration file itself is not linted here, per impl doc §3.2)
2. **Type-check** — `mypy app` (same `alembic` exclude applies)
3. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point; this is the gate that does cover the migration file, per the house convention noted in impl doc §3.2)
4. **Build / import smoke** — implicit in `pytest -q` for this layer (no separate build step for a models/migration-only layer)

**Human gates** (a wave cannot advance past these without human sign-off):
- [ ] **Applying the new Alembic revision to the live `portal` DB is human-owned** — never done by a wave, never done from an agent session, per impl doc §3.2 ("Applying the migration to the live `portal` DB is a human-owned gate") and §9 Definition of done. This schedule's waves only ever run `alembic upgrade`/`downgrade` against a scratch/ephemeral DB (impl §8.1).
- [ ] **Deploy-order note (not a wave blocker, a live-environment constraint):** DB-4's backfill must not be applied to any shared/live DB before Backend C-6 has shipped there — the human applying the migration confirms this ordering at apply time, not this schedule's waves (impl doc §6 DB-4 Dependencies).

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W1 | `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | `DB-1, DB-2, DB-4, DB-5` | serialize within the wave: one agent authors the entire revision file in one pass (recommended, per §5's practical-execution note), incorporating all four units' DDL/backfill blocks in the order DB-1 → DB-2 → DB-4 → DB-5. If dispatched as separate agents instead, serialize strictly in that same order — each waits for the prior unit's commit, rebases, re-reads the file, then appends its block; never two agents editing the file concurrently. |
| W2 | `api-backend/app/models/users.py`, `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` | `DB-6` (contends with the state DB-2 left in W1, not with a same-wave peer) | no same-wave contention — `DB-6` is the sole W2 unit; it starts only after DB-2's commit (already the wave barrier) and appends immediately after `date_of_birth` in `users.py`, and appends its `op.add_column` block + `downgrade()` reversal to the same migration file DB-1/DB-2/DB-4/DB-5 already committed in W1. |

**W1's `DB-3` has no shared-file contention** — it is the only W1 unit not touching the migration file, and touches no file any other unit touches; fully parallel-safe alongside the serialized migration-file work.

**Rebase discipline within a wave** (when serializing on the shared migration file in W1, if dispatched as separate agents):
1. Contending agent (e.g. authoring `DB-2`'s block) waits until the prior unit's (`DB-1`'s) commit is on the layer branch.
2. It runs `git pull --rebase` (against the layer branch, not `main`), re-reads `a9317a31b484_0026_client_portal_integration.py`, then appends its `upgrade()`/`downgrade()` block.
3. If its rebase conflicts, it resolves, re-runs unit tests, then commits. It does **not** push.

**If the map is empty for a wave, all its units are truly parallel-safe** — not the case for W1's five migration-touching units, but true for `DB-3` within W1.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `DB-1`…`DB-6` has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified as specified) — `app/models/onboarding.py`, `app/models/users.py`, `app/models/pc.py`, `app/models/post_trade_allocation.py`, and the single new migration file `a9317a31b484_0026_client_portal_integration.py`.
- [ ] `a9317a31b484_0026_client_portal_integration.py`'s `down_revision` is exactly `"fa66b2f3aee6"` (impl doc §3.1 hard constraint, §9 Definition of done).
- [ ] `alembic history` shows one linear chain with no branch point.
- [ ] DB-6's scope boundary held: `rg` for any of its seven column names (`anniversary`, `spouse_name`, `children`, `personal_interests`, `communication_preferences`, `gift_hospitality_preferences`, `relationship_notes`) outside `app/models/users.py` and the migration file returns nothing (impl doc §6 DB-6 "Done when", §9).
- [ ] `model_limit` (DB-5) scope boundary held: `rg "model_limit"` across `app/libs/trade_models/**` and `admin-frontend/**` returns nothing (impl doc §6 DB-5 "Done when").
- [ ] Impl doc §7 (frozen seam) matches the proposal's §4 verbatim, checked against the proposal on the parent branch — not against sibling layer branches (impl doc §9).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q` (from `api-backend/`, against a scratch/ephemeral DB only — never the live `portal` DB).
- Additionally confirms the round-trip: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` is clean on a scratch DB (impl doc §9 Definition of done).
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `DB-7`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Wave W1 committed (`DB-1`, `DB-2`, `DB-3`, `DB-4`, `DB-5`) and its gate green.
- [ ] Wave W2 committed (`DB-6`) and its gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-portal-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, opened worktrees, or applied the migration to the live `portal` DB. Hand-off complete — human owns the merge and the live-migration apply.
