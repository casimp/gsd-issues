---
estimated_steps: 8
estimated_files: 1
---

# T03: Tests for prompted flow

**Slice:** S01 — Prompted flow in agent_end with confirmation messages
**Milestone:** M005

## Description

Add tests for the prompted branch in `agent_end`. Use the existing `setupExtension()` and `writeMilestoneWithRoadmap()` test helpers. Cover the happy paths (sync prompt, PR prompt), mutual exclusion with hooks, re-prompt prevention, unmapped PR skip, and flag clearing by `handleAutoEntry`.

## Steps

1. Add a new `describe("agent_end prompted flow")` block in the hooks test section
2. Test: "sends sync prompt when ROADMAP.md exists and prompted flow is enabled" — import `setPromptedFlowEnabled` (or equivalent), enable it, write ROADMAP.md via helper, call `agentEndHandler()`, assert `pi.sendMessage` called with content containing the milestone ID and `/issues sync`, assert `syncMilestoneToIssue` NOT called
3. Test: "sends PR prompt when SUMMARY.md exists, mapped, and prompted flow is enabled" — enable prompted flow, write SUMMARY.md + ISSUE-MAP.json, call `agentEndHandler()`, assert `pi.sendMessage` called with content containing `/issues pr`
4. Test: "does not send prompts when hooks are enabled (mutual exclusion)" — enable both `_promptedFlowEnabled` and `_hooksEnabled`, write ROADMAP.md + config, call `agentEndHandler()` — `syncMilestoneToIssue` called (hooks path took over), prompted sendMessage NOT called
5. Test: "does not re-prompt for already-prompted milestones" — enable prompted flow, write ROADMAP.md, call `markSynced(mid)`, call `agentEndHandler()` — sendMessage NOT called for that milestone
6. Test: "skips PR prompt when milestone is unmapped" — enable prompted flow, write SUMMARY.md but no ISSUE-MAP.json, call `agentEndHandler()` — sendMessage NOT called for PR prompt
7. Test: "handleAutoEntry clears prompted flow flag" — call `setPromptedFlowEnabled()`, then `handleAutoEntry()`, assert `isPromptedFlowEnabled()` is false
8. Run full test suite to verify no regressions

## Must-Haves

- [ ] 6 new tests pass
- [ ] All existing 324 tests still pass
- [ ] Tests use existing helpers (setupExtension, writeMilestoneWithRoadmap)
- [ ] Tests clean up state in afterEach (clearHookState already handles it with T01's change)

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — all tests pass
- `npx vitest run` — full suite passes

## Inputs

- `src/commands/__tests__/issues.test.ts` — existing test structure and helpers (lines 689-1020)
- `src/commands/issues.ts` — T01's new flag exports
- `src/index.ts` — T02's new prompted branch

## Expected Output

- `src/commands/__tests__/issues.test.ts` — 6 new tests in "agent_end prompted flow" describe block

## Observability Impact

- **New test assertions on `pi.sendMessage` customType** — `"gsd-issues:prompted-sync"` and `"gsd-issues:prompted-pr"` are now verified in tests, ensuring the prompted-flow messages are distinguishable from hooks-path events
- **Dedup surface tested** — `markSynced()` / `markPrd()` prevent re-prompting; test "does not re-prompt" verifies this
- **Mutual exclusion tested** — `isPromptedFlowEnabled() && !isHooksEnabled()` guard verified in the mutual-exclusion test
- **Flag lifecycle tested** — `handleAutoEntry` clearing `_promptedFlowEnabled` is directly asserted via `isPromptedFlowEnabled()` getter
