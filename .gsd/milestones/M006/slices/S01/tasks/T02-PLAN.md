---
estimated_steps: 5
estimated_files: 2
---

# T02: Wire guard into handleSmartEntry and handleAutoEntry

**Slice:** S01 — Orphan Milestone Guard Utility and Entry Point Wiring
**Milestone:** M006

## Description

Add orphan milestone guard calls at the very top of both `handleSmartEntry()` and `handleAutoEntry()` in `src/commands/issues.ts`. When `findOrphanMilestones(cwd)` returns a non-empty list, display the orphan IDs via `ctx.ui.notify()` and return early. This prevents orphan milestones from being swept into `/issues` or `/issues auto` flows.

## Steps

1. Read `src/commands/issues.ts` to locate the exact top of `handleSmartEntry()` and `handleAutoEntry()`
2. Import `findOrphanMilestones` from `../lib/smart-entry`
3. Add guard at top of `handleSmartEntry()`: call `findOrphanMilestones`, if non-empty → notify with orphan list → return
4. Add guard at top of `handleAutoEntry()`: same pattern
5. Write tests in `src/commands/__tests__/issues.test.ts`: orphan blocks both handlers, clean state passes both, completed milestone not blocked, mapped milestone not blocked

## Must-Haves

- [ ] Guard is the first substantive check in `handleSmartEntry()` — before config or state detection
- [ ] Guard is the first substantive check in `handleAutoEntry()` — before scanMilestones or resume dispatch
- [ ] Block message via `ctx.ui.notify()` lists orphan milestone IDs
- [ ] Block message suggests resolution paths (`/issues sync` or remove/archive)
- [ ] Handler returns early after blocking — no fall-through
- [ ] All new tests pass alongside existing 330+ test suite
- [ ] `npx tsc --noEmit` reports zero errors

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` passes with new guard tests
- `npx vitest run` full suite passes (330+ existing + new)
- `npx tsc --noEmit` clean

## Inputs

- `src/lib/smart-entry.ts` — `findOrphanMilestones()` from T01
- `src/commands/issues.ts` — `handleSmartEntry()` and `handleAutoEntry()` function signatures and current top-of-function logic
- `src/commands/__tests__/issues.test.ts` — existing test patterns (makeUI, makeCtx, makePi, clearHookState, temp dirs)

## Expected Output

- `src/commands/issues.ts` — guard calls at top of both handler functions
- `src/commands/__tests__/issues.test.ts` — new describe block with 6+ test cases for orphan guard in both handlers
