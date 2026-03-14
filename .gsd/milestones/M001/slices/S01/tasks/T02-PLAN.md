---
estimated_steps: 4
estimated_files: 4
---

# T02: GitLab and GitHub Provider Implementations with Tests

**Slice:** S01 — Provider abstraction and core types
**Milestone:** M001

## Description

Implement the two `IssueProvider` implementations that wrap `glab` and `gh` CLI calls through an injected exec function. Each provider constructs the correct CLI arguments for create/close/list/addLabels operations, parses stdout to extract issue IDs from URLs, and throws `ProviderError` on failures. Tests mock the exec function to verify argument construction, output parsing, and error handling without requiring real CLI tools.

## Steps

1. Implement `GitLabProvider` in `src/providers/gitlab.ts`: constructor takes `ExecFn` and `projectPath`. `createIssue` builds `glab issue create --title --description --milestone --assignee --weight --label --yes --no-editor` args (omitting unset optional fields), parses IID from stdout URL via regex (`/\/issues\/(\d+)/`), validates it's a positive integer. `closeIssue` calls `glab issue close $IID` then optionally `glab issue update $IID --label $doneLabel`. `listIssues` calls `glab issue list --output json` with optional milestone/label/state filters. `addLabels` calls `glab issue update $IID --label`. All methods throw `ProviderError` on non-zero exit code.
2. Implement `GitHubProvider` in `src/providers/github.ts`: same pattern but with `gh` CLI. `createIssue` uses `gh issue create --title --body --milestone --assignee --label`, parses issue number from stdout URL. `closeIssue` uses `gh issue close $number --reason completed|"not planned"`. `listIssues` uses `gh issue list --json number,title,state,url,labels,milestone,assignees` with `--milestone` and `--label` filters. `addLabels` uses `gh issue edit $number --add-label`.
3. Write `src/providers/__tests__/gitlab.test.ts`: mock exec returning successful URL stdout, verify IID extraction. Mock error exit code, verify `ProviderError` thrown with correct fields. Verify argument construction for create with full options and minimal options. Test list with JSON parsing. Test close with done label.
4. Write `src/providers/__tests__/github.test.ts`: same pattern — URL parsing, error handling, argument construction for create/close/list/addLabels. Verify `--reason` flag on close. Verify `--json` field selection on list.

## Must-Haves

- [ ] `GitLabProvider` implements all `IssueProvider` methods
- [ ] `GitHubProvider` implements all `IssueProvider` methods
- [ ] URL → issue ID parsing validated with regex, fails loudly on malformed output
- [ ] Optional fields (milestone, assignee, labels, weight) omitted from CLI args when not provided
- [ ] `ProviderError` thrown on non-zero exit code with diagnostic context
- [ ] All provider tests pass with mocked exec

## Observability Impact

- Signals added: `ProviderError` with `{ provider, operation, exitCode, stderr, command }` — surfaces exactly which CLI call failed
- How a future agent inspects this: catch `ProviderError`, inspect fields to determine if it's an auth issue (exit code + stderr), a missing CLI tool, or a malformed response
- Failure state exposed: failed CLI command string, exit code, full stderr output

## Verification

- `npx vitest run` — all tests pass (detection, issue-map, gitlab provider, github provider)
- `npx tsc --noEmit` — no type errors
- Test count: expect ~20+ assertions across the 4 test files

## Inputs

- `src/providers/types.ts` — `IssueProvider` interface, `ExecFn`, `ProviderError`, all option/result types (from T01)
- S01-RESEARCH.md — CLI flag details, output format examples, `shell: false` constraint

## Expected Output

- `src/providers/gitlab.ts` — complete GitLab provider implementation
- `src/providers/github.ts` — complete GitHub provider implementation
- `src/providers/__tests__/gitlab.test.ts` — GitLab provider tests passing
- `src/providers/__tests__/github.test.ts` — GitHub provider tests passing
