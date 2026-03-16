---
id: T03
parent: S01
milestone: M004
provides:
  - "`/issues auto` wired to smart entry → GSD auto-mode chain"
  - "Auto flag management (isAutoRequested, clearAutoRequested) for cross-module auto-mode coordination"
  - "Resume path: existing milestones → skip scope → dispatch `/gsd auto` directly"
  - "agent_end handler extended to chain scope completion into GSD auto when auto flag is set"
key_files:
  - src/commands/issues.ts
  - src/commands/__tests__/issues.test.ts
  - src/index.ts
key_decisions:
  - "Resume path dispatches `/gsd auto` immediately via sendMessage without setting the auto flag — no need for the flag when there's no scope to wait for"
  - "Auto flag cleared on both success (milestones created) and failure (no milestones) paths to prevent stuck auto state"
  - "Used `gsd-issues:auto-dispatch` customType for the `/gsd auto` message to distinguish it from the scope prompt (`gsd-issues:scope-prompt`)"
  - "Emits `gsd-issues:auto-start` event with trigger field (`resume` or `scope-complete`) so listeners can distinguish the two auto-start paths"
patterns_established:
  - "Module-level boolean flag with getter/clearer pattern (same as preScopeMilestones but for auto state)"
observability_surfaces:
  - "`gsd-issues:auto-start` event emitted when `/gsd auto` is dispatched — payload includes milestoneIds and trigger source"
  - "`isAutoRequested()` from `commands/issues.ts` — returns whether auto-mode is in progress (non-false = active)"
  - "`gsd-issues:auto-dispatch` customType on sendMessage — inspectable in mocks/logs to confirm `/gsd auto` was sent"
duration: 20m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Wire /issues auto to smart entry + GSD auto mode

**Wired `/issues auto` to run smart entry then chain into GSD auto-mode via `pi.sendMessage`, with resume shortcut for existing milestones.**

## What Happened

Added `handleAutoEntry` to `src/commands/issues.ts` with two paths:
1. **Resume path:** If milestones already exist on disk, skip scope entirely — emit `gsd-issues:auto-start` with `trigger: "resume"` and send `/gsd auto` via `pi.sendMessage` immediately.
2. **Scope-first path:** If no milestones exist, set `_autoRequested = true` flag and delegate to `handleSmartEntry`. The `agent_end` handler in `index.ts` then checks `isAutoRequested()` after scope completion — if true, sends `/gsd auto` and clears the flag.

Extended the `agent_end` handler in `index.ts` to: (a) check `isAutoRequested()` when new milestones are detected and dispatch `/gsd auto` if true, (b) clear the auto flag even when no milestones are created (prevents stuck state).

Re-wired `case "auto"` in the command handler switch in `index.ts` to route to `handleAutoEntry`.

Added 6 new tests covering: auto entry with no milestones, auto entry with existing milestone (resume), auto flag cleared after completion, non-auto path doesn't trigger GSD auto, auto flag cleared on scope failure, and routing verification through `index.ts`.

## Verification

- `npx vitest run -- --grep "issues command"` — 17 tests pass (8 smart entry + 3 scope detection + 6 auto entry)
- `npx vitest run` — 308 tests pass (all 18 test files)
- `grep -r 'handleAuto\b' src/ --include='*.ts'` — no references to old auto handler (only `handleAutoEntry`)
- `npx tsc --noEmit` — clean compilation
- Slice verification: all 5 slice-level checks pass (full suite, smart-entry tests, config tests, issues tests, config grep)

## Diagnostics

- **`gsd-issues:auto-start` event:** Listen for `{ milestoneIds, trigger }` to confirm auto-mode was dispatched. `trigger` is `"resume"` (existing milestones) or `"scope-complete"` (after scope).
- **`gsd-issues:auto-dispatch` message:** Inspect `pi.sendMessage` calls with this customType to verify `/gsd auto` was sent.
- **`isAutoRequested()`:** Call from any module to check if auto-mode is in progress. Returns `false` when idle.
- **Auto flag stuck state:** If scope completes with no milestones, auto flag is cleared — observable via `isAutoRequested()` returning `false`.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/commands/issues.ts` — Added `handleAutoEntry`, `_autoRequested` flag, `isAutoRequested()`, `clearAutoRequested()`
- `src/commands/__tests__/issues.test.ts` — Added 6 auto-entry tests in new describe block, updated afterEach to clear auto flag
- `src/index.ts` — Re-wired `case "auto"` to `handleAutoEntry`, extended `agent_end` handler with auto-mode chaining
- `.gsd/milestones/M004/slices/S01/tasks/T03-PLAN.md` — Added Observability Impact section
