# S01: Rip out orchestration, build smart entry and scope flow

**Goal:** `/issues` with no milestone offers "import from tracker" or "start fresh", LLM creates milestones via GSD, milestones synced to tracker with confirmation. M003 state machine fully removed. `config.milestone` optional.
**Demo:** Run `/issues` with no milestone in config → see import/fresh choice → scope prompt sent to LLM. Existing commands (sync, pr, close, import) still work. All tests pass.

## Must-Haves

- M003 orchestration fully removed: `lib/auto.ts`, `commands/auto.ts`, their test files, `gsd_issues_auto` tool registration, orchestration `agent_end` handler in `index.ts`
- `config.milestone` is optional in Config type and `validateConfig()` — existing configs with milestone still work
- Setup wizard allows skipping milestone selection (optional field)
- `/issues` with no subcommand runs smart entry: detects milestone state, offers import-from-tracker or start-fresh
- Smart entry sends a scope prompt via `pi.sendMessage` that instructs the LLM to create right-sized milestones
- Scope completion detected via new CONTEXT.md files on disk (helper function)
- `/issues auto` runs smart entry then kicks off `/gsd auto` via `pi.sendMessage`
- Milestone scanner: utility that scans `.gsd/milestones/` for CONTEXT.md files, returns milestone IDs
- Sync triggered after scope: user prompted to sync newly created milestones to tracker
- All surviving tests pass, new tests cover smart entry, config optionality, milestone scanning

## Proof Level

- This slice proves: contract
- Real runtime required: no (pi APIs mocked in tests; runtime prompt quality is UAT)
- Human/UAT required: yes (scope prompt quality validated by first real `/issues` run)

## Verification

- `npx vitest run` — all tests pass (existing tests adjusted for removed code, new tests for smart entry)
- `src/lib/__tests__/smart-entry.test.ts` — tests for milestone scanning, scope prompt construction, completion detection
- `src/lib/__tests__/config.test.ts` — existing + new tests for optional milestone
- `src/commands/__tests__/issues.test.ts` — tests for `/issues` no-subcommand smart entry routing and `/issues auto` with smart entry + GSD auto
- `npx vitest run -- --grep "config"` — config validation errors list specific field names for all failures (no silent swallowing); milestone absence produces no error

## Observability / Diagnostics

- Runtime signals: `gsd-issues:scope-complete` event emitted when scope finishes with milestone count
- Inspection surfaces: CONTEXT.md files on disk signal milestone creation; config validation errors list missing/invalid fields
- Failure visibility: scope prompt sent to LLM is logged via `sendMessage` — future agent can inspect what was asked
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `pi.sendMessage` for scope prompt, `pi.on("agent_end")` for completion detection, `readGSDState()` for resume path
- New wiring introduced in this slice: smart entry handler in `/issues` command, `agent_end` hook for scope completion (replaces orchestration hook)
- What remains before the milestone is truly usable end-to-end: S02 adds auto-PR and sizing hooks, S03 adds PR template and README

## Tasks

- [x] **T01: Remove M003 orchestration and make config.milestone optional** `est:45m`
  - Why: Clears the decks — removes ~1800 lines of orchestration code and its tests, makes milestone optional so the smart entry can work without pre-configured milestone IDs
  - Files: `src/lib/auto.ts`, `src/lib/__tests__/auto.test.ts`, `src/commands/auto.ts`, `src/commands/__tests__/auto.test.ts`, `src/index.ts`, `src/lib/config.ts`, `src/lib/__tests__/config.test.ts`, `src/commands/setup.ts`, `src/commands/__tests__/setup.test.ts`
  - Do: Delete `lib/auto.ts` and its test file. Delete `commands/auto.ts` and its test file. Remove `gsd_issues_auto` tool registration from `index.ts`. Remove orchestration `agent_end` handler from `index.ts`. Remove "auto" from SUBCOMMANDS. Clean up imports. Make `milestone` optional in Config interface. Update `validateConfig()` to accept missing milestone (keep type check when present). Update setup wizard to allow skipping milestone. Add config tests for optional milestone. Verify all remaining tests pass.
  - Verify: `npx vitest run` — all surviving tests pass, no references to deleted modules
  - Done when: `lib/auto.ts`, `commands/auto.ts` and their tests are gone; `gsd_issues_auto` tool and orchestration `agent_end` handler removed from `index.ts`; `milestone` is optional in Config; test count drops by ~43 (auto tests) but all remaining pass; setup allows empty milestone

- [x] **T02: Build smart entry flow with milestone scanning and scope prompt** `est:1h`
  - Why: Core of the slice — the smart entry that makes `/issues` work without a milestone ID. Includes the milestone scanner, scope prompt builder, and completion detection.
  - Files: `src/lib/smart-entry.ts`, `src/lib/__tests__/smart-entry.test.ts`, `src/commands/issues.ts`, `src/commands/__tests__/issues.test.ts`, `src/index.ts`
  - Do: Create `lib/smart-entry.ts` with: `scanMilestones(cwd)` — scans `.gsd/milestones/` for dirs containing CONTEXT.md, returns milestone IDs; `buildScopePrompt(options)` — builds the scope prompt including sizing constraint and import context; `detectNewMilestones(before, after)` — compares milestone sets to find newly created ones. Create `commands/issues.ts` with `handleSmartEntry(ctx, pi)` — the no-subcommand handler: checks for existing milestones via `readGSDState()` for resume, otherwise offers import-from-tracker or start-fresh via `ctx.ui.select`, sends scope prompt via `pi.sendMessage`. Wire smart entry into `/issues` no-subcommand case in `index.ts` (replace the usage hint). Add `agent_end` handler for scope completion detection: scans for new CONTEXT.md files, emits `gsd-issues:scope-complete` event, prompts user to sync. Write comprehensive tests for all three `smart-entry.ts` functions and the command handler.
  - Verify: `npx vitest run -- --grep "smart-entry|issues command"` — new tests pass
  - Done when: `/issues` with no subcommand dispatches smart entry; milestone scanner finds CONTEXT.md files; scope prompt includes sizing constraint; completion detection compares before/after milestone sets; all tests pass

- [x] **T03: Wire /issues auto to smart entry + GSD auto mode** `est:45m`
  - Why: Completes the slice — `/issues auto` runs smart entry then starts `/gsd auto` via `pi.sendMessage`. Ensures the end-to-end wiring works at contract level.
  - Files: `src/commands/issues.ts`, `src/commands/__tests__/issues.test.ts`, `src/index.ts`
  - Do: Add `handleAutoEntry(ctx, pi)` to `commands/issues.ts` — runs smart entry flow, then on completion sends `/gsd auto` via `pi.sendMessage` to start GSD auto-mode. Re-wire `/issues auto` case in `index.ts` to use `handleAutoEntry` instead of deleted `handleAuto`. Add `agent_end` handler logic: when scope is complete and auto mode was requested, trigger GSD auto. Write tests for auto entry path — mock sendMessage, verify scope prompt sent first, then `/gsd auto` sent after completion. Run full test suite to confirm nothing is broken.
  - Verify: `npx vitest run` — all tests pass including new auto-entry tests
  - Done when: `/issues auto` triggers smart entry then GSD auto; `agent_end` handler correctly chains scope completion → GSD auto start; full test suite green

## Files Likely Touched

- `src/lib/auto.ts` (deleted)
- `src/lib/__tests__/auto.test.ts` (deleted)
- `src/commands/auto.ts` (deleted)
- `src/commands/__tests__/auto.test.ts` (deleted)
- `src/index.ts`
- `src/lib/config.ts`
- `src/lib/__tests__/config.test.ts`
- `src/commands/setup.ts`
- `src/commands/__tests__/setup.test.ts`
- `src/lib/smart-entry.ts` (new)
- `src/lib/__tests__/smart-entry.test.ts` (new)
- `src/commands/issues.ts` (new)
- `src/commands/__tests__/issues.test.ts` (new)
