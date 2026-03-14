# S03: Sync Workflow — Research

**Date:** 2026-03-14

## Summary

S03 bridges roadmap parsing, provider issue creation, and ISSUE-MAP.json persistence into a single sync flow — the core value loop of gsd-issues. The existing provider layer (S01) handles issue creation and the config layer (S02) handles settings, but several pieces are missing: roadmap parsing, epic assignment via REST API, weight handling, the `gsd_issues_sync` tool registration, and the confirmation UX flow. The extension API types in `src/index.ts` also need extending to expose `registerTool`, `exec`, and `events`.

The predecessor `gitlab-sync` skill provides a battle-tested workflow (13 steps) that maps directly to what S03 must do deterministically. The main design challenge is handling provider-specific features (GitLab epics/weight vs GitHub milestones/labels) cleanly through the existing provider abstraction without bloating the shared interface.

## Recommendation

Build three modules:
1. **`src/lib/state.ts`** — `parseRoadmapSlices(roadmapPath)` to extract slice metadata from roadmap files. `readGSDState(cwd)` to find the active milestone. These are the deferred D011 helpers.
2. **`src/lib/sync.ts`** — Core sync orchestration: load config → load existing map → parse roadmap → filter unmapped → create issues → handle GitLab extras (epic, weight) → save map → emit event. Accepts injected `ExecFn` and provider for testability.
3. **`src/commands/sync.ts`** — Command/tool handler: load config → instantiate provider → call sync with confirmation UX → report results.

Epic assignment belongs in the GitLab provider (new `assignToEpic` method using `glab api`), not in the sync module. Weight is passed through `CreateIssueOpts.weight` which GitLabProvider already handles. This keeps provider-specific details in providers and sync logic clean.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CLI execution | `ExecFn` injection pattern from S01 | Testable without real CLIs, matches pi.exec() signature |
| Issue creation | `IssueProvider.createIssue()` from S01 | Already handles `--milestone`, `--assignee`, `--weight`, `--label` |
| Issue map persistence | `loadIssueMap()` / `saveIssueMap()` from S01 | Structural validation, missing-file handling, dir creation |
| Config loading | `loadConfig()` from S02 | Throws with guidance on missing/invalid config |
| TypeBox schemas | `@sinclair/typebox` (pi convention) | Required for `registerTool` parameter schemas |

## Existing Code and Patterns

- `src/providers/types.ts` — `IssueProvider`, `CreateIssueOpts` (title, description, milestone, assignee, labels, weight), `IssueMapEntry` (localId, issueId, provider, url, createdAt), `ExecFn`, `ProviderError`
- `src/providers/gitlab.ts` — `GitLabProvider.createIssue()` handles `--weight` flag, `--milestone`, `--label`. Private `run()` centralizes exec + error throwing. Constructor takes `(exec, projectPath?)`.
- `src/providers/github.ts` — `GitHubProvider.createIssue()` ignores `weight` (GitLab-only), always passes `--body`. Constructor same shape.
- `src/lib/issue-map.ts` — `loadIssueMap(filePath)` returns `[]` for missing file, validates structure. `saveIssueMap(filePath, entries)` creates parent dirs.
- `src/lib/config.ts` — `Config` type with `provider`, `milestone`, `assignee?`, `done_label?`, `labels?`, plus `gitlab?: GitLabConfig` and `github?: GitHubConfig`. `GitLabConfig` has `project_path`, `project_id`, `epic?`, `weight_strategy?`, `reorganisation?`.
- `src/index.ts` — Extension entry point with local `ExtensionAPI` type (only `registerCommand` currently). `sync` case is a stub returning "not yet implemented". Must extend API types and replace stub.
- `src/commands/setup.ts` — Reference pattern for command handlers: `handleSetup(args, ctx)` exported, dynamic-imported in index.ts. Uses `ctx.ui.*` for interactive flow.
- Predecessor `gitlab-sync` SKILL.md — Full 14-step workflow: validate config → load values → find roadmap → parse slices → check existing map → determine weight → handle absorbed tickets → preview → confirm → create issues → assign epic → write map → output branches → report.

## Constraints

- **`@sinclair/typebox` must be added as a dependency** — not currently in `package.json`. Required for `registerTool` parameter schemas.
- **ExtensionAPI types must be extended** — current local types only cover `registerCommand`. Need `registerTool`, `exec`, `events`. Must match pi's actual API (inspected in `types.ts`).
- **Epic assignment requires `glab api` REST call** — `glab api -X POST "groups/{group_id}/epics/{epic_iid}/issues/{issue_id}"`. This needs the project-level issue ID (not IID), which requires a separate `glab api "projects/{project_id}/issues/{iid}"` call first. Two API calls per issue for epic assignment.
- **Epic config is a string like `&42`** — need to parse the IID from it. The predecessor stored `epic.iid`, `epic.group_id`, `epic.group_path` separately; S02's config stores just `epic?: string`. This means epic assignment in S03 either needs a richer config shape or must discover the group path from the project.
- **Roadmap format is fixed** — `- [ ] **S01: Title** \`risk:level\` \`depends:[]\`` with optional `> After this: ...` on next line. Parser must handle both `[ ]` and `[x]` checkboxes.
- **Weight comes from config, not per-slice** — the predecessor asked for S/M/L per slice. S02's config has `weight_strategy: "none" | "fibonacci" | "linear"` but no size mapping. Weight values are not configurable in the current config shape. Options: (a) hardcode sensible defaults for fibonacci/linear, (b) extend config schema, (c) prompt user during sync. Recommend (a) with hardcoded mappings.
- **`sendUserMessage` on ExtensionAPI** for triggering sync as part of GSD flow — but for S03, the sync is triggered via `/issues sync` command or `gsd_issues_sync` tool. The "prompted step" (R009) means the tool/command handles confirmation, not that it auto-triggers.
- **PATH for glab** — `glab` requires `$HOME/.local/bin` in PATH. The `ExecFn` can pass `env` option, but pi.exec() likely inherits the full environment. Worth noting but likely handled by the shell.

## Common Pitfalls

- **Epic config is too sparse** — S02 stores `epic?: string` (e.g., `"&42"`) but epic assignment needs `group_id` (or `group_path`) and `epic_iid` separately. The `glab api` endpoint is `groups/{group_id}/epics/{epic_iid}/issues/{issue_id}`. Without `group_id`, we'd need to discover it from the project, adding another API call. **Decision needed**: extend GitLabConfig or discover at sync time.
- **Weight strategy has no size values** — Config has `weight_strategy: "none" | "fibonacci" | "linear"` but no per-slice size assignment or default values. The predecessor had `sizes: { small: N, medium: N, large: N }`. Without sizes, weight can't be computed. For initial S03, recommend: if `weight_strategy !== "none"`, skip weight (log a warning) rather than block sync. Weight handling can be added in a follow-up or config extension.
- **Re-sync safety** — Must check `loadIssueMap()` for existing entries and skip slices already mapped. Match on `localId` (slice ID). The predecessor checks `(slice_id, issue_iid)` tuples.
- **`--yes --no-editor` flags** — GitLab's `glab issue create` needs these for non-interactive mode. Already handled by `GitLabProvider.createIssue()`.
- **GitHub `--body` required** — Must pass `--body` to prevent editor mode. Already handled by `GitHubProvider.createIssue()`.
- **Issue description format** — Should include slice demo line and GSD metadata for traceability. Use a consistent template.
- **Title format** — Predecessor uses `feat(gsd): <slice title in lowercase>`. S03 should follow this or make it configurable. Recommend: configurable title prefix in config with a sensible default.

## Open Risks

- **Epic config gap is the biggest risk** — The current `GitLabConfig.epic` is just a string (`"&42"`). Epic assignment via REST requires `group_id` and `epic_iid`. Either the config shape needs extending (breaking S02's schema) or the sync module needs to discover group info via `glab api`, adding fragile discovery logic. Recommend: extend `GitLabConfig.epic` to be `{ iid: number; group_id: number }` or discover via `glab api "projects/{project_id}"` at sync time.
- **Weight strategy lacks concrete values** — No way to compute weight from the current config. Recommend deferring weight to a config schema extension or making it per-slice interactive during sync.
- **Reorganisation complexity** — The predecessor supports absorbed ticket handling (close/comment/weight reconciliation). This is in scope (R006) but is complex. Recommend: implement basic reorganisation (close with reference) and defer weight reconciliation to avoid scope explosion. The config has `reorganisation?: boolean` — when `true`, prompt for absorbed tickets.
- **Tool return type** — `registerTool.execute()` must return `AgentToolResult<T>` = `{ content: (TextContent | ImageContent)[], details: T }`. Need to structure sync results for both LLM consumption (text content) and UI rendering (details).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GitHub CLI (gh) | gh (bundled) | installed |
| TypeScript | none relevant | none found |
| pi extension API | none relevant | none found |

## Sources

- Provider interface and types (source: `src/providers/types.ts`)
- GitLab/GitHub provider implementations (source: `src/providers/gitlab.ts`, `src/providers/github.ts`)
- Config types and validation (source: `src/lib/config.ts`)
- Extension API types (source: pi core `packages/pi-coding-agent/src/core/extensions/types.ts`)
- EventBus interface (source: pi core `packages/pi-coding-agent/src/core/event-bus.ts`)
- Predecessor sync workflow (source: `di-core/.gsd/skills/gitlab-sync/SKILL.md`)
- Tool registration pattern (source: pi core tools `bash.ts`, GSD extension `index.ts`)
- TypeBox schema convention (source: `@sinclair/typebox` usage in pi core tools)
