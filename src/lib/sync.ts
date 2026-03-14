/**
 * Sync orchestration — create remote issues for unmapped roadmap slices.
 *
 * Core pipeline:
 * 1. Load existing ISSUE-MAP.json
 * 2. For each unmapped slice, create issue via provider
 * 3. Persist mapping immediately after each creation (crash-safe)
 * 4. Optionally assign to GitLab epic via REST API
 * 5. Emit completion event with summary
 *
 * Diagnostics:
 * - SyncResult.errors: per-slice error messages for partial failures
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
import type { RoadmapSlice } from "./state.js";
import { loadIssueMap, saveIssueMap } from "./issue-map.js";

// ── Types ──

export interface SyncOptions {
  provider: IssueProvider;
  config: Config;
  slices: RoadmapSlice[];
  mapPath: string;
  exec: ExecFn;
  emit?: (event: string, payload: unknown) => void;
  dryRun?: boolean;
}

export interface SyncResult {
  created: IssueMapEntry[];
  skipped: string[];
  errors: Array<{ sliceId: string; error: string }>;
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

function buildDescription(
  slice: RoadmapSlice,
  milestoneId: string,
): string {
  const parts: string[] = [];
  if (slice.description) {
    parts.push(slice.description);
  }
  parts.push("");
  parts.push(`[gsd:${milestoneId}/${slice.id}]`);
  return parts.join("\n");
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

export async function syncSlicesToIssues(
  opts: SyncOptions,
): Promise<SyncResult> {
  const { provider, config, slices, mapPath, exec, emit, dryRun } = opts;

  const existingMap = await loadIssueMap(mapPath);
  const mappedIds = new Set(existingMap.map((e) => e.localId));
  const currentMap = [...existingMap];

  const result: SyncResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // Derive milestone ID from config (e.g. "M001" from milestone field)
  const milestoneId = config.milestone;
  const weightStrategy = config.gitlab?.weight_strategy;
  const epicConfig = config.gitlab?.epic;

  for (const slice of slices) {
    // Skip already-mapped slices
    if (mappedIds.has(slice.id)) {
      result.skipped.push(slice.id);
      continue;
    }

    if (dryRun) {
      // In dry-run mode, build the entry preview without creating
      const previewEntry: IssueMapEntry = {
        localId: slice.id,
        issueId: 0,
        provider: provider.name,
        url: "(dry-run)",
        createdAt: new Date().toISOString(),
      };
      result.created.push(previewEntry);
      continue;
    }

    // Build create options
    const createOpts: CreateIssueOpts = {
      title: slice.title,
      description: buildDescription(slice, milestoneId),
      milestone: config.milestone,
      assignee: config.assignee,
      labels: config.labels,
      weight: computeWeight(weightStrategy, slice.risk),
    };

    try {
      const issue = await provider.createIssue(createOpts);

      // Build mapping entry
      const entry: IssueMapEntry = {
        localId: slice.id,
        issueId: issue.id,
        provider: provider.name,
        url: issue.url,
        createdAt: new Date().toISOString(),
      };

      // Persist immediately — crash-safe
      currentMap.push(entry);
      await saveIssueMap(mapPath, currentMap);
      mappedIds.add(slice.id);
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
          // Record as a non-fatal warning by emitting, but don't add to errors
          emit?.("gsd-issues:epic-warning", {
            sliceId: slice.id,
            issueId: issue.id,
            warning: msg,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ sliceId: slice.id, error: msg });
      // Continue to next slice — don't abort
    }
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
