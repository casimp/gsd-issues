---
id: T02
parent: S02
milestone: M001
provides:
  - Interactive /issues setup command with full provider detection, CLI discovery, and config writing
  - ExtensionUI extended with select/input/confirm methods for interactive flows
key_files:
  - src/commands/setup.ts
  - src/commands/__tests__/setup.test.ts
  - src/index.ts
key_decisions:
  - ExtensionUI extended in-place (select, input, confirm) rather than creating a separate InteractiveUI interface — simpler, and hasUI guard already gates access
  - Provider-specific discovery helpers (discoverMilestones, discoverCurrentUser, discoverProjectId) kept as private functions in setup.ts rather than extracted to provider modules — they're only used during setup
  - parseRepoPath extracts owner/repo from remote URL locally rather than reusing detect.ts parseHostname — different return shape needed (full path vs hostname)
  - Default done_label is "T::Done" for GitLab, empty string for GitHub — matches existing project conventions
patterns_established:
  - Interactive command pattern: guard ctx.hasUI → detect → discover → collect → assemble → save → validate → summarize
  - CLI discovery with graceful fallback: try CLI, catch ProviderError, notify with auth guidance, fall back to manual input
  - Test mocking pattern for setup: routedExec for CLI routing, makeUI for mocked ExtensionUI, tempDir for isolated config writes
observability_surfaces:
  - CLI discovery failures notify user with specific guidance ("Run `glab auth login`" / "Run `gh auth login`")
  - Empty milestone list surfaced to user with "No milestones found" + manual input
  - Detection failure surfaced with "Could not detect provider" + manual selection
  - Config summary displayed after successful write showing all fields
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Interactive setup command with CLI discovery

**Full `/issues setup` flow: provider detection → CLI discovery → interactive config collection → validated config written.**

## What Happened

Replaced the stub `src/commands/setup.ts` with the complete interactive setup handler. Extended `ExtensionUI` with `select`, `input`, and `confirm` methods needed for interactive flows.

The handler follows this sequence:
1. **Guard** `ctx.hasUI` — returns early with notification if not interactive
2. **Detect** provider from git remote via `detectProvider`, manual select fallback if null
3. **Discover** repo/project path from remote URL via `parseRepoPath`
4. **Discover** milestones via CLI (`glab milestone list` / `gh milestone list`), select from list or manual input if empty/failed
5. **Discover** current user via `glab auth status` / `gh auth status`, manual input if auth fails
6. **Collect** remaining fields: done_label, branch_pattern, labels
7. **Provider-specific**: GitLab gets project_path (from remote), project_id (from API with manual fallback), optional epic. GitHub gets repo (from remote), close_reason (default "completed"), optional project number.
8. **Save** via `saveConfig`, double-check via `validateConfig`, display summary

All CLI failures are caught and surfaced with actionable guidance — no unhandled rejections.

## Verification

- `npx vitest run src/commands/__tests__/setup.test.ts` — 11 tests pass
- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 85 tests pass (S01 + S02 tests green)

Slice-level checks:
- ✅ `npx vitest run` — all tests pass
- ✅ `npx tsc --noEmit` — clean typecheck
- ✅ `src/lib/__tests__/config.test.ts` — 24 tests pass (T01, still green)
- ✅ `src/commands/__tests__/setup.test.ts` — 11 tests pass: GitHub happy path, GitLab with epic, detection failure + manual selection, auth failure fallback, empty milestone list, milestone discovery failure, omitted optional fields, GitLab without epic, GitHub with project, validation of written config

## Diagnostics

- Auth not configured → `ctx.ui.notify` with "Run `glab auth login`" / "Run `gh auth login`"
- No milestones found → `ctx.ui.notify` with "No milestones found. Enter manually."
- Detection returned null → `ctx.ui.notify` with "Could not detect provider" + manual selection
- Successful setup → summary notification listing all config fields written
- Test mocks show expected CLI invocations for each provider (routedExec pattern)

## Deviations

- Added `select`, `input`, `confirm` methods to `ExtensionUI` in `src/index.ts` — not listed as a T02 file but necessary for the interactive flow to typecheck. The interface needed these methods since T01 only defined `notify`.

## Known Issues

None.

## Files Created/Modified

- `src/commands/setup.ts` — Complete interactive setup handler replacing stub
- `src/commands/__tests__/setup.test.ts` — 11 tests covering both providers, fallbacks, edge cases
- `src/index.ts` — ExtensionUI extended with select/input/confirm methods
