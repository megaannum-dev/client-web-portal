# 018 — Client Portal ↔ Backend Integration · Execution Schedule — Layer: Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/018-client-portal-integration-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution. If a spec detail changes, this file usually does not.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `client-portal-integration-be` — cut from `client-portal-integration` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/018-client-portal-integration-be.md` |
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/018-client-portal-integration-db.md`, `docs/execution-schedules/018-client-portal-integration-fe.md`, `docs/execution-schedules/018-client-portal-integration-admin-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/018-client-portal-integration-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-14` (definitions live in the impl doc — do not restate them here). No `BE-15` exists; the impl doc's own history amended a prior `BE-15` out, and this schedule confirms none remains to sequence.

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl doc §2 preconditions all green: the frozen seam (proposal § 4) is agreed and impl doc §7 is a verbatim copy of it.
- [ ] Layer branch `client-portal-integration-be` cut from `client-portal-integration` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.
- [ ] **Cross-layer note (deploy-ordering, not a dependency edge):** per impl doc §2 and §9, this layer's `BE-9` (writing `expires_at` in `OnboardingRepository.set_verdict`) and the Database layer's `DB-4` backfill migration touch the same column (`onboarding_documents.expires_at`) but on different sides — `BE-9` is safe to code and commit at any time (it fills a column that is `NULL` on 100% of rows before this unit ships), but any unit that is *exercised against a real database* while reading/writing `client_tickets`, `client_profiles.occupation`, `models.model_limit`, or a backfilled `expires_at` (`BE-2`, `BE-3`, `BE-5`, `BE-9`, `BE-10`, `BE-12`, `BE-13`) requires DB migration `a9317a31b484` applied first. This is a human-owned precondition on the *target environment*, not an intra-layer dependency edge — no row is added to §3 for it.

**Layer independence.** This schedule does **not** wait on any sibling layer's schedule. The cross-layer seam is frozen in the proposal and re-pinned in impl doc §7; sibling layers may run before, after, or concurrent with this one. All layer branches eventually merge back into `client-portal-integration` — the human decides the merge order.

**Exit signal (what this run produces):** every unit BE-1…BE-14 committed on `client-portal-integration-be`, the final validation wave green, PR opened against `client-portal-integration`. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

**STRICT RULE — intra-layer only.** Every edge below is between two Backend units in this impl doc. No edge references a sibling layer's unit ID; the DB-migration facts above are preconditions on the environment, not DAG edges.

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | root: creates the `client_portal` package skeleton every other unit extends |
| `BE-6` | — | root: `FileStorage.list()` + storage settings, touches only `trade_models`/`config` |
| `BE-8` | — | root: pure config change to `compliance_doc_config.py` |
| `BE-11` | — | root: value-only change to `onboarding/service.py`, independent of the new package |
| `BE-2` | `BE-1` | adds routes/service/repo methods into the package `BE-1` creates |
| `BE-3` | `BE-1` | adds routes/service/repo methods into the package `BE-1` creates |
| `BE-7` | `BE-6` | `list_documents`/`download_document` call `get_storage().list()`, added by `BE-6` |
| `BE-9` | `BE-8` | writes `expires_at` only for a spec with `periodic_review=True`; there is no such spec until `BE-8` flips it |
| `BE-12` | `BE-1` | adds ticket routes/service/repo methods into the package `BE-1` creates |
| `BE-4` | `BE-1`, `BE-3` | reuses `positions_for_client`'s model-join pattern introduced by `BE-3` |
| `BE-5` | `BE-1`, `BE-3` | `recommended_models` excludes ids from `positions_for_client`, added by `BE-3` |
| `BE-10` | `BE-8`, `BE-9` | the KYC renewal window is only meaningful once a periodic spec (`BE-8`) has a real `expires_at`-writing path (`BE-9`) |
| `BE-13` | `BE-12` | reuses `TicketKind`/`TicketStatus` and the ticket repository `BE-12` introduces |
| `BE-14` | `BE-1`, `BE-2`, `BE-3`, `BE-4`, `BE-5`, `BE-6`, `BE-7`, `BE-8`, `BE-9`, `BE-10`, `BE-11`, `BE-12`, `BE-13` | this unit is the audit + enforcement pass that runs after every route from every other unit exists |

**Graph invariants:**
- No cycles.
- Every edge is between Backend units.
- An edge means "must be **committed** before the dependent starts."
- Absence of an edge = safe to run in parallel.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1, BE-6, BE-8, BE-11` | yes (4 units, 4 parallel dispatches) | — |
| W2 | `BE-2, BE-3, BE-7, BE-9, BE-12` | yes, subject to §7 serialization on shared `client_portal` files | W1 committed |
| W3 | `BE-4, BE-5, BE-10, BE-13` | yes, subject to §7 serialization on shared `client_portal` files | W2 committed |
| W4 | `BE-14` | n/a (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against client-portal-integration
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | `client_portal` package skeleton + route relocation | create `app/libs/client_portal/{__init__.py,router.py,service.py,repository.py,schemas.py}`; modify `app/libs/onboarding/router.py`, `app/main.py` | commit exists on layer branch |
| `BE-6` | `FileStorage.list()` + storage settings | `app/libs/trade_models/storage.py`, `app/core/config.py` | commit exists on layer branch |
| `BE-8` | IPS becomes a periodic-review document | `app/libs/onboarding/compliance_doc_config.py` | commit exists on layer branch |
| `BE-11` | `uploaded_by` resolves to a display name | `app/libs/onboarding/service.py` | commit exists on layer branch |

**Barrier before W2:** all rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | Client profile GET/PATCH + RM contact | `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}` | commit exists on layer branch |
| `BE-3` | Portfolio GET | `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}` | commit exists on layer branch |
| `BE-7` | Document listing + allow-listed download | `app/libs/client_portal/{schemas.py,service.py,router.py}` | commit exists on layer branch |
| `BE-9` | `set_verdict` writes `expires_at` for periodic docs | `app/libs/onboarding/repository.py` | commit exists on layer branch |
| `BE-12` | Ticket create/list/status + RM scoping | `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}` | commit exists on layer branch |

**Barrier before W3:** all rows above must show a commit on the layer branch AND wave-gate checks (§6) pass. See §7 — `BE-2`/`BE-3`/`BE-7`/`BE-12` share `client_portal/{schemas.py,service.py,router.py}` (and `repository.py` for all but `BE-7`) and must be serialized per the resolution table below.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-4` | Portfolio history GET (calendar-month bucketing) | `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}` | commit exists on layer branch |
| `BE-5` | Recommended models GET + material download | `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}` | commit exists on layer branch |
| `BE-10` | Client KYC panel GET + renewal upload POST + 14-day window | `app/libs/client_portal/{schemas.py,service.py,router.py}`, `app/main.py` | commit exists on layer branch |
| `BE-13` | Merged request history GET | `app/libs/client_portal/{schemas.py,service.py,router.py}` | commit exists on layer branch |

**Barrier before W4:** all rows above must show a commit on the layer branch AND wave-gate checks (§6) pass. See §7 — all four units share `client_portal/{schemas.py,service.py,router.py}` and must be serialized per the resolution table below.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-14` | Authorization audit: token-derived subject, no id parameters | none of its own — router-introspection + `rg` import-direction check over files from `BE-1`…`BE-13` | commit exists on layer branch (the introspection test itself, run as part of §8, is the artifact; per impl doc this unit has no source files of its own) |

**Barrier before W-final:** row above committed AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave (impl doc §3.2):

1. **Lint** — `ruff check .`
2. **Format check** — `ruff format --check .`
3. **Type-check** — `mypy app`
4. **Unit tests** — `pytest -q` (impl doc §8 — only tests for units already committed need pass at this point)

Combined, per impl doc §3.2: `ruff check . && ruff format --check . && mypy app && pytest -q`.

**Human gates:**
- [ ] None inside this layer's own run — fully automated to PR. Applying DB migration `a9317a31b484` to a shared/real database is a human-owned action but is **not** a barrier internal to this schedule (per §2's cross-layer note): units that only touch existing tables/files (`BE-6`, `BE-7`, `BE-8`, `BE-11`, `BE-14`) have no such dependency, and the remaining units (`BE-2`, `BE-3`, `BE-5`, `BE-9`, `BE-10`, `BE-12`, `BE-13`) can be coded and unit-tested against a mocked/scratch DB per impl doc §8.1 before a real migration is applied. The human confirms the migration is applied before this branch's routes are exercised end-to-end against a live DB — but that confirmation is not required to advance any wave in this schedule.

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (union of §5 "Files touched" per wave; flag any file listed by ≥ 2 units in the same wave):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `app/libs/client_portal/schemas.py` | `BE-2, BE-3, BE-7, BE-12` | serialize in unit-ID order: `BE-2` → `BE-3` → `BE-7` → `BE-12`, each pulling and re-reading the file before its own additive edit (per impl doc §3.2, each unit's diff to this file is additive-only) |
| W2 | `app/libs/client_portal/service.py` | `BE-2, BE-3, BE-7, BE-12` | same order as above |
| W2 | `app/libs/client_portal/router.py` | `BE-2, BE-3, BE-7, BE-12` | same order as above |
| W2 | `app/libs/client_portal/repository.py` | `BE-2, BE-3, BE-12` | serialize in unit-ID order: `BE-2` → `BE-3` → `BE-12` (BE-7 does not touch this file) |
| W3 | `app/libs/client_portal/schemas.py` | `BE-4, BE-5, BE-10, BE-13` | serialize in unit-ID order: `BE-4` → `BE-5` → `BE-10` → `BE-13` |
| W3 | `app/libs/client_portal/service.py` | `BE-4, BE-5, BE-10, BE-13` | same order as above |
| W3 | `app/libs/client_portal/router.py` | `BE-4, BE-5, BE-10, BE-13` | same order as above |
| W3 | `app/libs/client_portal/repository.py` | `BE-4, BE-5` | serialize in unit-ID order: `BE-4` → `BE-5` (BE-10, BE-13 do not touch this file) |

**If the map is empty for a wave, all its units are truly parallel-safe.** W1 and W4 have no shared-file entries — every unit in those waves is parallel-safe.

**Rebase discipline within a wave** (when serializing on a shared file):
1. Contending agent B (next in unit-ID order) waits until A's commit is on the layer branch.
2. B runs `git pull --rebase` (against the layer branch, not `main`), re-reads the target file, then edits.
3. If B's rebase conflicts, B resolves, re-runs unit tests, then commits. B **does not push**.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID `BE-1`…`BE-14` has at least one commit on `client-portal-integration-be`.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state (created/modified as specified).
- [ ] Public surface (impl doc §5 modules) matches impl doc — imports resolve, no dangling references to removed symbols (`onboarding/router.py` no longer defines `/client/subscriptions`/`/client/events`).
- [ ] Layer-specific invariant: `app/libs/trade_models/schemas.py` diff is empty — no `model_limit` field added to `ModelCreate`/`ModelUpdate`/`ModelOut` (proposal Non-Goals).
- [ ] `rg -l "client_portal" app/libs/onboarding app/libs/trade_models` returns nothing (import-direction check, BE-14).
- [ ] No `/client/*` route in `client_portal/router.py` declares a path/query parameter named `client_id`/`user_id`/`onboarding_id` (BE-14 router-introspection check).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc §8: `pytest -q`.
- Additionally confirms the mandatory regression goal (impl doc §8.3, BE-9): the existing `tests/libs/onboarding/` suite passes with **zero edits**.
- Reports pass/fail counts and any failing test's first traceback frame.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see change protocol below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-15`), then extend §3/§4/§5 of this file. Never dispatch an un-specified unit. (Note: this proposal previously carried a `BE-15` that was deleted in an earlier amendment to the impl doc — a future `BE-15` here would be a fresh, unrelated unit, not a resurrection of the deleted one.)
- **Scope change:** any edit to the impl doc's §7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on `client-portal-integration-be`; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `client-portal-integration`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
