---
id: T03
parent: S02
milestone: M002
provides:
  - Complete extension wiring — all three tools (sync, close, pr) registered, pr subcommand routed, tool_result hook removed
key_files:
  - src/index.ts
  - src/commands/__tests__/close.test.ts
  - src/commands/__tests__/sync.test.ts
  - src/commands/__tests__/import.test.ts
  - src/commands/__tests__/pr.test.ts
key_decisions:
  - Removed ToolResultEvent type and pi.on() from ExtensionAPI interface — hook is fully excised, not just unused
  - PR tool runs without confirmation in LLM tool mode (consistent with sync/close tool behavior)
patterns_established:
  - All command test makePi() helpers no longer include `on` property — matches updated ExtensionAPI contract
observability_surfaces:
  - gsd_issues_pr tool registered and LLM-callable; emits gsd-issues:pr-complete event
  - Hook removal verifiable via grep — 0 matches for tool_result in index.ts
  - Four tool registrations visible in index.ts (sync, close, import, pr)
duration: ~15min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Wire tools, remove hook, and update command routing

**Removed tool_result auto-close hook, registered gsd_issues_pr tool, wired pr subcommand, and cleaned up all test files for the new ExtensionAPI contract.**

## What Happened

The tool_result lifecycle hook (WRITE_TOOLS, SUMMARY_REGEX, `pi.on("tool_result", ...)`) was completely removed from index.ts. Issue close is now explicit only — via `/issues close` command or `gsd_issues_close` tool. The `ToolResultEvent` type and `pi.on()` method were removed from the `ExtensionAPI` interface.

The `gsd_issues_pr` tool was registered with `PrToolSchema` parameters (optional `milestone_id`, `target_branch`, `dry_run`). It resolves milestone from params/config/state, builds the map path, and calls `createMilestonePR()` without confirmation (LLM tool mode). Returns PR URL and number in the ToolResult.

`"pr"` was added to SUBCOMMANDS and a `case "pr"` was added to the command handler switch, dynamically importing `handlePr` from `./commands/pr.js`.

All four test files (`sync.test.ts`, `close.test.ts`, `import.test.ts`, `pr.test.ts`) had their `makePi()` helpers updated to remove the `on: vi.fn()` property. The 7 hook tests in close.test.ts were removed. Two new tests were added: PR tool registration verification and hook-removal verification.

The sync.ts and close.ts commands were already at milestone level from prior work (T01) — no further changes needed.

## Verification

- `npx vitest run` — 235 tests pass (15 files), no failures. Net: -7 hook tests, +2 new tests.
- `npx tsc --noEmit` — clean, no type errors.
- `grep "tool_result" src/index.ts` — 0 matches, hook fully removed.
- `grep 'name: "gsd_issues_' src/index.ts` — 4 tool registrations (sync, close, import, pr).
- SUBCOMMANDS includes "pr", command handler routes to `handlePr`.
- No slice/sliceId references in sync.ts or close.ts commands.

### Slice-level verification status

- ✅ `npx vitest run` — 235 tests pass (target: 212+)
- ✅ `npx tsc --noEmit` — clean
- ✅ Hook removal verified
- ✅ New tool registrations verified
- ✅ Command tests for `/issues sync`, `/issues close M001` — passing
- ✅ PR tool registration test — passing
- ⬜ New sync tests (milestone-level sync, skips mapped, etc.) — already exist from T01 sync.test.ts rewrite
- ⬜ New PR tests (push + createPR, Closes #N, errors) — already exist from T02 pr.test.ts
- ⬜ Updated close tests (milestone ID parameter, event payload) — already exist from T01 close.test.ts update

## Diagnostics

- `gsd_issues_pr` tool: LLM-callable, params `{ milestone_id?, target_branch?, dry_run? }`. Emits `gsd-issues:pr-complete` on success.
- Hook removal: `grep "tool_result" src/index.ts` should return nothing. `ExtensionAPI` interface no longer has `on()` method.
- All registered tools: `grep 'name: "gsd_issues_' src/index.ts` returns sync, close, import, pr.
- Usage text includes "pr": `/issues <setup|sync|import|close|pr|status>`.

## Deviations

- sync.ts and close.ts commands were already milestone-level from T01 — no rewrite needed, just verified.
- `ToolResultEvent` type removed from ExtensionAPI interface (not just the hook implementation) — cleaner contract.
- Removed `resolve` and `isAbsolute` from path imports (only used by hook).

## Known Issues

None.

## Files Created/Modified

- `src/index.ts` — hook removed, `gsd_issues_pr` tool registered, `"pr"` in SUBCOMMANDS and command routing, ExtensionAPI simplified
- `src/commands/__tests__/close.test.ts` — 7 hook tests removed, hook-removal verification test added, `on` removed from makePi
- `src/commands/__tests__/sync.test.ts` — `on` removed from makePi, PR tool registration test added
- `src/commands/__tests__/import.test.ts` — `on` removed from makePi
- `src/commands/__tests__/pr.test.ts` — `on` removed from makePi
- `.gsd/milestones/M002/slices/S02/tasks/T03-PLAN.md` — Observability Impact section added, must-haves checked
