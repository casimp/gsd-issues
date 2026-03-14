# S01: Provider Abstraction and Core Types — Research

**Date:** 2026-03-14

## Summary

S01 delivers the foundational layer: `IssueProvider` interface, GitLab and GitHub implementations via their respective CLIs, provider auto-detection from git remote, and ISSUE-MAP.json persistence. This is a greenfield project — no source files exist yet. The pi extension API is well-understood from `types.ts` and the reference GSD extension. Both `glab` (v1.89.0) and `gh` (v2.82.0) are installed and authenticated.

The biggest implementation risk is CLI output parsing — both CLIs return URLs on issue creation, but the output format is only documented by convention, not contract. Using `pi.exec()` (which returns `{ stdout, stderr, code, killed }`) is straightforward. Provider detection from git remote URL is simple regex work. ISSUE-MAP.json is a flat JSON array — no complex schema needed.

Requirements covered: **R001** (provider abstraction + auto-detection) and **R008** (ISSUE-MAP.json mapping persistence).

## Recommendation

Build the provider interface and implementations as pure TypeScript modules with no extension registration — S01 produces library code consumed by later slices. Use `pi.exec()` for all CLI calls. Parse issue IDs from the URL that both CLIs print on stdout after creation. Use `glab api` and `gh api` for operations that need JSON output (listing, querying). Auto-detect provider by parsing the hostname from `git remote get-url origin`. Keep the `IssueProvider` interface minimal — only the operations downstream slices actually need (create, close, list, addLabels).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Tool parameter schemas | `@sinclair/typebox` (already in pi) | Pi convention — `registerTool` expects TypeBox schemas |
| CLI execution | `pi.exec(command, args, options)` | Returns typed `ExecResult`, handles timeout/abort, required by pi architecture |
| Event bus | `pi.events` (`EventBus`) | Simple emit/on — no custom pub/sub needed |
| JSON file I/O | `node:fs/promises` (`readFile`/`writeFile`) | Standard, no wrapper needed for simple JSON persistence |

## Existing Code and Patterns

- `di-core/.gsd/skills/gitlab-sync/SKILL.md` — Working `glab issue create` commands with `--title`, `--milestone`, `--assignee`, `--weight`, `--label`, `--yes` flags. IID extraction: `grep -oP '\d+$'` on stdout URL. Epic assignment via `glab api -X POST "groups/$GROUP_ID/epics/$EPIC_IID/issues/$ISSUE_ID"`. This is the primary reference for the GitLab provider.
- `di-core/.gsd/skills/gitlab-close/SKILL.md` — Close via `glab issue close $IID`, done label via `glab issue update $IID --label "$DONE_LABEL"`. MR-aware: skip close when MR will auto-close. This pattern carries into S04 but informs the provider interface shape.
- `di-core/.gsd/skills/gitlab-import/SKILL.md` — List via `glab api "projects/$PROJECT_ID/issues?milestone=$M&state=opened&per_page=100"` returning JSON. This confirms glab REST API returns standard GitLab JSON.
- `~/.gsd/agent/extensions/gsd/index.ts` — Reference extension showing `pi.on("tool_result", ...)` hook pattern, `isToolCallEventType()` type guards, command/tool registration.
- `pi-coding-agent/src/core/extensions/types.ts` — Full `ExtensionAPI` type: `pi.exec()` returns `ExecResult { stdout, stderr, code, killed }`. `WriteToolResultEvent` has `input: { path, content }` for summary detection. `EventBus` has `emit(channel, data)` and `on(channel, handler)`.
- `pi-coding-agent/src/core/exec.ts` — `pi.exec()` uses `child_process.spawn` with `shell: false`. Args are `string[]`, not a shell string. Important: no shell expansion, so no globbing or piping.

## Constraints

- **`pi.exec()` is `shell: false`** — cannot pipe, redirect, or use shell expansion. Each CLI call must be a single command with explicit args array. Parsing output must happen in TypeScript, not via `grep -oP`.
- **`glab` requires PATH** — `glab` lives at `$HOME/.local/bin/glab`. The `pi.exec()` call inherits the process environment, so PATH should already include it, but worth verifying in integration tests.
- **No `--json` flag on `glab issue create`** — `glab issue create` outputs a URL to stdout (e.g. `https://gitlab.com/group/project/-/issues/123`). Must parse IID from URL with regex. `gh issue create` also outputs a URL (e.g. `https://github.com/owner/repo/issues/42`). Both use `\d+` at end of URL.
- **`glab issue list` supports `--output json`** — Returns JSON array with full issue objects. `gh issue list` supports `--json fields` with explicit field selection. Different flags, same idea.
- **`gh issue close` has `--reason` flag** — Supports `completed` or `not planned`. GitLab close has no reason flag — done status is communicated via labels.
- **Epic assignment on GitLab requires REST API** — No `--epic` flag on `glab issue create` that works reliably. Must use `glab api -X POST "groups/$GROUP_ID/epics/$EPIC_IID/issues/$ISSUE_ID"`. This needs the issue's internal ID (not IID), fetched via `glab api "projects/$PROJECT_ID/issues/$IID"`.
- **Import uses `@sinclair/typebox`** — Available at `@sinclair/typebox` via pi's dependency tree. No separate install needed.
- **Git remote URL formats** — SSH: `git@github.com:owner/repo.git`, HTTPS: `https://github.com/owner/repo.git`, also `https://gitlab.example.com/group/subgroup/repo.git`. Detection must handle both SSH and HTTPS, plus self-hosted instances.

## Common Pitfalls

- **Parsing CLI stdout as a contract** — The URL output format from `glab issue create` and `gh issue create` is not formally documented. If the format changes in a CLI update, ID extraction breaks silently. Mitigate: validate that extracted ID is a positive integer, fail loudly if not.
- **Self-hosted GitLab detection** — `detectProvider()` can't just check for `gitlab.com` — self-hosted instances use custom domains. Should default to checking if `glab` is configured for the remote, or fall back to config. For S01, support `gitlab.com` and `github.com` as known hosts; let config override in S02.
- **`pi.exec()` error handling** — Non-zero exit code doesn't throw — must check `result.code !== 0` explicitly. Stderr may contain warnings even on success (e.g. glab prints deprecation notices to stderr).
- **ISSUE-MAP.json concurrency** — Multiple slices completing near-simultaneously could race on file read/write. For S01, use simple read-modify-write with no locking — concurrency is unlikely in practice and can be hardened later if needed.
- **`gh issue create` requires `--body` or will open editor** — Must pass `--body` flag explicitly to avoid interactive mode. Same for `glab` — use `--yes --no-editor` flags.

## Open Risks

- **CLI output format stability** — Both `glab` and `gh` are actively developed. A major version bump could change the URL output format from `create`. Low probability (URLs are stable), but would break ID extraction.
- **Self-hosted provider detection** — S01 will detect `github.com` and `gitlab.com` from git remote. Self-hosted instances (e.g. `gitlab.mycompany.com`) need config-based override, which arrives in S02. Users with self-hosted instances can't auto-detect until S02.
- **`glab` PATH issue** — If `pi.exec()` doesn't inherit the user's PATH modifications, `glab` at `$HOME/.local/bin` may not be found. The extension may need to extend PATH in the exec options. Testable immediately.
- **`gh` auth scope for projects** — `gh issue create --project` requires `project` scope. If the user hasn't granted it, project assignment fails silently or errors. This is an S03 concern but worth noting since the provider interface shape is set here.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GitLab CLI | `wshobson/agents@gitlab-ci-patterns` (3.5K installs) | available — CI/CD focused, not issue tracking |
| GitLab CLI | `vince-winkintel/gitlab-cli-skills@gitlab-cli-skills` (133 installs) | available — generic CLI, low relevance |
| GitHub CLI | `oldwinter/skills@github-cli` (86 installs) | available — generic CLI, low relevance |
| pi extensions | (no external skill) | none found — using pi source types directly |

No skills are worth installing — the predecessor skills in `di-core` plus pi's own type definitions are the authoritative references.

## Sources

- `pi.exec()` signature and `ExecResult` type (source: `pi-coding-agent/src/core/exec.ts`)
- Full `ExtensionAPI` interface including `registerTool`, `on`, `exec`, `events` (source: `pi-coding-agent/src/core/extensions/types.ts`)
- `EventBus` interface: `emit(channel, data)` / `on(channel, handler)` (source: `pi-coding-agent/src/core/event-bus.ts`)
- `glab issue create` outputs URL to stdout, supports `--yes --no-editor` for non-interactive (source: `glab issue create --help`, v1.89.0)
- `gh issue create` outputs URL to stdout, requires `--body` to avoid editor (source: `gh issue create --help`, v2.82.0)
- `glab issue list --output json` for JSON listing, `gh issue list --json fields` for field-selective JSON (source: CLI help output)
- `gh issue close --reason {completed|not planned}` for close reason (source: `gh issue close --help`)
- GitLab epic assignment via REST: `glab api -X POST "groups/$GID/epics/$EID/issues/$IID"` (source: `di-core/.gsd/skills/gitlab-sync/SKILL.md`)
- IID extraction pattern: URL ends in `/issues/{number}`, extract with regex (source: predecessor skill + CLI testing)
