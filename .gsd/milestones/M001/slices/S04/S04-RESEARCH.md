# S04: Auto-close on slice completion — Research

**Date:** 2026-03-14

## Summary

S04 delivers the auto-close lifecycle hook: when the agent writes an `S##-SUMMARY.md` file, the extension detects it via `pi.on("tool_result")`, looks up the mapping in ISSUE-MAP.json, and closes the remote issue with provider-appropriate behavior (done label for GitLab, close reason for GitHub). It also wires the `/issues close` command and a `gsd_issues_close` LLM-callable tool, and emits `gsd-issues:close-complete` on the event bus.

The pi extension API provides exactly the hook we need: `pi.on("tool_result", handler)` fires after every tool execution with `toolName`, `input` (containing `path` and `content` for write tools), `content`, and `isError`. The handler runs asynchronously and can modify the result. The `WriteToolInput` shape is `{ path: string, content: string }` — we pattern-match the path for `S\d+-SUMMARY.md` and extract the milestone ID from the directory structure.

All provider-side close infrastructure exists from S01: `IssueProvider.closeIssue(opts)` handles GitLab's two-step close+label and GitHub's `--reason` flag. Config from S02 provides `done_label` and `github.close_reason`. The main new code is the close orchestration module, the tool_result hook wiring, and the command/tool registration.

## Recommendation

Build three units:

1. **`src/lib/close.ts`** — Pure close orchestration: `closeSliceIssue(opts)` loads ISSUE-MAP.json, finds the entry for the slice, calls `provider.closeIssue()` with config-driven options, emits `gsd-issues:close-complete`. Returns a structured result. No I/O beyond what's injected.

2. **Hook wiring in `src/index.ts`** — Add `pi.on("tool_result", handler)` that watches for write tool results where `event.input.path` matches the summary file pattern. Extract milestone ID and slice ID from the path, derive the ISSUE-MAP.json location, call `closeSliceIssue()`. Guard against: `isError` results, non-write tools, paths that don't match, missing config, missing map entries. The hook must be fire-and-forget (no blocking the tool pipeline) and must not throw (catch and log).

3. **Command + tool** — `/issues close` command (manual trigger with UI feedback) and `gsd_issues_close` tool (LLM-callable). Both delegate to `closeSliceIssue()`.

The `ExtensionAPI` local type needs `on()` method added to match pi's actual contract.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Issue close CLI calls | `IssueProvider.closeIssue()` from S01 | Already handles GitLab two-step close + done label, GitHub `--reason` |
| ISSUE-MAP lookup | `loadIssueMap()` from S01 | Handles missing file, corrupt JSON, structural validation |
| Config loading | `loadConfig()` from S02 | Handles missing file with setup guidance, validates structure |
| Provider instantiation | `createProvider(config, exec)` from S03/index.ts | Simple factory, already proven |
| State reading | `readGSDState()` from S03 | Reads active milestone from STATE.md |
| TypeBox schemas | `@sinclair/typebox` already a dependency | Consistent with sync tool registration pattern |

## Existing Code and Patterns

- `src/providers/types.ts` — `CloseIssueOpts` has `issueId`, `reason?` (GitHub), `doneLabel?` (GitLab) — all we need
- `src/providers/gitlab.ts` — `closeIssue()` does two CLI calls: `glab issue close` then `glab issue update --label` for done label
- `src/providers/github.ts` — `closeIssue()` passes `--reason` flag to `gh issue close`
- `src/lib/config.ts` — `Config.done_label` (top-level), `Config.github?.close_reason` — both available after `loadConfig()`
- `src/lib/sync.ts` — Pattern for event emission: `emit?.("gsd-issues:sync-complete", { ... })`
- `src/index.ts` — `createProvider(config, exec)` factory, tool registration via `pi.registerTool()`, command handler pattern
- `~/.gsd/agent/extensions/gsd/index.ts:421` — Reference `pi.on("tool_result")` handler: checks `event.toolName`, early-returns on irrelevant events, processes asynchronously

## Constraints

- **`ExtensionAPI.on()` not in local types** — Current `ExtensionAPI` interface in `src/index.ts` lacks the `on` method. Must add it with the correct overload for `"tool_result"`. The handler receives `(event: ToolResultEvent, ctx: ExtensionContext)` per pi's real types.
- **Handler must not throw** — The tool_result handler runs in pi's extension wrapper pipeline. Uncaught errors would surface as `ExtensionError` and could disrupt the tool result flow. All close operations must be wrapped in try/catch.
- **Handler must not block** — The tool_result event fires synchronously in the tool execution pipeline. The close operation involves CLI calls (network I/O). The handler should fire-and-forget (no `await` on the outer call) or pi handles async handlers gracefully (it does — the wrapper `await`s but the tool result is already computed).
- **`event.input` typing** — `ToolResultEvent.input` is `Record<string, unknown>`. For write tools, it contains `{ path: string, content: string }` but this isn't statically typed. Need runtime type narrowing.
- **Path resolution** — `event.input.path` may be relative or absolute. The write tool resolves paths via `resolveToCwd()` internally, but the `input` object contains the raw user-supplied path. Need to resolve against `process.cwd()` for reliable matching.
- **ISSUE-MAP.json location** — The map lives at `.gsd/milestones/{milestoneId}/ISSUE-MAP.json`. Must derive `milestoneId` from the summary file path (e.g. `.gsd/milestones/M001/slices/S01/S01-SUMMARY.md` → `M001`).
- **pi.exec PATH** — GitLab's `glab` requires `$HOME/.local/bin` in PATH. The providers already handle this via the injected `ExecFn` (pi.exec), but the hook must pass `pi.exec` not `child_process`.

## Common Pitfalls

- **Re-writes of summary files** — Agent may rewrite a summary file during edits. The hook must be idempotent: if the issue is already closed, the close call should be a no-op or handled gracefully. Both `glab issue close` and `gh issue close` on an already-closed issue return non-zero — need to catch `ProviderError` and treat "already closed" as success.
- **Non-GSD summary writes** — A file named `SUMMARY.md` (without the `S##-` prefix) or a file in an unrelated directory shouldn't trigger close. The path regex must be specific: match `.gsd/milestones/{milestoneId}/slices/{sliceId}/{sliceId}-SUMMARY.md`.
- **Partial writes / error results** — If the write tool errors (`event.isError === true`), the file may not exist or may be corrupt. Skip close on error results.
- **Missing ISSUE-MAP entry** — Not every slice has a mapped issue (sync may not have been run, or this is a new slice). Missing entry is a no-op, not an error.
- **Missing config** — If `.gsd/issues.json` doesn't exist, `loadConfig()` throws. The hook should catch this silently (no config = no close behavior).
- **MR-aware close (GitLab predecessor)** — The predecessor skill checked if an MR would auto-close the issue. This is fragile (requires checking MR descriptions) and provider-specific. For the extension, we always close explicitly — the done label is the primary signal, and double-closing is harmless. Omit MR-aware logic for now; can revisit if needed.

## Open Risks

- **Already-closed issue handling** — `glab issue close` on an already-closed issue may return exit code 1. Need to verify behavior and handle gracefully. If it does, the `ProviderError` will be thrown and the hook must catch it without logging a false alarm.
- **Async handler timing** — The tool_result handler fires during the agent's tool execution loop. If the close CLI call is slow (network), it could delay the next tool result. Pi does `await` the handler, so slow close calls could add latency. This is acceptable — close is infrequent and the added latency is bounded by CLI timeout.
- **Edit tool vs write tool** — The agent could theoretically use the `edit` tool on a summary file (appending content). This wouldn't be caught by a write-only hook. In practice, summaries are written once via the write tool. If edit detection is needed later, add a parallel check for `event.toolName === "edit"` with the same path pattern.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | n/a | No external skill — using pi source directly as reference |
| GitLab/GitHub CLI | n/a | Providers already implemented in S01 |

## Sources

- `ToolResultEvent` shape and handler contract (source: pi extension types at `~/.../extensions/types.ts:703-760,993`)
- `WriteToolInput` schema: `{ path, content }` (source: pi write tool at `~/.../tools/write.ts:7-12`)
- `wrapToolWithExtensions` — confirms handler is awaited, result can be modified (source: pi extension wrapper at `~/.../extensions/wrapper.ts:73-91`)
- GSD extension's `tool_result` handler — reference pattern for early-return and async processing (source: `~/.gsd/agent/extensions/gsd/index.ts:421`)
- `EventBus` — simple `emit(channel, data)` / `on(channel, handler)` interface (source: pi event-bus at `~/.../event-bus.ts:3-6`)
- Predecessor close skill — MR-aware close, done label workflow, graceful when no mapping (source: `di-core/.gsd/skills/gitlab-close/SKILL.md`)
