# 020 — Schema / Format Cleanup Refactor · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/020-schema-format-cleanup-refactor-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: **Backend** — one layer per file. Sibling layers run on their own branches from their own schedule docs.
> Branch: `schema-repository-refactor-bugfix-be` — cut from `schema-repository-refactor-bugfix` and merged back into it (human owns the merge).
> Worktrees: **none.** All work happens in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/020-schema-format-cleanup-refactor-be.md` |
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 2 — Backend, § Layer 4 — Test baseline |
| Sibling layer schedules | `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md`, `docs/execution-schedules/020-schema-format-cleanup-refactor-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/020-schema-format-cleanup-refactor-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-16` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `api-backend/.venv/` exists and resolves `ruff`, `mypy`, `pytest`, FastAPI, SQLAlchemy.
- [ ] A MySQL instance is reachable at `DATABASE_URL` (creds `portal/portalsecret`); alembic head is `c72e91a4f6b3`.
- [ ] The proposal's §4 seam is frozen; impl doc §7 is a verbatim copy of it.
- [ ] Layer branch `schema-repository-refactor-bugfix-be` cut from `schema-repository-refactor-bugfix` and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the `-db` or `-fe` schedules. The DB layer's fee migration and storage-key migration are explicitly **not** preconditions here (impl §2) — BE-13/BE-14 assume decimal-fraction fees and BE-5/BE-7 assume bucket-relative keys as seam facts, mocked in tests, never as a runtime dependency on the DB branch.

**Exit signal:** all `BE-*` units committed on the layer branch; the §3.2 gate green from `api-backend/`; exactly one known-failing test remains (`tests/libs/post_trade_allocation/test_be3_service_run.py:365`, proposal D-7, unskipped); PR opened against `schema-repository-refactor-bugfix`. **The orchestrator does not push, does not merge.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `BE-1` | — | Root. Clears the six pytest collection errors — nothing else's test signal is trustworthy until this lands. |
| `BE-2` | `BE-1` | The suite must collect before its shared-fixture failures can even be counted. |
| `BE-3` | `BE-2` | The mechanical renames land on symbols BE-2's `FakeIdentityService` consolidation introduces (`generate_invite_link`). |
| `BE-4` | `BE-1` | Deletes `tests/libs/reconciliation/test_be1_action.py`, which BE-1 already touched. |
| `BE-5` | — | Root, parallel-safe. New `app/core/storage.py` + `Bucket` registry. |
| `BE-6` | `BE-5` | Path containment lives inside `LocalStorage.open()`, which BE-5 creates. |
| `BE-7` | `BE-5` | Repoints every call site to `get_storage()`, which BE-5 defines. Not independently revertible from BE-5. |
| `BE-8` | `BE-5`, `BE-7` | `client_folder()` is called from the sites BE-7 repoints, against the registry BE-5 creates. |
| `BE-9` | — | Root, parallel-safe. The three exception handlers in `app/main.py`. |
| `BE-10` | `BE-4` | Row 13 of the status-code table sits in a file BE-4 edits (`app/libs/reconciliation/router.py`) — land BE-4 first so the line numbers are settled. |
| `BE-11` | `BE-9` | Uses `GENERIC_500` and the fallback handler BE-9 defines. |
| `BE-12` | `BE-9` | Same envelope BE-9 establishes. Not independently revertible from BE-9. |
| `BE-13` | — | Root, parallel-safe. Fee compare-and-set guard. |
| `BE-14` | — | Root, parallel-safe. Fee schema bounds. |
| `BE-15` | — | Root, parallel-safe. Entitlement check on client material download. (Touches the same function as BE-7's `app/libs/client_portal/service.py:263` — see §7; not a dependency edge, a same-file caution.) |
| `BE-16` | — | Root, parallel-safe. `response_model` on the two undeclared endpoints. |

**Graph invariants:** no cycles; every edge intra-layer; absence of an edge = safe to run in parallel subject to §7.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `BE-1, BE-5, BE-9, BE-13, BE-14, BE-15, BE-16` | yes (7 parallel dispatches) | — |
| W2 | `BE-2, BE-4, BE-6, BE-7, BE-11, BE-12` | yes (6 parallel dispatches) | W1 committed |
| W3 | `BE-3, BE-8, BE-10` | yes (3 parallel dispatches) | W2 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W3 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against schema-repository-refactor-bugfix
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| `BE-1` | Clear the six pytest collection errors | `delete: tests/libs/auth/test_be4_pta_actions.py`, `tests/libs/onboarding/test_be4_actions.py`, `tests/libs/eod/test_be6_pta_hook_and_action.py`, `tests/libs/reconciliation/test_be1_action.py`, `tests/libs/dev/test_be23_dev_register_service.py`, `tests/libs/dev/test_be24_dev_router_mount.py`; `modify: tests/libs/client_portal/test_be12_tickets.py` | `pytest -q --collect-only` exits 0 |
| `BE-5` | `app/core/storage.py` + the `Bucket` registry | `create: app/core/storage.py`; `delete: app/libs/trade_models/storage.py`; `modify: app/core/config.py` | commit exists on layer branch |
| `BE-9` | Three exception handlers in `app/main.py` | `modify: app/main.py` | commit exists on layer branch |
| `BE-13` | `Decimal` equality guard on the fee compare-and-set | `modify: app/libs/onboarding/service.py` | commit exists on layer branch |
| `BE-14` | `Field(ge=0, lt=1)` on the fee schemas | `modify: app/libs/trade_models/schemas.py` | commit exists on layer branch |
| `BE-15` | Entitlement check on client material download | `modify: app/libs/client_portal/{router,service,repository}.py` | commit exists on layer branch |
| `BE-16` | Declare `response_model` on the two undeclared endpoints | `modify: app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py` | commit exists on layer branch |

**Barrier before W2:** all rows above committed AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-2` | The two shared-fixture fixes (~264 failures) | `create: tests/conftest.py`; `modify: tests/cli/conftest.py`, `tests/libs/clients/conftest.py`, `tests/libs/staff/conftest.py`; auth-override fixtures across `tests/libs/{access,auth,clients,eod,onboarding,post_trade_allocation,reconciliation,staff,users}/` | commit exists on layer branch |
| `BE-4` | Delete the four unconsumed routes; keep every module | `modify: app/libs/reconciliation/router.py` (delete `get_reconciliation`/`_resolve_session`); `delete: app/libs/eod/router.py`; `modify: app/main.py` (drop the eod import/mount) | route count is 90; commit exists |
| `BE-6` | Path containment in `LocalStorage.open()` | `modify: app/core/storage.py` | commit exists on layer branch |
| `BE-7` | Repoint every call site to its bucket | `modify: app/libs/trade_models/{service,router}.py`, `app/libs/onboarding/service.py`, `app/libs/eod/service.py`, `app/libs/client_portal/service.py` | commit exists on layer branch |
| `BE-11` | Stop leaking `str(exc)` at 500 | `modify: app/core/security.py` | commit exists on layer branch |
| `BE-12` | Move the `access` conflict payload out of `detail` | `modify: app/libs/access/service.py` | commit exists on layer branch |

**Barrier before W3:** all rows above committed AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `BE-3` | The mechanical rename / signature tail | four `StaffService.enroll()` call sites in `tests/libs/staff/`; `dev_mode`/`WeasyPrintRenderer`/`generate_invite_link`/`not_started`/alembic-head/default-password tests; two grep-guard tests | `pytest -q` reports exactly one failure (`test_be3_service_run.py:365`, D-7) and zero errors |
| `BE-8` | `client_folder(name, uid, *, bucket)` — one definition | `modify: app/libs/onboarding/service.py`; `modify/delete: app/libs/onboarding/repository.py:265-277` | commit exists on layer branch |
| `BE-10` | The status-code corrections (13 sites) | `modify: app/core/security.py`, `app/libs/auth/deps.py`, `app/libs/auth/status.py`, `app/libs/access/service.py`, `app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py`, `app/libs/post_trade_allocation/router.py`, `app/libs/reconciliation/router.py` | commit exists on layer branch |

**Barrier before W-final:** all rows above committed AND wave-gate checks (§6) pass.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `.\.venv\Scripts\ruff.exe check .` && `.\.venv\Scripts\ruff.exe format --check .` (from `api-backend/`).
2. **Type-check** — `.\.venv\Scripts\mypy.exe app` (from `api-backend/`).
3. **Unit tests** — `.\.venv\Scripts\python.exe -m pytest -q` (from `api-backend/`). The failure count is expected to **decline across waves, not hit zero until W3**: ~255 failures after W1 (collection succeeds, BE-2's fixture fixes haven't landed), dropping to roughly a dozen after BE-2 (W2), then to exactly one named failure (`test_be3_service_run.py:365`, D-7) after BE-3 (W3). A wave gate at W1/W2 passes on "no *new* failures beyond the declining baseline", not on "zero failures" — only the W-final gate requires exactly one.
4. **Build / import smoke** — app boots (`uvicorn`/`TestClient(app)` construction succeeds); at W2's gate specifically, also assert route count is **90** and `GET /api/mobo/trade-records` still serves successfully (BE-4's own "Done when").

**Human gates:**
- [ ] None — fully automated to PR. (BE-3's own gate — "exactly one named failure remains" — is a mechanical assertion, not a human sign-off; it is called out in §2's exit signal and must be named in the PR body per impl §3.2.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map** (only same-wave collisions require action; cross-wave repeats are sequential by construction and need no resolution):

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| — | *(none)* | — | W1, W2 and W3 each touch a disjoint file set — verified against every unit's Files list. No same-wave collision exists in this layer's DAG. |

**Cross-wave notes (informational only, no action needed — sequencing already keeps these safe):**
- `app/main.py`: BE-9 (W1) then BE-4 (W2).
- `app/core/storage.py`: BE-5 (W1) then BE-6 (W2).
- `app/libs/onboarding/service.py`: BE-13 (W1) then BE-7 (W2) then BE-8 (W3).
- `app/libs/client_portal/service.py`: BE-15 (W1) then BE-7 (W2) — the pairing flagged in impl §6 as "sequence adjacently"; the wave barrier already enforces that.
- `app/core/security.py`: BE-11 (W2) then BE-10 (W3).
- `app/libs/access/service.py`: BE-12 (W2) then BE-10 (W3).
- `app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py`: BE-16 (W1) then BE-7 (W2, router.py only) then BE-10 (W3).

**If a future edit to the impl doc introduces a same-wave collision, resolve by either promoting one unit to the next wave (add a dep edge in §3) or serializing within the wave per the DB schedule's pattern (§7 there) — do not open a worktree.**

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

- [ ] Every unit ID BE-1 … BE-16 has at least one commit on the layer branch.
- [ ] Every "Files" entry from impl §6 matches the actual working-tree state.
- [ ] Public surface matches impl doc: `app/libs/reconciliation.{router,records,engine,presenter,dtos,formatting}`, `...algotrade.synth` and `app/models/recon.py` all still import successfully; `get_reconciliation`/`_resolve_session` are absent from `app/libs/reconciliation/router.py`.
- [ ] Route count is exactly **90**.
- [ ] `app/core/storage.py` imports nothing from `app.libs` (BE-5's layering invariant).
- [ ] No `HTTPException` in `app/` carries a dict `detail` except the one BE-12 explicitly moves out (source-level grep guard, impl §8.3 BE-12).

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs `.\.venv\Scripts\python.exe -m pytest -q` from `api-backend/`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Confirms the **exactly one** named failure is `tests/libs/post_trade_allocation/test_be3_service_run.py:365` (D-7) — any other failure is a regression, not the accepted exception.
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS** (with the single named D-7 failure explicitly accounted for, not silently absorbed into "PASS"). If either fails: do not open a PR; report every failure to the human; fixes are dispatched as a follow-up wave.

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** A red gate halts the algorithm at that wave.
- **New units mid-run:** add to the impl doc first (e.g. `BE-17`), then extend §3/§4/§5 here. Never dispatch an un-specified unit.
- **Scope change:** any edit to impl doc §7 (the seam) suspends this run until the `-db`/`-fe` layers acknowledge it.

---

## 10. Definition of done

- [ ] W1, W2, W3 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS (with D-7 named).
- [ ] PR opened against `schema-repository-refactor-bugfix`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
