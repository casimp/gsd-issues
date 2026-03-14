---
estimated_steps: 5
estimated_files: 3
---

# T02: Interactive setup command with CLI discovery

**Slice:** S02 — Config and setup command
**Milestone:** M001

## Description

Implement the full `/issues setup` flow as an interactive command that detects the provider, discovers project metadata via CLI, walks the user through configuration, and writes a validated `.gsd/issues.json`. This is the primary user entry point for configuring gsd-issues per repository.

## Steps

1. Create `src/commands/setup.ts` with `handleSetup(args: string, ctx: ExtensionCommandContext, exec: ExecFn)`. Guard `ctx.hasUI` at top — if false, notify "Setup requires interactive mode" and return. Call `detectProvider(cwd, exec)` to auto-detect. If null, use `ctx.ui.select` to let user choose manually.
2. Implement provider-specific discovery helpers (private functions in setup.ts): `discoverMilestones(provider, exec, cwd)` fetches milestones via `glab milestone list --output json` or `gh milestone list --json title,number`. `discoverCurrentUser(provider, exec)` gets username from `glab auth status` or `gh auth status`. Handle CLI failures gracefully — catch ProviderError and fall back to manual input with `ctx.ui.input`.
3. Build the interactive collection flow: select milestone from discovered list (or type manually if list empty), input assignee (default from discovery), input done_label (with sensible defaults per provider: `"T::Done"` for GitLab, `null` for GitHub), input branch_pattern (default `{issue_id}-gsd/{milestone}/{slice}`), multi-input labels. For GitLab: discover project path/id from remote URL, optional epic via `ctx.ui.confirm` + `ctx.ui.input`. For GitHub: discover repo from remote, optional project number.
4. Assemble the `Config` object, call `saveConfig`, call `validateConfig` to double-check, display summary via `ctx.ui.notify` with the config fields shown. If validation fails (shouldn't happen given controlled input, but guard), show errors.
5. Write `src/commands/__tests__/setup.test.ts` — mock `ctx.ui` (select/input/confirm/notify) and `exec`. Test: GitHub happy path (detect → discover milestones → collect → write → validate), GitLab happy path with project path and epic, detection failure with manual provider selection, auth failure fallback to manual input, empty milestone list with manual input, non-interactive mode early return. Wire `handleSetup` into `src/index.ts` by updating the setup route.

## Must-Haves

- [ ] `ctx.hasUI` guard with early return and notification
- [ ] Provider auto-detection with manual fallback on failure
- [ ] Milestone discovery from CLI with manual fallback on empty list
- [ ] User discovery from CLI with manual fallback on auth failure
- [ ] Provider-specific sections populated (GitLab: project_path, project_id; GitHub: repo, close_reason)
- [ ] Config written via `saveConfig` and validated
- [ ] Summary displayed to user after successful setup
- [ ] All discovery failures handled gracefully — no unhandled rejections

## Verification

- `npx vitest run src/commands/__tests__/setup.test.ts` — all setup tests pass
- `npx tsc --noEmit` — zero type errors
- Full test suite: `npx vitest run` — all tests pass (S01 tests still green)

## Observability Impact

- Signals added: CLI discovery failures surface via `ctx.ui.notify` with specific guidance ("Run `glab auth login` first" / "Run `gh auth login` first")
- How a future agent inspects this: `loadConfig` error messages tell you exactly what's wrong; setup test mocks show expected CLI invocations
- Failure state exposed: auth not configured, no milestones found, detection returned null — all visible to the user with actionable next steps

## Inputs

- `src/lib/config.ts` — `Config` type, `saveConfig`, `validateConfig` (from T01)
- `src/index.ts` — command registration stub to wire into (from T01)
- `src/providers/detect.ts` — `detectProvider` for auto-detection
- `src/providers/types.ts` — `ExecFn` type for injected exec

## Expected Output

- `src/commands/setup.ts` — complete interactive setup handler
- `src/commands/__tests__/setup.test.ts` — comprehensive setup tests with mocked UI and exec
- `src/index.ts` — updated to import real setup handler instead of stub
