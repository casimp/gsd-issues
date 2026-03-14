---
id: S02
parent: M001
milestone: M001
provides:
  - Config type system (Config, GitLabConfig, GitHubConfig) with structural validation
  - loadConfig / saveConfig / validateConfig consumed by S03–S05
  - /issues command registered with subcommand routing (setup, sync, import, close, status)
  - Interactive /issues setup flow with provider detection, CLI discovery, and config writing
  - ExtensionUI interface with select/input/confirm methods for interactive flows
requires:
  - slice: S01
    provides: detectProvider for auto-populating provider in setup, provider type constants
affects:
  - S03 (consumes loadConfig, Config type, /issues command routing)
  - S04 (consumes loadConfig, Config type)
  - S05 (consumes loadConfig, Config type, /issues command routing)
key_files:
  - src/lib/config.ts
  - src/index.ts
  - src/commands/setup.ts
  - src/lib/__tests__/config.test.ts
  - src/commands/__tests__/setup.test.ts
key_decisions:
  - Extension API types defined locally (no @gsd/pi-coding-agent dependency) — minimal interfaces matching pi extension contract
  - ExtensionUI extended in-place with select/input/confirm rather than a separate InteractiveUI interface
  - Provider-specific discovery helpers kept private in setup.ts — only used during setup, not reused elsewhere
  - Default done_label is "T::Done" for GitLab, empty string for GitHub — matches existing project conventions
patterns_established:
  - Config I/O follows issue-map.ts pattern: readFile/writeFile with mkdir, JSON.parse + structural validation, clear error messages
  - Extension entry point: default export function receiving ExtensionAPI, registerCommand with getArgumentCompletions and handler
  - Interactive command pattern: guard ctx.hasUI → detect → discover → collect → assemble → save → validate → summarize
  - CLI discovery with graceful fallback: try CLI, catch ProviderError, notify with auth guidance, fall back to manual input
observability_surfaces:
  - loadConfig throws with "Run /issues setup" on missing config file — greppable diagnostic
  - loadConfig throws with all validation errors listed on invalid config
  - validateConfig returns structured {valid, errors[]} for programmatic inspection
  - CLI discovery failures notify user with specific guidance ("Run `glab auth login`" / "Run `gh auth login`")
  - Empty milestone list surfaced to user with "No milestones found" + manual input fallback
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-14
---

# S02: Config and Setup Command

**Config module with structural validation and interactive `/issues setup` command with CLI-driven discovery and graceful fallbacks.**

## What Happened

Two tasks delivered the config foundation and the user-facing setup flow:

**T01** established the `Config` type system (`Config`, `GitLabConfig`, `GitHubConfig` interfaces), file I/O (`loadConfig`/`saveConfig`), and structural validation (`validateConfig` returning `{valid, errors[]}`). The extension entry point (`src/index.ts`) registers the `/issues` command with `getArgumentCompletions` for subcommands and routes `setup` to a handler while stubbing `sync`/`import`/`close`/`status` with "not yet implemented" notifications.

**T02** replaced the setup stub with the full interactive flow. The handler follows: guard `ctx.hasUI` → detect provider from git remote → discover milestones/users via CLI → collect remaining fields interactively → assemble provider-specific config → save and validate → display summary. All CLI failures are caught and surfaced with actionable guidance (e.g., "Run `glab auth login`"). Empty milestone lists fall back to manual input.

Extension API types (`ExtensionAPI`, `ExtensionCommandContext`, `ExtensionUI`) are defined locally since no SDK package exists. `ExtensionUI` was extended with `select`, `input`, `confirm` methods needed for the interactive flow.

## Verification

- `npx vitest run` — 85 tests pass (all S01 + S02 tests)
- `npx tsc --noEmit` — zero type errors
- `src/lib/__tests__/config.test.ts` — 24 tests: validation, round-trip, missing file, corrupt JSON, provider section enforcement, extra field pass-through, error messages
- `src/commands/__tests__/setup.test.ts` — 11 tests: GitHub happy path, GitLab with epic, detection failure + manual selection, auth failure fallback, empty milestone list, milestone discovery failure, omitted optional fields, GitLab without epic, GitHub with project, validation of written config

## Requirements Advanced

- R002 (Unified config with interactive setup) — Config type system, load/save/validate I/O, and interactive setup command all implemented and contract-tested
- R011 (Slash commands) — `/issues` command registered with subcommand routing; `setup` fully implemented, remaining subcommands stubbed for S03–S05

## Requirements Validated

- R002 — contract-validated: Config round-trip (write → read → validate), structural validation catches missing provider / wrong types / missing provider-specific section, interactive setup covers both providers with fallback paths. 35 tests prove the contract. Runtime validation deferred to S03+ when config is consumed by real workflows.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `src/commands/setup.ts` created as a stub in T01 (not in original file list) — necessary for dynamic import in index.ts to resolve at typecheck time. T02 replaced it with the real implementation.
- `ExtensionUI` extended with `select`/`input`/`confirm` in T02 — not in original T02 file list but required for the interactive flow to typecheck.

## Known Limitations

- Stub subcommands (`sync`, `import`, `close`, `status`) respond with "not yet implemented" — replaced by S03–S05.
- Config validation is structural only (field names, types, required sections). No runtime validation against actual provider state (e.g., "does this milestone exist?") — that happens when S03 sync runs.
- Extension API types are locally defined and may drift from pi's actual contract if it changes.

## Follow-ups

- none — downstream slices (S03–S05) will replace stubs and consume the config module as designed.

## Files Created/Modified

- `src/lib/config.ts` — Config types, validateConfig, loadConfig, saveConfig
- `src/index.ts` — Extension entry point with /issues command and subcommand routing, ExtensionUI interface
- `src/commands/setup.ts` — Interactive setup handler with CLI discovery
- `src/lib/__tests__/config.test.ts` — 24 config tests
- `src/commands/__tests__/setup.test.ts` — 11 setup tests

## Forward Intelligence

### What the next slice should know
- `loadConfig(cwd)` returns a typed `Config` object or throws with guidance. Always call it early and let the error propagate — the message tells the user exactly what to do.
- `Config.provider` is `"gitlab" | "github"` — use it to instantiate the right provider from S01.
- Provider-specific sections are guaranteed present after validation: `config.gitlab` exists when `provider === "gitlab"`, `config.github` exists when `provider === "github"`.

### What's fragile
- `ExtensionUI` interface is locally defined — if pi adds new required methods, the types won't catch it until runtime. Match against actual pi extension contract if issues arise.
- `parseRepoPath` in setup.ts extracts owner/repo from remote URL with regex — handles common SSH/HTTPS patterns but may miss unusual remote formats.

### Authoritative diagnostics
- `npx vitest run src/lib/__tests__/config.test.ts` — 24 tests prove config contract
- `npx vitest run src/commands/__tests__/setup.test.ts` — 11 tests prove setup flow with both providers
- `loadConfig` error messages include the config file path and either "Run /issues setup" or a bullet list of validation errors

### What assumptions changed
- No assumptions changed — both tasks delivered as planned.
