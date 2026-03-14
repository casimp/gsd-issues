# S02: Config and Setup Command — Research

**Date:** 2026-03-14

## Summary

S02 delivers two requirements: R002 (unified config with interactive setup) and R011 (slash commands with subcommand routing). The predecessor `gitlab-setup` skill provides a detailed blueprint for what config fields are needed and how discovery works — but the new implementation must be provider-agnostic, TypeScript-native, and use pi's extension API for interactivity (ctx.ui.select, ctx.ui.input, ctx.ui.confirm) rather than LLM-interpreted bash scripts.

The config schema needs a unified shape with a common section (provider, milestone, assignee, done_label/close_reason, branch_pattern) and provider-specific sections (gitlab: epic, weight_strategy, reorganisation; github: project). The `/issues` command registers with subcommand routing (setup, sync, import, close) using the same pattern as the GSD extension's `/gsd` command — a single `registerCommand` with `getArgumentCompletions` and an `args`-parsing handler.

Config loading (`loadConfig`) and validation (`validateConfig`) are the primary S02 deliverables consumed by S03-S05. Every downstream slice depends on `loadConfig()` returning a validated `Config` object. The setup command is the user-facing entry point but the config module is the critical contract.

## Recommendation

1. **Config module** (`src/lib/config.ts`): Define `Config` type, `loadConfig(cwd)`, `saveConfig(cwd, config)`, and `validateConfig(config)`. Follow the same structural-validation-over-schema-library pattern from S01 (D014). Config file lives at `.gsd/issues.json`. `loadConfig` throws on missing file with guidance to run `/issues setup`. `validateConfig` returns `{valid: boolean, errors: string[]}` for use in both load-time validation and setup-time preview.

2. **Command registration** (`src/index.ts`): Default export `ExtensionFactory` function. Register `/issues` command with subcommands: `setup`, `sync`, `import`, `close`, `status`. S02 implements `setup` handler fully; `sync`, `import`, `close` stubs that notify "not yet implemented" (filled in S03-S05). Register `getArgumentCompletions` for tab-completion.

3. **Setup flow** (`src/commands/setup.ts`): Interactive setup using `ctx.ui.select`, `ctx.ui.input`, `ctx.ui.confirm`. Steps: detect provider → discover project info via CLI → present findings → collect user input → write config → validate. The setup command runs the provider CLIs through `pi.exec()` for discovery (milestones, labels, assignee, project info).

4. **No TypeBox in S02**: TypeBox is only needed for `registerTool` parameter schemas (S03+). S02 only registers a command, which takes plain `(args: string, ctx)`.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Provider detection | `detectProvider(cwd, exec)` from S01 | Already handles SSH/HTTPS parsing, returns `'github' \| 'gitlab' \| null` |
| CLI execution | `pi.exec()` (via `ExtensionAPI.exec()`) | Extension convention — same `ExecFn` signature providers use |
| Interactive UI | `ctx.ui.select()`, `ctx.ui.input()`, `ctx.ui.confirm()` | pi extension API — handles interactive/RPC mode differences |
| File I/O with mkdir | Pattern from `saveIssueMap` in S01 | `mkdir -p` then `writeFile` — same approach for `saveConfig` |

## Existing Code and Patterns

- `src/providers/detect.ts` → `detectProvider(cwd, exec?)` returns `'github' | 'gitlab' | null`. S02 uses this to auto-populate the provider field during setup. Takes optional exec function for testability.
- `src/providers/types.ts` → `ExecFn`, `ExecResult`, `ProviderError` types. Config module imports provider name literals from here.
- `src/lib/issue-map.ts` → Pattern for file load/save with structural validation, missing file handling, corrupt data errors, parent dir creation. Config module follows the same pattern.
- `~/.gsd/agent/extensions/gsd/index.ts` → Reference extension: default export factory, `pi.registerCommand()`, `pi.on()` hooks. Shows how to structure `index.ts`.
- `~/.gsd/agent/extensions/gsd/commands.ts` → Subcommand routing pattern: `registerCommand("gsd", { getArgumentCompletions, handler })` with `args.trim()` parsing and if/else dispatch. `/issues` follows identical pattern.
- `di-core/.gsd/skills/gitlab-setup/SKILL.md` → Config schema blueprint. Fields: project_path, project_id, milestone, assignee, epic, done_label, branch_pattern, weight_strategy, reorganisation. Validation snippet shows all required/optional fields and their types.

## Config Schema Design

### Common fields (both providers)
- `provider`: `"github" | "gitlab"` (auto-detected, user-confirmable)
- `milestone`: string (active milestone title — required for sync)
- `assignee`: string (default assignee username)
- `done_label`: string | null (label applied on close — GitLab uses e.g. "T::Done", GitHub may use "done" or null)
- `branch_pattern`: string (template: `{issue_id}-gsd/{milestone}/{slice}`)
- `labels`: string[] (default labels for new issues — optional)

### GitLab-specific section
- `gitlab.project_path`: string (e.g. "group/subgroup/project")
- `gitlab.project_id`: number (numeric project ID for API calls)
- `gitlab.epic`: `{iid: number, group_id: number, group_path: string} | null`
- `gitlab.weight_strategy`: `{type: "size_based" | "none", sizes?: {small: number, medium: number, large: number}}`
- `gitlab.reorganisation`: `{absorbed: "close_with_reference" | "leave_open", weight: "reconcile" | "zero_and_reweight" | "none", comment_template?: string}`

### GitHub-specific section
- `github.repo`: string (e.g. "owner/repo" — for gh -R flag if needed)
- `github.project`: `{number: number} | null` (optional Projects V2)
- `github.close_reason`: `"completed" | "not_planned"` (default close reason)

### Type structure
```typescript
interface Config {
  provider: "github" | "gitlab";
  milestone: string;
  assignee: string;
  done_label: string | null;
  branch_pattern: string;
  labels: string[];
  gitlab?: GitLabConfig;
  github?: GitHubConfig;
}
```

The provider-specific section is only required when `provider` matches. Validation enforces this.

## Constraints

- **pi.exec() for all CLI calls** — cannot use `child_process` directly in the extension. S01 providers already follow this; setup discovery must too.
- **`ExtensionFactory` is the entry point** — default export function receiving `ExtensionAPI`. Must be sync or async.
- **`registerCommand` takes `(args: string, ctx: ExtensionCommandContext)`** — the handler receives the full args string after the command name. Subcommand routing is manual string parsing.
- **ctx.ui may not be available** — `ctx.hasUI` is false in RPC/print mode. Setup must guard interactive UI calls.
- **TypeBox import from `@sinclair/typebox`** — pi's extension loader aliases this to its bundled v0.34.x. Only needed for `registerTool` (S03+), not `registerCommand`.
- **Config file path is `.gsd/issues.json`** — per D003. Must be relative to project root (cwd).
- **`glab` needs PATH to include `$HOME/.local/bin`** — setup discovery commands need this in exec env option.
- **No runtime schema deps** — D014 established structural validation pattern. Config validation follows suit.

## Common Pitfalls

- **Interactive setup in non-interactive mode** — If `ctx.hasUI` is false, setup can't use select/input/confirm. Guard with early return and notify, or fall back to non-interactive mode that validates an existing config file.
- **glab auth not configured** — `glab auth status` may fail. Discovery step should handle this gracefully and tell the user to authenticate first rather than crashing.
- **GitHub repo context** — `gh` needs to be run from within a git repo or with `-R owner/repo` flag. Discovery should detect this.
- **Config migration** — Users may edit `.gsd/issues.json` manually. `loadConfig` should validate and surface clear errors, not silently corrupt.
- **Empty milestone list** — Both `glab` and `gh` might return no milestones. Setup should handle this and let the user type a milestone name manually.
- **Epic discovery on GitLab** — Requires `glab api` for REST endpoint, not a simple CLI flag. The setup flow should make epic optional and use API call only when user wants it.

## Open Risks

- **Provider discovery failures in CI or unusual setups** — `detectProvider` returns null for unknown hosts. Setup should allow manual provider selection as fallback.
- **glab/gh CLI version differences** — The JSON output format for milestone/label discovery might differ across versions. Setup discovery commands should handle parse failures gracefully.
- **Config schema evolution** — As S03-S05 are built, new fields might be needed. `loadConfig` should be tolerant of extra fields (pass through) and `validateConfig` should be strict only on required fields. Adding a `version` field now would future-proof migration.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | zenobi-us/dotfiles@creating-pi-extensions (26 installs) | available — covers extension authoring patterns |
| TypeBox | epicenterhq/epicenter@typebox (42 installs) | available — not needed for S02, useful for S03+ |

Neither skill is critical for S02. The pi extension API types and reference extension provide sufficient guidance. The TypeBox skill may be worth considering when S03 needs tool registration.

## Sources

- pi extension types: `types.ts` — full ExtensionAPI, registerCommand, ExtensionUIContext signatures
- GSD extension reference: `~/.gsd/agent/extensions/gsd/index.ts` + `commands.ts` — subcommand routing, UI interaction patterns
- Predecessor setup skill: `di-core/.gsd/skills/gitlab-setup/SKILL.md` — config schema, discovery steps, validation logic
- S01 summary: established patterns for structural validation, ExecFn injection, file I/O with mkdir
- EventBus: simple `emit(channel, data)` / `on(channel, handler)` — used for `gsd-issues:*` events
