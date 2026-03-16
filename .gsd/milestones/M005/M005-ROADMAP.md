# M005: Continuous Prompted Flow

**Vision:** `/issues` walks the user through the full milestone lifecycle — scope, sync, work, PR — with confirmation prompts at each step, instead of stopping after scoping.

## Success Criteria

- `/issues` → scope → plan → "Sync to tracker?" prompt → work → "Create PR?" prompt. One continuous flow with user confirmation at each outward-facing action.
- `/issues auto` behavior unchanged — hooks fire automatically with no prompts.
- Individual commands (`/issues sync`, `/issues pr`) still work standalone.
- All existing 324 tests pass, new tests cover the prompted flow branch.
- Prompted flow and hooks mode are mutually exclusive — no double-sync or double-PR.

## Key Risks / Unknowns

- `pi.sendMessage()` prompt quality — the LLM must interpret the confirmation message and either ask the user or act on it. Worst case: user falls back to `/issues sync` manually, which is the current state. Not a code correctness risk.

## Verification Classes

- Contract verification: vitest tests for the new `agent_end` branch, flag management, and prompt message content
- Integration verification: none — the sync/PR functions are already proven
- Operational verification: none
- UAT / human verification: first real `/issues` run validates LLM interpretation of the sendMessage prompt

## Milestone Definition of Done

This milestone is complete only when all are true:

- `_promptedFlowEnabled` flag is set by `handleSmartEntry()` and cleared appropriately
- `agent_end` handler sends confirmation prompts via `pi.sendMessage()` for sync (ROADMAP.md) and PR (SUMMARY.md) when prompted mode is active
- Prompted mode and hooks mode are mutually exclusive (`_promptedFlowEnabled && !isHooksEnabled()`)
- Re-prompting is prevented via `markSynced()`/`markPrd()` tracking
- `handleAutoEntry()` clears `_promptedFlowEnabled` to prevent conflict
- README documents the continuous flow as the primary path
- All tests pass (existing + new)

## Requirement Coverage

- Covers: R009 (sync surfaced as prompted step — extends from command-only to continuous flow)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none — all other active requirements are M001/M002 concerns unrelated to M005

## Slices

- [x] **S01: Prompted flow in agent_end with confirmation messages** `risk:low` `depends:[]`
  > After this: `/issues` (bare) walks user through scope → prompted sync → work → prompted PR as a continuous flow with confirmation at each outward-facing action. Proven by 6+ new tests exercising the `agent_end` prompted branch alongside the existing 324 tests.

## Boundary Map

### S01

Produces:
- `_promptedFlowEnabled` flag with getter/setter/clearer exports following the `_hooksEnabled` pattern
- `agent_end` prompted branch: when `_promptedFlowEnabled && !isHooksEnabled()`, sends `pi.sendMessage()` prompts for sync (ROADMAP.md detected + unmapped) and PR (SUMMARY.md detected + mapped)
- `markSynced()`/`markPrd()` calls before sending prompts to prevent re-prompting
- `clearHookState()` also clears `_promptedFlowEnabled`
- `handleAutoEntry()` clears `_promptedFlowEnabled` on entry

Consumes:
- Existing `agent_end` handler structure (index.ts lines 476-626)
- Existing module-scoped state pattern (`_hooksEnabled`, `_autoRequested`, `markSynced`, `markPrd`)
- Existing `scanMilestones()`, `loadIssueMap()`, `findRoadmapPath()` utilities
- Existing test helpers (`setupExtension`, `writeMilestoneWithRoadmap`, `makePi`, `makeCtx`)
