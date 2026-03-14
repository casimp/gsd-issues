/**
 * Sync command handler — `/issues sync`.
 *
 * Loads config, reads roadmap, previews unmapped slices,
 * asks for confirmation, then creates remote issues via the sync pipeline.
 *
 * Diagnostics:
 * - Preview shows unmapped slice IDs + titles before confirmation
 * - Results reported via ctx.ui.notify with created/skipped/error counts
 * - Config and roadmap errors surface as ui.notify("error")
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState, findRoadmapPath, parseRoadmapSlices } from "../lib/state.js";
import { syncSlicesToIssues } from "../lib/sync.js";
import { loadIssueMap } from "../lib/issue-map.js";
import { GitLabProvider } from "../providers/gitlab.js";
import { GitHubProvider } from "../providers/github.js";
import type { IssueProvider } from "../providers/types.js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";

/**
 * Create the appropriate provider from config.
 */
function createProvider(config: ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never, exec: ExtensionAPI["exec"]): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}

/**
 * Handle `/issues sync` — interactive sync with confirmation.
 */
export async function handleSync(
  _args: string,
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

  // Resolve milestone from config or GSD state
  let milestoneId = config.milestone;
  if (!milestoneId) {
    const state = await readGSDState(cwd);
    if (!state) {
      ctx.ui.notify(
        "Cannot determine milestone — no milestone in config or GSD state.",
        "error",
      );
      return;
    }
    milestoneId = state.milestoneId;
  }

  // Read roadmap
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  let roadmapContent: string;
  try {
    roadmapContent = await readFile(roadmapPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to read roadmap: ${msg}`, "error");
    return;
  }

  const slices = parseRoadmapSlices(roadmapContent);
  const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
  const existingMap = await loadIssueMap(mapPath);
  const mappedIds = new Set(existingMap.map((e) => e.localId));
  const unmapped = slices.filter((s) => !mappedIds.has(s.id));

  if (unmapped.length === 0) {
    ctx.ui.notify("All slices are already mapped to issues. Nothing to sync.", "info");
    return;
  }

  // Show preview
  const previewLines = unmapped.map((s) => `  ${s.id}: ${s.title}`);
  const previewText = `Unmapped slices to create:\n${previewLines.join("\n")}`;
  ctx.ui.notify(previewText, "info");

  // Confirm
  const confirmed = await ctx.ui.confirm(`Create ${unmapped.length} issue${unmapped.length === 1 ? "" : "s"}?`);
  if (!confirmed) {
    ctx.ui.notify("Sync cancelled.", "info");
    return;
  }

  // Run sync
  const provider = createProvider(config, pi.exec);
  const result = await syncSlicesToIssues({
    provider,
    config: { ...config, milestone: milestoneId },
    slices,
    mapPath,
    exec: pi.exec,
    emit: pi.events.emit.bind(pi.events),
  });

  // Report results
  const lines: string[] = [];
  lines.push(`Sync complete: ${result.created.length} created, ${result.skipped.length} skipped.`);
  if (result.errors.length > 0) {
    lines.push(`${result.errors.length} error(s):`);
    for (const e of result.errors) {
      lines.push(`  ${e.sliceId}: ${e.error}`);
    }
  }
  ctx.ui.notify(lines.join("\n"), result.errors.length > 0 ? "warning" : "info");
}
