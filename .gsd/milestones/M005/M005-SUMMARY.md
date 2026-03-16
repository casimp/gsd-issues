---
id: M005
provides:
  - Continuous prompted flow for /issues — scope → prompted sync → work → prompted PR
  - _promptedFlowEnabled flag with getter/setter/clearer following _hooksEnabled pattern
  - Prompted branch in agent_end handler sending pi.sendMessage() for sync and PR confirmations
  - markSynced/markPrd dedup prevents re-prompting across agent_end cycles
  - Mutual exclusion between prompted flow and hooks mode
  - README updated to document /issues as continuous prompted flow primary path
key_decisions:
  - "D053: Prompted flow as parallel branch — separate from hooks, no code sharing via auto-accept toggle"
  - "D054: Mark prompted before sending — markSynced/markPrd called on send, not on user confirmation (fire-and-forget API)"
patterns_established:
  - Prompted branch mirrors hooks section structure but sends messages instead of executing functions
  - Module-scoped boolean flags with getter/setter/clearer exports for cross-handler coordination
  - Filter pi.sendMessage mock.calls by customType in tests to isolate prompted-flow assertions
observability_surfaces:
  - isPromptedFlowEnabled() — runtime state query for prompted mode
  - "gsd-issues:prompted-sync" customType on pi.sendMessage — inspectable sync prompt event
  - "gsd-issues:prompted-pr" customType on pi.sendMessage — inspectable PR prompt event
  - isSynced()/isPrd() — queryable dedup state after prompts sent
requirement_outcomes: []
duration: 38m
verification_result: passed
completed_at: 2026-03-14
---

# M005: Continuous Prompted Flow

**`/issues` now walks through the full milestone lifecycle — scope → prompted sync → work → prompted PR — with `pi.sendMessage()` confirmation prompts at each outward-facing action, completing the "start from work" vision.**

## What Happened

M004 delivered smart entry and auto-mode hooks, but bare `/issues` abandoned the user after scoping — they had to know to run `/issues sync` and `/issues pr` separately. M005 closed that gap with a single slice.

Added a `_promptedFlowEnabled` module-scoped flag to `issues.ts`, set by `handleSmartEntry()` (non-auto entry), cleared by `handleAutoEntry()` and `clearHookState()`. This follows the exact pattern of `_hooksEnabled` and `_autoRequested`.

Added a prompted branch to the `agent_end` handler in `index.ts`. When `isPromptedFlowEnabled() && !isHooksEnabled()`, the handler scans for ROADMAP.md (unmapped milestone → sync prompt) and SUMMARY.md (mapped + completed → PR prompt), sending `pi.sendMessage()` with `triggerTurn: true` and distinguishable `customType` values (`gsd-issues:prompted-sync`, `gsd-issues:prompted-pr`). `markSynced()`/`markPrd()` are called before `sendMessage()` to prevent re-prompting — the extension can't await responses from `sendMessage()` (fire-and-forget).

Six new tests cover: sync prompt sent, PR prompt sent, mutual exclusion with hooks, dedup via markSynced, unmapped milestone skips PR prompt, handleAutoEntry clears the flag. README updated to document `/issues` as the primary continuous flow.

## Cross-Slice Verification

Single-slice milestone. All success criteria verified:

1. **Continuous flow**: `/issues` → scope → prompted sync → work → prompted PR. The `agent_end` prompted branch detects ROADMAP.md (sync prompt) and SUMMARY.md (PR prompt) via `pi.sendMessage()`. Proven by 6 new tests filtering `pi.sendMessage` mock calls by `customType`.

2. **`/issues auto` unchanged**: 324 existing tests pass unmodified. Mutual exclusion guard (`_promptedFlowEnabled && !isHooksEnabled()`) prevents prompted branch from firing when hooks are active. `handleAutoEntry()` clears `_promptedFlowEnabled` on entry. Dedicated test confirms.

3. **Individual commands still work**: All existing command tests (sync: 11, pr: 11, close: 8, import: 16, setup: 15) pass unchanged.

4. **Test coverage**: 330/330 tests pass across 18 test files (324 existing + 6 new). `npx tsc --noEmit` zero errors.

5. **Mutual exclusion**: Guard condition `_promptedFlowEnabled && !isHooksEnabled()` ensures no double-sync or double-PR. Dedicated mutual exclusion test confirms hooks path takes precedence.

## Requirement Changes

No requirement status transitions. R009 (Sync surfaced as prompted step) was extended from command-only to continuous prompted flow, but remains active — runtime LLM prompt quality requires UAT validation, which is not contract-provable.

## Forward Intelligence

### What the next milestone should know
- The `agent_end` handler now has three sections: scope completion detection, hooks (auto-sync/auto-PR), and prompted flow (sync/PR prompts). Any new `agent_end` logic should be placed after these with its own guard condition.
- All five milestones (M001–M005) are code-complete. The extension covers the full lifecycle from provider abstraction through continuous prompted flow. Future work is likely UAT, polish, or new capabilities (sub-issues, keyboard shortcuts).

### What's fragile
- The prompted branch relies on dynamic imports aliased to avoid shadowing the hooks section's identically-named imports. Adding a fourth section with the same pattern would need its own aliases.
- `pi.sendMessage()` is fire-and-forget — marking on send means a user "skip" leaves the milestone un-synced with no re-prompt. `/issues sync` and `/issues pr` remain manual fallbacks.

### Authoritative diagnostics
- Filter `pi.sendMessage` mock calls by `customType: "gsd-issues:prompted-sync"` or `"gsd-issues:prompted-pr"` — definitive signal that prompted flow fired correctly.
- `isPromptedFlowEnabled()` runtime query confirms mode state.
- 330/330 tests, 18 test files, zero type errors — the full regression baseline.

### What assumptions changed
- No assumptions changed — the implementation matched the plan exactly. The `agent_end` handler structure and module-scoped flag pattern from M004 scaled cleanly to the prompted flow use case.

## Files Created/Modified

- `src/commands/issues.ts` — added `_promptedFlowEnabled` flag, getter/setter/clearer exports, wired into handleSmartEntry/handleAutoEntry/clearHookState
- `src/index.ts` — added prompted branch in agent_end handler (sync + PR prompts via pi.sendMessage)
- `src/commands/__tests__/issues.test.ts` — 6 new tests in "agent_end prompted flow" describe block
- `README.md` — rewrote workflow sections for continuous prompted flow, updated commands table
