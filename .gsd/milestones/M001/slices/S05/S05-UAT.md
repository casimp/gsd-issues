# S05: Import Workflow — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Import is a read-only workflow calling real CLIs — contract tests prove the formatting/sorting/event pipeline, but real validation requires live `glab`/`gh` calls against actual repositories with issues.

## Preconditions

- A GitLab or GitHub repository with existing issues (at least 3, ideally some with labels, milestones, and varied weights on GitLab)
- `glab` CLI authenticated for GitLab repos, `gh` CLI authenticated for GitHub repos
- `.gsd/issues.json` configured for the target repo (run `/issues setup` first)
- The pi extension loaded (via `npm link` or direct path)

## Smoke Test

1. Run `/issues import` in a repo with configured issues
2. **Expected:** Formatted markdown output appears with `## #ID: Title` headers for each open issue

## Test Cases

### 1. Basic GitLab import

1. Configure a GitLab repo with at least 3 open issues, some with weights
2. Run `/issues import`
3. **Expected:** Markdown output shows all open issues, sorted by weight descending (heaviest first, unweighted last). Each issue has `## #ID: Title` header with labels, weight, milestone, and assignee metadata lines.

### 2. Basic GitHub import

1. Configure a GitHub repo with at least 3 open issues, some with milestones and labels
2. Run `/issues import`
3. **Expected:** Markdown output shows all open issues. Weight line is absent (GitHub has no weight). Milestone and labels appear where present. Issues appear in provider-default order (no weight sorting effect since all are unweighted).

### 3. Import with milestone filter

1. In a repo with issues across multiple milestones
2. Run `/issues import --milestone "Sprint 1"`
3. **Expected:** Only issues in "Sprint 1" milestone appear in the output

### 4. Import with labels filter

1. In a repo with issues across various labels
2. Run `/issues import --labels bug,critical`
3. **Expected:** Only issues matching the specified labels appear

### 5. Import with equals-sign flag syntax

1. Run `/issues import --milestone="Sprint 2" --labels=enhancement`
2. **Expected:** Same filtering behavior as space-separated flags — milestone and label filters applied correctly

### 6. LLM tool path

1. Trigger `gsd_issues_import` tool with `{ milestone: "Sprint 1" }` params
2. **Expected:** Returns a `ToolResult` with formatted markdown in `content[0].text` and `{ markdown, issueCount }` in `details`

### 7. Description truncation

1. Ensure at least one issue has a description longer than 500 characters
2. Run `/issues import`
3. **Expected:** The long description is truncated at 500 chars with `…` suffix. Shorter descriptions appear in full.

### 8. Event emission

1. Set up a listener on `gsd-issues:import-complete` event
2. Run `/issues import`
3. **Expected:** Event fires with `{ issueCount }` matching the number of issues returned

## Edge Cases

### Empty result set

1. Run `/issues import --milestone "NonexistentMilestone"`
2. **Expected:** Output is "No issues found." — not an empty string, not an error

### No config file

1. Delete or rename `.gsd/issues.json`
2. Run `/issues import`
3. **Expected:** Error notification: "No issues config found" — not a crash

### Provider CLI not authenticated

1. Run with an expired or missing auth token
2. **Expected:** `ProviderError` surfaces with the CLI's stderr message, provider name, and exit code — enough to diagnose the auth issue

### Mixed weighted and unweighted issues (GitLab)

1. Have issues with weight 8, 3, 1, and some with no weight
2. Run `/issues import`
3. **Expected:** Output order is weight 8, 3, 1, then unweighted issues last

## Failure Signals

- Empty output when issues exist on the remote — indicates filter mismatch or CLI auth failure
- Issues appearing unsorted — weight sorting logic broken
- Descriptions showing full length beyond 500 chars — truncation not applied
- `gsd-issues:import-complete` event not firing — event emission wiring broken
- TypeScript errors from `npx tsc --noEmit` — type regression
- Any of the 188 tests failing — regression in import or other workflows

## Requirements Proved By This UAT

- R005 — Import workflow works end-to-end against real issues on both providers
- R010 — `gsd-issues:import-complete` event fires with correct payload
- R011 — `/issues import` command accepts milestone/label flags and produces output
- R012 — `gsd_issues_import` tool returns structured results for LLM callers

## Not Proven By This UAT

- R005 validation against extremely large issue sets (100+ issues) — truncation/pagination behavior under load
- Interaction with sync/close workflows — import is independent and read-only
- npm distribution (R013) — deferred to S06

## Notes for Tester

- GitLab weight sorting is the most interesting behavior to verify — GitHub issues will all be "unweighted" since GitHub has no weight field.
- The `--per-page 100` / `--limit 100` defaults mean you'll see at most 100 issues. If the target repo has more, the output is silently truncated at 100.
- Import output is markdown designed for LLM consumption — it should be parseable but doesn't need to look pretty in a terminal.
