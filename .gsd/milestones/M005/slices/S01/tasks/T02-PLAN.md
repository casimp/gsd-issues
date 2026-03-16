---
estimated_steps: 6
estimated_files: 1
---

# T02: Add prompted branch to agent_end handler

**Slice:** S01 — Prompted flow in agent_end with confirmation messages
**Milestone:** M005

## Description

Add a new section to the `agent_end` handler in `index.ts` that fires after the hooks section. When `isPromptedFlowEnabled() && !isHooksEnabled()`, detect ROADMAP.md and SUMMARY.md using the same filesystem checks as the hooks path, but send `pi.sendMessage()` confirmation prompts instead of calling sync/PR functions directly.

## Steps

1. After line 625 (end of hooks section), add dynamic imports for `isPromptedFlowEnabled` from `./commands/issues.js`
2. Add guard: `if (isPromptedFlowEnabled() && !isHooksEnabled())`
3. Inside the guard, load config (same pattern as hooks — early return if no config)
4. Sync prompt loop: for each milestone with ROADMAP.md, check `!isSynced(mid)` and not in ISSUE-MAP.json. If unmapped, call `markSynced(mid)` then `pi.sendMessage()` with `customType: "gsd-issues:prompted-sync"`, content including the milestone ID and the `/issues sync` command, `triggerTurn: true`
5. PR prompt loop: for each milestone with SUMMARY.md, check `!isPrd(mid)` and IS in ISSUE-MAP.json (must be mapped). If mapped, call `markPrd(mid)` then `pi.sendMessage()` with `customType: "gsd-issues:prompted-pr"`, content including the milestone ID and `/issues pr`, `triggerTurn: true`
6. The message content must be specific enough for the LLM to confirm with the user: include milestone ID, what happened (planned / completed), and the exact command to run

## Must-Haves

- [ ] Prompted branch only fires when `isPromptedFlowEnabled() && !isHooksEnabled()`
- [ ] Sync prompt: ROADMAP.md exists + unmapped + not already prompted
- [ ] PR prompt: SUMMARY.md exists + mapped + not already prompted
- [ ] `markSynced()`/`markPrd()` called BEFORE sendMessage to prevent re-prompting on next agent_end
- [ ] Message includes milestone ID and exact command
- [ ] `sendMessage` uses `triggerTurn: true`

## Verification

- `npx tsc --noEmit` — no type errors
- Manual inspection of the `agent_end` handler structure

## Inputs

- `src/index.ts` — existing `agent_end` handler (lines 476-626)
- `src/commands/issues.ts` — T01's new `isPromptedFlowEnabled` export

## Expected Output

- `src/index.ts` — new prompted branch in `agent_end` handler after the hooks section

## Observability Impact

- `pi.sendMessage()` with `customType: "gsd-issues:prompted-sync"` — inspectable prompt event when a milestone has a ROADMAP.md but no tracked issue. Content includes milestone ID and `/issues sync` command.
- `pi.sendMessage()` with `customType: "gsd-issues:prompted-pr"` — inspectable prompt event when a milestone has a SUMMARY.md and a tracked issue. Content includes milestone ID and `/issues pr` command.
- `markSynced()` / `markPrd()` called before sending — dedup state prevents duplicate prompts on subsequent `agent_end` fires. Same surface as hooks path, queryable via `isSynced()` / `isPrd()`.
- Guard condition `isPromptedFlowEnabled() && !isHooksEnabled()` — runtime-inspectable via the getter functions to verify which branch fires.
