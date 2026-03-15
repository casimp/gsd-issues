# S02: Auto-Flow Orchestration — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The orchestration drives pi sessions via sendMessage/newSession — contract tests prove the state machine, but the real pi API integration requires a live runtime test

## Preconditions

- gsd-issues extension installed and loaded in pi
- A project with GSD initialized (`.gsd/` directory exists)
- A milestone with a ROADMAP.md containing slices (e.g. from a previous `/gsd plan`)
- `.gsd/issues.json` exists with valid config including `max_slices_per_milestone` and `sizing_mode` fields (run `/issues setup` first if not)
- No GSD auto-mode running (`/gsd auto` is not active)
- Git repo with a remote configured (GitHub or GitLab)

## Smoke Test

1. Run `/issues auto M001` (or whatever milestone ID exists)
2. **Expected:** The extension starts orchestration — first phase prompt appears asking the agent to import issues. No crash, no error notification.

## Test Cases

### 1. Happy path: full lifecycle through all phases

1. Ensure config has `max_slices_per_milestone: 10` and `sizing_mode: "best_try"` (high limit so sizing passes)
2. Run `/issues auto M001`
3. Observe the agent receives prompts for each phase: import → plan → (validate-size passes internally) → sync → execute → pr → done
4. Check `.gsd/issues-auto.json` between phases — should show current phase and milestoneId
5. After completion, verify `.gsd/issues-auto.lock` is removed
6. **Expected:** All phases execute in order. Lock and state files are cleaned up on completion. `gsd-issues:auto-phase` events emitted for each transition.

### 2. Mutual exclusion with GSD auto-mode

1. Start `/gsd auto` on a milestone (creates `.gsd/auto.lock`)
2. Run `/issues auto M001`
3. **Expected:** Error notification: "GSD auto-mode is already active" (or similar). The auto-flow does not start. No `.gsd/issues-auto.lock` created.

### 3. Own stale lock detection and recovery

1. Manually create `.gsd/issues-auto.lock` with contents: `{"pid": 99999, "phase": "import"}` (a PID that doesn't exist)
2. Run `/issues auto M001`
3. **Expected:** Extension detects the stale lock (PID 99999 is not running), removes it, and starts normally.

### 4. Strict mode blocks on oversized milestone

1. Set config: `max_slices_per_milestone: 2`, `sizing_mode: "strict"`
2. Have a milestone with 5+ slices in its ROADMAP.md
3. Run `/issues auto` for that milestone
4. Observe: after plan phase, validate-size detects oversized → triggers split phase
5. If the split doesn't reduce slices below 2, observe retry (up to 3 times)
6. **Expected:** After 3 failed split attempts, auto-flow stops with an error. Lock is cleaned up.

### 5. Best_try mode warns but proceeds on oversized milestone

1. Set config: `max_slices_per_milestone: 2`, `sizing_mode: "best_try"`
2. Have a milestone with 5+ slices in its ROADMAP.md
3. Run `/issues auto` for that milestone
4. **Expected:** After plan phase, validate-size detects oversized → emits warning via `gsd-issues:auto-phase` event with warning field → proceeds to sync phase (does not block).

### 6. Tool invocation: gsd_issues_auto

1. In a conversation, ask the LLM to start auto-flow for a milestone
2. **Expected:** The LLM calls `gsd_issues_auto` tool with `milestone_id` parameter. The tool starts the orchestration same as the command.

### 7. Config validation before start

1. Delete `.gsd/issues.json` (or make it invalid)
2. Run `/issues auto M001`
3. **Expected:** Error notification about missing/invalid config. Auto-flow does not start.

### 8. Milestone resolution from args, config, and GSD state

1. Run `/issues auto M001` — should use M001
2. Run `/issues auto` with `config.milestone` set — should use config milestone
3. Run `/issues auto` with no args and no config milestone — should attempt to read from GSD state
4. **Expected:** Milestone resolved in priority order: explicit arg > config > GSD state. Error if none found.

## Edge Cases

### newSession cancellation stops flow

1. Start `/issues auto M001`
2. While the first phase is running, trigger a stop (cancel the session or call `stopAuto`)
3. **Expected:** `newSession()` returns null/undefined (cancelled), auto-flow stops gracefully. Lock and state files are cleaned up.

### Concurrent agent_end calls are guarded

1. Start `/issues auto M001`
2. If two `agent_end` events fire in rapid succession (race condition)
3. **Expected:** Only one `advancePhase()` executes at a time — the second is dropped by the `_handlingAdvance` guard. No duplicate phase transitions.

### agent_end with no active auto-flow

1. Do not start `/issues auto`
2. Trigger an `agent_end` event (e.g. by completing any other task)
3. **Expected:** The handler checks `isAutoActive()`, returns immediately. No errors, no side effects.

## Failure Signals

- Error notification on `/issues auto` start without starting orchestration
- `.gsd/issues-auto.lock` persisting after auto-flow completes or errors — indicates cleanup failure
- `.gsd/issues-auto.json` showing a phase that doesn't advance — indicates stuck state machine
- `gsd-issues:auto-phase` events not emitting — indicates broken event wiring
- Existing extension functionality (sync, import, close, pr) broken after S02 changes — indicates regression

## Requirements Proved By This UAT

- R021 — `/issues auto` drives full milestone lifecycle end-to-end using pi.sendMessage and ctx.newSession
- R018 — Config fields consumed by auto-flow for sizing validation (max_slices_per_milestone, sizing_mode)
- R019 — Milestone size validation integrated into auto-flow (validate-size phase)

## Not Proven By This UAT

- Real provider integration (GitHub/GitLab API calls during auto-flow) — depends on existing sync/import/close/pr workflows being correct
- Agent split quality — the prompts are constructed but whether the LLM produces good splits is subjective
- Performance under slow network/disk conditions — the 500ms settle delay is not tested under load
- Multi-user/multi-project concurrent auto-flows — only single-instance mutual exclusion is tested

## Notes for Tester

- The auto-flow uses `newSession()` which creates fresh agent contexts — each phase runs in a new session. This means you'll see the conversation reset between phases.
- The settle delay (500ms) between agent_end and state read is intentional — don't be concerned about the brief pause.
- `/issues status` is still stubbed — it won't show auto-flow progress. Check `.gsd/issues-auto.json` directly for current phase.
- If testing strict mode split retry, the LLM may produce different splits each time — the test is whether the retry mechanism works, not whether the splits are optimal.
- The `gsd-issues:auto-phase` events are on `pi.events` — you can listen for them with another extension or check the event log if pi surfaces it.
