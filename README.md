# gsd-issues

Issue tracker integration for GSD and pi. Syncs GSD roadmap slices to GitHub/GitLab issues, imports remote issues for planning, and auto-closes issues on slice completion.

## Features

- **Sync** — Create remote issues from GSD roadmap slices with milestone, assignee, labels, weight, and epic support
- **Close** — Close the remote issue mapped to a completed slice
- **Import** — Fetch remote issues as structured markdown for LLM-assisted planning
- **Auto-close** — Lifecycle hook that closes mapped issues when a slice summary is written
- **Dual provider** — GitHub (via `gh` CLI) and GitLab (via `glab` CLI)

## Installation

```bash
npm install -g gsd-issues
```

Add to your pi `settings.json` packages array:

```json
{
  "packages": ["npm:gsd-issues"]
}
```

Pi will discover the extension automatically on next launch.

## Setup

Run the interactive setup wizard:

```
/issues setup
```

The wizard will:

1. Detect your provider (GitHub or GitLab) from the git remote
2. Discover the project/repo path
3. Prompt for milestone, assignee, labels, and provider-specific options
4. Write `.gsd/issues.json` config

### Manual Configuration

Create `.gsd/issues.json` in your project root:

**GitLab:**

```json
{
  "provider": "gitlab",
  "milestone": "M001",
  "assignee": "username",
  "labels": ["gsd"],
  "done_label": "T::Done",
  "gitlab": {
    "project_path": "group/project",
    "project_id": 42,
    "weight_strategy": "fibonacci",
    "epic": "&42"
  }
}
```

**GitHub:**

```json
{
  "provider": "github",
  "milestone": "M001",
  "assignee": "username",
  "labels": ["gsd"],
  "github": {
    "repo": "owner/repo",
    "close_reason": "completed"
  }
}
```

## Commands

All commands are accessed via `/issues <subcommand>` in pi.

### `/issues setup`

Interactive configuration wizard. Detects provider, discovers project details, and writes `.gsd/issues.json`.

### `/issues sync`

Syncs unmapped GSD roadmap slices to remote issues. Shows a preview of what will be created and asks for confirmation before proceeding.

### `/issues import`

Imports open issues from the remote tracker as formatted markdown.

Flags:
- `--milestone <name>` — Filter by milestone (overrides config)
- `--labels <a,b>` — Filter by labels (comma-separated)

### `/issues close <slice_id>`

Closes the remote issue mapped to the given slice ID.

### `/issues status`

_(Not yet implemented)_

## Tools (LLM-callable)

These tools are registered for LLM callers (agents) and are not typically invoked directly by users.

### `gsd_issues_sync`

Syncs roadmap slices to remote issues. Accepts optional `milestone_id` and `roadmap_path` parameters. Runs without confirmation (LLM-driven).

### `gsd_issues_close`

Closes the remote issue for a given `slice_id`. Accepts optional `milestone_id`.

### `gsd_issues_import`

Imports issues with optional filtering by `milestone`, `labels`, `state`, and `assignee`. Returns structured markdown.

## Auto-close Hook

The extension registers a `tool_result` lifecycle hook. When a write tool produces a file matching `.gsd/milestones/M###/slices/S##/S##-SUMMARY.md`, the mapped issue is automatically closed. This integrates with the GSD workflow — completing a slice summary triggers issue closure without explicit user action.

## Events

The extension emits events on `pi.events` for composability:

| Event | Payload | When |
|-------|---------|------|
| `gsd-issues:sync-complete` | `{ milestone, created, skipped, errors }` | After sync finishes |
| `gsd-issues:close-complete` | `{ sliceId, milestone, issueId, url }` | After issue is closed |
| `gsd-issues:import-complete` | `{ issueCount, markdown }` | After import finishes |

## Requirements

- Node.js >= 18
- `gh` CLI (for GitHub) or `glab` CLI (for GitLab) installed and authenticated
- pi coding agent

## License

MIT
