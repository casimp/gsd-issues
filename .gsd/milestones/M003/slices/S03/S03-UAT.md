# S03: README and Documentation — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is a single-file documentation update with no runtime code changes. Verification is grep-based content checks and visual inspection of the rendered README.

## Preconditions

- Repository cloned with `README.md` present at project root
- A markdown renderer available (GitHub web UI, VS Code preview, or `grip`)

## Smoke Test

Open `README.md` — confirm it mentions `/issues auto`, has a mermaid diagram, and lists five LLM tools.

## Test Cases

### 1. Auto-flow tool documented

1. Run `grep -c 'gsd_issues_auto' README.md`
2. **Expected:** Output ≥ 1

### 2. Sizing config fields in config examples

1. Run `grep -c 'max_slices_per_milestone' README.md`
2. Run `grep -c 'sizing_mode' README.md`
3. **Expected:** Both outputs ≥ 1. Fields appear in both GitLab and GitHub config examples.

### 3. Auto-phase event documented

1. Run `grep -c 'auto-phase' README.md`
2. **Expected:** Output ≥ 1. The event appears in the Events table with `{ phase, milestoneId }` payload.

### 4. /issues auto command in commands table

1. Run `grep -c '/issues auto' README.md`
2. **Expected:** Output ≥ 1. The command appears in the Commands table with a description of the auto-flow lifecycle.

### 5. Tool count updated to five

1. Run `grep 'Five tools' README.md`
2. **Expected:** Matches a line stating five tools are registered.

### 6. /issues status has stubbed caveat

1. Run `grep 'status' README.md | grep -i 'stub'`
2. **Expected:** At least one line indicates `/issues status` is stubbed or not yet implemented.

### 7. Mermaid diagram syntax valid

1. Count `subgraph` lines: `grep -c 'subgraph' README.md`
2. Count standalone `end` lines: `grep -c '^ *end$' README.md`
3. **Expected:** Both counts are equal (balanced subgraph/end pairs). Currently 3/3.

### 8. Mermaid diagram shows both paths

1. Open README.md in a markdown renderer that supports mermaid (GitHub web, VS Code with mermaid extension)
2. **Expected:** Diagram shows a "manual" subgraph with sync/import/close/pr commands AND an "auto" subgraph with the phase sequence including sizing check and split loop.

### 9. No aspirational features documented

1. Read the README end-to-end
2. **Expected:** Every feature, command, tool, and event described in the README corresponds to implemented code. No "coming soon", "planned", or features that don't exist in `src/`.

### 10. Tests still pass

1. Run `npx vitest run`
2. **Expected:** 309 tests pass, 0 failures. README changes should not affect test results.

## Edge Cases

### Config examples match actual Config type

1. Compare the JSON fields in README config examples against `src/lib/config.ts` Config interface
2. **Expected:** All fields in config examples exist in the Config type. No extra fields documented that don't exist in code.

### Tool parameter documentation matches TypeBox schema

1. Compare `gsd_issues_auto` tool description in README against `src/index.ts` registerTool call
2. **Expected:** Parameters listed in README match the TypeBox schema in source code.

## Failure Signals

- Any grep check returning 0 — missing documentation section
- Mermaid subgraph/end count mismatch — broken diagram syntax
- README mentions features not present in `src/` — aspirational documentation
- Tests fail after README edit — accidental source code modification

## Requirements Proved By This UAT

- R021 — README documents the `/issues auto` lifecycle accurately
- R018 — README documents `max_slices_per_milestone` and `sizing_mode` config fields
- R019 — README documents milestone size validation in the auto-flow diagram

## Not Proven By This UAT

- Runtime correctness of any workflow — this UAT validates documentation only
- R021 runtime behavior — auto-flow orchestration correctness is proven by S02's 43 contract tests, not this UAT
- Visual rendering of mermaid diagrams on all platforms — only checked on one renderer

## Notes for Tester

- The mermaid diagram test (case 8) requires a renderer with mermaid support. GitHub's web UI works. Plain markdown preview will show raw mermaid source.
- "Stubbed" caveat for `/issues status` is expected — it's intentionally not functional yet (deferred to a future milestone).
