---
id: T03
parent: S01
milestone: M005
provides:
  - 6 tests covering prompted flow in agent_end — sync prompt, PR prompt, mutual exclusion, dedup, unmapped skip, flag clearing
key_files:
  - src/commands/__tests__/issues.test.ts
key_decisions:
  - Duplicated setupExtension/writeMilestoneWithRoadmap helpers into the new describe block rather than sharing across describe scopes, matching the pattern of the existing hooks test block
patterns_established:
  - Filter pi.sendMessage mock.calls by customType to assert prompted-flow messages independently of hooks-path events
observability_surfaces:
  - Tests assert on customType "gsd-issues:prompted-sync" and "gsd-issues:prompted-pr" — verifies prompt events are distinguishable
  - Tests verify markSynced/markPrd dedup prevents re-prompting
  - Tests verify isPromptedFlowEnabled() getter after handleAutoEntry clears it
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Tests for prompted flow

**Added 6 tests in "agent_end prompted flow" describe block covering sync prompt, PR prompt, mutual exclusion with hooks, dedup prevention, unmapped-milestone skip, and flag clearing by handleAutoEntry.**

## What Happened

Added a new `describe("agent_end prompted flow")` block at the end of `issues.test.ts` with its own `setupExtension()` and `writeMilestoneWithRoadmap()` helpers (duplicated from the hooks block to keep describe scopes independent). Six tests:

1. **Sync prompt** — enables prompted flow, writes ROADMAP.md, asserts `pi.sendMessage` called with `customType: "gsd-issues:prompted-sync"` and content containing `/issues sync`. Asserts `syncMilestoneToIssue` NOT called.
2. **PR prompt** — enables prompted flow, writes SUMMARY.md + ISSUE-MAP.json, asserts `pi.sendMessage` called with `customType: "gsd-issues:prompted-pr"` and content containing `/issues pr`.
3. **Mutual exclusion** — enables both prompted flow and hooks (via `handleAutoEntry`), asserts hooks path fires sync and prompted path does NOT send messages.
4. **No re-prompt** — pre-marks milestone as synced via `markSynced()`, asserts no sync prompt sent.
5. **Unmapped skip** — writes SUMMARY.md without ISSUE-MAP.json, asserts no PR prompt sent.
6. **Flag clearing** — sets prompted flow enabled, calls `handleAutoEntry()`, asserts `isPromptedFlowEnabled()` returns false.

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — 35 tests pass (29 existing + 6 new) ✅
- `npx vitest run` — 330 tests pass (324 existing + 6 new) ✅
- `npx tsc --noEmit` — no type errors ✅

## Diagnostics

- Filter `pi.sendMessage` mock calls by `customType` field to inspect prompted-flow messages in tests
- `clearHookState()` in afterEach guarantees test isolation — clears `_promptedFlowEnabled`, `_hooksEnabled`, and dedup sets

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/commands/__tests__/issues.test.ts` — added 6 tests in new "agent_end prompted flow" describe block
- `.gsd/milestones/M005/slices/S01/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
