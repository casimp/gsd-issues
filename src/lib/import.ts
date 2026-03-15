/**
 * Import orchestration — format provider issues as structured markdown.
 *
 * Core flow:
 * 1. Accept Issue[] from a provider's listIssues()
 * 2. Sort by weight descending (unweighted issues last)
 * 3. Format each issue as a markdown section with metadata
 * 4. Emit gsd-issues:import-complete event with issue count
 *
 * Diagnostics:
 * - ImportResult.issueCount: quick numeric check that the pipeline ran
 * - ImportResult.markdown: the full formatted output, parseable by LLM callers
 * - Empty lists produce deterministic "No issues found" text
 * - gsd-issues:import-complete event: { issueCount }
 */

import { Type, type Static } from "@sinclair/typebox";
import type { Issue, IssueProvider, IssueMapEntry, ExecFn } from "../providers/types.js";
import { ProviderError } from "../providers/types.js";
import type { Config } from "./config.js";
import { syncMilestoneToIssue } from "./sync.js";
import { loadIssueMap } from "./issue-map.js";

// ── Types ──

export interface ImportOptions {
  issues: Issue[];
  emit?: (event: string, payload: unknown) => void;
}

export interface ImportResult {
  markdown: string;
  issueCount: number;
}

// ── Description truncation ──

const MAX_DESCRIPTION_LENGTH = 500;

function truncateDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return description.slice(0, MAX_DESCRIPTION_LENGTH) + "…";
}

// ── Weight-based sorting ──

/**
 * Sort issues by weight descending. Issues without weight go last.
 * Stable sort within same-weight groups (preserves original order).
 */
function sortByWeight(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const aWeight = a.weight ?? -1;
    const bWeight = b.weight ?? -1;
    return bWeight - aWeight;
  });
}

// ── Markdown formatting ──

function formatIssue(issue: Issue): string {
  const lines: string[] = [];

  lines.push(`## #${issue.id}: ${issue.title}`);

  if (issue.labels.length > 0) {
    lines.push(`**Labels:** ${issue.labels.join(", ")}`);
  }

  if (issue.weight !== undefined) {
    lines.push(`**Weight:** ${issue.weight}`);
  }

  if (issue.milestone) {
    lines.push(`**Milestone:** ${issue.milestone}`);
  }

  if (issue.assignee) {
    lines.push(`**Assignee:** ${issue.assignee}`);
  }

  if (issue.description) {
    lines.push("");
    lines.push(truncateDescription(issue.description));
  }

  return lines.join("\n");
}

// ── Core import function ──

/**
 * Format a list of issues as structured markdown for LLM consumption.
 *
 * Returns `{ markdown, issueCount }`. Empty input produces
 * a "No issues found" message. Issues are sorted by weight
 * descending (unweighted last).
 */
export function importIssues(opts: ImportOptions): ImportResult {
  const { issues, emit } = opts;

  if (issues.length === 0) {
    emit?.("gsd-issues:import-complete", { issueCount: 0 });
    return {
      markdown: "No issues found.",
      issueCount: 0,
    };
  }

  const sorted = sortByWeight(issues);
  const sections = sorted.map(formatIssue);
  const markdown = sections.join("\n\n");

  emit?.("gsd-issues:import-complete", { issueCount: issues.length });

  return {
    markdown,
    issueCount: issues.length,
  };
}

// ── Re-scope types ──

export interface RescopeOptions {
  provider: IssueProvider;
  config: Config;
  milestoneId: string;
  originalIssueIds: number[];
  cwd: string;
  mapPath: string;
  exec: ExecFn;
  emit?: (event: string, payload: unknown) => void;
  dryRun?: boolean;
}

export interface RescopeResult {
  created: IssueMapEntry | null;
  closedOriginals: number[];
  closeErrors: Array<{ issueId: number; error: string }>;
  skipped: boolean;
}

// ── Re-scope function ──

/**
 * Re-scope imported tracker issues to a GSD milestone.
 *
 * Creates a single milestone-level issue via syncMilestoneToIssue(),
 * then closes each original tracker issue best-effort. If the milestone
 * is already mapped in ISSUE-MAP, the entire operation is skipped.
 *
 * Already-closed originals are treated as success (not errors).
 *
 * Emits `gsd-issues:rescope-complete` with operation summary.
 */
export async function rescopeIssues(opts: RescopeOptions): Promise<RescopeResult> {
  const { provider, config, milestoneId, originalIssueIds, cwd, mapPath, exec, emit, dryRun } = opts;

  // Check if milestone already mapped → skip
  const existingMap = await loadIssueMap(mapPath);
  const alreadyMapped = existingMap.some((e) => e.localId === milestoneId);

  if (alreadyMapped) {
    const result: RescopeResult = {
      created: null,
      closedOriginals: [],
      closeErrors: [],
      skipped: true,
    };

    emit?.("gsd-issues:rescope-complete", {
      milestoneId,
      createdIssueId: null,
      closedOriginals: [],
      closeErrors: [],
    });

    return result;
  }

  // Create milestone issue via syncMilestoneToIssue (reuse, not duplicate)
  const syncResult = await syncMilestoneToIssue({
    provider,
    config: { ...config, milestone: milestoneId },
    milestoneId,
    cwd,
    mapPath,
    exec,
    emit,
    dryRun,
  });

  const createdEntry = syncResult.created.length > 0 ? syncResult.created[0] : null;

  // Close originals best-effort
  const closedOriginals: number[] = [];
  const closeErrors: Array<{ issueId: number; error: string }> = [];

  if (!dryRun) {
    const doneLabel = config.done_label;
    const reason = config.github?.close_reason;

    for (const issueId of originalIssueIds) {
      try {
        await provider.closeIssue({
          issueId,
          doneLabel,
          reason,
        });
        closedOriginals.push(issueId);
      } catch (err) {
        // Treat already-closed as success
        if (err instanceof ProviderError) {
          const msg = (err.stderr + " " + err.message).toLowerCase();
          if (msg.includes("already closed") || msg.includes("already been closed")) {
            closedOriginals.push(issueId);
            continue;
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        closeErrors.push({ issueId, error: msg });
      }
    }
  }

  const result: RescopeResult = {
    created: createdEntry,
    closedOriginals,
    closeErrors,
    skipped: false,
  };

  emit?.("gsd-issues:rescope-complete", {
    milestoneId,
    createdIssueId: createdEntry?.issueId ?? null,
    closedOriginals,
    closeErrors,
  });

  return result;
}

// ── TypeBox tool schema ──

export const ImportToolSchema = Type.Object({
  milestone: Type.Optional(Type.String()),
  labels: Type.Optional(Type.Array(Type.String())),
  state: Type.Optional(Type.Union([
    Type.Literal("open"),
    Type.Literal("closed"),
    Type.Literal("all"),
  ])),
  assignee: Type.Optional(Type.String()),
  rescope_milestone_id: Type.Optional(Type.String()),
  original_issue_ids: Type.Optional(Type.Array(Type.Number())),
});

export type ImportToolParams = Static<typeof ImportToolSchema>;
