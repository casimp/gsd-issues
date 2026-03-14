# S03: Sync Workflow — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Sync creates real issues on remote trackers — the core value proposition can only be validated by confirming issues appear on GitLab/GitHub with correct metadata. Mock-based contract tests cover logic; UAT covers the real CLI integration.

## Preconditions

- A Git repo with a remote pointing to either `gitlab.com` or `github.com`
- `glab` CLI authenticated (for GitLab tests) or `gh` CLI authenticated (for GitHub tests)
- `.gsd/issues.json` exists with valid config (run `/issues setup` first — from S02)
- Config has `milestone` set to an existing milestone on the remote
- A `.gsd/milestones/{MID}/{MID}-ROADMAP.md` exists with at least 2-3 slices
- `.gsd/STATE.md` exists with `**Active Milestone:** {MID}`
- No existing `ISSUE-MAP.json` in the milestone directory (fresh sync)

## Smoke Test

1. Run `/issues sync` in pi
2. See a preview listing slice IDs and titles
3. Confirm with "yes"
4. **Expected:** Issues created on remote, summary shows "Created: N, Skipped: 0"

## Test Cases

### 1. Fresh sync creates issues for all slices

1. Ensure no `ISSUE-MAP.json` exists in the milestone directory
2. Run `/issues sync`
3. Observe the preview listing all incomplete slices
4. Confirm "yes"
5. **Expected:** One issue created per incomplete slice. Each issue has: correct title (`S01: <title>`), description containing the demo line and `[gsd:M001/S01]` metadata tag, milestone assigned, labels from config applied, assignee from config set. `ISSUE-MAP.json` written with entries mapping each `localId` to a remote `issueId` and `url`.

### 2. Re-sync skips already-mapped slices

1. After Test 1, run `/issues sync` again
2. Preview should show nothing to create (or only new unmapped slices)
3. **Expected:** "Nothing to sync — all slices already mapped" or skipped count equals total slices. No duplicate issues created on the remote.

### 3. Decline confirmation aborts sync

1. Run `/issues sync`
2. See the preview listing slices to create
3. Decline the confirmation prompt
4. **Expected:** No issues created. No `ISSUE-MAP.json` changes. Notification says sync was cancelled.

### 4. GitLab epic assignment (GitLab only)

1. Set `config.gitlab.epic` to a valid epic reference (e.g. `"&42"`) in `.gsd/issues.json`
2. Run `/issues sync` and confirm
3. **Expected:** Issues created and assigned to the specified epic. Verify on GitLab that each issue appears under the epic.

### 5. GitLab weight mapping (GitLab only)

1. Set `config.gitlab.weight_strategy` to `"fibonacci"` in `.gsd/issues.json`
2. Roadmap has slices with varying risk levels (low, medium, high)
3. Run `/issues sync` and confirm
4. **Expected:** Issues have weights: low→1, medium→2, high→3. Verify on GitLab issue detail pages.

### 6. GitHub milestone and labels (GitHub only)

1. Config has `milestone` set to a valid GitHub milestone name and `labels` with at least one label
2. Run `/issues sync` and confirm
3. **Expected:** Issues created with the specified milestone and labels on GitHub. Verify on the GitHub issues page.

### 7. LLM tool invocation

1. In a pi session, trigger the LLM to call `gsd_issues_sync` (e.g. ask "sync the roadmap to issues")
2. **Expected:** Tool executes without confirmation prompt. Issues created. Tool result contains text summary with created/skipped counts and details object with full SyncResult.

### 8. Partial roadmap (mix of done and pending slices)

1. Mark some slices as `[x]` (done) in the roadmap
2. Run `/issues sync` and confirm
3. **Expected:** Issues created only for incomplete (`[ ]`) slices. Done slices are skipped entirely — not shown in preview, not created on remote.

## Edge Cases

### Config missing or invalid

1. Delete or corrupt `.gsd/issues.json`
2. Run `/issues sync`
3. **Expected:** Error notification with clear message about config issue. No crash, no partial state.

### Missing milestone in STATE.md

1. Remove the `**Active Milestone:**` line from `.gsd/STATE.md`
2. Run `/issues sync` without specifying a milestone
3. **Expected:** Error about unable to determine active milestone. No crash.

### Empty roadmap (no slices)

1. Create a roadmap with no slice lines
2. Run `/issues sync`
3. **Expected:** "Nothing to sync" message. No errors.

### Network failure mid-sync

1. Start a sync with multiple slices
2. Simulate network failure (e.g. disconnect after first issue)
3. **Expected:** First issue's mapping persisted in `ISSUE-MAP.json` (crash-safe). Error reported for subsequent slices. Re-running sync after reconnect creates only the remaining slices.

### Epic assignment failure (GitLab only)

1. Set `config.gitlab.epic` to a non-existent epic (e.g. `"&99999"`)
2. Run `/issues sync` and confirm
3. **Expected:** Issues are still created successfully. Warning about failed epic assignment. Issues not assigned to any epic but otherwise complete.

## Failure Signals

- Issues not appearing on the remote tracker after sync reports success
- Duplicate issues created on re-sync (mapping not working)
- Missing milestone, labels, or assignee on created issues
- `ISSUE-MAP.json` empty or missing after successful sync
- Weight not set on GitLab issues when weight_strategy is configured
- Crash or unhandled error instead of graceful error notification
- Tool invocation showing confirmation prompt (should be skipped in tool mode)

## Requirements Proved By This UAT

- R003 — Sync: roadmap slices → remote issues (fresh sync, re-sync safety, partial roadmap)
- R006 — GitLab extras: epic assignment, weight mapping (test cases 4, 5)
- R007 — GitHub support: milestone and label assignment (test case 6)
- R008 — ISSUE-MAP.json persistence including crash-safety (test cases 1, 2, network failure edge case)
- R009 — Sync surfaced as prompted step with confirmation (test cases 1, 3)
- R010 — Event bus emission of sync-complete (verified via test case 1 side effects)
- R011 — /issues sync command functional (all command test cases)
- R012 — LLM tool with typed params (test case 7)

## Not Proven By This UAT

- R004 — Auto-close on slice completion (S04)
- R005 — Import workflow (S05)
- R010 — Close-complete and import-complete events (S04, S05)
- Real multi-provider testing in a single session (would need repos on both GitLab and GitHub)
- Performance under large roadmaps (50+ slices)

## Notes for Tester

- Test GitLab and GitHub separately — each needs its own repo, CLI auth, and config.
- Epic assignment requires the epic to exist on the GitLab group level, not project level.
- The `milestone` in config must match an existing milestone name exactly (case-sensitive on GitLab, case-insensitive on GitHub).
- After testing, clean up created issues on the remote to avoid clutter. `ISSUE-MAP.json` can be deleted to reset local state.
- The `dryRun` mode is not exposed via `/issues sync` command — it's an internal option used by tests. To preview without creating, decline the confirmation prompt.
