# S02: Config and Setup Command

**Goal:** Config module (`loadConfig`/`saveConfig`/`validateConfig`) consumed by S03–S05, and `/issues` command registered with subcommand routing — `setup` fully implemented, other subcommands stubbed.
**Demo:** User runs `/issues setup`, walks through interactive config (provider detection → milestone selection → assignee → labels → branch pattern), `.gsd/issues.json` is written and validated. Running `/issues` with no args shows help. Stubs for `sync`, `import`, `close`, `status` respond with "not yet implemented".

## Must-Haves

- `Config` type with common fields + provider-specific `gitlab?`/`github?` sections
- `loadConfig(cwd)` reads `.gsd/issues.json`, validates, throws with guidance on missing file
- `saveConfig(cwd, config)` writes `.gsd/issues.json` with parent dir creation
- `validateConfig(config)` returns `{valid, errors[]}` — structural validation, no schema library
- Extension default export registers `/issues` command with `getArgumentCompletions`
- Subcommand routing: `setup` fully implemented, `sync`/`import`/`close`/`status` stubbed
- Setup flow: detect provider → discover milestones/labels via CLI → collect user input → write config → validate
- Guard `ctx.hasUI` — notify and return if interactive UI unavailable
- Handle auth failures, empty milestone lists, and detection failures gracefully

## Proof Level

- This slice proves: contract
- Real runtime required: no (mock-tested config module, setup flow tested against mock exec/UI)
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass including new config and setup tests
- `npx tsc --noEmit` — clean typecheck
- `src/lib/__tests__/config.test.ts` — validates load/save/validate round-trip, missing file error, corrupt data, validation error messages, provider-specific section enforcement
- `src/commands/__tests__/setup.test.ts` — validates setup flow: provider detection, milestone discovery, config writing, auth failure handling, non-interactive mode guard

## Observability / Diagnostics

- Runtime signals: `loadConfig` throws with guidance message ("Run /issues setup") on missing file; `validateConfig` returns structured error array
- Failure visibility: `ProviderError` from CLI discovery surfaces provider/operation/stderr; `validateConfig` errors list exactly which fields are wrong
- Redaction constraints: none (no secrets in config)

## Integration Closure

- Upstream surfaces consumed: `src/providers/detect.ts` (`detectProvider`), `src/providers/types.ts` (`ExecFn`, provider name literals)
- New wiring introduced in this slice: `src/index.ts` extension entry point, `/issues` command registration
- What remains before the milestone is truly usable end-to-end: S03 (sync), S04 (close), S05 (import), S06 (packaging)

## Tasks

- [x] **T01: Config module and extension entry point with command routing** `est:30m`
  - Why: Establishes the `Config` type and load/save/validate functions that every downstream slice imports, plus the `/issues` command shell that all subcommands plug into
  - Files: `src/lib/config.ts`, `src/index.ts`, `src/lib/__tests__/config.test.ts`
  - Do: Define `Config`, `GitLabConfig`, `GitHubConfig` types. Implement `loadConfig(cwd)` (read `.gsd/issues.json`, parse, validate, throw on missing/invalid), `saveConfig(cwd, config)` (mkdir + writeFile), `validateConfig(config)` (structural checks returning `{valid, errors[]}`). Create `src/index.ts` as default export `ExtensionFactory` — register `/issues` command with `getArgumentCompletions` for subcommands, route `setup` to handler (imported from `src/commands/setup.ts` — stub initially), route `sync`/`import`/`close`/`status` to "not yet implemented" notifiers. Follow S01 patterns: structural validation, file I/O with mkdir. Follow GSD extension patterns: registerCommand with args parsing.
  - Verify: `npx vitest run src/lib/__tests__/config.test.ts` passes, `npx tsc --noEmit` clean
  - Done when: `loadConfig`/`saveConfig`/`validateConfig` round-trip works, validation catches missing provider, wrong types, missing provider-specific section; extension compiles and registers command

- [x] **T02: Interactive setup command with CLI discovery** `est:40m`
  - Why: Delivers the user-facing setup flow — the primary entry point for configuring gsd-issues per-repo
  - Files: `src/commands/setup.ts`, `src/commands/__tests__/setup.test.ts`
  - Do: Implement `handleSetup(args, ctx, exec)` using `ctx.ui.select`/`ctx.ui.input`/`ctx.ui.confirm`. Steps: (1) detect provider via `detectProvider`, allow manual override on failure; (2) discover milestones via `glab milestone list --output json` or `gh milestone list --json`; (3) discover current user; (4) collect remaining fields (done_label, branch_pattern, labels); (5) for GitLab: discover project path/id, optional epic; (6) for GitHub: discover repo, optional project; (7) write config via `saveConfig`; (8) validate and display summary. Guard `ctx.hasUI` at top. Handle CLI auth failures with clear guidance. Handle empty milestone lists with manual input fallback. Wire into `src/index.ts` by replacing stub import.
  - Verify: `npx vitest run src/commands/__tests__/setup.test.ts` passes, `npx tsc --noEmit` clean
  - Done when: Setup flow handles both providers, auth failures, empty milestones, non-interactive mode; config is written and validated end-to-end

## Files Likely Touched

- `src/lib/config.ts`
- `src/lib/__tests__/config.test.ts`
- `src/index.ts`
- `src/commands/setup.ts`
- `src/commands/__tests__/setup.test.ts`
