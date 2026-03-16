---
estimated_steps: 5
estimated_files: 1
---

# T01: Add _promptedFlowEnabled flag and wire it into handleSmartEntry/handleAutoEntry

**Slice:** S01 — Prompted flow in agent_end with confirmation messages
**Milestone:** M005

## Description

Add the `_promptedFlowEnabled` module-scoped flag to `issues.ts`, following the exact pattern of `_hooksEnabled` and `_autoRequested`. Wire it into `handleSmartEntry()` (set before scope prompt) and `handleAutoEntry()` (clear on entry). Integrate into `clearHookState()` so test cleanup works.

## Steps

1. Add `let _promptedFlowEnabled = false;` alongside the other module-scoped flags
2. Add `isPromptedFlowEnabled()`, `setPromptedFlowEnabled()`, `clearPromptedFlowEnabled()` exports matching the getter/setter/clearer pattern
3. In `handleSmartEntry()`, set `_promptedFlowEnabled = true` just before `preScopeMilestones = await scanMilestones(cwd)` (line 208 area). Only set it when NOT in auto mode — check `!_autoRequested` before setting, since `handleAutoEntry()` calls `handleSmartEntry()` and we don't want prompted flow active during auto.
4. In `handleAutoEntry()`, add `_promptedFlowEnabled = false` at the top of the function, before any other logic
5. In `clearHookState()`, add `_promptedFlowEnabled = false`

## Must-Haves

- [ ] Flag defaults to false
- [ ] Getter, setter, and clearer are exported
- [ ] `handleSmartEntry()` sets it (when not auto mode)
- [ ] `handleAutoEntry()` clears it
- [ ] `clearHookState()` clears it
- [ ] Existing tests unaffected

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — all existing tests pass
- `npx tsc --noEmit` — no type errors

## Inputs

- `src/commands/issues.ts` — existing module-scoped state pattern (lines 47-97)

## Expected Output

- `src/commands/issues.ts` — `_promptedFlowEnabled` flag with exports, wired into both entry handlers and clearHookState
