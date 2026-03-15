/**
 * PR command handler — `/issues pr`.
 *
 * Parses milestone ID from positional arg or --milestone flag,
 * resolves integration branch, shows PR preview (source → target, closes #N),
 * confirms with user, then creates PR via the PR pipeline.
 *
 * Diagnostics:
 * - Missing milestone arg → uses config/state milestone
 * - Missing integration branch → clear error with milestoneId
 * - Preview shows source → target and Closes #N if mapped
 * - Push/PR errors surfaced with actionable messages
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState, readIntegrationBranch, findRoadmapPath } from "../lib/state.js";
import { createMilestonePR } from "../lib/pr.js";
import { loadIssueMap } from "../lib/issue-map.js";
import { GitLabProvider } from "../providers/gitlab.js";
import { GitHubProvider } from "../providers/github.js";
import type { IssueProvider } from "../providers/types.js";
import { join, dirname } from "node:path";

function createProvider(config: Awaited<ReturnType<typeof loadConfig>>, exec: ExtensionAPI["exec"]): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}

/**
 * Parse milestone ID from args string.
 * Supports: "pr M001", "pr --milestone M001", "pr --milestone=M001"
 */
function parseMilestoneId(args: string): string | undefined {
  const parts = args.trim().split(/\s+/);
  const rest = parts.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const part = rest[i];
    if (part === "--milestone" && i + 1 < rest.length) {
      return rest[i + 1];
    }
    if (part.startsWith("--milestone=")) {
      return part.slice("--milestone=".length);
    }
    // First positional arg that isn't a flag
    if (!part.startsWith("--")) {
      return part;
    }
  }

  return undefined;
}

/**
 * Parse optional target branch from args.
 * Supports: --target main, --target=main
 */
function parseTargetBranch(args: string): string | undefined {
  const parts = args.trim().split(/\s+/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "--target" && i + 1 < parts.length) {
      return parts[i + 1];
    }
    if (part.startsWith("--target=")) {
      return part.slice("--target=".length);
    }
  }

  return undefined;
}

/**
 * Handle `/issues pr` — interactive PR creation with preview and confirmation.
 */
export async function handlePr(
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

  // Resolve milestone: from arg, config, or GSD state
  let milestoneId = parseMilestoneId(args);
  if (!milestoneId) {
    milestoneId = config.milestone;
  }
  if (!milestoneId) {
    const state = await readGSDState(cwd);
    if (!state) {
      ctx.ui.notify(
        "Cannot determine milestone — provide milestone ID, set it in config, or have an active GSD state.",
        "error",
      );
      return;
    }
    milestoneId = state.milestoneId;
  }

  // Check integration branch exists
  const sourceBranch = await readIntegrationBranch(cwd, milestoneId);
  if (!sourceBranch) {
    ctx.ui.notify(
      `No integration branch configured for milestone ${milestoneId}. Set integrationBranch in ${milestoneId}-META.json.`,
      "error",
    );
    return;
  }

  // Determine target branch
  const targetBranchOverride = parseTargetBranch(args);
  const targetBranch = targetBranchOverride ?? config.branch_pattern ?? "main";

  // Same-branch guard
  if (sourceBranch === targetBranch) {
    ctx.ui.notify(
      `Milestone branch is '${sourceBranch}' — cannot create a PR from a branch to itself.`,
      "error",
    );
    return;
  }

  // Check ISSUE-MAP for Closes #N
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
  const entries = await loadIssueMap(mapPath);
  const mapEntry = entries.find((e) => e.localId === milestoneId);
  const closesIssueId = mapEntry?.issueId;

  // Show preview
  const previewLines: string[] = [
    `PR preview for milestone ${milestoneId}:`,
    `  ${sourceBranch} → ${targetBranch}`,
  ];
  if (closesIssueId !== undefined) {
    previewLines.push(`  Closes #${closesIssueId}`);
  } else {
    previewLines.push(`  No issue mapping — PR will be created without Closes #N`);
  }
  ctx.ui.notify(previewLines.join("\n"), "info");

  // Confirm
  const confirmed = await ctx.ui.confirm("Create pull request?");
  if (!confirmed) {
    ctx.ui.notify("PR creation cancelled.", "info");
    return;
  }

  // Create PR
  const provider = createProvider(config, pi.exec);
  try {
    const result = await createMilestonePR({
      provider,
      config,
      exec: pi.exec,
      cwd,
      milestoneId,
      mapPath,
      emit: pi.events.emit.bind(pi.events),
      targetBranch: targetBranchOverride,
    });

    ctx.ui.notify(
      `PR created: ${result.url} (#${result.number}) — ${result.sourceBranch} → ${result.targetBranch}`,
      "info",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to create PR for ${milestoneId}: ${msg}`, "error");
  }
}
