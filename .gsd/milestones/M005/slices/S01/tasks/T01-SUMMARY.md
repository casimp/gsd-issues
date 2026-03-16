---
id: T01
parent: S01
milestone: M005
provides:
  - _promptedFlowEnabled module-scoped flag with getter/setter/clearer exports
  - Flag wired into handleSmartEntry (set when not auto), handleAutoEntry (clear), clearHookState (clear)
key_files:
  - src/commands/issues.ts
key_decisions:
  - Used direct _autoRequested check in handleSmartEntry rather than a parameter, matching the existing module-scoped flag pattern
patterns_established:
  - Prompted flow flag follows same getter/setter/clearer pattern as _hooksEnabled and _autoRequested
observability_surfaces:
  - isPromptedFlowEnabled() — runtime state query for agent_end and tests
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add _promptedFlowEnabled flag and wire it into handleSmartEntry/handleAutoEntry

**Added `_promptedFlowEnabled` module-scoped flag with getter/setter/clearer, wired into both entry handlers and clearHookState.**

## What Happened

Added `let _promptedFlowEnabled = false` alongside existing module-scoped flags in `issues.ts`. Exported `isPromptedFlowEnabled()`, `setPromptedFlowEnabled()`, and `clearPromptedFlowEnabled()` following the exact pattern of the `_hooksEnabled` and `_autoRequested` flags.

Wired into three locations:
1. `handleSmartEntry()` — sets `_promptedFlowEnabled = true` just before `preScopeMilestones` assignment, guarded by `!_autoRequested` so auto mode doesn't activate prompted flow
2. `handleAutoEntry()` — clears `_promptedFlowEnabled = false` as the first line of the function body
3. `clearHookState()` — clears `_promptedFlowEnabled = false` for test isolation

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — 29/29 tests pass ✓
- `npx tsc --noEmit` — no type errors ✓

### Slice-level verification (partial — T01 is intermediate)

- `npx vitest run src/commands/__tests__/issues.test.ts` — ✓ existing tests pass (new prompted-flow tests come in T03)
- `npx vitest run` — not run (no new test files to validate yet)
- `npx tsc --noEmit` — ✓ no type errors

## Diagnostics

- `isPromptedFlowEnabled()` — queryable at runtime to inspect flag state
- `clearHookState()` resets the flag — test isolation is guaranteed

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/commands/issues.ts` — added `_promptedFlowEnabled` flag, getter/setter/clearer exports, wired into handleSmartEntry, handleAutoEntry, clearHookState
- `.gsd/milestones/M005/slices/S01/S01-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
