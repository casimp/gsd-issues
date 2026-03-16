import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanMilestones,
  buildScopePrompt,
  detectNewMilestones,
} from "../smart-entry.js";

// ── scanMilestones ──

describe("smart-entry scanMilestones", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smart-entry-scan-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when milestones dir doesn't exist", async () => {
    const result = await scanMilestones(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns empty array when milestones dir is empty", async () => {
    await mkdir(join(tmpDir, ".gsd", "milestones"), { recursive: true });
    const result = await scanMilestones(tmpDir);
    expect(result).toEqual([]);
  });

  it("skips directories without CONTEXT.md", async () => {
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    // No CONTEXT.md file
    const result = await scanMilestones(tmpDir);
    expect(result).toEqual([]);
  });

  it("finds directories with CONTEXT.md", async () => {
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001 — Context\n");

    const result = await scanMilestones(tmpDir);
    expect(result).toEqual(["M001"]);
  });

  it("returns sorted milestone IDs", async () => {
    // Create M003, M001, M002 (out of order)
    for (const id of ["M003", "M001", "M002"]) {
      const mDir = join(tmpDir, ".gsd", "milestones", id);
      await mkdir(mDir, { recursive: true });
      await writeFile(join(mDir, `${id}-CONTEXT.md`), `# ${id}\n`);
    }

    const result = await scanMilestones(tmpDir);
    expect(result).toEqual(["M001", "M002", "M003"]);
  });

  it("filters mixed dirs — some with, some without CONTEXT.md", async () => {
    const base = join(tmpDir, ".gsd", "milestones");

    // M001 has CONTEXT.md
    const m1Dir = join(base, "M001");
    await mkdir(m1Dir, { recursive: true });
    await writeFile(join(m1Dir, "M001-CONTEXT.md"), "# M001\n");

    // M002 does NOT have CONTEXT.md
    const m2Dir = join(base, "M002");
    await mkdir(m2Dir, { recursive: true });

    // M003 has CONTEXT.md
    const m3Dir = join(base, "M003");
    await mkdir(m3Dir, { recursive: true });
    await writeFile(join(m3Dir, "M003-CONTEXT.md"), "# M003\n");

    const result = await scanMilestones(tmpDir);
    expect(result).toEqual(["M001", "M003"]);
  });

  it("ignores files in milestones dir (non-directories)", async () => {
    const base = join(tmpDir, ".gsd", "milestones");
    await mkdir(base, { recursive: true });
    await writeFile(join(base, "README.md"), "not a milestone\n");

    const result = await scanMilestones(tmpDir);
    expect(result).toEqual([]);
  });
});

// ── buildScopePrompt ──

describe("smart-entry buildScopePrompt", () => {
  it("includes filesystem instructions", () => {
    const prompt = buildScopePrompt({});
    expect(prompt).toContain("## Scope New Milestone");
    expect(prompt).toContain(".gsd/milestones/{MID}/");
    expect(prompt).toContain("CONTEXT.md");
    expect(prompt).toContain("ROADMAP.md");
  });

  it("includes sizing constraint when maxSlices provided", () => {
    const prompt = buildScopePrompt({ maxSlices: 5 });
    expect(prompt).toContain("5 slices or fewer");
    expect(prompt).toContain("Sizing constraint");
  });

  it("omits sizing constraint when maxSlices not provided", () => {
    const prompt = buildScopePrompt({});
    expect(prompt).not.toContain("Sizing constraint");
  });

  it("includes import context as background", () => {
    const prompt = buildScopePrompt({
      importContext: "## #42: Fix the widget\n**Labels:** bug",
    });
    expect(prompt).toContain("## Background: Imported Issues");
    expect(prompt).toContain("## #42: Fix the widget");
    expect(prompt).toContain("**Labels:** bug");
  });

  it("omits import section when no importContext", () => {
    const prompt = buildScopePrompt({});
    expect(prompt).not.toContain("Background: Imported Issues");
  });

  it("includes work description", () => {
    const prompt = buildScopePrompt({ description: "Build a login system" });
    expect(prompt).toContain("## Work Description");
    expect(prompt).toContain("Build a login system");
  });

  it("omits description section when no description", () => {
    const prompt = buildScopePrompt({});
    expect(prompt).not.toContain("## Work Description");
  });

  it("includes all sections when all options provided", () => {
    const prompt = buildScopePrompt({
      description: "Build auth",
      importContext: "Issue #1: login",
      maxSlices: 3,
    });
    expect(prompt).toContain("Sizing constraint");
    expect(prompt).toContain("3 slices or fewer");
    expect(prompt).toContain("Background: Imported Issues");
    expect(prompt).toContain("Issue #1: login");
    expect(prompt).toContain("## Work Description");
    expect(prompt).toContain("Build auth");
  });
});

// ── detectNewMilestones ──

describe("smart-entry detectNewMilestones", () => {
  it("returns empty when no new milestones", () => {
    expect(detectNewMilestones(["M001", "M002"], ["M001", "M002"])).toEqual([]);
  });

  it("detects single new milestone", () => {
    expect(detectNewMilestones(["M001"], ["M001", "M002"])).toEqual(["M002"]);
  });

  it("detects multiple new milestones", () => {
    expect(detectNewMilestones([], ["M001", "M002"])).toEqual(["M001", "M002"]);
  });

  it("handles empty before and after", () => {
    expect(detectNewMilestones([], [])).toEqual([]);
  });

  it("ignores removed milestones (before has items not in after)", () => {
    expect(detectNewMilestones(["M001", "M002"], ["M001"])).toEqual([]);
  });

  it("works with non-sequential IDs", () => {
    expect(
      detectNewMilestones(["M001"], ["M001", "M005", "M010"]),
    ).toEqual(["M005", "M010"]);
  });
});
