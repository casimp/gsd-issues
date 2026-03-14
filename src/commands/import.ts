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
import { importIssues } from "../lib/import.js";
import { GitLabProvider } from "../providers/gitlab.js";
import { GitHubProvider } from "../providers/github.js";
import type { IssueProvider, IssueFilter } from "../providers/types.js";

function createProvider(config: Awaited<ReturnType<typeof loadConfig>>, exec: ExtensionAPI["exec"]): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}

/**
 * Parse --milestone and --labels flags from args string.
 *
 * Supports:
 *   import --milestone "Sprint 1" --labels bug,feature
 *   import --milestone=Sprint1 --labels=bug,feature
 */
function parseImportFlags(args: string): { milestone?: string; labels?: string[] } {
  const parts = args.trim().split(/\s+/);
  let milestone: string | undefined;
  let labels: string[] | undefined;

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
  }

  return { milestone, labels };
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
