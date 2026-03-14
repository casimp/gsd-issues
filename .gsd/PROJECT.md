# Project

## What This Is

`gsd-issues` is a pi extension that bridges GSD's slice lifecycle with remote issue trackers (GitHub and GitLab). It replaces four ad-hoc GSD skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) with a proper TypeScript extension using pi's extension API for deterministic execution, lifecycle hooks, slash commands, and npm distribution.

Three core workflows: sync (roadmap slices → remote issues), import (remote issues → LLM planning input), and close (auto-close on slice completion).

## Core Value

When a GSD slice completes, the corresponding remote issue is automatically closed. When a roadmap is created, the user is prompted to create matching issues. The extension handles the plumbing so the agent never needs to interpret bash snippets from skill files.

## Current State

S01 (provider abstraction), S02 (config and setup), S03 (sync workflow), S04 (auto-close), and S05 (import) complete. All three core workflows are implemented: sync creates remote issues from roadmap slices, close auto-closes mapped issues when a slice summary is written, and import fetches remote issues and formats them as structured markdown for LLM planning input. The Issue type now includes optional weight, milestone, assignee, and description fields populated by both providers. 188 mock-based tests passing across 13 test files, typecheck clean.

Next: S06 (npm packaging and distribution) — the final slice to make the extension installable via npm.

## Architecture / Key Patterns

- **Extension entry point:** `index.ts` exports a default function receiving `ExtensionAPI`
- **Provider abstraction:** `IssueProvider` interface with GitLab (`glab` CLI) and GitHub (`gh` CLI) implementations, auto-detected from git remote
- **Config:** Unified `.gsd/issues.json` with provider-specific sections, interactive setup via `/issues setup`
- **Mapping:** `ISSUE-MAP.json` per milestone in `.gsd/milestones/{MID}/`
- **Lifecycle hooks:** `pi.on("tool_result", ...)` watching for summary writes to trigger auto-close
- **Event bus:** Emits `gsd-issues:*` events on `pi.events` for composability
- **Distribution:** npm package, installed via pi's package manager

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Issue tracker integration — Sync, close, and import workflows for GitLab and GitHub with npm distribution
