---
id: T02
parent: S01
milestone: M005
provides:
  - Prompted branch in agent_end handler that sends confirmation messages for sync and PR
  - pi.sendMessage() calls with customType "gsd-issues:prompted-sync" and "gsd-issues:prompted-pr"
key_files:
  - src/index.ts
key_decisions:
  - Reused aliased dynamic imports (loadPromptMap, scanPrompt, readPromptFile) to avoid shadowing the hooks section's identically-named imports
  - Used display:false on sendMessage since the content is for the LLM to relay to the user, not a direct UI notification
patterns_established:
  - Prompted branch mirrors hooks section structure (config load, sync loop, PR loop) but sends messages instead of executing functions
  - markSynced/markPrd called before sendMessage — same dedup contract as hooks path
observability_surfaces:
  - "gsd-issues:prompted-sync" customType on pi.sendMessage — inspectable sync prompt event
  - "gsd-issues:prompted-pr" customType on pi.sendMessage — inspectable PR prompt event
  - isSynced()/isPrd() queryable after prompts sent — same dedup surface as hooks
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Add prompted branch to agent_end handler

**Added prompted branch to `agent_end` that sends `pi.sendMessage()` confirmation prompts for sync and PR when bare `/issues` scope flow was used.**

## What Happened

Added a new section in the `agent_end` handler (src/index.ts) after the existing hooks section. When `isPromptedFlowEnabled() && !isHooksEnabled()`, the handler:

1. Loads config (same pattern as hooks — no-op without config)
2. Scans milestones and checks ROADMAP.md existence + unmapped status → sends sync prompt via `pi.sendMessage()` with `customType: "gsd-issues:prompted-sync"`, milestone ID, and exact `/issues sync {mid}` command
3. Checks SUMMARY.md existence + mapped status → sends PR prompt via `pi.sendMessage()` with `customType: "gsd-issues:prompted-pr"`, milestone ID, and exact `/issues pr {mid}` command

Both prompts call `markSynced()`/`markPrd()` BEFORE `sendMessage()` to prevent re-prompting on subsequent `agent_end` fires. Both use `triggerTurn: true` so the LLM can relay the prompt to the user.

Added `isPromptedFlowEnabled` to the existing dynamic import destructure at the top of the `agent_end` handler.

## Verification

- `npx tsc --noEmit` — no type errors ✅
- `npx vitest run src/commands/__tests__/issues.test.ts` — 29 tests pass ✅
- `npx vitest run` — all 324 tests pass ✅
- Manual inspection of agent_end handler structure confirms correct placement and guard conditions ✅

## Diagnostics

- `pi.sendMessage()` with `customType: "gsd-issues:prompted-sync"` — fired when ROADMAP.md exists, milestone unmapped, not already prompted
- `pi.sendMessage()` with `customType: "gsd-issues:prompted-pr"` — fired when SUMMARY.md exists, milestone mapped, not already prompted
- `isSynced(mid)` / `isPrd(mid)` — queryable to verify dedup state after prompts sent
- Guard `isPromptedFlowEnabled() && !isHooksEnabled()` — queryable via getter functions

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/index.ts` — added prompted branch (lines 628-705) after hooks section in agent_end handler; added `isPromptedFlowEnabled` to dynamic import
- `.gsd/milestones/M005/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
