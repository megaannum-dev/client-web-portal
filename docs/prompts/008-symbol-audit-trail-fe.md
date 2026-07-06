# 008 — `Distinctive Symbols Column` · Prompt — `Frontend`

> Status: **Ready to dispatch.**
> Drives: `docs/execution-schedules/008-symbol-audit-trail-fe.md` (waves) over `docs/implementations/008-symbol-audit-trail-fe.md` (units).
> Layer: `Frontend` (admin-frontend) — **one layer per prompt.** Paste into a **fresh** Claude Code session on the correct branch.
> Branch: `distinctive-symbol-sections-fe` — cut from `distinctive-symbol-sections`.
> Worktrees: **none.**

---

## 1. Identity & cross-references

| Reference | Location | Owns |
|---|---|---|
| Implementation doc (spec) | `docs/implementations/008-symbol-audit-trail-fe.md` | *what* to build (FE-1…FE-5 + contracts) |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-fe.md` | *what order* (waves, gates, collision protocol) |
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` | *why* + frozen cross-layer seam |
| This prompt | `docs/prompts/008-symbol-audit-trail-fe.md` | *who* runs it + *how* to drive the session |

**Read order at session start** (orchestrator, once): this file → impl doc §1-3 → impl doc §7 (frozen seam) → schedule doc §1-4. Do **not** read every feature body up front — pull per dispatch.

---

## 2. Branch & session contract

- **Layer:** `Frontend`.
- **First action (mandatory):**
  ```bash
  PARENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)   # expect: distinctive-symbol-sections
  LAYER_BRANCH="${PARENT_BRANCH}-fe"
  ```
  If already on `${LAYER_BRANCH}`, record `PARENT_BRANCH` as `distinctive-symbol-sections`.
- **Confirm branch state**: working tree clean, HEAD is `${LAYER_BRANCH}`, no other prompt session dispatching here.
- **Precondition:** §7 seam agreed. A live BE with the symbol routes + `symbol_audit` include is *nice-to-have* for verification; absent one, develop against a mocked DTO shaped per impl §7 (the seam is the contract).
- **No worktrees.** Schedule §7 shared-file map is empty — all waves parallel-safe as scheduled.
- **No push, no merge.** Stop at "PR opened."

---

## 3. Role

You are the **orchestrator** for the `Frontend` layer of proposal `008`. Your job:

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
| Layer working dir | `admin-frontend/` |
| Runtime | Node (Next.js app router, React, TypeScript, Tailwind) |
| Env activation | none — Node/npm on PATH |
| Package manager | npm (`admin-frontend/package-lock.json`) |
| Migration tool | n/a |
| DB URL env var | n/a (FE calls the BE via server actions / api-client) |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |
| Merge target (DO NOT push here) | `${PARENT_BRANCH}` (`distinctive-symbol-sections`) |

---

## 5. Global invariants (inherited by every sub-agent)

- **Data flow:** page/hook → `server/pc` server action → `server/api-client` → BE; DTO→view mapping lives only in `lib/pc/models.ts` (no derivation in components).
- **Server actions:** `"use server"`, return `APIResult<T>` (`{success, data}` | `{success:false, error, code}`).
- **Styling:** Tailwind + design-token CSS vars (`bg-surface-container`, `text-secondary`, …); radius remap — design `12→rounded-md`, `8→rounded`; icons from `@/lib/icons`.
- **View types stay string-first:** `Model.symbols: string[]` (active universe only); weight is not carried (D-4). New surface (`symbolBook`, `symbolAudit`, `SymbolsTab`) is additive.
- **Additive & backward-compatible first:** existing `Ticks` callers must keep compiling unchanged; no `any` types added; `ChangesTab` stays untouched (audit is a separate field).
- **Frozen seam:** the cross-layer contract in proposal §4 (= impl §7) is fixed. If a unit conflicts with it, **stop and report** — do not diverge.

---

## 6. Operating rules (non-negotiable)

- **The human owns `main` and owns merges.** Stop at "PR opened against `${PARENT_BRANCH}`."
- **No push** (orchestrator or sub-agent). `git push` hard-forbidden.
- **No worktrees.** `git worktree add` hard-forbidden.
- **No hook skipping.** `--no-verify` / `--no-gpg-sign` forbidden. On a hook failure, fix and make a **new** commit — never `--amend` past it.
- **No `git add -A` / `git add .`** — explicit file lists from the impl doc unit.
- **Do not read every impl feature up front.** Load bodies lazily per dispatch.
- **Red gate = stop.** No cross-wave fixes, no invented units.
- **Never modify sibling-layer files.** Scope is `admin-frontend/`. Do not touch `api-backend/**`. If a unit needs changes outside `admin-frontend/`, stop and report.

---

## 7. Delegation model — the sub-agent brief template

**Dispatch rule:** one Agent call per unit. Within a wave, dispatches go in a **single message** with parallel Agent calls (W1: FE-1 ‖ FE-3 — disjoint files). W2–W4 are single-unit. Across waves, always wait for the previous wave's commits + gate. Shared-file map is empty (schedule §7).

### 7.1 Brief template (fill and send)

```
You are a feature sub-agent for the Frontend layer of proposal 008.

CONTEXT (do not re-derive):
- Layer working dir: admin-frontend/
- Runtime + env: Node + npm; no env activation. Run commands from admin-frontend/.
- Shell: PowerShell (Bash also available); OS: Windows 11
- Branch you are committing to: ${LAYER_BRANCH}  (distinctive-symbol-sections-fe)
- Merge target (DO NOT push, DO NOT switch to): ${PARENT_BRANCH}  (distinctive-symbol-sections)

INVARIANTS (hold at every step):
- Data flow: component → server/pc action → api-client → BE; DTO→view mapping only in lib/pc/models.ts.
- Server actions "use server", return APIResult<T>.
- Tailwind + token CSS vars; radius remap 12→rounded-md, 8→rounded; icons from @/lib/icons.
- Model.symbols stays string[] (active only); no weight (D-4); new surface additive; existing Ticks callers unchanged; no `any`; ChangesTab untouched.
- Frozen seam (proposal §4 = impl §7) is fixed — if a contract conflicts, STOP and report.

TASK:
- Feature ID: <e.g. FE-2>
- Spec: read `docs/implementations/008-symbol-audit-trail-fe.md` §6 <FE-2>. That section is the CONTRACT — implement as specified, do not exceed scope.
- Files this unit is allowed to touch (from the impl doc unit):
  - <path> — <create | modify>
- Dependencies (already committed on ${LAYER_BRANCH}): <unit IDs or "none">.

STEPS:
1. Read every file listed above.
2. Read the frozen seam in impl doc §7 if this unit touches it.
3. Implement the contract from impl doc §6 <FE-2>.
4. Add the unit test(s) for <FE-2> from impl doc §8 if a FE test runner is configured; otherwise rely on the build type-check.
5. Run the gate: cd admin-frontend; npm run lint; npm run build. If red, fix and re-run. Do not commit red.
6. Stage ONLY the files listed above (no git add -A / git add .).
7. Commit with the message from impl doc §6 <FE-2> (or `<type>(fe): <summary> (<FE-ID>)`).
8. Report back: commit SHA, files changed, lint/build summary. Exit.

FORBIDDEN:
- git push, git worktree add, --no-verify, --amend past a hook failure.
- Editing any file outside the "allowed" list; editing api-backend/** (BE/DB layers).
- Reading the schedule doc or other unit specs — you own exactly <FE-2>.
```

### 7.2 W-final agents (validation + test)

Dispatched once, in parallel, after W4's gate is green. Use schedule §8.1 (validation) and §8.2 (test) as the briefs verbatim, each prefixed with the CONTEXT block from §7.1.

---

## 8. Execution loop

```
read impl doc §1-3 and §7
read schedule doc §1-4
capture PARENT_BRANCH, LAYER_BRANCH; verify branch state (§2)

for wave in schedule.waves + [W_final]:
    for unit in wave.units:
        dispatch sub-agent with §7.1 brief filled from impl doc §6 <unit>
    wait until every dispatched sub-agent reports a commit on LAYER_BRANCH
    run wave gate (schedule §6) — if red: STOP, report, exit
open PR against PARENT_BRANCH
report: units committed, gate summary, PR URL
STOP
```

---

## 9. Definition of done

- [ ] Every unit in impl §6 (FE-1…FE-5) has a commit on `${LAYER_BRANCH}`.
- [ ] Every wave gate (schedule §6) green when crossed.
- [ ] W-final validation agent: PASS.
- [ ] W-final test agent: PASS.
- [ ] PR opened against `${PARENT_BRANCH}`.
- [ ] Orchestrator has **not** pushed, force-pushed, merged, or opened a worktree.
- [ ] Final report delivered: units committed, gate summaries, PR URL.
