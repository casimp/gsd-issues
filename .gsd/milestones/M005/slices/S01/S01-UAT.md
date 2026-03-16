# S01: Prompted flow in agent_end with confirmation messages — UAT

**Milestone:** M005
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven for contract, live-runtime for LLM prompt quality)
- Why this mode is sufficient: The flag management and message dispatch are fully testable via contracts. The LLM's interpretation of `pi.sendMessage()` prompts requires a live `/issues` run.

## Preconditions

- `gsd-issues` extension installed and loaded in pi
- `.gsd/issues.json` config exists with valid provider settings (GitHub or GitLab)
- Remote repository accessible (for sync/PR to actually execute if user confirms)
- No existing milestones in `.gsd/milestones/` (for fresh-start test), OR an existing milestone with ROADMAP.md (for mid-flow test)

## Smoke Test

1. Run `/issues` in a project with no milestones
2. Agent scopes milestones (creates CONTEXT.md files)
3. After scoping completes (agent turn ends), the agent should relay a message like "Milestone M001 is planned. Run `/issues sync` to create a tracker issue, or skip."
4. **Expected:** The prompt appears without the user needing to run any additional command

## Test Cases

### 1. Fresh start: scope → sync prompt

1. Ensure no milestones exist in `.gsd/milestones/`
2. Run `/issues`
3. Let the agent scope milestones (creates CONTEXT.md + ROADMAP.md)
4. Wait for the agent turn to complete (agent_end fires)
5. **Expected:** Agent relays a sync prompt containing the milestone ID (e.g. "M001") and the command `/issues sync M001`. No issue is auto-created on the remote tracker.

### 2. Mapped milestone completes: PR prompt

1. Have a milestone (e.g. M001) already synced to the tracker (ISSUE-MAP.json exists with a mapping for M001)
2. Complete the milestone (create SUMMARY.md in `.gsd/milestones/M001/`)
3. Wait for agent_end to fire
4. **Expected:** Agent relays a PR prompt containing the milestone ID and the command `/issues pr M001`. No PR is auto-created.

### 3. Auto mode: no prompts, hooks fire directly

1. Run `/issues auto`
2. Let the agent scope and plan (creates ROADMAP.md)
3. Wait for agent_end to fire
4. **Expected:** The milestone issue is created automatically (hooks path). No confirmation prompt is shown. `syncMilestoneToIssue()` is called directly.

### 4. Standalone commands still work

1. Run `/issues sync M001` directly (without having run `/issues` first)
2. **Expected:** Interactive sync flow runs normally — preview shown, confirmation asked, issue created on confirm. No change from pre-M005 behavior.

### 5. Prompt fires only once per milestone

1. Run `/issues` and let scoping complete (sync prompt fires for M001)
2. Trigger another agent_end cycle (e.g. agent does more work)
3. **Expected:** The sync prompt does NOT fire again for M001. The milestone was already marked as prompted.

### 6. PR prompt skipped for unmapped milestone

1. Run `/issues` and let scoping complete
2. When the sync prompt appears, tell the agent "skip" (do not sync)
3. Complete the milestone (create SUMMARY.md)
4. Wait for agent_end to fire
5. **Expected:** No PR prompt appears for this milestone, because it was never synced (no ISSUE-MAP.json entry). The agent does not suggest creating a PR for an un-tracked milestone.

## Edge Cases

### Switching from prompted to auto mid-session

1. Run `/issues` (prompted flow activates)
2. Before completing the milestone, run `/issues auto`
3. **Expected:** `handleAutoEntry()` clears `_promptedFlowEnabled`. Subsequent agent_end cycles use hooks (auto-sync/auto-PR), not prompted flow. No double-sync or double-PR.

### Config missing

1. Delete `.gsd/issues.json`
2. Run `/issues` and let scoping complete
3. Wait for agent_end
4. **Expected:** Prompted branch gracefully skips (config load returns null). No crash, no prompt sent. Agent continues normally.

### Multiple milestones scoped

1. Run `/issues` and let the agent scope two milestones (M001, M002)
2. Wait for agent_end
3. **Expected:** Sync prompts fire for both M001 and M002 (separate `pi.sendMessage()` calls, each with the correct milestone ID).

## Failure Signals

- Sync prompt contains wrong milestone ID or wrong command
- PR prompt fires for an unmapped milestone
- Auto mode (`/issues auto`) shows prompts instead of auto-executing
- Same prompt fires twice for the same milestone
- Both hooks and prompted flow fire in the same agent_end cycle (double-sync)
- TypeError or import error in agent_end handler (check console)

## Requirements Proved By This UAT

- R009 — Sync surfaced as prompted step in GSD flow (extends from command-only to continuous lifecycle with PR prompt as well)

## Not Proven By This UAT

- LLM prompt quality is subjective — the `pi.sendMessage()` content is deterministic, but whether the LLM relays it verbatim, paraphrases, or acts on it depends on the model and context
- Remote tracker integration (issue creation, PR creation) — these are proven by M001/M002 tests and are not re-tested here
- Multi-provider behavior — prompted flow is provider-agnostic (uses the same sync/PR paths), so provider-specific testing is not repeated

## Notes for Tester

- The prompted flow sends messages to the LLM via `pi.sendMessage()` with `triggerTurn: true`. The LLM should interpret these and relay the prompt to the user. If the LLM ignores the message or acts on it without asking, that's an LLM behavior issue, not an extension bug.
- If prompts don't appear, check `pi.sendMessage` was called by looking at the extension's customType events (`gsd-issues:prompted-sync`, `gsd-issues:prompted-pr`).
- The `/issues sync` and `/issues pr` commands always work as standalone fallbacks regardless of prompted flow state.
