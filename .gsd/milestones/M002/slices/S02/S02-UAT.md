# S02: Milestone-level sync and PR creation — UAT

**Milestone:** M002
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: This slice changes user-facing commands and tools — UAT must verify the actual CLI interactions work against real GitLab/GitHub repos, not just contract tests

## Preconditions

- A git repo with a GitLab or GitHub remote
- `glab` (GitLab) or `gh` (GitHub) CLI installed and authenticated
- `.gsd/issues.json` configured via `/issues setup` (provider, labels, milestone set)
- At least one milestone directory exists (e.g. `.gsd/milestones/M001/`) with:
  - `M001-CONTEXT.md` containing a `## Project Description` section
  - `M001-ROADMAP.md` with a first heading and slice listing
  - `META.json` with `{ "integrationBranch": "main" }` or equivalent
- A milestone branch exists (e.g. `gsd/M001/S01`) that is ahead of the target branch
- No existing `ISSUE-MAP.json` in the milestone directory (for fresh sync tests)

## Smoke Test

1. Run `/issues sync` in a project with a configured milestone
2. **Expected:** Shows milestone preview (title, description excerpt), asks for confirmation, creates one issue on the remote, writes ISSUE-MAP.json with the milestone ID as localId

## Test Cases

### 1. Milestone sync creates one issue

1. Ensure `.gsd/milestones/M001/ISSUE-MAP.json` does not exist
2. Run `/issues sync`
3. Observe the preview: should show milestone title (from ROADMAP.md first heading), description excerpt (from CONTEXT.md), and labels
4. Confirm creation
5. **Expected:** One issue created on the remote tracker. ISSUE-MAP.json written with `localId: "M001"`. Console shows issue URL. `gsd-issues:sync-complete` event emitted with `{ milestone: "M001", created: 1, skipped: 0, errors: 0 }`.

### 2. Sync skips already-mapped milestone

1. After test 1 completes (ISSUE-MAP.json exists with M001 mapping)
2. Run `/issues sync` again for the same milestone
3. **Expected:** Message indicates milestone is already mapped. No new issue created. No confirmation prompt shown.

### 3. Close milestone issue via command

1. After test 1 (issue exists and is mapped)
2. Run `/issues close M001`
3. **Expected:** Issue closed on remote. `gsd-issues:close-complete` event emitted with `{ milestone: "M001", issueId, url }`. No `sliceId` in the event payload.

### 4. PR creation — happy path

1. Ensure milestone branch (e.g. `gsd/M001/S01`) exists locally with commits ahead of `main`
2. Ensure ISSUE-MAP.json has a mapping for M001
3. Run `/issues pr`
4. Observe preview: shows source branch → target branch, `Closes #N` reference
5. Confirm creation
6. **Expected:** Branch pushed to remote. PR/MR created with title `"M001: <milestone title>"`. PR body contains `Closes #N` (where N is the issue number from ISSUE-MAP). `gsd-issues:pr-complete` event emitted with `{ milestoneId, prUrl, prNumber }`.

### 5. PR creation — no mapped issue (PR without close)

1. Delete ISSUE-MAP.json for the milestone
2. Run `/issues pr`
3. **Expected:** PR created successfully but body does NOT contain `Closes #N`. Preview shows "No linked issue" or equivalent. PR still works — just won't auto-close anything on merge.

### 6. PR tool via LLM

1. Trigger `gsd_issues_pr` tool with `{ milestone_id: "M001" }`
2. **Expected:** PR created without confirmation prompt (tool mode). Returns structured ToolResult with `prUrl` and `prNumber`.

### 7. Sync tool via LLM

1. Trigger `gsd_issues_sync` tool with `{ milestone_id: "M001" }`
2. **Expected:** Issue created without confirmation prompt (tool mode). Returns structured ToolResult with issue URL and number.

## Edge Cases

### Missing CONTEXT.md

1. Remove or rename `M001-CONTEXT.md`
2. Run `/issues sync`
3. **Expected:** Sync still works — description falls back to ROADMAP.md content only. Title falls back to CONTEXT.md heading or milestone ID. No crash.

### Missing META.json (no integration branch)

1. Remove or rename `META.json` from the milestone directory
2. Run `/issues pr`
3. **Expected:** Clear error message: "No integration branch configured for milestone M001". No push attempted, no PR created.

### Same-branch error

1. Set up a scenario where the milestone branch equals the target branch (e.g. both are `main`)
2. Run `/issues pr`
3. **Expected:** Clear error message: "cannot create a PR from a branch to itself". No push, no PR.

### Push failure

1. Configure the remote to reject pushes (e.g. protected branch, wrong credentials)
2. Run `/issues pr`
3. **Expected:** Push failure reported with branch name and git error. PR creation NOT attempted (no orphaned PR).

### Hook removal verification

1. Write an S##-SUMMARY.md file via a tool call (the old trigger)
2. **Expected:** No auto-close fires. `grep "tool_result" src/index.ts` returns 0 matches. Issue remains open.

## Failure Signals

- ISSUE-MAP.json contains `localId` with slice format (e.g. "S01") instead of milestone format ("M001")
- Sync creates multiple issues for one milestone
- PR body missing `Closes #N` when ISSUE-MAP has a mapping
- `tool_result` string found in index.ts
- Event payloads contain `sliceId` field
- `/issues pr` subcommand not recognized
- `gsd_issues_pr` tool not registered (check `grep 'name: "gsd_issues_' src/index.ts`)

## Requirements Proved By This UAT

- R003 — Sync creates milestone-level issues (test 1, 2)
- R004 — Close via PR merge with `Closes #N` (test 4); manual close as fallback (test 3)
- R009 — Sync prompts confirmation before creating (test 1)
- R014 — PR/MR creation with `Closes #N` (test 4, 5)
- R015 — Milestone-level issue tracking end-to-end (tests 1-7)
- R010 — Events emitted with milestone payloads (tests 1, 3, 4)
- R011 — Commands work: `/issues sync`, `/issues close M001`, `/issues pr` (tests 1, 3, 4)
- R012 — Tools work: `gsd_issues_sync`, `gsd_issues_pr` (tests 6, 7)

## Not Proven By This UAT

- R006/R007 — GitLab-specific (epic, weight) and GitHub-specific (milestones, projects) extras are contract-tested but not runtime-verified here
- R016 — Import re-scope flow (deferred to S03)
- R008 — ISSUE-MAP format correctness beyond localId — contract-tested, not runtime-verified
- Cross-provider testing — UAT should be run on both GitLab and GitHub repos, but a single provider run is acceptable for initial validation

## Notes for Tester

- The PR creation requires the branch to actually be pushable. If you're testing on a repo with branch protection, you may need to temporarily allow force-push or use an unprotected branch.
- Run on both GitLab and GitHub repos if possible — the CLI argument construction differs between `glab mr create` and `gh pr create`.
- After PR merge on the platform, verify the linked issue auto-closes — this is platform behavior, not extension code, but it's the whole point of `Closes #N`.
- The `--target` flag on `/issues pr` lets you override the target branch without changing config.
