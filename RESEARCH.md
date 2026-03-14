# gsd-issues — Research & Architecture

> Research conducted 2026-03-14 from the di-core project. This file captures everything learned about pi extensions, the GSD lifecycle hooks, and the design decisions for this extension.

## What This Extension Does

Bridges GSD's slice lifecycle with remote issue trackers (GitLab and GitHub). Three core workflows:

1. **Sync** — Create issues from a GSD roadmap (one issue per slice)
2. **Import** — Pull existing issues into GSD planning as structured input
3. **Close** — Mark issues as done when slices complete

## Why an Extension (Not Skills)

The predecessor was three GSD skills in `di-core/.gsd/skills/` (`gitlab-sync`, `gitlab-import`, `gitlab-close`). These were pure markdown instructions — the LLM read the SKILL.md, interpreted bash snippets, and executed them. Problems:

- **Fragile** — LLM interpreting 200-line markdown procedures is error-prone
- **No lifecycle hooks** — `gitlab-close` relied on the LLM remembering to invoke it
- **Not distributable** — project-local skills, not shareable across repos/teams

An extension gives:
- **Deterministic execution** — TypeScript calling `glab`/`gh` directly via `pi.exec()`
- **Lifecycle hooks** — auto-close on slice completion via `pi.on("tool_result", ...)`
- **Slash commands** — `/issues sync`, `/issues import`, `/issues close`
- **Registered tools** — LLM can call `gsd_issues_sync`, `gsd_issues_import` with typed params
- **Distribution** — npm package or git repo, installed via pi's package manager

## Pi Extension Architecture

### Extension Structure

```
gsd-issues/
  package.json    # { "pi": { "extensions": ["./index.ts"] } }
  index.ts        # export default function(pi: ExtensionAPI) { ... }
```

The `package.json` needs a `"pi"` manifest field:
```json
{
  "name": "gsd-issues",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

### Extension Entry Point

```typescript
import type { ExtensionAPI, ExtensionContext } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function(pi: ExtensionAPI) {
  // Register tools (LLM-callable)
  pi.registerTool({ name, label, description, parameters, execute });

  // Register commands (user-invokable)
  pi.registerCommand("issues", { description, handler });

  // Subscribe to events (lifecycle hooks)
  pi.on("tool_result", async (event, ctx) => { ... });

  // Register keyboard shortcuts
  pi.registerShortcut("Ctrl+Alt+I", { description, handler });
}
```

### Key APIs Available

**ExtensionAPI (`pi`):**
- `pi.registerTool()` — register LLM-callable tools with TypeBox schemas
- `pi.registerCommand()` — register `/commands`
- `pi.on(event, handler)` — subscribe to lifecycle events
- `pi.registerShortcut()` — keyboard shortcuts
- `pi.exec(command, args, options)` — run shell commands, returns `{ stdout, stderr, exitCode }`
- `pi.sendUserMessage()` — send a message to the agent
- `pi.sendMessage()` — send a custom message to the session
- `pi.events` — shared EventBus for cross-extension communication

**ExtensionContext (`ctx`, passed to handlers):**
- `ctx.ui.select()` — show a selector dialog
- `ctx.ui.confirm()` — confirmation dialog
- `ctx.ui.input()` — text input dialog
- `ctx.ui.notify()` — show a notification
- `ctx.cwd` — current working directory
- `ctx.isIdle()` — whether the agent is streaming

### Lifecycle Events for Issue Closing

No dedicated "slice completed" event exists in GSD core. Two viable approaches:

**Approach 1: Watch for summary writes (recommended)**
```typescript
pi.on("tool_result", async (event, ctx) => {
  if (event.toolName !== "write") return;
  if (/S\d+-SUMMARY\.md$/.test(event.input.path)) {
    // Slice just completed — trigger issue close
  }
});
```

**Approach 2: Watch agent_end and read disk state**
```typescript
pi.on("agent_end", async (event, ctx) => {
  // Read STATE.md, compare against last known state
  // If a slice just transitioned to complete, close the issue
});
```

Approach 1 is more precise — triggers on the exact file write that signals completion.

## Provider Abstraction

Auto-detect from git remote (`gitlab.com` → GitLab, `github.com` → GitHub):

```typescript
interface IssueProvider {
  name: string;
  detect(): Promise<boolean>;
  createIssue(opts: CreateIssueOpts): Promise<{ iid: number; url: string }>;
  closeIssue(iid: number): Promise<void>;
  listIssues(filter: IssueFilter): Promise<Issue[]>;
  assignToMilestone(iid: number, milestone: string): Promise<void>;
}
```

### GitLab specifics
- CLI: `glab`
- Epics: group-level, assigned via REST API (`glab api -X POST`)
- Labels: `T::Done` convention
- Weight: in hours (1-4)

### GitHub specifics
- CLI: `gh`
- No epics — use Projects V2 or milestones
- Labels: different conventions
- No weight field natively

## Distribution

Pi has a built-in package manager. Extensions are distributed via:

### npm
```json
// In user's ~/.gsd/agent/settings.json
{ "packages": ["npm:gsd-issues"] }
```
Pi runs `npm install -g gsd-issues`, reads the `"pi"` manifest, auto-discovers resources.

### Git repo
```json
// In user's ~/.gsd/agent/settings.json
{ "packages": ["github.com/your-org/gsd-issues"] }
```
Pi clones, checks out, runs `npm install`, discovers from manifest. Updates via `git fetch + reset`.

### Project-scoped
```json
// In project's .pi/settings.json
{ "packages": ["github.com/your-org/gsd-issues"] }
```
Every team member gets it when they open the project.

## Mapping File

Replaces the old `GITLAB-MAP.json` with provider-agnostic `ISSUE-MAP.json`:

```json
[
  {
    "slice_id": "S01",
    "issue_id": 167,
    "provider": "gitlab",
    "url": "https://gitlab.com/org/repo/-/issues/167",
    "title": "feat(gsd): sync roadmap to gitlab issues",
    "direction": "gsd_to_remote",
    "created_at": "2026-03-14T18:00:00Z"
  }
]
```

Location: `.gsd/milestones/{MID}/ISSUE-MAP.json`

## Proposed File Structure

```
gsd-issues/
  package.json
  index.ts              # extension entry — registers tools, commands, hooks
  providers/
    types.ts            # IssueProvider interface, shared types
    detect.ts           # auto-detect provider from git remote
    gitlab.ts           # glab-based implementation
    github.ts           # gh-based implementation
  lib/
    issue-map.ts        # read/write ISSUE-MAP.json
    state.ts            # read GSD STATE.md, roadmap, etc.
    sync.ts             # sync roadmap slices → remote issues
    import.ts           # import remote issues → planning input
    close.ts            # close issue on slice completion
  README.md
  RESEARCH.md           # this file
```

## Predecessor Skills (Reference)

The original skills live in `di-core/.gsd/skills/`:
- `gitlab-sync/SKILL.md` — full procedure for creating issues from roadmap
- `gitlab-import/SKILL.md` — full procedure for importing issues into planning
- `gitlab-close/SKILL.md` — full procedure for marking issues done

These contain working `glab` commands, API patterns, and edge case handling that should be ported into the provider implementations.

## Open Questions

- Should `gitlab-import` stay as a skill? It's read-only, fuzzy/creative work that the LLM does well with markdown instructions. The extension could register a tool that fetches the data, but the "interpret and organize into planning" part is inherently LLM work.
- Backward compatibility with existing `GITLAB-MAP.json` files — migration path or just support both?
- Should the extension emit events on `pi.events` bus (e.g. `gsd-issues:sync-complete`) for other extensions to consume?
