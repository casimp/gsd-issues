---
estimated_steps: 5
estimated_files: 10
---

# T01: Remove M003 orchestration and make config.milestone optional

**Slice:** S01 — Rip out orchestration, build smart entry and scope flow
**Milestone:** M004

## Description

Remove the M003 orchestration state machine entirely — `lib/auto.ts`, `commands/auto.ts`, their test files, the `gsd_issues_auto` tool registration, and the orchestration `agent_end` handler from `index.ts`. Then make `config.milestone` optional in the Config type and `validateConfig()`, and update the setup wizard to allow skipping milestone selection.

This is mechanical cleanup + a config schema change. The orchestration is ~1800 lines of code plus ~1000 lines of tests that are being replaced by the smart entry (T02) and hooks (S02).

## Steps

1. Delete `src/lib/auto.ts` and `src/lib/__tests__/auto.test.ts`. Delete `src/commands/auto.ts` and `src/commands/__tests__/auto.test.ts`.
2. In `src/index.ts`: remove the `gsd_issues_auto` tool registration block (lines ~391-416), remove the orchestration `agent_end` handler (lines ~418-432), remove the `case "auto"` block in the command handler switch (the "auto" subcommand will be re-wired to the new handler in T03), clean up the module docstring and unused imports. Keep "auto" in SUBCOMMANDS — it will be re-routed in T03. Update the command description strings.
3. In `src/lib/config.ts`: change `milestone: string` to `milestone?: string` in the Config interface. In `validateConfig()`, change the milestone validation from required to optional — remove the "Missing required field" check, keep the type check for when it's present.
4. In `src/commands/setup.ts`: make the milestone step allow an empty/skip option. When user provides empty string or selects "skip", don't set milestone in config. Update the summary display to handle missing milestone.
5. Add tests in `src/lib/__tests__/config.test.ts` for: config without milestone validates successfully, config with valid milestone still works, config with non-string milestone still fails. Update `src/commands/__tests__/setup.test.ts` if any tests depend on milestone being required.

## Must-Haves

- [ ] `src/lib/auto.ts` and `src/lib/__tests__/auto.test.ts` deleted
- [ ] `src/commands/auto.ts` and `src/commands/__tests__/auto.test.ts` deleted
- [ ] `gsd_issues_auto` tool registration removed from `index.ts`
- [ ] Orchestration `agent_end` handler removed from `index.ts`
- [ ] "auto" case in command switch removed (temporarily — T03 re-wires it)
- [ ] `Config.milestone` is `string | undefined` (optional)
- [ ] `validateConfig()` accepts config without milestone field
- [ ] Setup wizard allows skipping milestone
- [ ] All surviving tests pass

## Observability Impact

- **Removed signals:** `gsd-issues:auto-phase` events no longer emitted; `isAutoActive` guard in `agent_end` handler gone. These were M003-only and will be replaced by smart entry signals in T02.
- **Config validation errors** now list milestone as optional — a config missing `milestone` no longer triggers "Missing required field" in error output. Agents inspecting validation output should treat milestone absence as valid.
- **Failure visibility:** `validateConfig()` still surfaces all errors in a single thrown message; the error list simply no longer includes milestone. Config files written without milestone are valid and loadable.
- **How a future agent inspects this task:** grep for `gsd_issues_auto` or `isAutoActive` in `src/` should return zero hits, confirming clean removal.

## Verification

- `npx vitest run` — all tests pass
- `grep -r 'auto\.ts\|auto\.js\|gsd_issues_auto\|isAutoActive\|advancePhase\|startAuto\|AutoDeps\|AutoPhase\|AutoState' src/ --include='*.ts'` returns no hits (confirming clean removal)
- Config test: `npx vitest run -- --grep "config"` includes optional milestone tests

## Inputs

- `src/index.ts` — current extension entry point with orchestration wiring
- `src/lib/config.ts` — current Config type with required milestone
- `src/commands/setup.ts` — current setup wizard

## Expected Output

- `src/lib/auto.ts` — deleted
- `src/lib/__tests__/auto.test.ts` — deleted
- `src/commands/auto.ts` — deleted
- `src/commands/__tests__/auto.test.ts` — deleted
- `src/index.ts` — cleaned of all orchestration references
- `src/lib/config.ts` — milestone optional
- `src/lib/__tests__/config.test.ts` — new tests for optional milestone
- `src/commands/setup.ts` — milestone skip support
