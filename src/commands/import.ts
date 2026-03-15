/**
 * Import command handler — `/issues import`.
 *
 * Fetches issues from the remote provider filtered by milestone, labels,
 * state, and assignee, then formats them as structured markdown via
 * the import pipeline.
 *
 * Diagnostics:
 * - Empty result → notify("info") with "No issues found"
 * - Import result reported via notify("info") with full markdown
 * - Config/provider errors surface with actionable messages
 * - gsd-issues:import-complete event emitted with { issueCount }
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState } from "../lib/state.js";
import { importIssues, rescopeIssues } from "../lib/import.js";
import { createProvider } from "../lib/provider-factory.js";
import type { IssueFilter } from "../providers/types.js";
import { findRoadmapPath } from "../lib/state.js";
import { join, dirname } from "node:path";

/**
 * Parse --milestone, --labels, --rescope, and --originals flags from args string.
 *
 * Supports:
 *   import --milestone "Sprint 1" --labels bug,feature
 *   import --milestone=Sprint1 --labels=bug,feature
 *   import --rescope M001 --originals 10,11,12
 */
function parseImportFlags(args: string): {
  milestone?: string;
  labels?: string[];
  rescope?: string;
  originals?: number[];
} {
  const parts = args.trim().split(/\s+/);
  let milestone: string | undefined;
  let labels: string[] | undefined;
  let rescope: string | undefined;
  let originals: number[] | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // --milestone
    if (part === "--milestone" && i + 1 < parts.length) {
      milestone = parts[i + 1];
      i++; // skip value
    } else if (part.startsWith("--milestone=")) {
      milestone = part.slice("--milestone=".length);
    }

    // --labels
    if (part === "--labels" && i + 1 < parts.length) {
      labels = parts[i + 1].split(",").map((l) => l.trim()).filter(Boolean);
      i++; // skip value
    } else if (part.startsWith("--labels=")) {
      labels = part.slice("--labels=".length).split(",").map((l) => l.trim()).filter(Boolean);
    }

    // --rescope
    if (part === "--rescope" && i + 1 < parts.length) {
      rescope = parts[i + 1];
      i++;
    } else if (part.startsWith("--rescope=")) {
      rescope = part.slice("--rescope=".length);
    }

    // --originals
    if (part === "--originals" && i + 1 < parts.length) {
      originals = parts[i + 1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      i++;
    } else if (part.startsWith("--originals=")) {
      originals = part.slice("--originals=".length).split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    }
  }

  return { milestone, labels, rescope, originals };
}

/**
 * Handle `/issues import` — fetch and format issues from remote provider.
 */
export async function handleImport(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();

  // Load config
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(msg, "error");
    return;
  }

  // Parse flags
  const flags = parseImportFlags(args);

  // Re-scope mode: when both --rescope and --originals present
  if (flags.rescope && flags.originals && flags.originals.length > 0) {
    const milestoneId = flags.rescope;

    if (!ctx.hasUI) {
      ctx.ui.notify("Re-scope requires interactive confirmation.", "error");
      return;
    }

    const confirmed = await ctx.ui.confirm(
      `Close ${flags.originals.length} original issue(s) and create milestone issue for ${milestoneId}?`,
    );

    if (!confirmed) {
      ctx.ui.notify("Re-scope aborted.", "info");
      return;
    }

    const provider = createProvider(config, pi.exec);
    const roadmapPath = findRoadmapPath(cwd, milestoneId);
    const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");

    try {
      const result = await rescopeIssues({
        provider,
        config,
        milestoneId,
        originalIssueIds: flags.originals,
        cwd,
        mapPath,
        exec: pi.exec,
        emit: pi.events.emit.bind(pi.events),
      });

      if (result.skipped) {
        ctx.ui.notify(`Milestone ${milestoneId} is already mapped. Re-scope skipped.`, "info");
        return;
      }

      const lines: string[] = [];
      lines.push(`Re-scope complete for ${milestoneId}:`);
      if (result.created) {
        lines.push(`  Created issue #${result.created.issueId} (${result.created.url})`);
      }
      lines.push(`  Closed originals: ${result.closedOriginals.length}`);
      if (result.closeErrors.length > 0) {
        lines.push(`  Close errors: ${result.closeErrors.length}`);
        for (const e of result.closeErrors) {
          lines.push(`    #${e.issueId}: ${e.error}`);
        }
      }
      ctx.ui.notify(lines.join("\n"), "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`Re-scope failed: ${msg}`, "error");
    }
    return;
  }

  // Resolve milestone: from flags, config, or GSD state
  let milestoneTitle = flags.milestone ?? config.milestone;
  if (!milestoneTitle) {
    const state = await readGSDState(cwd);
    if (state) {
      milestoneTitle = state.milestoneId;
    }
  }

  // Build filter
  const filter: IssueFilter = {
    state: "open",
  };
  if (milestoneTitle) {
    filter.milestone = milestoneTitle;
  }
  if (flags.labels && flags.labels.length > 0) {
    filter.labels = flags.labels;
  }

  // Create provider and fetch
  const provider = createProvider(config, pi.exec);

  try {
    const issues = await provider.listIssues(filter);
    const result = importIssues({
      issues,
      emit: pi.events.emit.bind(pi.events),
    });

    ctx.ui.notify(result.markdown, "info");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to import issues: ${msg}`, "error");
  }
}
