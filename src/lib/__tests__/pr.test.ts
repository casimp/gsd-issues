import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  IssueProvider,
  ExecFn,
  ExecResult,
  PRResult,
  IssueMapEntry,
} from "../../providers/types.js";
import type { Config } from "../config.js";
import { saveIssueMap } from "../issue-map.js";
import { createMilestonePR, PrToolSchema, type PrOptions } from "../pr.js";

// ── Helpers ──

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: "gitlab",
    milestone: "M001",
    assignee: "alice",
    labels: ["gsd", "auto"],
    gitlab: {
      project_path: "group/project",
      project_id: 42,
      weight_strategy: "fibonacci",
    },
    ...overrides,
  };
}

function mockProvider(prResult?: PRResult): IssueProvider {
  return {
    name: "gitlab",
    createIssue: vi.fn(),
    closeIssue: vi.fn(),
    listIssues: vi.fn(),
    addLabels: vi.fn(),
    createPR: vi.fn().mockResolvedValue(
      prResult ?? {
        url: "https://gitlab.com/group/project/-/merge_requests/1",
        number: 1,
      },
    ),
  };
}

function mockExec(overrides: Partial<ExecResult> = {}): ExecFn {
  return vi.fn().mockResolvedValue({
    stdout: "",
    stderr: "",
    code: 0,
    killed: false,
    ...overrides,
  });
}

async function setupMilestoneFiles(
  tmpDir: string,
  milestoneId: string,
  opts: {
    metaBranch?: string;
    contextTitle?: string;
    roadmapTitle?: string;
    issueMap?: IssueMapEntry[];
  } = {},
): Promise<{ mapPath: string }> {
  const milestoneDir = join(tmpDir, ".gsd", "milestones", milestoneId);
  await mkdir(milestoneDir, { recursive: true });

  // META.json with integration branch
  if (opts.metaBranch !== undefined) {
    const meta = { integrationBranch: opts.metaBranch };
    await writeFile(
      join(milestoneDir, `${milestoneId}-META.json`),
      JSON.stringify(meta),
    );
  }

  // CONTEXT.md
  if (opts.contextTitle) {
    await writeFile(
      join(milestoneDir, `${milestoneId}-CONTEXT.md`),
      `# ${opts.contextTitle} — Context\n\n## Project Description\n\nSome description.\n`,
    );
  }

  // ROADMAP.md
  if (opts.roadmapTitle) {
    await writeFile(
      join(milestoneDir, `${milestoneId}-ROADMAP.md`),
      `# ${opts.roadmapTitle}\n\n- [ ] **S01: First slice** \`risk:high\` \`depends:[]\`\n`,
    );
  }

  // ISSUE-MAP.json
  const mapPath = join(milestoneDir, "ISSUE-MAP.json");
  if (opts.issueMap) {
    await saveIssueMap(mapPath, opts.issueMap);
  }

  return { mapPath };
}

function makeMapEntry(milestoneId: string, issueId: number): IssueMapEntry {
  return {
    localId: milestoneId,
    issueId,
    provider: "gitlab",
    url: `https://gitlab.com/group/project/-/issues/${issueId}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

// ── Tests ──

describe("createMilestonePR", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gsd-pr-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("pushes branch and creates PR with Closes #N", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
      roadmapTitle: "Issue Tracker Integration",
      issueMap: [makeMapEntry("M001", 99)],
    });

    const provider = mockProvider();
    const exec = mockExec();
    const emit = vi.fn();

    const result = await createMilestonePR({
      provider,
      config: makeConfig(),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
      emit,
    });

    // Push was called
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "gsd/M001/S01"],
      { cwd: tmpDir },
    );

    // Provider.createPR was called with correct args
    expect(provider.createPR).toHaveBeenCalledWith({
      title: "M001: Issue Tracker Integration",
      body: expect.stringContaining("Closes #99"),
      headBranch: "gsd/M001/S01",
      baseBranch: "main",
      closesIssueId: 99,
    });

    // Result is correct
    expect(result.url).toBe("https://gitlab.com/group/project/-/merge_requests/1");
    expect(result.number).toBe(1);
    expect(result.milestoneId).toBe("M001");
    expect(result.sourceBranch).toBe("gsd/M001/S01");
    expect(result.targetBranch).toBe("main");
    expect(result.closesIssueId).toBe(99);

    // Event was emitted
    expect(emit).toHaveBeenCalledWith("gsd-issues:pr-complete", {
      milestoneId: "M001",
      prUrl: "https://gitlab.com/group/project/-/merge_requests/1",
      prNumber: 1,
    });
  });

  it("creates PR without Closes #N when no ISSUE-MAP entry", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
      roadmapTitle: "Some Milestone",
      // No issueMap
    });

    const provider = mockProvider();
    const exec = mockExec();

    const result = await createMilestonePR({
      provider,
      config: makeConfig(),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    // PR created without closesIssueId
    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        closesIssueId: undefined,
      }),
    );
    const body = (provider.createPR as ReturnType<typeof vi.fn>).mock.calls[0][0].body;
    expect(body).not.toContain("Closes #");

    expect(result.closesIssueId).toBeUndefined();
  });

  it("errors on missing integration branch", async () => {
    const milestoneDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(milestoneDir, { recursive: true });
    const mapPath = join(milestoneDir, "ISSUE-MAP.json");
    // No META.json → readIntegrationBranch returns null

    await expect(
      createMilestonePR({
        provider: mockProvider(),
        config: makeConfig(),
        exec: mockExec(),
        cwd: tmpDir,
        milestoneId: "M001",
        mapPath,
      }),
    ).rejects.toThrow("No integration branch configured for milestone M001");
  });

  it("errors on source === target branch", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "main",
    });

    await expect(
      createMilestonePR({
        provider: mockProvider(),
        config: makeConfig(),
        exec: mockExec(),
        cwd: tmpDir,
        milestoneId: "M001",
        mapPath,
        targetBranch: "main",
      }),
    ).rejects.toThrow(
      "Milestone branch is 'main' — cannot create a PR from a branch to itself",
    );
  });

  it("propagates push failure before attempting PR", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
    });

    const provider = mockProvider();
    const exec = mockExec({
      code: 128,
      stderr: "fatal: remote origin not found",
    });

    await expect(
      createMilestonePR({
        provider,
        config: makeConfig(),
        exec,
        cwd: tmpDir,
        milestoneId: "M001",
        mapPath,
      }),
    ).rejects.toThrow("Failed to push branch 'gsd/M001/S01': fatal: remote origin not found");

    // Provider.createPR was NOT called
    expect(provider.createPR).not.toHaveBeenCalled();
  });

  it("uses targetBranch param over config", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
    });

    const provider = mockProvider();
    const exec = mockExec();

    await createMilestonePR({
      provider,
      config: makeConfig({ branch_pattern: "develop" }),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
      targetBranch: "release",
    });

    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: "release",
      }),
    );
  });

  it("uses config branch_pattern when no targetBranch param", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
    });

    const provider = mockProvider();
    const exec = mockExec();

    await createMilestonePR({
      provider,
      config: makeConfig({ branch_pattern: "develop" }),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: "develop",
      }),
    );
  });

  it("defaults target to 'main' when no param or config", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
    });

    const provider = mockProvider();
    const exec = mockExec();

    await createMilestonePR({
      provider,
      config: makeConfig({ branch_pattern: undefined }),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: "main",
      }),
    );
  });

  it("dry-run returns preview without pushing or creating PR", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
      issueMap: [makeMapEntry("M001", 42)],
    });

    const provider = mockProvider();
    const exec = mockExec();
    const emit = vi.fn();

    const result = await createMilestonePR({
      provider,
      config: makeConfig(),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
      dryRun: true,
      emit,
    });

    // No git push
    expect(exec).not.toHaveBeenCalled();
    // No provider call
    expect(provider.createPR).not.toHaveBeenCalled();

    // Result is a preview
    expect(result.url).toBe("(dry-run)");
    expect(result.number).toBe(0);
    expect(result.sourceBranch).toBe("gsd/M001/S01");
    expect(result.closesIssueId).toBe(42);

    // Event still emitted for dry-run
    expect(emit).toHaveBeenCalledWith("gsd-issues:pr-complete", {
      milestoneId: "M001",
      prUrl: "(dry-run)",
      prNumber: 0,
    });
  });

  it("emits gsd-issues:pr-complete with correct payload", async () => {
    const prResult: PRResult = {
      url: "https://github.com/org/repo/pull/77",
      number: 77,
    };
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M002", {
      metaBranch: "gsd/M002/S01",
    });

    const emit = vi.fn();

    await createMilestonePR({
      provider: mockProvider(prResult),
      config: makeConfig({ provider: "github", milestone: "M002" }),
      exec: mockExec(),
      cwd: tmpDir,
      milestoneId: "M002",
      mapPath,
      emit,
    });

    expect(emit).toHaveBeenCalledWith("gsd-issues:pr-complete", {
      milestoneId: "M002",
      prUrl: "https://github.com/org/repo/pull/77",
      prNumber: 77,
    });
  });

  it("uses CONTEXT.md title when ROADMAP.md is missing", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
      contextTitle: "My Context Title",
      // no roadmapTitle
    });

    const provider = mockProvider();
    const exec = mockExec();

    await createMilestonePR({
      provider,
      config: makeConfig(),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "M001: My Context Title",
      }),
    );
  });

  it("falls back to milestoneId when no ROADMAP or CONTEXT", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
      // no roadmapTitle, no contextTitle
    });

    const provider = mockProvider();
    const exec = mockExec();

    await createMilestonePR({
      provider,
      config: makeConfig(),
      exec,
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    expect(provider.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "M001: M001",
      }),
    );
  });

  it("body contains gsd metadata tag", async () => {
    const { mapPath } = await setupMilestoneFiles(tmpDir, "M001", {
      metaBranch: "gsd/M001/S01",
    });

    const provider = mockProvider();

    await createMilestonePR({
      provider,
      config: makeConfig(),
      exec: mockExec(),
      cwd: tmpDir,
      milestoneId: "M001",
      mapPath,
    });

    const body = (provider.createPR as ReturnType<typeof vi.fn>).mock.calls[0][0].body;
    expect(body).toContain("[gsd:M001]");
  });
});

describe("PrToolSchema", () => {
  it("is a valid TypeBox schema", () => {
    expect(PrToolSchema).toBeDefined();
    expect(PrToolSchema.type).toBe("object");
    expect(PrToolSchema.properties).toHaveProperty("milestone_id");
    expect(PrToolSchema.properties).toHaveProperty("target_branch");
    expect(PrToolSchema.properties).toHaveProperty("dry_run");
  });
});
