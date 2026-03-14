---
estimated_steps: 6
estimated_files: 7
---

# T01: Extend Issue type, update providers, and build import module

**Slice:** S05 — Import Workflow
**Milestone:** M001

## Description

Extend the `Issue` type with optional fields needed for rich import output (`weight`, `milestone`, `assignee`, `description`), update both providers' `listIssues` to populate them from existing CLI JSON output, and build the `importIssues()` core formatting function. This is the pipeline that turns raw provider data into structured markdown the LLM can interpret for planning.

## Steps

1. Add optional fields to `Issue` in `src/providers/types.ts`: `weight?: number`, `milestone?: string`, `assignee?: string`, `description?: string`
2. Update `GlabListItem` in `src/providers/gitlab.ts` to include `weight`, `description`, `milestone` (object with `title`), `assignees` (array of `{username}`). Update `listIssues` mapping to extract: `weight: item.weight ?? undefined`, `milestone: item.milestone?.title`, `assignee: item.assignees?.[0]?.username`, `description: item.description ?? undefined`
3. Update `GhListItem` in `src/providers/github.ts`: add `body: string | null`. Add `body` to the `--json` field list. Update `listIssues` mapping to extract: `milestone: item.milestone?.title`, `assignee: item.assignees?.[0]?.login`, `description: item.body ?? undefined`. (GitHub has no weight.)
4. Update existing provider test expectations in `gitlab.test.ts` and `github.test.ts` — add new fields to mock data and update `toEqual` assertions to include the new optional fields
5. Create `src/lib/import.ts` with `ImportOptions` interface, `ImportResult` type, and `importIssues()` function. Format issues as markdown: `## #ID: Title` headers, labels as comma-separated, weight if present, assignee if present, description truncated at 500 chars. Sort by weight descending (unweighted last). Handle empty list with "No issues found" message. Emit `gsd-issues:import-complete` event. Export `ImportToolSchema` (TypeBox) for T02.
6. Create `src/lib/__tests__/import.test.ts` — test formatting output, weight-based sorting, description truncation, empty list handling, event emission, issues without optional fields

## Must-Haves

- [ ] `Issue` type has optional `weight`, `milestone`, `assignee`, `description` fields
- [ ] GitLab provider `listIssues` populates all four new fields from `glab issue list --output json`
- [ ] GitHub provider `listIssues` populates `milestone`, `assignee`, `description` (no weight) from `gh issue list --json`
- [ ] `importIssues()` returns structured markdown sorted by weight descending
- [ ] Description truncation at 500 chars with `…` suffix
- [ ] Empty issue list returns "No issues found" message
- [ ] `gsd-issues:import-complete` event emitted with issue count
- [ ] All existing provider tests pass with updated expectations

## Verification

- `npx vitest run src/lib/__tests__/import.test.ts` — all import tests pass
- `npx vitest run src/providers/__tests__/gitlab.test.ts src/providers/__tests__/github.test.ts` — all provider tests pass (no regressions)
- `npx tsc --noEmit` — zero errors

## Observability Impact

- **New event:** `gsd-issues:import-complete` — emitted with `{ issueCount }` after formatting. A future agent can verify import ran by watching for this event.
- **Extended Issue shape:** `weight`, `milestone`, `assignee`, `description` fields now available on `Issue` objects returned by both providers. Inspect any `listIssues()` result to see richer data.
- **Failure visibility:** Provider errors during `listIssues` propagate `ProviderError` with full CLI context — same diagnostic surface as sync/close. No new failure modes introduced.
- **Import result inspection:** `ImportResult.markdown` contains the formatted output. `ImportResult.issueCount` gives a quick numeric check. Empty imports produce deterministic "No issues found" text.

## Inputs

- `src/providers/types.ts` — `Issue` type to extend, `IssueFilter` already has filter fields
- `src/providers/gitlab.ts` — `GlabListItem` and `listIssues` to update
- `src/providers/github.ts` — `GhListItem` and `listIssues` to update
- `src/lib/close.ts` — reference for module structure with emit pattern
- `src/lib/sync.ts` — reference for TypeBox schema export pattern
- S05-RESEARCH.md — GitLab `assignees: [{username}]`, GitHub `assignees: [{login}]`, `body` can be null

## Expected Output

- `src/providers/types.ts` — `Issue` type extended with 4 optional fields
- `src/providers/gitlab.ts` — `GlabListItem` extended, `listIssues` mapping updated
- `src/providers/github.ts` — `GhListItem` extended with `body`, `--json` fields updated, `listIssues` mapping updated
- `src/lib/import.ts` — `importIssues()` function with formatting, sorting, truncation, event emission, TypeBox schema
- `src/lib/__tests__/import.test.ts` — comprehensive import tests
- `src/providers/__tests__/gitlab.test.ts` — updated expectations for new fields
- `src/providers/__tests__/github.test.ts` — updated expectations for new fields
