# S05: Import Workflow

**Goal:** User can fetch issues from GitLab/GitHub, get them formatted as structured markdown, and hand them to the LLM for planning interpretation.
**Demo:** `/issues import` fetches issues filtered by milestone/labels, outputs structured markdown with issue IDs, titles, labels, weight, and truncated descriptions. `gsd_issues_import` tool does the same for LLM callers. `gsd-issues:import-complete` event emitted.

## Must-Haves

- `Issue` type extended with optional `weight`, `milestone`, `assignee`, `description` fields
- Both providers' `listIssues` populate the new optional fields from CLI output
- `importIssues()` function formats `Issue[]` as structured markdown for LLM consumption
- Empty issue lists produce a clear "no issues found" message
- Descriptions truncated at 500 chars
- Issues sorted by weight descending (heaviest first), unweighted last
- `/issues import` command handler with milestone/label filter parsing
- `gsd_issues_import` tool registered with TypeBox schema
- `gsd-issues:import-complete` event emitted with issue count
- Existing provider tests updated for new fields without regressions

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass (existing 158 + new import/command tests), zero regressions
- `npx tsc --noEmit` — zero type errors
- `npx vitest run src/lib/__tests__/import.test.ts` — import formatting, sorting, truncation, empty list, event emission
- `npx vitest run src/commands/__tests__/import.test.ts` — command handler and tool integration

## Observability / Diagnostics

- **`gsd-issues:import-complete` event** — emitted with `{ issueCount, milestone, hasFilter }` on every import, successful or empty. Agents can watch this to confirm the pipeline ran.
- **Formatted markdown output** — the import result itself is the inspection surface. The structured `## #ID: Title` format is parseable by both humans and LLM callers.
- **Empty list handling** — returns a clear "No issues found" message rather than empty string, making it unambiguous whether the pipeline ran vs returned nothing.
- **Provider errors** — `ProviderError` propagates with full diagnostic context (provider, operation, exitCode, stderr, command) — same observability as sync/close.
- **No secrets** — import is read-only, no credentials in output. Issue descriptions may contain user content but are truncated, not redacted.

## Integration Closure

- Upstream surfaces consumed: `IssueProvider.listIssues()` from S01, `loadConfig()` from S02, `/issues` command routing from S02
- New wiring introduced in this slice: import command case in index.ts switch, `gsd_issues_import` tool registration
- What remains before the milestone is truly usable end-to-end: S06 (npm packaging)

## Tasks

- [x] **T01: Extend Issue type, update providers, and build import module** `est:30m`
  - Why: The core import pipeline — extend types with optional fields, update both providers to populate them, write the `importIssues()` formatting function with tests
  - Files: `src/providers/types.ts`, `src/providers/gitlab.ts`, `src/providers/github.ts`, `src/lib/import.ts`, `src/lib/__tests__/import.test.ts`, `src/providers/__tests__/gitlab.test.ts`, `src/providers/__tests__/github.test.ts`
  - Do: Add optional `weight?`, `milestone?`, `assignee?`, `description?` to `Issue`. Update `GlabListItem` to include `weight`, `description`, `milestone`, `assignees`. Update `GhListItem` to add `body` field and add `body` to `--json` arg. Map new fields in both `listIssues` methods. Build `importIssues()` — takes `Issue[]`, returns formatted markdown with `## #ID: Title` headers, labels, weight, assignee, truncated description. Sort by weight desc, unweighted last. Handle empty list. Emit event. Update existing provider test expectations for new fields.
  - Verify: `npx vitest run src/lib/__tests__/import.test.ts src/providers/__tests__/gitlab.test.ts src/providers/__tests__/github.test.ts` — all pass, `npx tsc --noEmit` clean
  - Done when: `importIssues()` produces correctly formatted markdown from mock issues, providers return extended Issue objects, zero test regressions

- [x] **T02: Wire /issues import command and gsd_issues_import tool** `est:20m`
  - Why: User-facing entry points — the command handler for interactive use and the tool for LLM callers
  - Files: `src/commands/import.ts`, `src/commands/__tests__/import.test.ts`, `src/index.ts`
  - Do: Create `handleImport()` command handler following close.ts pattern: parse `--milestone` and `--labels` flags from args, load config, resolve milestone, create provider, call `importIssues()`, send markdown result via `ctx.ui.notify`. Register `gsd_issues_import` tool in index.ts with TypeBox schema (optional `milestone`, `labels`), returning formatted markdown as ToolResult. Replace the import stub in the switch case with dynamic import of `handleImport`. Add `--per-page 100` (GitLab) / `--limit 100` (GitHub) to filter construction to avoid silent truncation.
  - Verify: `npx vitest run src/commands/__tests__/import.test.ts` — command and tool paths tested, `npx vitest run` — full suite passes with zero regressions
  - Done when: `/issues import` and `gsd_issues_import` tool both return formatted markdown from mock provider, event emitted, full test suite green

## Files Likely Touched

- `src/providers/types.ts`
- `src/providers/gitlab.ts`
- `src/providers/github.ts`
- `src/lib/import.ts`
- `src/commands/import.ts`
- `src/index.ts`
- `src/lib/__tests__/import.test.ts`
- `src/commands/__tests__/import.test.ts`
- `src/providers/__tests__/gitlab.test.ts`
- `src/providers/__tests__/github.test.ts`
