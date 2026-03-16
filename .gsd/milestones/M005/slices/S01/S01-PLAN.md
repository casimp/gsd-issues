# S01: Prompted flow in agent_end with confirmation messages

**Goal:** When `/issues` (bare) runs the scope flow, `agent_end` sends confirmation prompts for sync and PR at the right moments, giving the user a continuous lifecycle without needing to know about `/issues sync` and `/issues pr`.

**Demo:** After scoping a milestone via `/issues`, the agent prompts "Milestone M001 planned. Run `/issues sync` to create a tracker issue, or skip." When the milestone completes (SUMMARY.md appears), it prompts "Milestone M001 complete. Run `/issues pr` to create a PR, or skip." Both prompts only fire once per milestone. `/issues auto` still auto-fires with no prompts.

## Must-Haves

- `_promptedFlowEnabled` flag with getter/setter/clearer exports
- `handleSmartEntry()` sets `_promptedFlowEnabled = true` before sending scope prompt
- `handleAutoEntry()` clears `_promptedFlowEnabled` on entry
- `clearHookState()` also clears `_promptedFlowEnabled`
- `agent_end` handler: when `_promptedFlowEnabled && !isHooksEnabled()`, check ROADMAP.md/SUMMARY.md and send `pi.sendMessage()` prompts
- Prompts include milestone ID and exact command to run
- `markSynced()`/`markPrd()` called when sending prompt to prevent re-prompting
- PR prompt skipped if milestone not mapped (sync was skipped)
- README updated to document continuous flow

## Verification

- `npx vitest run src/commands/__tests__/issues.test.ts` — new prompted-flow tests pass
- `npx vitest run` — all 324+ tests pass
- `npx tsc --noEmit` — no type errors

## Tasks

- [ ] **T01: Add _promptedFlowEnabled flag and wire it into handleSmartEntry/handleAutoEntry** `est:20m`
  - Why: The flag is the coordination mechanism between the command handler and `agent_end`. Without it, `agent_end` can't distinguish "user ran `/issues`" from "no flow active".
  - Files: `src/commands/issues.ts`
  - Do: Add `_promptedFlowEnabled` boolean (default false) with `isPromptedFlowEnabled()`, `setPromptedFlowEnabled()`, `clearPromptedFlowEnabled()` exports following the existing pattern. Set `_promptedFlowEnabled = true` in `handleSmartEntry()` just before setting `preScopeMilestones`. Clear it in `clearHookState()`. In `handleAutoEntry()`, clear `_promptedFlowEnabled` at the top (before any other logic) to prevent conflict if user ran `/issues` then `/issues auto`. Export from the module for `agent_end` import.
  - Verify: `npx vitest run src/commands/__tests__/issues.test.ts` — existing tests still pass, flag is exported and importable
  - Done when: `isPromptedFlowEnabled()` returns true after `handleSmartEntry()` runs, false after `clearHookState()`, false after `handleAutoEntry()` runs

- [ ] **T02: Add prompted branch to agent_end handler** `est:30m`
  - Why: This is the core change — `agent_end` needs to send confirmation prompts when prompted mode is active and hooks are not.
  - Files: `src/index.ts`
  - Do: After the hooks section (line 625), add a new section: import `isPromptedFlowEnabled` and `clearPromptedFlowEnabled` from issues.ts. When `isPromptedFlowEnabled() && !isHooksEnabled()`, run the same ROADMAP.md / SUMMARY.md detection loop as the hooks path, but instead of calling `syncMilestoneToIssue()` / `createMilestonePR()` directly, send `pi.sendMessage()` with `triggerTurn: true`. Message content for sync: `"Milestone {mid} is planned. Run \`/issues sync\` to create a tracker issue, or skip if you don't need one."`. Message content for PR: `"Milestone {mid} is complete. Run \`/issues pr\` to create a pull request, or skip."`. Call `markSynced(mid)` / `markPrd(mid)` when sending the prompt (not on confirmation) to prevent re-prompting. Use `customType: "gsd-issues:prompted-sync"` / `"gsd-issues:prompted-pr"` for inspectability. The PR prompt should check ISSUE-MAP.json mapping exists (skip if unmapped — sync was skipped). Config loading follows the same pattern as the hooks section.
  - Verify: `npx vitest run src/commands/__tests__/issues.test.ts` — new tests in T03 will exercise this
  - Done when: `agent_end` sends sendMessage prompts for sync/PR when prompted mode is active, and does NOT call sync/PR functions directly

- [ ] **T03: Tests for prompted flow** `est:30m`
  - Why: Proves the prompted branch works correctly and doesn't interfere with existing hooks.
  - Files: `src/commands/__tests__/issues.test.ts`
  - Do: Add a new `describe("agent_end prompted flow")` block using the same `setupExtension()` / `writeMilestoneWithRoadmap()` helpers. Tests:
    1. "sends sync prompt when ROADMAP.md exists and prompted flow is enabled" — set `_promptedFlowEnabled`, write ROADMAP.md, call `agentEndHandler()`, assert `pi.sendMessage` called with content containing milestone ID and `/issues sync`
    2. "sends PR prompt when SUMMARY.md exists, mapped, and prompted flow is enabled" — set `_promptedFlowEnabled`, write SUMMARY.md + ISSUE-MAP.json, call `agentEndHandler()`, assert `pi.sendMessage` called with content containing `/issues pr`
    3. "does not send prompts when hooks are enabled" — set both `_promptedFlowEnabled` and `_hooksEnabled`, write ROADMAP.md, call `agentEndHandler()` — sync function called (hooks path), sendMessage NOT called for prompted-sync
    4. "does not re-prompt for already-prompted milestones" — set `_promptedFlowEnabled`, write ROADMAP.md, call `markSynced(mid)`, call `agentEndHandler()` — sendMessage NOT called
    5. "skips PR prompt when milestone is unmapped" — set `_promptedFlowEnabled`, write SUMMARY.md but no ISSUE-MAP.json, call `agentEndHandler()` — sendMessage NOT called for PR
    6. "handleAutoEntry clears prompted flow flag" — set `_promptedFlowEnabled`, call `handleAutoEntry()`, assert `isPromptedFlowEnabled()` is false
  - Verify: `npx vitest run src/commands/__tests__/issues.test.ts` — all tests pass including new ones
  - Done when: 6 new tests pass, all existing tests still pass

- [ ] **T04: Update README for continuous flow** `est:15m`
  - Why: README should document `/issues` as the primary continuous flow, not just the scoping entry point.
  - Files: `README.md`
  - Do: Update the "How It Works" or equivalent section to describe the continuous flow: `/issues` → scope → prompted sync → work → prompted PR. Clarify that `/issues auto` is the same flow with auto-confirmations. Position `/issues sync`, `/issues pr`, etc. as escape hatches for one-off actions. Keep it concise — this is a README section update, not a rewrite.
  - Verify: `grep -c "continuous" README.md` or verify the new flow description is present. `npx vitest run` — all tests still pass after README change (sanity).
  - Done when: README describes the continuous prompted flow as the primary path

## Files Likely Touched

- `src/commands/issues.ts` — new flag, setter/getter/clearer, handleSmartEntry/handleAutoEntry wiring
- `src/index.ts` — new prompted branch in `agent_end` handler
- `src/commands/__tests__/issues.test.ts` — 6+ new tests
- `README.md` — continuous flow documentation
