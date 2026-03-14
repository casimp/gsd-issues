# S02: Config and Setup Command — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02 is contract-level proof — config module and setup flow are mock-tested. No real CLIs or remote services needed. All verification is structural: types compile, validation catches bad input, setup flow writes correct config.

## Preconditions

- Repository cloned and `npm install` completed
- Node.js available (for vitest and tsc)
- No `.gsd/issues.json` exists in the test working directory (tests use temp dirs)

## Smoke Test

Run `npx vitest run` from the project root. All 85 tests pass, including 24 config tests and 11 setup tests. Run `npx tsc --noEmit` — zero errors.

## Test Cases

### 1. Config round-trip (write → read → validate)

1. Call `saveConfig(tmpDir, validGitLabConfig)` where `validGitLabConfig` has all required fields
2. Call `loadConfig(tmpDir)` to read it back
3. Call `validateConfig(result)` on the loaded config
4. **Expected:** Loaded config matches original. `validateConfig` returns `{valid: true, errors: []}`.

### 2. Missing config file gives actionable error

1. Call `loadConfig("/nonexistent/path")`
2. **Expected:** Throws an error containing "Run /issues setup" and the expected file path `.gsd/issues.json`.

### 3. Corrupt JSON config

1. Write non-JSON content to `.gsd/issues.json` in a temp dir
2. Call `loadConfig(tmpDir)`
3. **Expected:** Throws an error (JSON parse failure), does not return silently.

### 4. Validation catches missing provider

1. Call `validateConfig({})` with an empty object
2. **Expected:** Returns `{valid: false, errors: [...]}` where errors include a message about missing `provider` field.

### 5. Validation enforces provider-specific section

1. Call `validateConfig({provider: "gitlab", ...commonFields})` without a `gitlab` section
2. **Expected:** Returns `{valid: false}` with an error about missing `gitlab` section.
3. Call `validateConfig({provider: "github", ...commonFields})` without a `github` section
4. **Expected:** Returns `{valid: false}` with an error about missing `github` section.

### 6. Setup flow — GitHub happy path

1. Mock `detectProvider` to return `"github"`
2. Mock exec to return milestones JSON for `gh milestone list`, user info for `gh auth status`
3. Mock UI to select milestone, input assignee, confirm defaults
4. Call `handleSetup([], ctx, exec)`
5. **Expected:** `.gsd/issues.json` is written with `provider: "github"`, `github` section with `repo` and `close_reason`, selected milestone and assignee, valid config per `validateConfig`.

### 7. Setup flow — GitLab with epic

1. Mock `detectProvider` to return `"gitlab"`
2. Mock exec to return milestones for `glab milestone list`, user for `glab auth status`, project ID for `glab api`
3. Mock UI to select milestone, input assignee, input epic ID
4. Call `handleSetup([], ctx, exec)`
5. **Expected:** `.gsd/issues.json` has `provider: "gitlab"`, `gitlab` section with `project_path`, `project_id`, and `epic_id`, valid config.

### 8. Setup flow — provider detection failure with manual selection

1. Mock `detectProvider` to return `null`
2. Mock UI to select "github" when prompted for provider
3. Mock remaining exec/UI for GitHub flow
4. Call `handleSetup([], ctx, exec)`
5. **Expected:** User is notified "Could not detect provider", then setup completes with manually selected provider.

### 9. Setup flow — auth failure fallback

1. Mock `detectProvider` to return `"github"`
2. Mock exec to throw `ProviderError` for milestone discovery
3. Mock UI to input milestone name manually
4. Call `handleSetup([], ctx, exec)`
5. **Expected:** User is notified with auth guidance ("Run `gh auth login`"), setup continues with manual milestone input, config is written.

### 10. Setup flow — non-interactive mode guard

1. Set `ctx.hasUI = false`
2. Call `handleSetup([], ctx, exec)`
3. **Expected:** Returns immediately with a notification that setup requires interactive mode. No config file written.

### 11. /issues command routing

1. Register the extension via the default export
2. Call the `/issues` handler with no args
3. **Expected:** User gets a usage hint listing available subcommands.
4. Call with arg `"sync"`
5. **Expected:** User gets "not yet implemented" notification.
6. Call with arg `"setup"`
7. **Expected:** Routes to the setup handler (would execute setup flow).

### 12. Subcommand completions

1. Call `getArgumentCompletions` on the registered `/issues` command
2. **Expected:** Returns `["setup", "sync", "import", "close", "status"]`.

## Edge Cases

### Empty milestone list from CLI

1. Mock exec to return empty array for milestone list
2. Mock UI to input milestone name manually when prompted
3. **Expected:** Setup notifies "No milestones found", falls back to manual input, completes successfully.

### Extra fields in config are preserved

1. Write a config with all required fields plus `customField: "value"`
2. Load and validate it
3. **Expected:** `validateConfig` returns `{valid: true}`. Extra field is not stripped.

### Milestone discovery CLI failure (not auth failure)

1. Mock exec to throw a non-auth error for milestone discovery
2. **Expected:** Error is caught, user gets guidance notification, falls back to manual input.

## Failure Signals

- `npx vitest run` reports any test failures
- `npx tsc --noEmit` reports type errors
- `loadConfig` throws without actionable guidance message
- `validateConfig` returns `{valid: true}` for clearly invalid configs (missing provider, wrong types)
- Setup flow throws unhandled rejections instead of catching CLI failures
- Setup writes config that fails its own `validateConfig` check

## Requirements Proved By This UAT

- R002 (Unified config with interactive setup) — contract-proved: config type system, file I/O, structural validation, interactive setup with both providers and fallback paths
- R011 (Slash commands) — contract-proved: `/issues` command registered with routing, `setup` subcommand fully functional, other subcommands stubbed with appropriate messages

## Not Proven By This UAT

- R002 runtime behavior — config consumed by real workflows (S03+)
- R011 remaining subcommands — `sync`, `import`, `close`, `status` are stubs (S03–S05)
- No live CLI interaction — all provider calls are mocked
- No actual `.gsd/issues.json` creation in a real project context

## Notes for Tester

All test cases are already automated in vitest. Running `npx vitest run` exercises every case listed above. Manual UAT would involve loading the extension in pi and running `/issues setup` against a real repository — that's deferred until S03+ when the config is consumed by actual workflows.
