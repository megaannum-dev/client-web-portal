# 008 — Distinctive Symbols Column · Execution Schedule — Frontend

> Status: **DRAFT — pending execution.**
> Sequences: `docs/implementations/008-symbol-audit-trail-fe.md` (the impl doc). Does not restate the spec — orders unit IDs.
> Layer: Frontend (admin-frontend) — one layer per file.
> Branch: `distinctive-symbol-sections-fe` — cut from `distinctive-symbol-sections`, merged back (human owns merge).
> Worktrees: **none.** All work in the main working tree on the layer branch.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Implementation doc (this layer) | `docs/implementations/008-symbol-audit-trail-fe.md` |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 3 — Frontend |
| Sibling layer schedules | `docs/execution-schedules/008-symbol-audit-trail-db.md`, `docs/execution-schedules/008-symbol-audit-trail-be.md` |
| Prompt (dispatch harness) | `docs/prompts/008-symbol-audit-trail-fe.md` |

**Unit ID space this schedule sequences:** `FE-1 … FE-5` (definitions in the impl doc).

---

## 2. Preconditions & exit signal

**Entry preconditions:**
- [ ] Impl §2 preconditions green: §7 seam agreed. For live verification, a BE with the symbol routes + `symbol_audit` include is reachable (else develop against a mocked DTO per §7).
- [ ] Branch `distinctive-symbol-sections-fe` cut from parent and checked out.
- [ ] Working tree clean; no other schedule dispatching on this branch.

**Layer independence.** Runs on its own branch; does not wait on DB/BE schedules. Seam frozen in proposal §4 / impl §7 — the FE builds against the contract, mocking the seam where a live BE is absent.

**Exit signal:** FE-1..FE-5 committed; W-final green; PR opened against parent branch. Orchestrator does **not** push or merge.

---

## 3. Dependency graph (intra-layer only)

| Unit | Depends on | Reason for the edge |
|---|---|---|
| `FE-1` | — | root — DTO + view types + mapper |
| `FE-3` | — | root — server actions + endpoint paths |
| `FE-2` | `FE-1`, `FE-3` | `SymbolsTab` consumes the view types (FE-1) and calls the actions (FE-3) |
| `FE-4` | `FE-2` | panel renders `SymbolsTab` |
| `FE-5` | `FE-4` | chip deep-link targets the Symbols tab wired in FE-4 |

**Graph invariants:** acyclic; all edges intra-layer; an edge = "committed before dependent starts."

---

## 4. Wave schedule (the topological sort)

### Wave summary

| Wave | Units | Runs in parallel? | Depends on wave |
|---|---|---|---|
| W1 | `FE-1`, `FE-3` | yes (different files) | — |
| W2 | `FE-2` | single unit | W1 committed |
| W3 | `FE-4` | single unit | W2 committed |
| W4 | `FE-5` | single unit | W3 committed |
| **W-final** | Validation + Test | yes (two dispatches) | W4 committed |

### Algorithm
```
for wave in [W1, W2, W3, W4, W_final]:
    dispatch units (W1 parallel; W2–W4 single)
    wait for ALL units in wave to commit (barrier)
    run wave gate checks (§6) — if red, STOP and report
open PR against parent branch
```

---

## 5. Per-wave delegation

### Wave W1
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-1` | impl §6.FE-1 — DTO/view types + mapper | `admin-frontend/lib/pc/types.ts`, `admin-frontend/lib/pc/models.ts` | commit on layer branch |
| `FE-3` | impl §6.FE-3 — write actions + endpoints + detail include | `admin-frontend/server/endpoints.ts`, `admin-frontend/server/pc/index.ts` | commit on layer branch |

**Barrier before W2:** both committed AND §6 gate passes. Disjoint files → truly parallel.

### Wave W2
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-2` | impl §6.FE-2 — `SymbolsTab.tsx` | `admin-frontend/components/pc/model-management/SymbolsTab.tsx` (new) | commit on layer branch |

### Wave W3
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-4` | impl §6.FE-4 — wire tab into panel + caller | `admin-frontend/components/pc/model-management/ModelDetailPanel.tsx` (+ its caller page/hook) | commit on layer branch |

### Wave W4
| Unit | Brief | Files touched | Done when |
|---|---|---|---|
| `FE-5` | impl §6.FE-5 — clickable chips + Overview link | `admin-frontend/components/pc/Shared.tsx`, `.../ModelTable.tsx`, `.../CardGrid.tsx`, `.../OverviewTab.tsx` | commit on layer branch |

**Barrier before W-final:** FE-5 committed AND §6 gate passes.

---

## 6. Wave gates (barriers between waves)

Run in order at each wave boundary (from impl §3.2).

1. **Lint** — `cd admin-frontend && npm run lint`
2. **Type-check / build** — `npm run build` (Next.js build = tsc + bundle)
3. **Unit test** — FE-1 mapper test via the repo's FE runner **if configured**; otherwise covered by the build type-check + preview verification (impl §8).

**Human gates:**
- [ ] none — fully automated to PR. (Live preview verification of the Symbols tab is part of W-final validation, not a human sign-off.)

---

## 7. Shared-file / collision protocol (no worktrees)

**Shared-file map: empty.** W1's two units touch disjoint files (`lib/pc/*` vs `server/*`); W2–W4 are single-unit waves. FE-5's four files are all first touched in W4 by one unit. No file is written by ≥2 units in the same wave → all waves parallel-safe as scheduled.

**Rebase discipline** (if any late edit collides): agent waits for the prior commit, `git pull --rebase` against the layer branch, re-reads the file, edits, re-runs the gate, commits. No push.

---

## 8. Final Validation & Test wave (W-final)

### 8.1 Validation agent
- [ ] FE-1..FE-5 each have ≥1 commit on the layer branch.
- [ ] `Model.symbols` still typed `string[]` and mapped active-only (existing `Ticks` callers unchanged); `symbolBook`/`symbolAudit` added.
- [ ] `SymbolsTab.tsx` exists and is rendered by `ModelDetailPanel`; `Tab` union includes `"symbols"`.
- [ ] No weight shown in the Symbols tab UI (D-4); no `any` types added.
- [ ] `ChangesTab.tsx` unchanged (audit is a separate field, not mixed into `changes`).

Reports **PASS** or failures with file + line.

### 8.2 Test agent
- Runs `npm run lint` + `npm run build`, plus the FE-1 mapper unit test if a runner exists.
- Reports pass/fail; does not modify code.

### 8.3 W-final gate
Both agents **PASS** → open PR. Else report every failure; no PR.

---

## 9. Change protocol (mid-run)
- Red gate → stop at that wave.
- New unit → add to impl doc (`FE-6`…) first, then extend §3/§4/§5 here.
- Seam edit → suspend; proposal §4 changes first.

---

## 10. Definition of done
- [ ] W1..W4 committed; each gate green.
- [ ] W-final validation: PASS.
- [ ] W-final test: PASS.
- [ ] PR opened against parent branch.
- [ ] No push/merge/worktree. Hand-off complete.
