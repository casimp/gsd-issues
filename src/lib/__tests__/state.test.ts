import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  parseRoadmapSlices,
  readGSDState,
  findRoadmapPath,
} from "../state.js";

// ── parseRoadmapSlices ──

describe("parseRoadmapSlices", () => {
  it("parses multiple slices with mixed done/undone", () => {
    const content = [
      "## Slices",
      "",
      "- [x] **S01: Provider abstraction** `risk:medium` `depends:[]`",
      "  > After this: providers work end-to-end.",
      "",
      "- [ ] **S02: Config and setup** `risk:medium` `depends:[S01]`",
      "  > After this: user can configure the extension.",
      "",
      "- [ ] **S03: Sync workflow** `risk:high` `depends:[S01,S02]`",
      "  > After this: issues are created from roadmap slices.",
    ].join("\n");

    const slices = parseRoadmapSlices(content);

    expect(slices).toHaveLength(3);
    expect(slices[0]).toEqual({
      id: "S01",
      title: "Provider abstraction",
      risk: "medium",
      done: true,
      description: "providers work end-to-end.",
    });
    expect(slices[1]).toEqual({
      id: "S02",
      title: "Config and setup",
      risk: "medium",
      done: false,
      description: "user can configure the extension.",
    });
    expect(slices[2]).toEqual({
      id: "S03",
      title: "Sync workflow",
      risk: "high",
      done: false,
      description: "issues are created from roadmap slices.",
    });
  });

  it("handles [x] and [X] as done", () => {
    const content = [
      "- [x] **S01: Lower case** `risk:low` `depends:[]`",
      "- [X] **S02: Upper case** `risk:low` `depends:[]`",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices).toHaveLength(2);
    expect(slices[0].done).toBe(true);
    expect(slices[1].done).toBe(true);
  });

  it("handles [ ] as not done", () => {
    const content =
      "- [ ] **S01: Not done** `risk:medium` `depends:[]`";

    const slices = parseRoadmapSlices(content);
    expect(slices).toHaveLength(1);
    expect(slices[0].done).toBe(false);
  });

  it("extracts different risk levels", () => {
    const content = [
      "- [ ] **S01: Low risk** `risk:low` `depends:[]`",
      "- [ ] **S02: High risk** `risk:high` `depends:[]`",
      "- [ ] **S03: Medium risk** `risk:medium` `depends:[]`",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices.map((s) => s.risk)).toEqual(["low", "high", "medium"]);
  });

  it("captures description from > After this: line", () => {
    const content = [
      "- [ ] **S01: With desc** `risk:low` `depends:[]`",
      "  > After this: everything works perfectly.",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices[0].description).toBe("everything works perfectly.");
  });

  it("returns empty description when no description line follows", () => {
    const content = [
      "- [ ] **S01: No desc** `risk:low` `depends:[]`",
      "",
      "- [ ] **S02: Also no desc** `risk:low` `depends:[]`",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices[0].description).toBe("");
    expect(slices[1].description).toBe("");
  });

  it("returns empty description when slice is last line", () => {
    const content =
      "- [ ] **S01: Last line** `risk:low` `depends:[]`";

    const slices = parseRoadmapSlices(content);
    expect(slices[0].description).toBe("");
  });

  it("returns empty array for empty content", () => {
    expect(parseRoadmapSlices("")).toEqual([]);
  });

  it("returns empty array for content with no slice lines", () => {
    const content = [
      "# Roadmap",
      "",
      "This is a roadmap with no slices.",
      "Just some text.",
    ].join("\n");

    expect(parseRoadmapSlices(content)).toEqual([]);
  });

  it("silently skips malformed lines", () => {
    const content = [
      "- [ ] Not a proper slice line",
      "- [ ] **S01: Valid** `risk:low` `depends:[]`",
      "  > After this: this one is real.",
      "- Some other bullet",
      "random text",
      "- [x] **S02: Also valid** `risk:high` `depends:[S01]`",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices).toHaveLength(2);
    expect(slices[0].id).toBe("S01");
    expect(slices[1].id).toBe("S02");
  });

  it("handles real roadmap content from this project", () => {
    // Matches the actual format in M001-ROADMAP.md
    const content = [
      "## Slices",
      "",
      "- [x] **S01: Provider abstraction and core types** `risk:medium` `depends:[]`",
      "  > After this: pi.exec(\"glab\"/\"gh\") calls work through the provider interface, auto-detection picks the right provider from git remote, ISSUE-MAP.json read/write works.",
      "",
      "- [x] **S02: Config and setup command** `risk:medium` `depends:[S01]`",
      "  > After this: user runs /issues setup, walks through interactive config, .gsd/issues.json is written and validated. /issues command registered with subcommand routing.",
      "",
      "- [ ] **S03: Sync workflow** `risk:high` `depends:[S01,S02]`",
      "  > After this: user writes a roadmap, gets prompted \"Ready to create issues?\", confirms, sees real issues created on GitLab/GitHub with milestone/assignee/labels/weight/epic, mapping persisted to ISSUE-MAP.json.",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices).toHaveLength(3);
    expect(slices[0]).toMatchObject({ id: "S01", done: true, risk: "medium" });
    expect(slices[1]).toMatchObject({ id: "S02", done: true, risk: "medium" });
    expect(slices[2]).toMatchObject({ id: "S03", done: false, risk: "high" });
    expect(slices[2].title).toBe("Sync workflow");
    expect(slices[2].description).toContain("Ready to create issues?");
  });

  it("handles description with > but no 'After this:' prefix", () => {
    const content = [
      "- [ ] **S01: With blockquote** `risk:low` `depends:[]`",
      "  > Some random blockquote that isn't a description.",
    ].join("\n");

    const slices = parseRoadmapSlices(content);
    expect(slices[0].description).toBe("");
  });
});

// ── readGSDState ──

describe("readGSDState", () => {
  // Use a temp directory with real file I/O for readGSDState tests
  let tmpDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    tmpDir = await mkdtemp(join(tmpdir(), "gsd-state-test-"));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads milestone ID from valid STATE.md", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "STATE.md"),
      [
        "# GSD State",
        "",
        "**Active Milestone:** M001 — Issue Tracker Integration",
        "**Active Slice:** S03 — Sync workflow",
        "**Phase:** executing",
      ].join("\n"),
      "utf-8",
    );

    const state = await readGSDState(tmpDir);
    expect(state).toEqual({ milestoneId: "M001" });
  });

  it("returns null when STATE.md is missing", async () => {
    const state = await readGSDState(tmpDir);
    expect(state).toBeNull();
  });

  it("returns null when STATE.md has no milestone line", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "STATE.md"),
      [
        "# GSD State",
        "",
        "**Phase:** executing",
        "No milestone here.",
      ].join("\n"),
      "utf-8",
    );

    const state = await readGSDState(tmpDir);
    expect(state).toBeNull();
  });

  it("handles milestone ID with random suffix", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "STATE.md"),
      "**Active Milestone:** M001-eh88as — Some Title\n",
      "utf-8",
    );

    const state = await readGSDState(tmpDir);
    expect(state).toEqual({ milestoneId: "M001-eh88as" });
  });
});

// ── findRoadmapPath ──

describe("findRoadmapPath", () => {
  it("constructs correct roadmap path", () => {
    const result = findRoadmapPath("/project", "M001");
    expect(result).toBe(
      join("/project", ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    );
  });

  it("works with milestone IDs containing random suffix", () => {
    const result = findRoadmapPath("/project", "M001-eh88as");
    expect(result).toBe(
      join(
        "/project",
        ".gsd",
        "milestones",
        "M001-eh88as",
        "M001-eh88as-ROADMAP.md",
      ),
    );
  });
});
