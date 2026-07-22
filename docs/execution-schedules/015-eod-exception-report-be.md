# 015 — End-of-Day Exception Report · Execution Schedule — Backend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/015-eod-exception-report-be.md` (the impl doc). This file **does not restate the spec** — it references unit IDs and orders their execution.
> Layer: Backend — **one layer per file.** Sibling layers run on their own branches from their own schedule docs.
> Branch: `<parent-branch>-be` — cut from the current/parent branch and merged back into it (human owns the merge). See `templates/implementation_details.md` §2 for the naming convention.
> Worktrees: **none.** All work happens in the main working tree on the layer branch — no `git worktree add`, no isolated checkouts.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/015-eod-exception-report-be.md` |
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 2 — Backend |
| Sibling layer schedules | `docs/execution-schedules/015-eod-exception-report-db.md`, `docs/execution-schedules/015-eod-exception-report-fe.md` |
| Prompt (dispatch harness) | `docs/prompts/015-eod-exception-report-be.md` |

**Unit ID space this schedule sequences:** `BE-1 … BE-10` (definitions live in the impl doc — do not restate them here).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] `eod_records`/`eod_break_records` tables applied to the working DB (Database layer's migration — the migration file/state, not a merged PR).
- [ ] The frozen seam (impl doc §7) is agreed and matches the proposal § 4 verbatim.
- [ ] `playwright install chromium` has been run in the local/dev environment (only needed to manually exercise BE-9's `ChromiumRenderer` end-to-end after W2 — every automated wave gate in this schedule mocks the renderer, per impl § 8.1, and does not require it).
- [ ] Layer branch `<parent-branch>-be` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** This schedule does not wait on the Database or Frontend schedules — it depends on the Database layer's **migration being applied to the working DB**, which can happen via a local migration run without that branch having merged. It does not wait on the Frontend schedule at all.

**Exit signal:** every unit in § 3 committed on the layer branch, the final validation wave green, PR opened against the parent branch. **The orchestrator does not push, does not merge — the human owns that.**

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| BE-1 | — | root — wire schemas, no internal dependency |
| BE-2 | — | root — `EodRepository`, only depends on DB layer's models (external, not a BE-* unit) |
| BE-3 | — | root (at import time) — calls `reconciliation.presenter`'s existing functions (external, not a BE-* unit) |
| BE-8 | — | root — `PdfRenderer` Protocol, no internal dependency |
| BE-4 | BE-1, BE-2, BE-3 | `EodService.build_day_view` assembles the schemas (BE-1), reads via the repository (BE-2), and merges rows via the presenter (BE-3) |
| BE-6 | BE-2 | `ensure_open` hook calls `EodRepository.ensure_open` (BE-2) |
| BE-7 | BE-2, BE-4 | `EodService.export` reads via the repository (BE-2) and extends the `EodService` class BE-4 creates — same file (`service.py`), must land after it (fixed in the impl doc; previously listed as `BE-2` only) |
| BE-9 | BE-8 | `ChromiumRenderer`/`WeasyPrintRenderer` implement the `PdfRenderer` Protocol (BE-8); `get_renderer()` selects between them |
| BE-5 | BE-2, BE-4, BE-9 | `EodService.sign_off` calls the repository (BE-2), extends the service class BE-4 creates, and calls `get_renderer()` (BE-9, not BE-8 directly — BE-9 is what actually exists to call) |
| BE-10 | BE-1, BE-4, BE-5, BE-6, BE-7 | routes wire all three service methods (`build_day_view` BE-4, `sign_off` BE-5, `export` BE-7) behind the gate BE-6 adds, using the schemas from BE-1 |

**Graph invariants:** no cycles. Every edge is between units in this same layer. BE-7 now formally depends on BE-4 (impl doc corrected) — the wave placement and § 7 serialization below already accounted for this file-state ordering and are unchanged.

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | BE-1, BE-2, BE-3, BE-8 | yes (4 units, 4 parallel dispatches) | — |
| W2 | BE-4, BE-6, BE-7, BE-9 | partially — BE-4 and BE-7 share a file and must serialize (§ 7); BE-6 and BE-9 are fully parallel with everything in this wave | W1 committed |
| W3 | BE-5 | no (single unit) | W2 committed |
| W4 | BE-10 | no (single unit) | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

### Algorithm (pseudocode)

```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch every unit in wave IN PARALLEL to its own agent
    (W2 exception: BE-4 dispatches first; BE-7 waits for BE-4's commit, then dispatches — see §7)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report; do not advance
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched (from impl doc) | Done when |
|---|---|---|---|
| BE-1 | impl §6.BE-1 — wire schemas | `create: api-backend/app/schemas/eod.py` | commit exists on layer branch |
| BE-2 | impl §6.BE-2 — `EodRepository` | `create: api-backend/app/libs/eod/repository.py` | commit exists on layer branch |
| BE-3 | impl §6.BE-3 — day-level merge presenter | `create: api-backend/app/libs/eod/presenter.py` | commit exists on layer branch |
| BE-8 | impl §6.BE-8 — `PdfRenderer` Protocol | `create: api-backend/app/libs/eod/pdf/base.py` | commit exists on layer branch |

**Barrier before W2:** all four rows above must show a commit on the layer branch AND wave-gate checks (§6) pass.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-4 | impl §6.BE-4 — `EodService.build_day_view` | `create: api-backend/app/libs/eod/service.py` | commit exists on layer branch — **dispatch first**, see § 7 |
| BE-6 | impl §6.BE-6 — auto-open hook + `Action.EOD_SIGNOFF` | `modify: api-backend/app/libs/post_trade_allocation/service.py`, `modify: api-backend/app/libs/auth/actions.py` | commit exists on layer branch |
| BE-7 | impl §6.BE-7 — `EodService.export` | `modify: api-backend/app/libs/eod/service.py` | commit exists on layer branch — **dispatch only after BE-4 commits**, see § 7 |
| BE-9 | impl §6.BE-9 — `ChromiumRenderer` + `get_renderer()` + reserved `WeasyPrintRenderer` stub | `create: api-backend/app/libs/eod/pdf/{chromium,weasyprint,__init__}.py`, `modify: api-backend/app/core/config.py`, `modify: api-backend/pyproject.toml` | commit exists on layer branch |

**Barrier before W3:** all four rows above must show a commit on the layer branch (BE-4 → BE-7 serialized per § 7) AND wave-gate checks (§6) pass.

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-5 | impl §6.BE-5 — `EodService.sign_off` | `modify: api-backend/app/libs/eod/service.py` | commit exists on layer branch |

**Barrier before W4:** as above.

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| BE-10 | impl §6.BE-10 — the three routes | `create: api-backend/app/libs/eod/router.py`, `modify: api-backend/app/main.py` | commit exists on layer branch |

**Barrier before W-final:** as above.

---

## 6. Wave gates (barriers between waves)

At the end of each feature wave, run in order — a failure blocks the next wave:

1. **Lint / format** — `cd api-backend && ruff check . && ruff format --check .`
2. **Type-check** — `cd api-backend && mypy app`
3. **Unit tests** — `cd api-backend && pytest -q` (impl doc § 8 — only tests for units already committed need pass at this point)
4. **Build / import smoke** — `cd api-backend && python -c "import app.libs.eod.router"` (W4 only — the router is the first point every module in the package must import cleanly together)

**Human gates:**
- [ ] none — fully automated to PR. (Confirming `playwright install chromium` is present in the **deployment image** before `ChromiumRenderer` is exercised in production, per impl § 9, is a deployment-time gate that happens after this PR merges — not a gate within this schedule, since every automated wave gate mocks the renderer.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map:**

| Wave | Shared file | Units contending | Resolution |
|---|---|---|---|
| W2 | `api-backend/app/libs/eod/service.py` | BE-4, BE-7 | serialize: dispatch BE-4 first (creates the file + `EodService` class + `build_day_view`), wait for its commit, **then** dispatch BE-7 (adds the `export` method to the now-existing class) — still within Wave W2. BE-7's agent runs `git pull --rebase` against the layer branch before starting, per § 7's rebase discipline below. |

**All other units in every wave touch distinct files** — BE-1/BE-2/BE-3/BE-8 (W1) and BE-6/BE-9 (W2) are fully parallel-safe with no collision.

**Rebase discipline within a wave** (when serializing on a shared file):
1. BE-7's agent waits until BE-4's commit is on the layer branch.
2. BE-7's agent runs `git pull --rebase` (against the layer branch, not `main`), re-reads `service.py`, then adds its `export` method.
3. If BE-7's rebase conflicts, it resolves, re-runs unit tests, then commits. It **does not push**.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent

Verifies static properties of the finished layer against impl doc §6 / §9:
- [ ] Every unit ID BE-1 through BE-10 has at least one commit on the layer branch.
- [ ] `api-backend/app/libs/eod/service.py`'s `EodService` class exposes `build_day_view`, `sign_off`, and `export` — all three methods present (confirms BE-4/BE-5/BE-7 all landed on the one shared file without one overwriting another).
- [ ] `GET /api/mobo/eod`, `POST /api/mobo/eod/sign-off`, `GET /api/mobo/eod/export` are all registered routes (`app.main`'s route table includes all three, gated as impl §6.BE-10 specifies).
- [ ] `Action.EOD_SIGNOFF in get_actions_for_role(AdminRole.MOBO)`.
- [ ] `get_renderer()` returns `ChromiumRenderer` by default and `WeasyPrintRenderer` when `PDF_RENDERER=weasyprint`; the latter's `.render()` raises `NotImplementedError`.
- [ ] No dangling references to removed/renamed symbols; imports resolve across the whole `app/libs/eod/` package.

Reports **PASS** or an explicit list of failures with file + line.

### 8.2 Test agent

- Runs the full unit-test suite from impl doc § 8: `cd api-backend && pytest -q tests/libs/eod/`.
- Reports pass/fail counts and any failing test's first traceback frame.
- Confirms no test in the suite launches a real headless browser or hits a real Next.js print route (impl § 8.1's layer-isolation rule for BE-9).
- Does **not** modify code.

### 8.3 W-final gate

Both agents must return **PASS**. If either fails:
- **Do not** open a PR.
- Report every failure back to the human. Fixes are dispatched as a follow-up wave (adds units to the impl doc — see § 9 below).

---

## 9. Change protocol (mid-run)

- **Red gate → stop.** Do not attempt fixes across waves; a red gate halts the algorithm at that wave.
- **New units mid-run:** if a fix requires new work, add the unit to the impl doc first (with an ID like `BE-11`), then extend § 3/§ 4/§ 5 of this file. Never dispatch an un-specified unit.
- **Scope change:** any edit to the impl doc's § 7 seam (cross-layer contract) suspends this run — sibling layers must acknowledge the seam change before this schedule resumes.

---

## 10. Definition of done

- [ ] Every wave W1…W4 committed on the layer branch; each wave gate green.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against parent branch.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened worktrees. Hand-off complete.
