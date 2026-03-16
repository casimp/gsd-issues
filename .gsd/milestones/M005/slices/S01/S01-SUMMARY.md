---
id: S01
parent: M005
milestone: M005
provides:
  - _promptedFlowEnabled flag with getter/setter/clearer following _hooksEnabled pattern
  - Prompted branch in agent_end sending pi.sendMessage() for sync (ROADMAP.md) and PR (SUMMARY.md) when prompted mode active
  - markSynced/markPrd dedup prevents re-prompting across agent_end cycles
  - clearHookState and handleAutoEntry clear prompted flow flag for isolation
  - 6 new tests covering prompted branch, mutual exclusion, dedup, unmapped skip, flag clearing
  - README updated to document /issues as continuous prompted flow
requires: []
affects: []
key_files:
  - src/commands/issues.ts
  - src/index.ts
  - src/commands/__tests__/issues.test.ts
  - README.md
key_decisions:
  - "D053: Prompted flow as parallel branch — separate from hooks, no code sharing via auto-accept toggle"
  - "D054: Mark prompted before sending — markSynced/markPrd called on send, not on user confirmation (fire-and-forget API)"
patterns_established:
  - Module-scoped boolean flags with getter/setter/clearer exports for cross-handler coordination
  - Prompted branch mirrors hooks section structure but sends messages instead of executing functions
  - Filter pi.sendMessage mock.calls by customType in tests to isolate prompted-flow assertions
observability_surfaces:
  - isPromptedFlowEnabled() — runtime state query for prompted mode
  - "gsd-issues:prompted-sync" customType on pi.sendMessage — inspectable sync prompt event
  - "gsd-issues:prompted-pr" customType on pi.sendMessage — inspectable PR prompt event
  - isSynced()/isPrd() — queryable dedup state after prompts sent
drill_down_paths:
  - .gsd/milestones/M005/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M005/slices/S01/tasks/T03-SUMMARY.md
  - .gsd/milestones/M005/slices/S01/tasks/T04-SUMMARY.md
duration: 38m
verification_result: passed
completed_at: 2026-03-14
---

# S01: Prompted flow in agent_end with confirmation messages

**Continuous prompted lifecycle for `/issues`: scope → prompted sync → work → prompted PR, with `pi.sendMessage()` confirmation prompts and once-per-milestone dedup.**

## What Happened

Added a `_promptedFlowEnabled` module-scoped flag to `issues.ts` (T01), wired into `handleSmartEntry()` (set when not auto), `handleAutoEntry()` (clear on entry), and `clearHookState()` (clear for test isolation). Follows the exact pattern of `_hooksEnabled` and `_autoRequested`.

Added a prompted branch to the `agent_end` handler in `index.ts` (T02). When `isPromptedFlowEnabled() && !isHooksEnabled()`, the handler scans for ROADMAP.md (unmapped → sync prompt) and SUMMARY.md (mapped → PR prompt), sending `pi.sendMessage()` with `triggerTurn: true` and distinguishable `customType` values. `markSynced()`/`markPrd()` are called before `sendMessage()` to prevent re-prompting — the extension can't await responses from `sendMessage()` (fire-and-forget).

Six tests (T03) cover: sync prompt sent, PR prompt sent, mutual exclusion with hooks, dedup via markSynced, unmapped milestone skips PR prompt, handleAutoEntry clears the flag. 330 total tests pass (324 existing + 6 new).

README (T04) updated to document `/issues` as the primary continuous flow, `/issues auto` as the auto-confirmed variant, and individual commands as standalone escape hatches.

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — 35/35 tests pass (29 existing + 6 new)
- `npx vitest run` — 330/330 tests pass across 18 test files
- `npx tsc --noEmit` — zero type errors

## Requirements Advanced

- R009 — Sync now surfaced as prompted step in the continuous `/issues` flow, not just the standalone `/issues sync` command. PR creation also prompted. Extends from command-only to continuous prompted lifecycle.

## Requirements Validated

- none (R009 remains active — runtime LLM prompt quality is UAT, not contract-provable)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- `pi.sendMessage()` is fire-and-forget — the extension marks milestones as prompted on send, not on user confirmation. If the user says "skip", the milestone won't be re-prompted. `/issues sync` and `/issues pr` remain available as manual fallback.
- LLM interpretation of the prompt message is not contract-testable. The first real `/issues` run validates whether the LLM relays the prompt correctly (UAT).

## Follow-ups

- none — M005 has a single slice

## Files Created/Modified

- `src/commands/issues.ts` — added `_promptedFlowEnabled` flag, getter/setter/clearer exports, wired into handleSmartEntry/handleAutoEntry/clearHookState
- `src/index.ts` — added prompted branch in agent_end handler (sync + PR prompts via pi.sendMessage)
- `src/commands/__tests__/issues.test.ts` — 6 new tests in "agent_end prompted flow" describe block
- `README.md` — rewrote workflow sections for continuous prompted flow, updated commands table

## Forward Intelligence

### What the next slice should know
- M005 has only one slice — no downstream work. This section is for future milestones.
- The `agent_end` handler now has three sections: scope completion detection, hooks (auto-sync/auto-PR), and prompted flow (sync/PR prompts). Any new agent_end logic should be placed after these with its own guard condition.

### What's fragile
- The prompted branch relies on dynamic imports aliased to avoid shadowing the hooks section's identically-named imports (`loadPromptMap`, `scanPrompt`, `readPromptFile`). Adding a fourth section with the same pattern would need its own aliases.

### Authoritative diagnostics
- Filter `pi.sendMessage` mock calls by `customType: "gsd-issues:prompted-sync"` or `"gsd-issues:prompted-pr"` — these are the definitive signal that prompted flow fired correctly.

### What assumptions changed
- No assumptions changed — the implementation matched the plan exactly.
