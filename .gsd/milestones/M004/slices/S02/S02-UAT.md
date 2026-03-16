# S02: Multi-milestone sequencing, /issues scope, and README — UAT

**Milestone:** M004
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The hooks and scope subcommand are thin orchestration layers that react to filesystem state during a real pi session. Contract tests prove the wiring; UAT validates that the hooks fire at the right time during an actual `/issues auto` run with GSD producing real artifacts.

## Preconditions

- gsd-issues extension installed and loaded in pi
- `.gsd/issues.json` configured with a valid provider (GitHub or GitLab), repo, and auth
- `auto_pr` field either absent (defaults to true) or explicitly set
- No active GSD milestone in `.gsd/STATE.md` (start fresh for scoping tests)
- Git repo with a clean working tree on a known branch

## Smoke Test

1. Run `/issues scope` in a project with no `.gsd/milestones/` directory
2. Confirm the LLM receives a scope prompt and creates at least one milestone directory with CONTEXT.md
3. Confirm the terminal shows the scope prompt was sent (no errors)

## Test Cases

### 1. Auto-sync fires on ROADMAP.md creation

1. Run `/issues auto` in a project with no milestones
2. Let the scope phase complete (LLM creates milestone directories with CONTEXT.md)
3. GSD auto-mode starts and the LLM creates a ROADMAP.md in the first milestone
4. **Expected:** The agent_end handler detects the new ROADMAP.md and automatically calls `syncMilestoneToIssue()`. A remote issue appears on the tracker. The `gsd-issues:auto-sync` event fires. No user confirmation is prompted.

### 2. Auto-PR fires on SUMMARY.md creation

1. Continue from test 1 — GSD auto-mode completes all slices for the milestone
2. GSD writes the milestone's SUMMARY.md
3. **Expected:** The agent_end handler detects SUMMARY.md + the milestone is in ISSUE-MAP.json + `auto_pr` is not false → `createMilestonePR()` is called automatically. A PR/MR appears on the tracker with `Closes #N` in the body. The `gsd-issues:auto-pr` event fires.

### 3. Hooks are idempotent across agent_end calls

1. After test 2, trigger another agent_end cycle (e.g., the LLM does another turn)
2. **Expected:** The sync hook does not create a duplicate issue (milestone is in `_syncedMilestones` set and ISSUE-MAP.json). The PR hook does not create a duplicate PR (milestone is in `_prdMilestones` set). No errors logged.

### 4. auto_pr: false suppresses automatic PR

1. Set `"auto_pr": false` in `.gsd/issues.json`
2. Run `/issues auto` and let GSD complete a milestone through SUMMARY.md
3. **Expected:** Sync hook fires normally (issue created). PR hook does NOT fire — no PR is created automatically. User can still run `/issues pr` manually.

### 5. /issues scope runs independently

1. Run `/issues scope` (not `/issues auto`)
2. **Expected:** The smart entry flow runs: if no milestones exist, the scope prompt is sent to the LLM. The LLM creates milestone directories. `gsd-issues:scope-complete` event fires. Auto-mode does NOT start (no `/gsd auto` chaining — that only happens from `/issues auto`).

### 6. Multi-milestone scope → sequential processing

1. Configure a project with enough work to scope into 2+ milestones (e.g., import many issues first with `/issues import`)
2. Run `/issues auto`
3. Scope phase creates multiple milestone directories (M001, M002, ...)
4. **Expected:** GSD auto-mode is dispatched. As each milestone's ROADMAP.md is created, auto-sync fires. As each milestone's SUMMARY.md is created, auto-PR fires. Each milestone gets its own issue and PR on the tracker.

### 7. Resume path still works

1. Start `/issues auto` and let it scope + begin planning
2. Interrupt the session (kill the pi process)
3. Restart pi and run `/issues auto` again
4. **Expected:** Smart entry detects the existing milestone in GSD state and resumes — no re-scoping. GSD auto-mode picks up where it left off.

## Edge Cases

### Hooks disabled when not in auto-mode

1. Run `/issues sync` manually (not through `/issues auto`)
2. Let GSD create a ROADMAP.md in a separate terminal
3. **Expected:** The agent_end handler's hooks do NOT fire because `_hooksEnabled` is false. Sync only happens through the explicit `/issues sync` command.

### Hook error doesn't crash the extension

1. Configure `.gsd/issues.json` with invalid auth credentials
2. Run `/issues auto` and let scope + planning complete
3. ROADMAP.md is created, triggering the sync hook
4. **Expected:** The sync hook catches the auth error, logs it to console.error with `[gsd-issues] auto-sync hook failed for M001:` prefix, and continues. The agent_end handler does not crash. GSD auto-mode continues.

### Config missing entirely during hooks

1. Delete `.gsd/issues.json` while `/issues auto` is running
2. Wait for an agent_end cycle
3. **Expected:** Hooks detect missing config and no-op gracefully. No crash, no error event. GSD auto-mode continues unaffected.

## Failure Signals

- Remote issue created but PR never appears → check `auto_pr` config value and `_prdMilestones` set state
- Duplicate issues on tracker → idempotency guard failed — check ISSUE-MAP.json and `_syncedMilestones` set
- `[gsd-issues] auto-sync hook failed` or `auto-pr hook failed` in console → auth/provider/network error
- `/issues scope` does nothing → check that `handleSmartEntry()` is being called (not short-circuited by existing milestones)
- README references `issues-auto.json`, `gsd_issues_auto`, or "state machine" → stale content not cleaned up

## Requirements Proved By This UAT

- R024 — Multi-milestone sequencing: auto-sync and auto-PR hooks process each milestone through the lifecycle
- R023 — /issues scope: standalone subcommand runs scoping independently
- R021 — Auto-flow orchestration: full scope→plan→sync→execute→PR chain without manual intervention
- R026 — Resume: existing milestone detected and resumed without re-scoping

## Not Proven By This UAT

- Prompt quality for scope phase — whether the LLM produces well-structured milestones depends on the specific prompt + model combination. Contract tests prove the prompt is sent; quality is subjective.
- Cross-provider consistency — UAT runs against one provider at a time. Contract tests cover both GitHub and GitLab code paths.
- `auto_pr` interaction with manual `/issues pr` — the manual command is unaffected by the config flag, but UAT doesn't explicitly test running both.

## Notes for Tester

- The hooks fire inside `agent_end`, which means they run after every LLM turn. During a long auto-mode session, expect multiple agent_end cycles where hooks no-op (idempotency working correctly).
- If testing multi-milestone (test case 6), the LLM needs to be prompted with enough work to justify multiple milestones. Importing 10+ issues before running `/issues auto` helps.
- The `gsd-issues:auto-sync` and `gsd-issues:auto-pr` events aren't directly visible in the terminal — check pi's event log or add a temporary listener to verify.
- README accuracy is best verified by reading it as a new user and checking that the described commands and flows match actual behavior.
