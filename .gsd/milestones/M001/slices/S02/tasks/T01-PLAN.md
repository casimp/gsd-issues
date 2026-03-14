---
estimated_steps: 5
estimated_files: 3
---

# T01: Config module and extension entry point with command routing

**Slice:** S02 — Config and setup command
**Milestone:** M001

## Description

Build the `Config` type system, file I/O (`loadConfig`/`saveConfig`), structural validation (`validateConfig`), and the extension entry point (`src/index.ts`) that registers the `/issues` command with subcommand routing. This establishes the contract surface consumed by S03–S05 and the command shell that setup, sync, import, and close plug into.

## Steps

1. Define `Config`, `GitLabConfig`, `GitHubConfig` interfaces in `src/lib/config.ts`. Common fields: `provider`, `milestone`, `assignee`, `done_label`, `branch_pattern`, `labels`. GitLab section: `project_path`, `project_id`, `epic`, `weight_strategy`, `reorganisation`. GitHub section: `repo`, `project`, `close_reason`.
2. Implement `validateConfig(config: unknown): {valid: boolean, errors: string[]}` — structural type checks on all fields, enforce provider-specific section matches `config.provider`, return all errors (not just first).
3. Implement `loadConfig(cwd: string): Config` — reads `.gsd/issues.json`, parses JSON, validates, throws on missing file (with "Run /issues setup" guidance), throws on invalid with validation errors in message. Implement `saveConfig(cwd: string, config: Config): void` — mkdir -p `.gsd/`, write JSON with 2-space indent.
4. Create `src/index.ts` — default export `ExtensionFactory` function. Register `/issues` command with `getArgumentCompletions` returning `['setup', 'sync', 'import', 'close', 'status']`. Handler parses first arg as subcommand, routes `setup` to imported handler, routes others to `ctx.ui.notify("... not yet implemented")`.
5. Write `src/lib/__tests__/config.test.ts` — test round-trip save/load, missing file error, corrupt JSON, validation errors (missing provider, wrong type, missing gitlab section when provider is gitlab, missing github section when provider is github), extra fields pass through, all error messages are human-readable.

## Must-Haves

- [ ] `Config` type with common + provider-specific sections
- [ ] `loadConfig` throws on missing file with setup guidance
- [ ] `loadConfig` throws on invalid config with validation errors
- [ ] `saveConfig` creates parent directory and writes formatted JSON
- [ ] `validateConfig` catches: missing required fields, wrong types, mismatched provider section
- [ ] Extension default export registers `/issues` command
- [ ] Subcommand routing dispatches `setup` and stubs others
- [ ] `getArgumentCompletions` returns subcommand list

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — all config tests pass
- `npx tsc --noEmit` — zero type errors

## Inputs

- `src/providers/types.ts` — provider name literals (`"github" | "gitlab"`)
- `src/providers/detect.ts` — `detectProvider` (consumed by setup, imported by index)
- `src/lib/issue-map.ts` — pattern reference for file I/O with mkdir and structural validation
- `~/.gsd/agent/extensions/gsd/index.ts` — pattern reference for extension entry point
- `~/.gsd/agent/extensions/gsd/commands.ts` — pattern reference for subcommand routing

## Observability Impact

- `loadConfig` throws with message containing "Run /issues setup" when `.gsd/issues.json` is missing — a future agent can grep for this to detect unconfigured state
- `loadConfig` throws with all validation errors in the message when config is invalid — agent can read the error to know exactly which fields are wrong
- `validateConfig` returns `{valid: boolean, errors: string[]}` — structured error array inspectable programmatically
- `saveConfig` writes formatted JSON (2-space indent) to `.gsd/issues.json` — agent can `cat` this file to verify config state
- Extension entry point registers `/issues` command — agent can invoke `/issues` to verify command exists; unimplemented subcommands respond with "not yet implemented" notification

## Expected Output

- `src/lib/config.ts` — Config types, loadConfig, saveConfig, validateConfig
- `src/lib/__tests__/config.test.ts` — comprehensive config tests
- `src/index.ts` — extension entry point with `/issues` command registration
