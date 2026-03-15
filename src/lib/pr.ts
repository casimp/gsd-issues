/**
 * PR creation pipeline — push branch and create a PR/MR for a milestone.
 *
 * Core pipeline:
 * 1. Read integration branch from META.json (source branch)
 * 2. Determine target branch (param > config > "main")
 * 3. Guard: source === target → error
 * 4. Load ISSUE-MAP to find closesIssueId (optional)
 * 5. Push branch to remote
 * 6. Call provider.createPR() with Closes #N if mapped
 * 7. Emit gsd-issues:pr-complete event
 *
 * Diagnostics:
 * - Missing integration branch: error with milestoneId in message
 * - Same-branch guard: error before any remote calls
 * - Push failure: propagated with git stderr before PR attempt
 * - PR creation: ProviderError carries full CLI diagnostics
 * - gsd-issues:pr-complete event: { milestoneId, prUrl, prNumber }
 */

import { Type, type Static } from "@sinclair/typebox";
import type {
  IssueProvider,
  ExecFn,
  PRResult,
} from "../providers/types.js";
import type { Config } from "./config.js";
import {
  readIntegrationBranch,
  readMilestoneContext,
  findRoadmapPath,
} from "./state.js";
import { loadIssueMap } from "./issue-map.js";
import { readFile } from "node:fs/promises";

// ── Types ──

export interface PrOptions {
  provider: IssueProvider;
  config: Config;
  exec: ExecFn;
  cwd: string;
  milestoneId: string;
  mapPath: string;
  emit?: (event: string, payload: unknown) => void;
  dryRun?: boolean;
  targetBranch?: string;
}

export interface PrResult {
  url: string;
  number: number;
  milestoneId: string;
  sourceBranch: string;
  targetBranch: string;
  closesIssueId?: number;
}

// ── Title builder ──

/**
 * Read the milestone title from ROADMAP.md first heading,
 * falling back to CONTEXT.md heading, then milestoneId.
 */
async function resolveMilestoneTitle(
  cwd: string,
  milestoneId: string,
): Promise<string> {
  // Try ROADMAP.md first heading
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  try {
    const roadmapContent = await readFile(roadmapPath, "utf-8");
    const match = /^#\s+(.+)$/m.exec(roadmapContent);
    if (match) return match[1].trim();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Try CONTEXT.md heading
  const ctx = await readMilestoneContext(cwd, milestoneId);
  if (ctx) return ctx.title;

  return milestoneId;
}

// ── Body builder ──

function buildPrBody(
  milestoneId: string,
  closesIssueId: number | undefined,
): string {
  const parts: string[] = [];
  parts.push(`PR for milestone **${milestoneId}**.`);

  if (closesIssueId !== undefined) {
    parts.push("");
    parts.push(`Closes #${closesIssueId}`);
  }

  parts.push("");
  parts.push(`[gsd:${milestoneId}]`);
  return parts.join("\n");
}

// ── Core PR pipeline ──

/**
 * Create a PR for a milestone's integration branch.
 *
 * 1. Reads integration branch from META.json
 * 2. Pushes branch to remote
 * 3. Creates PR via provider with optional Closes #N
 *
 * Errors pre-flight on missing integration branch and same-branch.
 * Propagates push failure before attempting PR creation.
 */
export async function createMilestonePR(
  opts: PrOptions,
): Promise<PrResult> {
  const {
    provider,
    config,
    exec,
    cwd,
    milestoneId,
    mapPath,
    emit,
    dryRun,
    targetBranch: targetBranchOverride,
  } = opts;

  // 1. Read source branch from META.json
  const sourceBranch = await readIntegrationBranch(cwd, milestoneId);
  if (!sourceBranch) {
    throw new Error(
      `No integration branch configured for milestone ${milestoneId}`,
    );
  }

  // 2. Determine target branch
  const targetBranch = targetBranchOverride ?? config.branch_pattern ?? "main";

  // 3. Guard: source === target
  if (sourceBranch === targetBranch) {
    throw new Error(
      `Milestone branch is '${sourceBranch}' — cannot create a PR from a branch to itself`,
    );
  }

  // 4. Load ISSUE-MAP for Closes #N
  const entries = await loadIssueMap(mapPath);
  const mapEntry = entries.find((e) => e.localId === milestoneId);
  const closesIssueId = mapEntry?.issueId;

  // Resolve title
  const milestoneTitle = await resolveMilestoneTitle(cwd, milestoneId);
  const prTitle = `${milestoneId}: ${milestoneTitle}`;

  // Build body
  const body = buildPrBody(milestoneId, closesIssueId);

  // Dry-run: return preview without side effects
  if (dryRun) {
    const result: PrResult = {
      url: "(dry-run)",
      number: 0,
      milestoneId,
      sourceBranch,
      targetBranch,
      closesIssueId,
    };

    emit?.("gsd-issues:pr-complete", {
      milestoneId,
      prUrl: result.url,
      prNumber: result.number,
    });

    return result;
  }

  // 5. Push branch to remote
  const pushResult = await exec("git", ["push", "-u", "origin", sourceBranch], { cwd });
  if (pushResult.code !== 0) {
    throw new Error(
      `Failed to push branch '${sourceBranch}': ${pushResult.stderr.trim() || pushResult.stdout.trim()}`,
    );
  }

  // 6. Create PR via provider
  const prResponse: PRResult = await provider.createPR({
    title: prTitle,
    body,
    headBranch: sourceBranch,
    baseBranch: targetBranch,
    closesIssueId,
  });

  const result: PrResult = {
    url: prResponse.url,
    number: prResponse.number,
    milestoneId,
    sourceBranch,
    targetBranch,
    closesIssueId,
  };

  // 7. Emit completion event
  emit?.("gsd-issues:pr-complete", {
    milestoneId,
    prUrl: prResponse.url,
    prNumber: prResponse.number,
  });

  return result;
}

// ── TypeBox tool schema ──

export const PrToolSchema = Type.Object({
  milestone_id: Type.Optional(Type.String()),
  target_branch: Type.Optional(Type.String()),
  dry_run: Type.Optional(Type.Boolean()),
});

export type PrToolParams = Static<typeof PrToolSchema>;
