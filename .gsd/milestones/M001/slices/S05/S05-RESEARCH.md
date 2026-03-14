# S05: Import Workflow — Research

**Date:** 2026-03-14

## Summary

S05 is a clean terminal slice — read-only, no side effects on remote trackers. The import workflow fetches issues from GitLab/GitHub via the existing provider abstraction, formats them as structured markdown, and hands the result to the LLM for planning interpretation (D005). All infrastructure is in place: `IssueProvider.listIssues()` exists on both providers, `loadConfig()` and `createProvider()` are battle-tested, the `/issues import` command stub and subcommand routing are wired up in `index.ts`.

The main implementation work is: (1) extending the `Issue` type with optional fields needed for rich import output (weight, milestone, assignee, description), (2) updating both providers' `listIssues` to populate them, (3) writing the import module with markdown formatting, and (4) wiring the command handler and LLM tool. No new patterns needed — this follows S03/S04's established structure exactly.

The predecessor `gitlab-import` skill uses `glab api` REST endpoints for richer data. However, `glab issue list --output json` returns the full API issue object — the current `GlabListItem` type just doesn't extract all fields. Similarly, `gh issue list --json` supports a `body` field that's not currently requested. Extending both providers to return richer data is safe since `listIssues` has no consumers yet in production code — only provider tests use it.

## Recommendation

Extend the `Issue` type with optional fields (`weight?`, `milestone?`, `assignee?`, `description?`), update both providers to populate them from existing CLI output, then build `importIssues()` as a pure formatting function over `Issue[]`. Keep the provider abstraction — don't bypass it with raw API calls. The `IssueFilter` type already supports milestone/label/assignee/state filtering. Epic-based filtering (GitLab-specific, uses a different API endpoint) is out of scope for this slice — milestone + label covers the primary use cases.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Provider instantiation | `createProvider(config, exec)` in `index.ts` | Already used by sync and close — same factory pattern |
| Config loading + validation | `loadConfig(cwd)` in `lib/config.ts` | Throws with actionable guidance on missing/invalid config |
| Milestone resolution | `readGSDState(cwd)` + `config.milestone` | Same fallback chain as sync and close commands |
| Issue listing with filters | `provider.listIssues(filter)` | Both providers implement filtering via CLI flags |
| Tool schema definition | `Type.Object({...})` from `@sinclair/typebox` | Convention from sync and close tools |
| Event emission | `pi.events.emit.bind(pi.events)` passed as `emit` param | Pattern from sync and close modules |

## Existing Code and Patterns

- `src/providers/types.ts` → `Issue` type to extend, `IssueFilter` already has milestone/labels/assignee/state fields, `IssueProvider.listIssues()` method signature
- `src/providers/gitlab.ts` → `GlabListItem` interface needs `weight`, `description`, `milestone`, `assignees` added; `listIssues` mapping needs to extract them. Uses `glab issue list --output json` which returns full API object
- `src/providers/github.ts` → `GhListItem` already has `milestone` and `assignees`; needs `body` field added. `--json` field list needs `body` appended
- `src/lib/sync.ts` → Reference for module structure: options interface, result type, core function, TypeBox schema export
- `src/lib/close.ts` → Reference for simpler module structure with emit pattern
- `src/commands/sync.ts` → Command handler pattern: load config → resolve milestone → create provider → call core function → report via `ctx.ui.notify`
- `src/commands/close.ts` → Simpler command with arg parsing; import needs filter arg parsing (milestone, labels)
- `src/index.ts` → `createProvider()` factory at module level; import case is stubbed at line 280; tool registration pattern from `gsd_issues_sync` and `gsd_issues_close`
- `src/lib/state.ts` → `readGSDState()` for milestone fallback — same pattern as sync/close
- `/home/casimp/software/di-core/.gsd/skills/gitlab-import/SKILL.md` → Predecessor: uses `glab api` for REST queries, outputs structured markdown with `## #IID: Title` headers, truncates descriptions at 500 chars, sorts by weight descending

## Constraints

- `Issue` type extension must use optional fields — existing consumers (sync, close, provider tests) don't populate or read them
- Provider tests use `toEqual` on `Issue` objects — adding new fields to provider output requires updating test expectations or switching to `toMatchObject`
- `glab issue list --output json` returns full GitLab API response but current `GlabListItem` only extracts 5 fields — extending is safe, no CLI output format change
- `gh issue list --json` needs explicit field names — `body` must be added to the `--json` argument
- GitLab milestone filter uses title string (`--milestone "v2.0"`), not milestone ID
- GitLab has `weight` as a numeric field; GitHub has no equivalent — optional in `Issue` type
- Import is read-only — no outward-facing actions, no confirmation needed
- The formatted markdown is for LLM consumption, not a final user artifact — structure for parseability, not prettiness
- Description truncation (500 chars from predecessor) keeps context manageable for LLM planning

## Common Pitfalls

- **Breaking existing provider tests** — Tests for `listIssues` use `toEqual` with exact `Issue` shapes. When providers start returning new optional fields, either update test data to include them or switch assertions to `toMatchObject`. Safest: update `GlabListItem`/`GhListItem` to include new fields, add them to test mock data, update `toEqual` expectations.
- **GitLab assignees format** — GitLab REST API returns `assignees: [{username: "..."}]` (array of objects), not a flat string. GitHub returns `assignees: [{login: "..."}]`. Both need normalized to a simple string (first assignee's username/login).
- **Empty issue lists** — `listIssues` may return `[]` for a valid filter that matches nothing. Import should handle gracefully with a "no issues found" message, not an empty markdown blob.
- **Large issue counts** — Both `glab` and `gh` default to 30 results per page. GitLab's `--per-page` maxes at 100. GitHub's `--limit` defaults to 30. Need to pass a reasonable limit to avoid truncation. Predecessor uses `per_page=100`.
- **GitHub `body` field can be null** — `gh issue list --json body` returns `null` for issues without a body, not empty string. Guard against this in the mapping.

## Open Risks

- **glab `--per-page` flag** — The `glab issue list` command uses `--per-page` (not `--limit`). Need to verify the exact flag name for pagination. GitHub uses `--limit`. Current `listIssues` implementations don't set pagination — import should pass a higher limit to avoid silent truncation.
- **GitLab weight field presence** — `glab issue list --output json` should include `weight` in the JSON, but this hasn't been verified against a real GitLab instance. If it's missing, import still works — weight is optional. Will be confirmed during S06 UAT.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| vitest | bobmatnyc/claude-mpm-skills@vitest | available (278 installs) — not needed, test patterns are well-established |

## Sources

- Predecessor import workflow (source: `/home/casimp/software/di-core/.gsd/skills/gitlab-import/SKILL.md`)
- `gh issue list --json` field options (source: `gh issue list --json` with no args, outputs available fields)
- `glab issue list` flags (source: `glab issue list --help`)
