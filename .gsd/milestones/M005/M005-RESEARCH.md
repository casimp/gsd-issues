# M005: Continuous Prompted Flow — Research

**Date:** 2026-03-14

## Summary

M005 is a wiring task. The sync/PR functions, filesystem detection, and `agent_end` handler all exist and work. The gap is narrow: when `/issues` (not `/issues auto`) runs the scope flow, nothing happens after scoping completes. The user has to manually run `/issues sync` and later `/issues pr`. The fix is a new module-scoped flag (`_promptedFlowEnabled`) set by `handleSmartEntry()`, and a second branch in the `agent_end` handler that sends confirmation prompts via `pi.sendMessage()` instead of auto-firing.

The critical design constraint is that `agent_end` receives no context parameter — its signature is `async () => {}` with only `pi` (ExtensionAPI) available via closure. This means `ctx.ui.confirm()` is unreachable from hooks. The prompted flow must work through `pi.sendMessage()` with `triggerTurn: true`, sending a message that asks the LLM to confirm with the user before calling sync/PR. This is the same mechanism used for scope prompts and `/gsd auto` dispatch — proven pattern.

The scope is genuinely small: one new flag, one new `agent_end` branch, a README update, and tests. No new library functions, no new commands, no schema changes. The main risk is getting the message content right so the LLM reliably interprets the confirmation request and calls the right tool/command on approval.

## Recommendation

Implement as a single slice. Add `_promptedFlowEnabled` flag parallel to `_hooksEnabled`, set it in `handleSmartEntry()` (and clear on completion/error). In `agent_end`, add a branch that checks `_promptedFlowEnabled && !isHooksEnabled()` and sends confirmation messages via `pi.sendMessage()` for sync (on ROADMAP.md detection) and PR (on SUMMARY.md detection). Use `deliverAs: "followUp"` to ensure the message reaches the user's conversation rather than steering the agent silently.

Do NOT attempt to make `/issues auto` share code with the prompted flow by auto-accepting confirmations. The hooks path (`_hooksEnabled`) already works and is well-tested — the two modes should stay as parallel branches in `agent_end` to avoid regressions.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Milestone filesystem detection | `scanMilestones()` in `lib/smart-entry.ts` | Already scans `.gsd/milestones/` for CONTEXT.md presence — used by hooks path |
| ROADMAP.md / SUMMARY.md detection | `agent_end` hook loops in `index.ts` (lines 527-623) | Exact same detection logic needed — just different action on detection |
| Issue sync pipeline | `syncMilestoneToIssue()` in `lib/sync.ts` | Full pipeline: description build, map persistence, epic assignment, idempotent |
| PR creation pipeline | `createMilestonePR()` in `lib/pr.ts` | Branch push, Closes #N, provider abstraction, error handling |
| Provider instantiation | `createProvider()` in `lib/provider-factory.ts` | Single factory, auto-detection, exec injection |
| LLM-mediated message | `pi.sendMessage()` with `triggerTurn: true` | Used for scope prompts (line 218 of issues.ts) and auto dispatch (line 510 of index.ts) |
| Module-scoped flag pattern | `_autoRequested`, `_hooksEnabled` in `commands/issues.ts` | Same pattern: set in command handler, read in `agent_end`, cleared after use |
| ISSUE-MAP.json check | `loadIssueMap()` from `lib/issue-map.ts` | Already used in hooks path for checking mapped/unmapped state |

## Existing Code and Patterns

- `src/index.ts` (lines 476-626) — The `agent_end` handler. Two sections: scope completion detection (lines 486-525) and hooks-based auto-sync/PR (lines 527-623). The prompted branch inserts between these or as a parallel check to the hooks section.
- `src/commands/issues.ts` — Module-scoped state: `preScopeMilestones`, `_autoRequested`, `_hooksEnabled`, `_syncedMilestones`, `_prdMilestones`. All with getter/setter/clear exports. New `_promptedFlowEnabled` follows this exact pattern.
- `src/commands/issues.ts:handleSmartEntry()` (lines 102-228) — Sets `preScopeMilestones` for scope detection but doesn't set any flow continuation flag. This is where `_promptedFlowEnabled = true` goes.
- `src/commands/issues.ts:handleAutoEntry()` (lines 241-281) — Sets both `_autoRequested = true` and `_hooksEnabled = true`. The prompted flow only sets `_promptedFlowEnabled`, NOT `_hooksEnabled` — they're mutually exclusive modes.
- `src/commands/__tests__/issues.test.ts` — 10 hook tests (lines 721-1020) with `setupExtension()` helper pattern, `writeMilestoneWithRoadmap()` helper, mock patterns for sync/PR modules. New tests follow this exact structure.
- `src/index.ts` (lines 93-107) — `ExtensionAPI` interface. `sendMessage` supports `deliverAs?: "steer" | "followUp" | "nextTurn"` — `followUp` would send the prompt as a follow-up message in the conversation.
- `src/commands/sync.ts`, `src/commands/pr.ts` — Interactive command handlers with `ctx.ui.confirm()`. These are the escape-hatch commands and should remain unchanged.

## Constraints

- **`agent_end` has no context parameter.** The handler signature is `async () => {}` — only `pi` is available via closure. No `ctx.ui.confirm()`, no `ctx.ui.notify()`, no `ctx.ui.select()`. All user interaction must go through `pi.sendMessage()`.
- **`_promptedFlowEnabled` must be mutually exclusive with `_hooksEnabled`.** If both are true, the `agent_end` handler would both auto-fire AND prompt — creating duplicate syncs/PRs. Guard: `_promptedFlowEnabled && !isHooksEnabled()`.
- **`pi.sendMessage()` is fire-and-forget from the extension's perspective.** The extension sends a message asking the LLM to confirm, but can't await the response. The LLM must interpret the user's response and call `/issues sync` or `/issues pr` (or the tools). This means the prompted flow relies on the LLM correctly interpreting the confirmation request.
- **Module-scoped state persists across agent turns within a session** but is lost on session restart. The `_promptedFlowEnabled` flag must survive across multiple `agent_end` cycles (scope → plan → sync prompt → work → PR prompt) within one session.
- **Hooks idempotency pattern must be preserved.** The `isSynced(mid)` / `markSynced(mid)` / `isPrd(mid)` / `markPrd(mid)` pattern prevents duplicate sync/PR — prompted mode should use the same tracking sets to prevent re-prompting for already-actioned milestones.
- **324 tests must remain passing.** The new code adds behavior to `agent_end` — existing tests that check `isHooksEnabled() === false` means hooks are no-op must still pass because `_promptedFlowEnabled` is a separate flag.

## Common Pitfalls

- **Sending confirmation prompt but not tracking prompted state** — If the extension prompts "Create issue?" and the user says yes, the LLM calls `/issues sync`, which succeeds. Next `agent_end` fires again, sees ROADMAP.md still exists and milestone still isn't marked as synced by hooks (because the command path doesn't call `markSynced`). The prompted flow re-prompts. Fix: the `agent_end` prompted branch must `markSynced(mid)` / `markPrd(mid)` when it sends the prompt (not when the user confirms), OR check ISSUE-MAP.json presence as the hooks already do.
- **Prompted and hooks modes both running** — If someone runs `/issues auto` after `/issues` already set `_promptedFlowEnabled`, both flags could be true. Fix: `handleAutoEntry()` should clear `_promptedFlowEnabled`, and the `agent_end` check should be `_promptedFlowEnabled && !isHooksEnabled()`.
- **Message content too vague for LLM** — If the prompt says "Want to sync?" without specifying the milestone ID and expected command, the LLM might not know what to do. Fix: include the milestone ID and the exact command or tool call expected: "Milestone M001 is planned. Run `/issues sync` to create a tracker issue, or skip."
- **PR prompt fires before sync happens** — In the prompted flow, the user might still be working when SUMMARY.md appears. The PR prompt checks ISSUE-MAP.json for mapping (a milestone must be synced before PR makes sense), but the user might skip sync. Fix: the PR prompt should check mapping exists and skip silently if not.
- **Flag not cleared on error** — If scope fails or the user cancels, `_promptedFlowEnabled` stays true and future `agent_end` calls might prompt unexpectedly. Fix: clear in the same places `_autoRequested` is cleared — scope detection done (successful or not), and in `clearHookState()`.

## Open Risks

- **LLM reliability of interpreting sendMessage confirmation prompts.** The extension can't control how the LLM interprets "Milestone M001 planned. Create a tracker issue?" The LLM might auto-confirm without asking the user, or might not understand the intent. This is a UX quality issue, not a correctness issue — the worst case is the user needs to run `/issues sync` manually, which is exactly the current state.
- **Session restarts reset module state.** If the user runs `/issues`, scopes a milestone, then restarts the session, `_promptedFlowEnabled` is lost and no prompts will fire. The auto-sync path has the same limitation (documented as known). Not worth solving with persistence for M005.
- **`deliverAs` option behavior is untested in this codebase.** The type declares `"steer" | "followUp" | "nextTurn"` but none are used. The safest approach is to use `triggerTurn: true` without `deliverAs`, matching the existing pattern. If `deliverAs` is needed for correct prompt delivery, that's a discovery during implementation.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | `zenobi-us/dotfiles@creating-pi-extensions` | available (27 installs) — low relevance, this codebase already has a mature extension |
| pi extensions | `scientiacapital/skills@extension-authoring` | available (26 installs) — low relevance, same reason |

No skills warrant installation. The codebase is a mature pi extension with established patterns. M005 is internal wiring, not new technology.

## Candidate Requirements

M005 CONTEXT.md describes the work clearly. Against the existing requirements:

- **R009 (Sync surfaced as prompted step)** — Currently status "active", validated for the command path (`/issues sync` with confirmation). M005 extends this to the continuous flow. R009 should be updated to "validated" after M005 completes.
- **No new requirement needed for the prompted flow itself** — it's a natural extension of R009 and R021 (auto-flow orchestration). The prompted flow is the manual-mode equivalent of R021's auto hooks.
- **Candidate: R027 — Continuous lifecycle flow** — Consider adding a requirement that `/issues` (bare) drives the full lifecycle with confirmation prompts, not just scoping. This would capture M005's value proposition explicitly. Currently implicit in M005-CONTEXT.md but not in REQUIREMENTS.md.
- **README update is not a requirement** — it's a documentation task within the slice. Current README already describes manual vs auto workflow; M005 changes the manual workflow description.

## Sources

- `src/index.ts` — `agent_end` handler implementation, ExtensionAPI interface (lines 93-107, 476-626)
- `src/commands/issues.ts` — smart entry, auto entry, module-scoped state (full file)
- `src/commands/__tests__/issues.test.ts` — 10 hook tests, test helper patterns (lines 689-1020)
- `src/lib/smart-entry.ts` — `scanMilestones()`, `buildScopePrompt()`, `detectNewMilestones()` (full file)
- `src/lib/sync.ts` — `syncMilestoneToIssue()` interface (line 185)
- `src/lib/pr.ts` — `createMilestonePR()` interface (line 117)
- M005-CONTEXT.md — problem statement, design questions, success criteria
- `.gsd/DECISIONS.md` — D046 (remove state machine), D047 (smart entry pattern), D048 (hooks not orchestration), D051 (module-scoped auto flag), D052 (scope completion via CONTEXT.md diffing)
