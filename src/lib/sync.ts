/**
 * Sync orchestration — create a remote issue for an unmapped milestone.
 *
 * Core pipeline:
 * 1. Load existing ISSUE-MAP.json
 * 2. Check if milestone is already mapped (skip if so)
 * 3. Build description from CONTEXT.md and ROADMAP.md
 * 4. Create single issue via provider
 * 5. Persist mapping immediately after creation (crash-safe)
 * 6. Optionally assign to GitLab epic via REST API
 * 7. Emit completion event with summary
 *
 * Diagnostics:
 * - SyncResult.errors: per-milestone error messages for failures
 * - ISSUE-MAP.json: inspect for mapping state at any time
 * - gsd-issues:sync-complete event: { milestone, created, skipped, errors }
 */

import { Type, type Static } from "@sinclair/typebox";
import type {
  IssueProvider,
  CreateIssueOpts,
  IssueMapEntry,
  ExecFn,
} from "../providers/types.js";
import type { Config } from "./config.js";
import { readMilestoneContext, findRoadmapPath, parseRoadmapSlices } from "./state.js";
import { loadIssueMap, saveIssueMap } from "./issue-map.js";
import { readFile } from "node:fs/promises";

// ── Types ──

export interface SyncOptions {
  provider: IssueProvider;
  config: Config;
  milestoneId: string;
  cwd: string;
  mapPath: string;
  exec: ExecFn;
  emit?: (event: string, payload: unknown) => void;
  dryRun?: boolean;
}

export interface SyncResult {
  created: IssueMapEntry[];
  skipped: string[];
  errors: Array<{ milestoneId: string; error: string }>;
}

// ── Weight mapping ──

const FIBONACCI_WEIGHTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
};

const LINEAR_WEIGHTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function computeWeight(
  strategy: "fibonacci" | "linear" | "none" | undefined,
  risk: string,
): number | undefined {
  if (!strategy || strategy === "none") return undefined;
  const table = strategy === "fibonacci" ? FIBONACCI_WEIGHTS : LINEAR_WEIGHTS;
  return table[risk];
}

// ── Description builder ──

/**
 * Build the issue description from CONTEXT.md content and ROADMAP.md slice listing.
 *
 * Structure:
 *   - Vision (from ROADMAP.md first line after title)
 *   - Project description body (from CONTEXT.md)
 *   - Slice overview (from ROADMAP.md slice listing)
 *   - GSD metadata tag
 */
function buildMilestoneDescription(
  milestoneId: string,
  contextBody: string | null,
  roadmapSlices: string | null,
): string {
  const parts: string[] = [];

  if (contextBody) {
    parts.push(contextBody);
  }

  if (roadmapSlices) {
    parts.push("");
    parts.push("## Slices");
    parts.push("");
    parts.push(roadmapSlices);
  }

  parts.push("");
  parts.push(`[gsd:${milestoneId}]`);
  return parts.join("\n");
}

/**
 * Extract slice listing from roadmap content as a bullet list.
 */
function extractSliceListing(roadmapContent: string): string | null {
  const slices = parseRoadmapSlices(roadmapContent);
  if (slices.length === 0) return null;

  return slices
    .map((s) => {
      const check = s.done ? "x" : " ";
      return `- [${check}] **${s.id}: ${s.title}** (risk: ${s.risk})`;
    })
    .join("\n");
}

/**
 * Read the milestone title from ROADMAP.md (first # heading).
 */
function extractRoadmapTitle(roadmapContent: string): string | null {
  const match = /^#\s+(.+)$/m.exec(roadmapContent);
  return match ? match[1].trim() : null;
}

// ── Epic assignment (GitLab only) ──

export async function assignToEpic(
  exec: ExecFn,
  projectId: number,
  issueIid: number,
  epicConfig: string,
): Promise<void> {
  // Parse epic IID from config string like "&42"
  const epicIid = parseInt(epicConfig.replace(/^&/, ""), 10);
  if (isNaN(epicIid)) {
    throw new Error(`Invalid epic config: "${epicConfig}" — expected format "&42"`);
  }

  // Discover group path from the project
  const groupResult = await exec("glab", [
    "api",
    `projects/${projectId}`,
    "--jq",
    ".namespace.full_path",
  ]);

  if (groupResult.code !== 0) {
    throw new Error(
      `Failed to discover group path for project ${projectId}: ${groupResult.stderr}`,
    );
  }

  const groupPath = groupResult.stdout.trim();
  if (!groupPath) {
    throw new Error(
      `Empty group path returned for project ${projectId}`,
    );
  }

  // Assign issue to epic
  const assignResult = await exec("glab", [
    "api",
    "-X",
    "POST",
    `groups/${encodeURIComponent(groupPath)}/epics/${epicIid}/issues/${projectId}`,
    "--field",
    `issue_id=${issueIid}`,
  ]);

  if (assignResult.code !== 0) {
    throw new Error(
      `Failed to assign issue ${issueIid} to epic ${epicIid}: ${assignResult.stderr}`,
    );
  }
}

// ── Core sync pipeline ──

export async function syncMilestoneToIssue(
  opts: SyncOptions,
): Promise<SyncResult> {
  const { provider, config, milestoneId, cwd, mapPath, exec, emit, dryRun } = opts;

  const existingMap = await loadIssueMap(mapPath);
  const mappedIds = new Set(existingMap.map((e) => e.localId));
  const currentMap = [...existingMap];

  const result: SyncResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  const weightStrategy = config.gitlab?.weight_strategy;
  const epicConfig = config.gitlab?.epic;

  // Skip if already mapped
  if (mappedIds.has(milestoneId)) {
    result.skipped.push(milestoneId);

    emit?.("gsd-issues:sync-complete", {
      milestone: milestoneId,
      created: 0,
      skipped: 1,
      errors: 0,
    });

    return result;
  }

  // Read CONTEXT.md for description body (graceful on missing)
  const milestoneContext = await readMilestoneContext(cwd, milestoneId);

  // Read ROADMAP.md for title and slice listing
  let roadmapContent: string | null = null;
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  try {
    roadmapContent = await readFile(roadmapPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  // Determine title: ROADMAP heading > CONTEXT heading > milestoneId
  const issueTitle =
    (roadmapContent ? extractRoadmapTitle(roadmapContent) : null) ??
    milestoneContext?.title ??
    milestoneId;

  // Build description
  const sliceListing = roadmapContent ? extractSliceListing(roadmapContent) : null;
  const description = buildMilestoneDescription(
    milestoneId,
    milestoneContext?.body ?? null,
    sliceListing,
  );

  // Compute weight from the highest-risk slice (or "medium" default)
  let highestRisk = "medium";
  if (roadmapContent) {
    const slices = parseRoadmapSlices(roadmapContent);
    const riskOrder = ["low", "medium", "high", "critical"];
    for (const s of slices) {
      if (riskOrder.indexOf(s.risk) > riskOrder.indexOf(highestRisk)) {
        highestRisk = s.risk;
      }
    }
  }

  if (dryRun) {
    const previewEntry: IssueMapEntry = {
      localId: milestoneId,
      issueId: 0,
      provider: provider.name,
      url: "(dry-run)",
      createdAt: new Date().toISOString(),
    };
    result.created.push(previewEntry);

    emit?.("gsd-issues:sync-complete", {
      milestone: milestoneId,
      created: 1,
      skipped: 0,
      errors: 0,
    });

    return result;
  }

  // Build create options
  const createOpts: CreateIssueOpts = {
    title: issueTitle,
    description,
    milestone: config.milestone,
    assignee: config.assignee,
    labels: config.labels,
    weight: computeWeight(weightStrategy, highestRisk),
  };

  try {
    const issue = await provider.createIssue(createOpts);

    // Build mapping entry
    const entry: IssueMapEntry = {
      localId: milestoneId,
      issueId: issue.id,
      provider: provider.name,
      url: issue.url,
      createdAt: new Date().toISOString(),
    };

    // Persist immediately — crash-safe
    currentMap.push(entry);
    await saveIssueMap(mapPath, currentMap);
    result.created.push(entry);

    // GitLab epic assignment (best-effort)
    if (provider.name === "gitlab" && epicConfig && config.gitlab) {
      try {
        await assignToEpic(
          exec,
          config.gitlab.project_id,
          issue.id,
          epicConfig,
        );
      } catch (epicErr) {
        // Warning only — don't fail the sync
        const msg =
          epicErr instanceof Error ? epicErr.message : String(epicErr);
        emit?.("gsd-issues:epic-warning", {
          milestoneId,
          issueId: issue.id,
          warning: msg,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push({ milestoneId, error: msg });
  }

  // Emit completion event
  emit?.("gsd-issues:sync-complete", {
    milestone: milestoneId,
    created: result.created.length,
    skipped: result.skipped.length,
    errors: result.errors.length,
  });

  return result;
}

// ── TypeBox tool schema ──

export const SyncToolSchema = Type.Object({
  milestone_id: Type.Optional(Type.String()),
  roadmap_path: Type.Optional(Type.String()),
});

export type SyncToolParams = Static<typeof SyncToolSchema>;
