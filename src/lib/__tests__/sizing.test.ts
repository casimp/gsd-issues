import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateMilestoneSize, type SizingResult } from "../sizing.js";
import type { Config } from "../config.js";

// ── Helpers ──

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: "github",
    milestone: "v1",
    github: { repo: "owner/repo" },
    ...overrides,
  };
}

/** Build a roadmap markdown string with `n` slice lines. */
function makeRoadmap(sliceCount: number): string {
  const lines: string[] = ["# M001 — Roadmap", ""];
  for (let i = 1; i <= sliceCount; i++) {
    const id = `S${String(i).padStart(2, "0")}`;
    lines.push(`- [ ] **${id}: Slice ${i}** \`risk:medium\` \`depends:[]\``);
  }
  return lines.join("\n") + "\n";
}

/** Write a roadmap file in the expected location for a milestone. */
async function writeRoadmap(
  cwd: string,
  milestoneId: string,
  content: string,
): Promise<void> {
  const dir = join(cwd, ".gsd", "milestones", milestoneId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${milestoneId}-ROADMAP.md`), content, "utf-8");
}

// ── Tests ──

describe("validateMilestoneSize", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "sizing-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns valid with limit undefined when no limit configured", async () => {
    const config = makeConfig(); // no max_slices_per_milestone
    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.valid).toBe(true);
    expect(result.limit).toBeUndefined();
    expect(result.milestoneId).toBe("M001");
  });

  it("returns valid when slice count is under the limit", async () => {
    await writeRoadmap(tmpDir, "M001", makeRoadmap(3));
    const config = makeConfig({ max_slices_per_milestone: 5 });

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.valid).toBe(true);
    expect(result.sliceCount).toBe(3);
    expect(result.limit).toBe(5);
  });

  it("returns valid when slice count equals the limit", async () => {
    await writeRoadmap(tmpDir, "M001", makeRoadmap(5));
    const config = makeConfig({ max_slices_per_milestone: 5 });

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.valid).toBe(true);
    expect(result.sliceCount).toBe(5);
    expect(result.limit).toBe(5);
  });

  it("returns invalid when slice count exceeds the limit", async () => {
    await writeRoadmap(tmpDir, "M001", makeRoadmap(7));
    const config = makeConfig({ max_slices_per_milestone: 5 });

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.valid).toBe(false);
    expect(result.sliceCount).toBe(7);
    expect(result.limit).toBe(5);
  });

  it("returns valid with sliceCount 0 for an empty roadmap", async () => {
    // Roadmap exists but has no slice lines
    await writeRoadmap(tmpDir, "M001", "# M001 — Roadmap\n\nNo slices yet.\n");
    const config = makeConfig({ max_slices_per_milestone: 5 });

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.valid).toBe(true);
    expect(result.sliceCount).toBe(0);
    expect(result.limit).toBe(5);
  });

  it("throws when the roadmap file is missing", async () => {
    // No roadmap written — directory doesn't even exist
    const config = makeConfig({ max_slices_per_milestone: 5 });

    await expect(
      validateMilestoneSize(tmpDir, "M001", config),
    ).rejects.toThrow(/Roadmap not found for milestone M001/);
  });

  it("defaults mode to 'best_try' when config.sizing_mode is absent", async () => {
    await writeRoadmap(tmpDir, "M001", makeRoadmap(2));
    const config = makeConfig({ max_slices_per_milestone: 5 });
    // sizing_mode not set

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.mode).toBe("best_try");
  });

  it("passes through 'strict' mode from config", async () => {
    await writeRoadmap(tmpDir, "M001", makeRoadmap(2));
    const config = makeConfig({
      max_slices_per_milestone: 5,
      sizing_mode: "strict",
    });

    const result = await validateMilestoneSize(tmpDir, "M001", config);

    expect(result.mode).toBe("strict");
  });

  it("includes milestoneId in the result for caller tracing", async () => {
    await writeRoadmap(tmpDir, "M042", makeRoadmap(1));
    const config = makeConfig({ max_slices_per_milestone: 10 });

    const result = await validateMilestoneSize(tmpDir, "M042", config);

    expect(result.milestoneId).toBe("M042");
  });
});
