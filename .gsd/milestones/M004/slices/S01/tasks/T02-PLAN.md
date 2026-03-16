---
estimated_steps: 5
estimated_files: 5
---

# T02: Build smart entry flow with milestone scanning and scope prompt

**Slice:** S01 — Rip out orchestration, build smart entry and scope flow
**Milestone:** M004

## Description

Build the core smart entry infrastructure: a milestone scanner that finds existing milestones by CONTEXT.md presence, a scope prompt builder that instructs the LLM to create right-sized milestones, and a completion detector that identifies newly created milestones. Wire the smart entry as the no-subcommand handler for `/issues`.

The smart entry mirrors GSD's `showSmartEntry()` pattern: detect state → offer choices → dispatch. When no milestone exists, user chooses "import from tracker" (fetches issues first, then scopes) or "start fresh" (scopes directly from user description). The scope prompt is sent via `pi.sendMessage` with explicit filesystem instructions for creating milestone directories and CONTEXT.md files.

## Steps

1. Create `src/lib/smart-entry.ts` with three functions:
   - `scanMilestones(cwd: string): Promise<string[]>` — reads `.gsd/milestones/` directory, returns sorted array of milestone IDs (directory names) that contain a CONTEXT.md file. Returns empty array if milestones dir doesn't exist.
   - `buildScopePrompt(options: { description?: string, importContext?: string, maxSlices?: number }): string` — builds the scope prompt for the LLM. Includes: explicit instructions to create milestone directories under `.gsd/milestones/`, write CONTEXT.md files, sizing constraint from maxSlices. When importContext is provided, includes it as background.
   - `detectNewMilestones(before: string[], after: string[]): string[]` — returns milestone IDs in `after` that weren't in `before`. Pure set difference.
2. Create `src/lib/__tests__/smart-entry.test.ts` with tests for all three functions: scanMilestones with no dir, empty dir, dirs with and without CONTEXT.md; buildScopePrompt with and without sizing/import context; detectNewMilestones with various before/after combos.
3. Create `src/commands/issues.ts` with `handleSmartEntry(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void>`:
   - Load config (handle missing config gracefully — may not exist yet)
   - Check `readGSDState()` — if active milestone exists, notify resume info and return
   - Scan existing milestones — if some exist without GSD state, offer to resume one
   - If no milestones: offer `ctx.ui.select` with "Import from tracker" or "Start fresh"
   - "Import from tracker": fetch issues via `importIssues`, include result as context in scope prompt
   - "Start fresh": prompt user for work description via `ctx.ui.input`, include in scope prompt
   - Build scope prompt via `buildScopePrompt()`, send via `pi.sendMessage` with `triggerTurn: true`
   - Record pre-scope milestone set for completion detection
4. Wire smart entry into `src/index.ts`: replace the no-subcommand usage hint with a call to `handleSmartEntry`. Register an `agent_end` handler that: snapshots milestones after agent turn, compares with pre-scope snapshot, if new milestones found emits `gsd-issues:scope-complete` event and notifies user.
5. Create `src/commands/__tests__/issues.test.ts` with tests for smart entry: mock pi APIs, test import path, fresh path, resume path, scope prompt sent via sendMessage, completion detection in agent_end.

## Must-Haves

- [ ] `scanMilestones()` finds milestone dirs containing CONTEXT.md
- [ ] `buildScopePrompt()` includes sizing constraint and filesystem instructions
- [ ] `detectNewMilestones()` correctly computes set difference
- [ ] Smart entry offers import-from-tracker or start-fresh when no milestone exists
- [ ] Scope prompt sent via `pi.sendMessage` with `triggerTurn: true`
- [ ] `agent_end` handler detects scope completion via new CONTEXT.md files
- [ ] `gsd-issues:scope-complete` event emitted with milestone count
- [ ] All new tests pass

## Verification

- `npx vitest run -- --grep "smart-entry"` — all smart-entry unit tests pass
- `npx vitest run -- --grep "issues command"` — all command handler tests pass
- `npx vitest run` — full suite green

## Observability Impact

- Signals added: `gsd-issues:scope-complete` event with `{ milestoneIds, count }` payload
- How a future agent inspects this: check for CONTEXT.md files in `.gsd/milestones/`; listen for scope-complete event
- Failure state exposed: scope prompt content visible in sendMessage mock; missing CONTEXT.md means scope didn't complete

## Inputs

- `src/index.ts` — cleaned of orchestration (T01 output)
- `src/lib/config.ts` — Config with optional milestone (T01 output)
- `src/lib/state.ts` — `readGSDState()`, `readMilestoneContext()` helpers
- `src/lib/import.ts` — `importIssues()` for import-from-tracker path

## Expected Output

- `src/lib/smart-entry.ts` — milestone scanning, scope prompt, completion detection
- `src/lib/__tests__/smart-entry.test.ts` — comprehensive tests
- `src/commands/issues.ts` — smart entry command handler
- `src/commands/__tests__/issues.test.ts` — command handler tests
- `src/index.ts` — wired with smart entry and scope completion agent_end handler
