/**
 * Smart entry infrastructure — milestone scanning, scope prompt construction,
 * and completion detection for the `/issues` no-subcommand flow.
 *
 * Mirrors GSD's showSmartEntry() pattern: detect state → offer choices → dispatch.
 *
 * Diagnostics:
 * - scanMilestones: returns sorted milestone IDs with CONTEXT.md present
 * - buildScopePrompt: returns full prompt text — inspectable in sendMessage mock
 * - detectNewMilestones: pure set difference, deterministic output
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// ── Milestone scanner ──

/**
 * Scan `.gsd/milestones/` for directories containing a CONTEXT.md file.
 *
 * Returns a sorted array of milestone IDs (directory names).
 * Returns empty array if the milestones directory doesn't exist.
 */
export async function scanMilestones(cwd: string): Promise<string[]> {
  const milestonesDir = join(cwd, ".gsd", "milestones");

  let entries: string[];
  try {
    entries = await readdir(milestonesDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const milestoneIds: string[] = [];

  for (const entry of entries) {
    const entryPath = join(milestonesDir, entry);
    const contextPath = join(entryPath, `${entry}-CONTEXT.md`);

    try {
      const entryStat = await stat(entryPath);
      if (!entryStat.isDirectory()) continue;

      await stat(contextPath);
      milestoneIds.push(entry);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // No CONTEXT.md — skip this directory
        continue;
      }
      throw err;
    }
  }

  return milestoneIds.sort();
}

// ── Scope prompt builder ──

export interface ScopePromptOptions {
  description?: string;
  importContext?: string;
  maxSlices?: number;
}

/**
 * Build the scope prompt for the LLM to create GSD milestones.
 *
 * Includes explicit filesystem instructions for creating milestone directories
 * and CONTEXT.md files. When importContext is provided, includes it as background.
 * When maxSlices is provided, includes sizing constraint.
 */
export function buildScopePrompt(options: ScopePromptOptions): string {
  const { description, importContext, maxSlices } = options;

  const sections: string[] = [];

  sections.push("## Scope New Milestone");
  sections.push("");
  sections.push(
    "Create a new GSD milestone by writing the required files to disk. Follow these steps exactly:",
  );
  sections.push("");
  sections.push("1. Choose the next milestone ID (e.g. M001, M002, etc.) based on existing milestones.");
  sections.push("2. Create the milestone directory: `.gsd/milestones/{MID}/`");
  sections.push("3. Write `.gsd/milestones/{MID}/{MID}-CONTEXT.md` with:");
  sections.push("   - A `# {MID}: Title — Context` heading");
  sections.push("   - A `## Project Description` section describing the work");
  sections.push("   - A `## Scope` section listing what's in and out of scope");
  sections.push("   - A `## Success Criteria` section with measurable outcomes");
  sections.push(
    "4. Write `.gsd/milestones/{MID}/{MID}-ROADMAP.md` with slices following GSD format:",
  );
  sections.push(
    "   `- [ ] **S01: Title** \\`risk:level\\` \\`depends:[]\\``",
  );
  sections.push("   Each slice should be a demoable vertical increment ordered by risk (highest first).");

  if (maxSlices) {
    sections.push("");
    sections.push(`**Sizing constraint:** Keep the milestone to ${maxSlices} slices or fewer.`);
  }

  if (importContext) {
    sections.push("");
    sections.push("## Background: Imported Issues");
    sections.push("");
    sections.push(
      "The following issues were imported from the tracker. Use them as context for scoping the milestone:",
    );
    sections.push("");
    sections.push(importContext);
  }

  if (description) {
    sections.push("");
    sections.push("## Work Description");
    sections.push("");
    sections.push(description);
  }

  return sections.join("\n");
}

// ── Completion detection ──

/**
 * Detect newly created milestones by comparing before/after snapshots.
 *
 * Returns milestone IDs in `after` that weren't in `before`.
 * Pure set difference — no I/O.
 */
export function detectNewMilestones(
  before: string[],
  after: string[],
): string[] {
  const beforeSet = new Set(before);
  return after.filter((id) => !beforeSet.has(id));
}
