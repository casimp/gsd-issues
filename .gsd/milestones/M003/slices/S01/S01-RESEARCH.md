# S01: Config, Setup, and Sizing Validation — Research

**Date:** 2026-03-14

## Summary

S01 adds two new config fields (`max_slices_per_milestone` and `sizing_mode`), extends the setup wizard to collect them, and introduces a `validateMilestoneSize()` function that reads a milestone's roadmap and reports whether it exceeds the configured limit.

The codebase is well-structured for this. The Config interface already has `[key: string]: unknown` passthrough, so adding typed optional fields won't break existing validation or round-trip tests. `parseRoadmapSlices()` in `src/lib/state.ts` already extracts slice metadata from roadmap files — the sizing validator just needs to count its output. The setup wizard (`src/commands/setup.ts`) follows a linear collect-and-assemble pattern that's easy to extend with two more prompts.

The work is straightforward: typed config fields, validation rules, two setup prompts, and a pure function that composes existing primitives. No external dependencies, no new modules beyond a `src/lib/sizing.ts` file.

## Recommendation

Create a `src/lib/sizing.ts` module with `validateMilestoneSize()` that:
1. Reads the roadmap file via `findRoadmapPath()` + `readFile()`
2. Parses slices via `parseRoadmapSlices()`
3. Compares count against `config.max_slices_per_milestone`
4. Returns a `SizingResult` with `{ valid, sliceCount, limit, mode, milestoneId }`

Add `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` to the Config interface. Extend `validateConfig()` to type-check these fields. Extend the setup wizard with two prompts after the existing fields (before provider-specific config).

Keep `validateMilestoneSize()` pure — it takes config + roadmap content, returns a result. The I/O (reading the file) stays in the caller. This matches the existing pattern where `parseRoadmapSlices()` is a pure parser and callers handle I/O.

Actually — looking more closely, `syncMilestoneToIssue()` in sync.ts reads the roadmap file and calls `parseRoadmapSlices()` inline. The sizing validator should follow the same pattern: read the file itself, so callers don't need to. S02's orchestration loop will call `validateMilestoneSize(cwd, milestoneId, config)` as a single step. File I/O inside the function, result out.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Parse roadmap slices from markdown | `parseRoadmapSlices()` in `src/lib/state.ts` | Already tested (462-line test file), handles all edge cases |
| Find roadmap file path | `findRoadmapPath()` in `src/lib/state.ts` | Consistent path construction |
| Config I/O | `loadConfig()` / `saveConfig()` in `src/lib/config.ts` | Handles mkdir, validation, error messages |
| Config validation pattern | `validateConfig()` in `src/lib/config.ts` | Follow the same hand-rolled structural check style |

## Existing Code and Patterns

- `src/lib/config.ts` — Config interface with `[key: string]: unknown` index signature. `validateConfig()` checks types field-by-field. Adding optional fields requires: add to interface, add validation rules in `validateConfig()`. The `[key: string]: unknown` means extra fields already pass through without errors — but typed fields need explicit validation.
- `src/lib/state.ts` — `parseRoadmapSlices(content: string): RoadmapSlice[]` is a pure parser. Returns `{ id, title, risk, done, description }` per slice. `findRoadmapPath(cwd, milestoneId)` builds the `.gsd/milestones/{MID}/{MID}-ROADMAP.md` path.
- `src/commands/setup.ts` — Linear flow: detect → discover → collect → assemble → save → validate → summarize. 435 lines. New fields go in Step 5 ("Collect remaining fields") before Step 6 ("Provider-specific config"). Summary in Step 8 needs the new fields too.
- `src/lib/sync.ts` — `syncMilestoneToIssue()` reads the roadmap, calls `parseRoadmapSlices()`, and uses the result for weight computation. This is the pattern the sizing validator should follow.
- `src/lib/__tests__/config.test.ts` — 346 lines, 24 tests. Tests cover valid/invalid configs, round-trip, extra field passthrough. New fields need: acceptance when valid, rejection when wrong type, passthrough when absent.
- `src/commands/__tests__/setup.test.ts` — 529 lines, uses mock UI (select/input/confirm/notify) and routed exec. Follow this pattern for testing the new prompts.
- `src/lib/__tests__/state.test.ts` — 462 lines. Tests for `parseRoadmapSlices()` cover empty, single, multiple, mixed done/undone, missing descriptions. The sizing validator tests will compose on top of these.

## Constraints

- Config validation is hand-rolled — no schema library (D014). New fields must follow the same `if (field in c && typeof c[field] !== ...)` pattern.
- 242 existing tests must continue passing. The `[key: string]: unknown` on Config means adding new optional fields to the interface is backward-compatible — existing test configs won't break.
- `max_slices_per_milestone` must be a positive integer (≥1). Zero or negative values are meaningless.
- `sizing_mode` defaults to `"best_try"` if omitted. This is the safe default — strict mode is opt-in.
- Cannot modify GSD core. The sizing validator is purely within gsd-issues.

## Common Pitfalls

- **Forgetting to update the summary output in setup.ts** — Step 8 builds a string of all config fields. If new fields are collected but not shown in the summary, the user sees incomplete feedback. Must add `max_slices_per_milestone` and `sizing_mode` to the summary block.
- **Type narrowing after index signature** — The `[key: string]: unknown` on Config means TypeScript sees all property accesses as `unknown`. The typed fields (`max_slices_per_milestone?: number`) override for direct property access, but the index signature must be compatible. Since `number | undefined` is assignable to `unknown`, this works.
- **Edge case: roadmap with 0 slices** — If planning hasn't happened yet, `parseRoadmapSlices()` returns `[]`. The sizing validator should treat this as "not enough data to validate" rather than "valid (0 ≤ limit)". Return a distinct state like `{ valid: true, sliceCount: 0, reason: "no_slices" }` so S02's orchestrator knows planning hasn't happened yet vs. the milestone being right-sized.
- **Coupling validateMilestoneSize to file I/O** — Keep the core comparison pure (count vs limit) and wrap it in an async function that does the file read. This lets tests pass roadmap content directly without temp files.

## Open Risks

- **Default value for max_slices_per_milestone** — The setup wizard needs a sensible default. The user considers milestones with 10+ slices "too large for meaningful review." A default of 5 is conservative. The prompt should suggest it but let the user override.
- **Config migration** — Existing `.gsd/issues.json` files from M001/M002 won't have the new fields. Since they're optional with sensible defaults, this is fine — but `validateMilestoneSize()` must handle `config.max_slices_per_milestone === undefined` gracefully (skip validation entirely).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| vitest | `pproenca/dot-skills@vitest` (343 installs) | available — not needed, project patterns are sufficient |
| pi extensions | `zenobi-us/dotfiles@creating-pi-extensions` (26 installs) | available — not needed, project has its own ExtensionAPI types |

## Sources

- Config interface and validation pattern (source: `src/lib/config.ts`)
- Roadmap parsing and path helpers (source: `src/lib/state.ts`)
- Setup wizard flow and testing patterns (source: `src/commands/setup.ts`, `src/commands/__tests__/setup.test.ts`)
- Sync's inline roadmap reading pattern (source: `src/lib/sync.ts` lines 240-255)
- Existing test suite: 242 tests across 15 files (source: `npx vitest run`)
