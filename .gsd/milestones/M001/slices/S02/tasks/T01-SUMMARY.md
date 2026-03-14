---
id: T01
parent: S02
milestone: M001
provides:
  - Config type system (Config, GitLabConfig, GitHubConfig interfaces)
  - loadConfig / saveConfig file I/O with validation
  - validateConfig structural validation returning all errors
  - Extension entry point registering /issues command with subcommand routing
key_files:
  - src/lib/config.ts
  - src/index.ts
  - src/lib/__tests__/config.test.ts
key_decisions:
  - Extension API types defined locally (no @gsd/pi-coding-agent dependency) — minimal interfaces for registerCommand, ExtensionCommandContext, ExtensionUI
  - Config uses index signature for extra field pass-through rather than stripping unknown keys
  - Setup handler imported dynamically in command routing to keep it lazy and avoid circular deps
patterns_established:
  - Config I/O follows issue-map.ts pattern: readFile/writeFile with mkdir, JSON.parse + structural validation, clear error messages with file path
  - Extension entry point: default export function receiving ExtensionAPI, registerCommand with getArgumentCompletions and handler
  - Subcommand routing via switch/case on first arg, dynamic import for real handlers, notify for stubs
observability_surfaces:
  - loadConfig throws with "Run /issues setup" on missing file — greppable diagnostic
  - loadConfig throws with all validation errors listed on invalid config
  - validateConfig returns structured {valid, errors[]} for programmatic inspection
  - Stub subcommands respond with "/issues X is not yet implemented" notification
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Config module and extension entry point with command routing

**Built Config type system, file I/O with structural validation, and `/issues` command with subcommand routing.**

## What Happened

Implemented the three planned files:

1. **`src/lib/config.ts`** — `Config`, `GitLabConfig`, `GitHubConfig` interfaces with common fields (provider, milestone, assignee, done_label, branch_pattern, labels) and provider-specific sections. `validateConfig` performs structural type checks on all fields, enforces provider-specific section matches provider value, and returns all errors collected. `loadConfig` reads `.gsd/issues.json`, validates, and throws with actionable guidance. `saveConfig` creates `.gsd/` and writes formatted JSON.

2. **`src/index.ts`** — Default export `ExtensionFactory` registering `/issues` command. `getArgumentCompletions` returns the five subcommands. Handler parses first arg, routes `setup` to dynamic import of `src/commands/setup.ts`, routes `sync`/`import`/`close`/`status` to "not yet implemented" notifications. Bare `/issues` shows usage hint. Unknown subcommands warn.

3. **`src/commands/setup.ts`** — Stub handler for T02 to replace with full interactive flow.

Extension API types (`ExtensionAPI`, `ExtensionCommandContext`, `ExtensionUI`) defined locally since there's no SDK package dependency.

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — 24 tests pass (validation, round-trip, missing file, corrupt JSON, provider section enforcement, extra field pass-through, error message quality)
- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 74 tests pass (full suite including S01 tests)

Slice-level checks:
- ✅ `npx vitest run` — all tests pass
- ✅ `npx tsc --noEmit` — clean typecheck
- ✅ `src/lib/__tests__/config.test.ts` — validates load/save/validate round-trip, missing file error, corrupt data, validation errors, provider-specific section enforcement
- ⏳ `src/commands/__tests__/setup.test.ts` — not yet created (T02 deliverable)

## Diagnostics

- `cat .gsd/issues.json` in any project to inspect current config state
- `loadConfig` error messages include the file path and either "Run /issues setup" (missing) or a bullet list of validation errors (invalid)
- `validateConfig` can be called directly for structured `{valid, errors[]}` inspection
- Stub subcommands respond with notify messages — visible in pi UI

## Deviations

- Created `src/commands/setup.ts` as a stub (not in original task plan files list but necessary for the dynamic import in index.ts to resolve at typecheck time). T02 will replace the implementation.

## Known Issues

None.

## Files Created/Modified

- `src/lib/config.ts` — Config types, validateConfig, loadConfig, saveConfig
- `src/index.ts` — Extension entry point with /issues command registration and subcommand routing
- `src/commands/setup.ts` — Stub setup handler (T02 replaces)
- `src/lib/__tests__/config.test.ts` — 24 tests covering validation, I/O, error handling
- `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
