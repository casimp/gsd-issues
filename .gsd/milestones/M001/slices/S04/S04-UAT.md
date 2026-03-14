# S04: Auto-close on slice completion — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The close workflow requires real `glab`/`gh` CLI calls against real remotes to prove end-to-end behavior. Contract tests verify orchestration logic, but the lifecycle hook firing in a live pi session with real issue tracker state is what proves R004.

## Preconditions

- A pi session is running with `gsd-issues` loaded as an extension
- `.gsd/issues.json` exists with valid config for the target provider (GitLab or GitHub)
- At least one slice has been synced to the remote tracker (ISSUE-MAP.json has entries)
- The synced issue is currently **open** on the remote tracker
- `glab` or `gh` CLI is authenticated and can access the target repo

## Smoke Test

1. In a GSD project with a synced slice (e.g. S01), write a summary file: create `.gsd/milestones/M001/slices/S01/S01-SUMMARY.md` via the agent's write tool
2. **Expected:** The mapped remote issue is closed within seconds. Check the remote tracker — issue should show as closed.

## Test Cases

### 1. Auto-close via summary write (GitLab)

1. Ensure `.gsd/issues.json` has `provider: "gitlab"` and `done_label: "T::Done"`
2. Sync a slice to create a GitLab issue (use `/issues sync` or the sync tool)
3. Verify the issue is open on GitLab with no "T::Done" label
4. Have the agent write the slice's `S##-SUMMARY.md` file using the write tool
5. **Expected:** The GitLab issue is closed, "T::Done" label is applied, `gsd-issues:close-complete` event is emitted with correct `{ milestone, sliceId, issueId, url }` payload

### 2. Auto-close via summary write (GitHub)

1. Ensure `.gsd/issues.json` has `provider: "github"` and `github.close_reason: "completed"`
2. Sync a slice to create a GitHub issue
3. Verify the issue is open on GitHub
4. Have the agent write the slice's `S##-SUMMARY.md` file using the write tool
5. **Expected:** The GitHub issue is closed with reason "completed", `gsd-issues:close-complete` event is emitted

### 3. Manual close via `/issues close` command

1. With a synced, open issue in ISSUE-MAP.json
2. Run `/issues close S01` (or `/issues close --slice S01 --milestone M001`)
3. **Expected:** Issue closed on remote, success message displayed via `ctx.ui.notify`

### 4. Close via `gsd_issues_close` tool

1. With a synced, open issue in ISSUE-MAP.json
2. LLM calls `gsd_issues_close` with `{ slice_id: "S01", milestone_id: "M001" }`
3. **Expected:** Tool returns `{ closed: true, issueId: "...", url: "..." }` and issue is closed on remote

### 5. Re-close idempotency

1. Close an issue that is already closed (via command or tool)
2. **Expected:** Returns success (not an error). No false alarm, no crash. The function treats already-closed as a no-op success.

## Edge Cases

### Non-summary write doesn't trigger close

1. Have the agent write a non-summary file in the slice directory (e.g. `S01-PLAN.md`, `S01-UAT.md`)
2. **Expected:** No close attempt is made. The hook only matches `S##-SUMMARY.md` patterns.

### Error result doesn't trigger close

1. If a write tool returns an error result (e.g. permission denied), the hook should not attempt to close
2. **Expected:** Hook checks `isError` flag and skips silently

### Missing ISSUE-MAP.json entry

1. Write a summary for a slice that was never synced (no entry in ISSUE-MAP.json)
2. **Expected:** No error, no crash. `closeSliceIssue()` returns `{ closed: false, reason: "no-mapping" }`. Hook swallows this silently.

### Missing config

1. Delete or rename `.gsd/issues.json`, then write a summary file
2. **Expected:** Hook catches the config load error and returns silently. No error surfaced to the agent.

### Summary rewrite

1. Write a summary file for a slice whose issue is already closed (e.g. overwriting with corrections)
2. **Expected:** Already-closed detection returns success. No error, no duplicate close attempt.

## Failure Signals

- Issue remains open on the remote tracker after summary write
- Error messages surface in the agent's tool pipeline (hook should be silent)
- `gsd-issues:close-complete` event not emitted (check pi.events listeners)
- `CloseResult` returns `{ closed: false }` when a mapping exists
- ProviderError with unexpected exitCode or stderr from `glab`/`gh`

## Requirements Proved By This UAT

- R004 — Auto-close on slice completion via lifecycle hook (primary proof)
- R006 — GitLab done label applied on close (supporting proof)
- R007 — GitHub close reason set on close (supporting proof)
- R008 — ISSUE-MAP.json consumed correctly for slice→issue resolution (supporting proof)
- R010 — `gsd-issues:close-complete` event emitted (supporting proof)
- R011 — `/issues close` command works (supporting proof)
- R012 — `gsd_issues_close` tool works (supporting proof)

## Not Proven By This UAT

- R003 — Sync workflow (proven by S03 UAT)
- R001, R002 — Provider abstraction and config (proven by S01/S02)
- Network failure / transient error recovery — no retry logic exists
- Concurrent close attempts — not tested
- Real remote UAT deferred to post-S06 when the extension is packaged and installable

## Notes for Tester

- The auto-close hook fires on the `tool_result` event, which means the write tool must complete successfully first. If testing manually, ensure you're triggering via an actual tool call (not a filesystem write outside pi).
- The hook matches against the working directory — if `cwd` doesn't contain `.gsd/milestones/`, the path won't match.
- `done_label` defaults to `"T::Done"` for GitLab if not set in config. For GitHub, `close_reason` defaults to `"completed"` if `github.close_reason` is not set.
- ISSUE-MAP.json is read but never modified by close — the remote tracker is the source of truth for closed status.
