# S03: Import re-scope and cleanup — UAT

**Milestone:** M002
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Re-scope involves real CLI calls to `glab`/`gh` for closing issues and creating new ones — contract tests mock these, but UAT must exercise the real CLIs against real remotes to validate output parsing and platform behavior.

## Preconditions

- A GitLab or GitHub repo with at least 2 open issues (these will be closed during re-scope)
- `.gsd/issues.json` configured for the repo (run `/issues setup` if not)
- At least one GSD milestone planned with a `CONTEXT.md` and `ROADMAP.md` (e.g. `M001`)
- The milestone does NOT already have an entry in `ISSUE-MAP.json` (or delete the existing entry to test fresh)
- `glab auth status` or `gh auth status` confirms CLI authentication

## Smoke Test

1. Run the import tool with rescope params: call `gsd_issues_import` with `rescope_milestone_id: "M001"` and `original_issue_ids: [<id1>, <id2>]` where id1 and id2 are real open issue IDs
2. **Expected:** A new milestone-level issue is created on the remote tracker, both original issues are closed, and `.gsd/milestones/M001/ISSUE-MAP.json` contains the new mapping

## Test Cases

### 1. Happy path re-scope via command

1. Note two open issue IDs on the remote (e.g. #42 and #57)
2. Run `/issues import --rescope M001 --originals 42,57`
3. Confirm when prompted "Close 2 original issues and create milestone issue?"
4. **Expected:** Output shows milestone issue created with URL, both originals listed as closed
5. Check remote: new issue exists with milestone title/description, #42 and #57 are closed
6. Check `.gsd/milestones/M001/ISSUE-MAP.json`: entry with `localId: "M001"` and the new issue's `remoteId`/`url`

### 2. Happy path re-scope via tool

1. Call `gsd_issues_import` tool with `rescope_milestone_id: "M001"`, `original_issue_ids: [42, 57]`
2. **Expected:** Tool returns structured text with created issue URL and closed original count
3. No confirmation prompt (tool path is LLM-driven)
4. Same remote/ISSUE-MAP verification as test case 1

### 3. Abort re-scope on confirmation decline

1. Run `/issues import --rescope M001 --originals 42,57`
2. When prompted, decline the confirmation
3. **Expected:** No issues created or closed, ISSUE-MAP unchanged, info message about abort

### 4. Double re-scope guard

1. Ensure `ISSUE-MAP.json` already has an entry for M001 (from test case 1 or manually added)
2. Run `/issues import --rescope M001 --originals 42,57`
3. **Expected:** Operation skips with message indicating milestone already mapped. No new issue created, no originals closed.

### 5. Dry run

1. Delete the M001 entry from ISSUE-MAP.json
2. Call `gsd_issues_import` with `rescope_milestone_id: "M001"`, `original_issue_ids: [42]`, `dry_run: true` (if supported in tool params — otherwise test via `rescopeIssues()` directly with `dryRun: true`)
3. **Expected:** Output describes what would happen but no remote changes. ISSUE-MAP unchanged. Remote issues still open.

### 6. createProvider single source of truth

1. Run `grep -rn "function createProvider" src/`
2. **Expected:** Exactly 1 result in `src/lib/provider-factory.ts`
3. Run `grep -rn "from.*provider-factory" src/`
4. **Expected:** 5 imports (index.ts, commands/import.ts, sync.ts, close.ts, pr.ts)

### 7. Stale JSDoc cleanup verified

1. Run `grep "S02–S05\|slice ID like" src/providers/types.ts`
2. **Expected:** 0 matches
3. Open `src/providers/types.ts` and check `IssueMapEntry.localId` JSDoc
4. **Expected:** Comment says "milestone ID" not "slice ID"

## Edge Cases

### Partial failure — one original already closed

1. Close issue #42 manually on the remote, leave #57 open
2. Delete M001 from ISSUE-MAP.json
3. Run `/issues import --rescope M001 --originals 42,57`
4. Confirm when prompted
5. **Expected:** Milestone issue created, #57 closed successfully, #42 treated as already-closed (not an error). Result shows both as closed, closeErrors array is empty.

### Partial failure — one original close fails

1. Use an issue ID that doesn't exist (e.g. 999999)
2. Run `/issues import --rescope M001 --originals 42,999999`
3. Confirm when prompted
4. **Expected:** Milestone issue still created (create-first pattern), #42 closed, 999999 appears in closeErrors with error message. Operation is not fully rolled back — milestone issue exists in ISSUE-MAP.

### GitLab-specific: epic assignment on re-scope

1. Configure `epic` in `.gsd/issues.json` for a GitLab repo
2. Run re-scope flow
3. **Expected:** Created milestone issue is assigned to the configured epic (verified on GitLab UI)

## Failure Signals

- Re-scope creates issue but ISSUE-MAP.json is empty or missing the entry → crash-safe persistence broken
- Originals remain open after confirmed re-scope → provider.closeIssue() not being called or CLI parsing broken
- Double re-scope creates a duplicate issue → skip guard not working
- `grep -rn "function createProvider" src/` returns more than 1 result → inline copies crept back
- `gsd-issues:rescope-complete` event not emitted → event bus wiring broken (check test output)
- Command re-scope runs without confirmation → confirmation guard bypassed

## Requirements Proved By This UAT

- R016 — Reverse flow: import issues and re-scope into milestones. Full lifecycle: import → re-scope → close originals → create milestone issue.
- R005 — Import workflow extended with re-scope capability
- R010 — `gsd-issues:rescope-complete` event emitted (verified via contract tests; UAT confirms runtime emission)
- R011 — `/issues import` command with `--rescope`/`--originals` flags
- R012 — `gsd_issues_import` tool with `rescope_milestone_id`/`original_issue_ids` params

## Not Proven By This UAT

- Runtime CLI output parsing across different `glab`/`gh` CLI versions — contract tests mock exact output formats
- Behavior with self-hosted GitLab/GitHub instances (different API base URLs)
- Concurrent re-scope operations on the same milestone from multiple agents
- R017 (sub-issues) — deferred, not part of this milestone

## Notes for Tester

- Test cases 1-5 modify remote state (create/close issues). Use a test project or be prepared to reopen issues manually.
- The "already-closed" tolerance means re-scope is somewhat idempotent for the close step — if you re-run after deleting the ISSUE-MAP entry, it won't fail on already-closed originals.
- Test cases 6-7 are pure local verification — safe to run anytime.
- The re-scope flow creates the milestone issue BEFORE closing originals. If you interrupt mid-flow, you'll have the new issue but originals still open. This is by design (D036) — create-first is crash-safe.
