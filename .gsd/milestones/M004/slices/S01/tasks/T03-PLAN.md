---
estimated_steps: 4
estimated_files: 4
---

# T03: Wire /issues auto to smart entry + GSD auto mode

**Slice:** S01 — Rip out orchestration, build smart entry and scope flow
**Milestone:** M004

## Description

Complete the slice by wiring `/issues auto` to run smart entry first, then start GSD auto-mode. The auto path reuses the smart entry flow from T02 but adds: after scope completion is detected, automatically send `/gsd auto` to start GSD's execution. This replaces the M003 orchestration entirely — gsd-issues is now just bookends around GSD.

The key design: `/issues auto` sets a flag indicating auto-mode was requested. The `agent_end` handler (from T02) checks this flag — when scope completes and auto was requested, it sends `/gsd auto` via `pi.sendMessage`. When scope completes without auto, it just notifies the user.

## Steps

1. Extend `src/commands/issues.ts`: add `handleAutoEntry(args, ctx, pi)` that calls `handleSmartEntry()` logic but sets an `_autoRequested` module-scoped flag. Add `isAutoRequested(): boolean` and `clearAutoRequested(): void` exports. If a milestone already exists (resume path), skip straight to sending `/gsd auto`.
2. Update the `agent_end` handler in `src/index.ts`: after detecting scope completion (new CONTEXT.md files), check `isAutoRequested()`. If true, send a message to start `/gsd auto` via `pi.sendMessage`, then clear the flag. If false, just notify the user about the new milestones and suggest syncing.
3. Re-wire `/issues auto` in `src/index.ts` command handler switch: add back the `case "auto"` block that was removed in T01, routing to `handleAutoEntry` from `commands/issues.ts` instead of the deleted `handleAuto`.
4. Add tests in `src/commands/__tests__/issues.test.ts`: test auto entry with no existing milestone (scope prompt sent, then on agent_end GSD auto started); test auto entry with existing milestone (skips scope, sends GSD auto directly); test that auto flag is cleared after completion; test non-auto path doesn't trigger GSD auto.

## Must-Haves

- [ ] `/issues auto` triggers smart entry then GSD auto-mode
- [ ] Auto flag set during `/issues auto`, cleared after GSD auto starts
- [ ] `agent_end` handler chains: scope complete → GSD auto (when auto requested)
- [ ] Resume path: existing milestone → skip scope → start GSD auto directly
- [ ] Non-auto `/issues` path doesn't trigger GSD auto
- [ ] "auto" subcommand routed to new handler in index.ts
- [ ] All tests pass including new auto-entry tests

## Verification

- `npx vitest run -- --grep "issues command"` — auto-entry tests pass
- `npx vitest run` — full test suite green (target: ~275+ tests, accounting for ~43 removed auto tests and ~25+ new tests)
- `grep -r 'handleAuto\b' src/ --include='*.ts'` — no references to old auto handler

## Observability Impact

- **New signal:** `gsd-issues:auto-start` event emitted when `/gsd auto` is dispatched after scope completion — payload: `{ milestoneIds, trigger: "scope-complete" | "resume" }`. Future agent can listen for this to confirm auto-mode was triggered.
- **Module-level flag:** `isAutoRequested()` returns whether auto-mode was requested — inspect from any module to determine if the current flow is auto or manual.
- **agent_end behavior change:** When `isAutoRequested()` is true and new milestones detected, sends `/gsd auto` via `pi.sendMessage` instead of just notifying. When false, notifies user about new milestones.
- **Failure visibility:** If scope completes but no milestones detected, auto flag is still cleared — prevents stuck auto state. The `gsd-issues:scope-complete` event fires only when milestones are actually created.

## Inputs

- `src/commands/issues.ts` — smart entry handler (T02 output)
- `src/commands/__tests__/issues.test.ts` — existing smart entry tests (T02 output)
- `src/index.ts` — cleaned and wired with smart entry (T01 + T02 output)

## Expected Output

- `src/commands/issues.ts` — extended with `handleAutoEntry`, auto flag management
- `src/commands/__tests__/issues.test.ts` — extended with auto-entry tests
- `src/index.ts` — `/issues auto` routed to new handler, `agent_end` chains to GSD auto
