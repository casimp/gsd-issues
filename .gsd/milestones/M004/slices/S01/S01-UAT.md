# S01: Scope phase and milestone-free entry — UAT

**Milestone:** M004
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Contract tests verify state machine logic, prompt construction, and completion detection with mocked pi APIs. Live-runtime UAT validates that the scope prompt actually produces usable milestones and that pi's sendMessage/agent_end integration works end-to-end.

## Preconditions

- `gsd-issues` extension is installed and loaded in pi (`pi.extensions` includes path to `src/index.ts`)
- A git repository with a remote (GitHub or GitLab) is available
- `.gsd/issues.json` exists with valid provider, token, and project config (run `/issues setup` if needed)
- `.gsd/issues.json` does NOT have a `milestone` field set (or field is absent)
- No existing `.gsd/milestones/` directory (clean slate), OR existing milestones present (for resume tests)

## Smoke Test

1. In a project with no `.gsd/milestones/` directory, type `/issues` and press Enter
2. **Expected:** A selection prompt appears offering "Import from tracker" and "Start fresh" options (not an error about missing milestone)

## Test Cases

### 1. Fresh start — no milestones, no config milestone

1. Ensure `.gsd/milestones/` does not exist and `issues.json` has no `milestone` field
2. Run `/issues`
3. Select "Start fresh"
4. When prompted for description, type "Build a REST API for user management"
5. **Expected:** A scope prompt is sent to the LLM (visible in the conversation) instructing it to create right-sized milestones under `.gsd/milestones/` with CONTEXT.md files. The LLM should respond by creating at least one milestone directory with a CONTEXT.md file.

### 2. Import from tracker — issues inform scoping

1. Ensure the project has open issues on the remote tracker
2. Run `/issues`
3. Select "Import from tracker"
4. **Expected:** Issues are fetched from the tracker and included as context in the scope prompt. The prompt should contain the issue titles/descriptions and instruct the LLM to create milestones informed by those issues.

### 3. Import fallback — no issues on tracker

1. Ensure the project has zero open issues (or use a repo with no issues)
2. Run `/issues`
3. Select "Import from tracker"
4. **Expected:** If import returns zero issues, the flow falls through to the "Start fresh" path (prompts for description). No error or dead-end.

### 4. Resume via GSD state — active milestone

1. Create a `.gsd/STATE.md` or ensure GSD has an active milestone (e.g., `M001`)
2. Run `/issues`
3. **Expected:** A message indicates the active milestone and suggests resuming with `/gsd auto` or `/issues auto`. No scope prompt is sent.

### 5. Resume via existing milestones on disk

1. Ensure `.gsd/milestones/M001/M001-CONTEXT.md` exists (milestone present on disk) but no active GSD state
2. Run `/issues`
3. **Expected:** A selection prompt offers to resume an existing milestone or start a new one. If "Start new" is selected, the scope flow runs normally.

### 6. `/issues auto` — scope then GSD auto

1. Ensure no milestones exist (clean slate)
2. Run `/issues auto`
3. Select "Start fresh", provide a description
4. **Expected:** Scope prompt is sent, LLM creates milestone(s), then `/gsd auto` is dispatched automatically (visible as a message in the conversation). GSD auto-mode begins.

### 7. `/issues auto` — resume with existing milestones

1. Ensure `.gsd/milestones/M001/M001-CONTEXT.md` exists
2. Run `/issues auto`
3. **Expected:** Scope is skipped entirely. `/gsd auto` is dispatched immediately. No selection prompt.

### 8. Config without milestone validates

1. Run `/issues setup`
2. When prompted for milestone, select the skip option (or leave empty)
3. Complete setup with valid provider, token, project
4. **Expected:** Config saves successfully. `issues.json` has no `milestone` field (or it's absent). Running `/issues` works normally.

### 9. Config with milestone still works

1. Manually add `"milestone": "M001"` to `issues.json`
2. Run `/issues setup` to verify it loads without error
3. **Expected:** Config validation passes. The milestone field is accepted when present.

### 10. Scope completion detection

1. Run `/issues` and trigger a scope prompt (fresh start)
2. Let the LLM create milestone directories with CONTEXT.md files
3. **Expected:** After the LLM finishes (agent_end fires), the extension detects the new CONTEXT.md files and emits a `gsd-issues:scope-complete` event. If running via `/issues auto`, this chains into `/gsd auto`.

### 11. Sizing constraint in scope prompt

1. Set `max_slices_per_milestone: 3` in `issues.json`
2. Run `/issues`, select "Start fresh", provide a description
3. **Expected:** The scope prompt sent to the LLM includes the sizing constraint (e.g., "each milestone should have at most 3 slices"). Verify by reading the conversation output.

## Edge Cases

### Empty description cancels scope

1. Run `/issues`, select "Start fresh"
2. When prompted for description, submit an empty string
3. **Expected:** A message indicates the scope was cancelled. No prompt is sent. No error.

### Config missing entirely

1. Delete `.gsd/issues.json`
2. Run `/issues`
3. **Expected:** A warning about missing config appears but the scope flow still works (config is loaded gracefully). Import-from-tracker may not work without config, but fresh start should proceed.

### Existing commands still work

1. With a valid config, run `/issues sync`, `/issues import`, `/issues close`, `/issues pr`, `/issues setup`
2. **Expected:** All existing subcommands still function as before. No regressions from the orchestration removal.

## Failure Signals

- `/issues` with no subcommand shows a usage hint or errors about missing milestone instead of the smart entry prompt
- Scope prompt is not sent (no LLM message visible after selecting an option)
- `agent_end` never detects new milestones (scope-complete event not emitted) — check if CONTEXT.md files follow the `{MID}-CONTEXT.md` naming convention
- `/issues auto` hangs after scope instead of chaining to `/gsd auto` — check `isAutoRequested()` state
- Config validation rejects configs without a milestone field
- Any test failures in `npx vitest run`

## Requirements Proved By This UAT

- R022 (Scope phase) — scope prompt construction and completion detection work end-to-end
- R025 (No milestone ID at entry) — `/issues` works without any milestone in config or on disk
- R026 (Resume still works) — existing milestones and GSD state trigger resume path
- R021 (Auto-flow orchestration) — `/issues auto` chains scope → GSD auto correctly

## Not Proven By This UAT

- Multi-milestone sequencing (R024) — S02 scope
- Scope prompt quality — whether the LLM actually creates well-structured milestones depends on the prompt and model. Contract tests mock this. Only real runs validate quality.
- Sync after scope — user is prompted but flow continues regardless. S02 adds the sync confirmation integration.

## Notes for Tester

- The scope prompt quality is the most important thing to evaluate. Read what the LLM actually produces — does it create reasonable milestones with CONTEXT.md files in the right location?
- If the LLM doesn't create milestones on the first turn, wait for subsequent turns — `agent_end` fires after each turn and re-checks.
- The import path requires a working provider (valid token, accessible project). If the token is expired, the import will fail and fall back to fresh start — this is expected behavior.
- Check for the `gsd-issues:scope-complete` event in pi's event log if scope completion seems broken.
