import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  IssueProvider,
  CreateIssueOpts,
  Issue,
  IssueMapEntry,
  ExecFn,
  ExecResult,
} from "../../providers/types.js";
import type { Config } from "../config.js";
import { saveIssueMap, loadIssueMap } from "../issue-map.js";
import {
  syncMilestoneToIssue,
  assignToEpic,
  SyncToolSchema,
  type SyncOptions,
  type SyncResult,
} from "../sync.js";

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

function makeIssue(id: number, title: string): Issue {
  return {
    id,
    title,
    state: "open",
    url: `https://gitlab.com/group/project/-/issues/${id}`,
    labels: [],
  };
}

function mockProvider(
  createFn?: (opts: CreateIssueOpts) => Promise<Issue>,
): IssueProvider {
  let nextId = 100;
  return {
    name: "gitlab",
    createIssue:
      createFn ??
      vi.fn(async (opts: CreateIssueOpts) => makeIssue(nextId++, opts.title)),
    closeIssue: vi.fn(async () => {}),
    listIssues: vi.fn(async () => []),
    addLabels: vi.fn(async () => {}),
    createPR: vi.fn(async () => ({ url: "", number: 0 })),
  };
}

function mockExec(overrides: Partial<ExecResult> = {}): ExecFn {
  return vi.fn(async () => ({
    stdout: "",
    stderr: "",
    code: 0,
    killed: false,
    ...overrides,
  }));
}

/**
 * Set up milestone directory structure with CONTEXT.md and ROADMAP.md.
 */
async function setupMilestoneFiles(
  tmpDir: string,
  milestoneId: string,
  opts?: { context?: string | null; roadmap?: string | null },
): Promise<void> {
  const dir = join(tmpDir, ".gsd", "milestones", milestoneId);
  await mkdir(dir, { recursive: true });

  if (opts?.context !== null) {
    const contextContent = opts?.context ?? [
      "---",
      `milestone: ${milestoneId}`,
      "---",
      "",
      `# ${milestoneId}: Test Milestone — Context`,
      "",
      "## Project Description",
      "",
      "This is the project description for the milestone.",
      "",
      "## Why This Milestone",
      "",
      "Because we need it.",
    ].join("\n");
    await writeFile(join(dir, `${milestoneId}-CONTEXT.md`), contextContent, "utf-8");
  }

  if (opts?.roadmap !== null) {
    const roadmapContent = opts?.roadmap ?? [
      `# ${milestoneId}: Test Milestone`,
      "",
      "## Slices",
      "",
      "- [ ] **S01: First slice** `risk:medium` `depends:[]`",
      "  > After this: first slice works.",
      "",
      "- [ ] **S02: Second slice** `risk:high` `depends:[S01]`",
      "  > After this: second slice works.",
    ].join("\n");
    await writeFile(join(dir, `${milestoneId}-ROADMAP.md`), roadmapContent, "utf-8");
  }
}

// ── Tests ──

describe("syncMilestoneToIssue", () => {
  let tempDir: string;
  let mapPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sync-test-"));
    mapPath = join(tempDir, ".gsd", "milestones", "M001", "ISSUE-MAP.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a single issue for the milestone", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();

    const result = await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].localId).toBe("M001");
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(provider.createIssue).toHaveBeenCalledTimes(1);
  });

  it("skips if milestone already mapped", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const existingEntry: IssueMapEntry = {
      localId: "M001",
      issueId: 50,
      provider: "gitlab",
      url: "https://gitlab.com/group/project/-/issues/50",
      createdAt: "2026-03-14T00:00:00Z",
    };
    await saveIssueMap(mapPath, [existingEntry]);

    const provider = mockProvider();
    const result = await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual(["M001"]);
    expect(provider.createIssue).not.toHaveBeenCalled();
  });

  it("persists map immediately after creation (crash-safe)", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider(
      vi.fn(async (opts: CreateIssueOpts) => {
        // Map should not exist yet
        const mapOnDisk = await loadIssueMap(mapPath);
        expect(mapOnDisk).toHaveLength(0);
        return makeIssue(100, opts.title);
      }),
    );

    await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    // After sync, map on disk should have the entry
    const finalMap = await loadIssueMap(mapPath);
    expect(finalMap).toHaveLength(1);
    expect(finalMap[0].localId).toBe("M001");
  });

  it("builds description from CONTEXT.md and ROADMAP.md", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();

    await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateIssueOpts;
    expect(call.title).toBe("M001: Test Milestone");
    expect(call.description).toContain("## Project Description");
    expect(call.description).toContain("This is the project description");
    expect(call.description).toContain("## Slices");
    expect(call.description).toContain("S01: First slice");
    expect(call.description).toContain("S02: Second slice");
    expect(call.description).toContain("[gsd:M001]");
  });

  it("handles missing CONTEXT.md gracefully (title-only description)", async () => {
    await setupMilestoneFiles(tempDir, "M001", { context: null });
    const provider = mockProvider();

    const result = await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(1);
    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateIssueOpts;
    // Should still have title from roadmap
    expect(call.title).toBe("M001: Test Milestone");
    // Description should still have slice listing and metadata tag
    expect(call.description).toContain("## Slices");
    expect(call.description).toContain("[gsd:M001]");
    // Should NOT have CONTEXT.md body
    expect(call.description).not.toContain("Project Description");
  });

  it("dryRun returns preview without creating issues", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();

    const result = await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
      dryRun: true,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].localId).toBe("M001");
    expect(result.created[0].issueId).toBe(0);
    expect(result.created[0].url).toBe("(dry-run)");
    expect(provider.createIssue).not.toHaveBeenCalled();

    // Map file should not exist
    const mapOnDisk = await loadIssueMap(mapPath);
    expect(mapOnDisk).toEqual([]);
  });

  it("emits sync-complete event with milestone-scoped payload", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const emitFn = vi.fn();

    await syncMilestoneToIssue({
      provider: mockProvider(),
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
      emit: emitFn,
    });

    expect(emitFn).toHaveBeenCalledWith("gsd-issues:sync-complete", {
      milestone: "M001",
      created: 1,
      skipped: 0,
      errors: 0,
    });
  });

  it("emits sync-complete with skipped when already mapped", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    await saveIssueMap(mapPath, [{
      localId: "M001",
      issueId: 50,
      provider: "gitlab",
      url: "https://gitlab.com/group/project/-/issues/50",
      createdAt: "2026-03-14T00:00:00Z",
    }]);

    const emitFn = vi.fn();
    await syncMilestoneToIssue({
      provider: mockProvider(),
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
      emit: emitFn,
    });

    expect(emitFn).toHaveBeenCalledWith("gsd-issues:sync-complete", {
      milestone: "M001",
      created: 0,
      skipped: 1,
      errors: 0,
    });
  });

  it("handles GitLab epic assignment on success", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (args.includes("--jq")) {
        return { stdout: "my-group/sub\n", stderr: "", code: 0, killed: false };
      }
      return { stdout: '{"id": 1}', stderr: "", code: 0, killed: false };
    });

    const config = makeConfig({
      gitlab: {
        project_path: "my-group/sub/project",
        project_id: 42,
        epic: "&7",
        weight_strategy: "fibonacci",
      },
    });

    const provider = mockProvider();
    await syncMilestoneToIssue({
      provider,
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec,
    });

    expect(exec).toHaveBeenCalledWith("glab", expect.arrayContaining(["api"]));
  });

  it("handles epic assignment failure gracefully", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (args.includes("--jq")) {
        return { stdout: "my-group\n", stderr: "", code: 0, killed: false };
      }
      return { stdout: "", stderr: "403 Forbidden", code: 1, killed: false };
    });

    const emitFn = vi.fn();
    const config = makeConfig({
      gitlab: {
        project_path: "my-group/project",
        project_id: 42,
        epic: "&7",
        weight_strategy: "none",
      },
    });

    const result = await syncMilestoneToIssue({
      provider: mockProvider(),
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec,
      emit: emitFn,
    });

    // Issue should still be created despite epic failure
    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    // Epic warning should have been emitted with milestoneId
    expect(emitFn).toHaveBeenCalledWith(
      "gsd-issues:epic-warning",
      expect.objectContaining({ milestoneId: "M001" }),
    );
  });

  it("uses weight from highest-risk slice", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();
    const config = makeConfig({
      gitlab: {
        project_path: "g/p",
        project_id: 1,
        weight_strategy: "fibonacci",
      },
    });

    await syncMilestoneToIssue({
      provider,
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Default roadmap has medium and high risk slices, highest is high=3
    expect(call.weight).toBe(3);
  });

  it("omits weight when strategy is none", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();
    const config = makeConfig({
      gitlab: {
        project_path: "g/p",
        project_id: 1,
        weight_strategy: "none",
      },
    });

    await syncMilestoneToIssue({
      provider,
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.weight).toBeUndefined();
  });

  it("omits weight when no weight_strategy is configured", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider();
    const config = makeConfig({
      provider: "github",
      github: { repo: "owner/repo" },
      gitlab: undefined,
    });

    await syncMilestoneToIssue({
      provider,
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.weight).toBeUndefined();
  });

  it("reports error with milestoneId on provider failure", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider = mockProvider(
      vi.fn(async () => {
        throw new Error("Rate limit exceeded");
      }),
    );

    const result = await syncMilestoneToIssue({
      provider,
      config: makeConfig(),
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].milestoneId).toBe("M001");
    expect(result.errors[0].error).toContain("Rate limit");
  });

  it("works with GitHub provider (no epic, no weight)", async () => {
    await setupMilestoneFiles(tempDir, "M001");
    const provider: IssueProvider = {
      name: "github",
      createIssue: vi.fn(async (opts: CreateIssueOpts) => ({
        id: 77,
        title: opts.title,
        state: "open" as const,
        url: "https://github.com/owner/repo/issues/77",
        labels: [],
      })),
      closeIssue: vi.fn(async () => {}),
      listIssues: vi.fn(async () => []),
      addLabels: vi.fn(async () => {}),
      createPR: vi.fn(async () => ({ url: "", number: 0 })),
    };

    const config = makeConfig({
      provider: "github",
      github: { repo: "owner/repo" },
      gitlab: undefined,
    });

    const result = await syncMilestoneToIssue({
      provider,
      config,
      milestoneId: "M001",
      cwd: tempDir,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].provider).toBe("github");
    expect(result.created[0].url).toContain("github.com");
  });
});

// ── assignToEpic ──

describe("assignToEpic", () => {
  it("parses epic IID from &N format and calls glab api", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (args.includes("--jq")) {
        return { stdout: "my-group\n", stderr: "", code: 0, killed: false };
      }
      return { stdout: '{"id": 1}', stderr: "", code: 0, killed: false };
    });

    await assignToEpic(exec, 42, 100, "&7");

    // First call: discover group path
    expect(exec).toHaveBeenCalledWith("glab", [
      "api",
      "projects/42",
      "--jq",
      ".namespace.full_path",
    ]);

    // Second call: assign to epic
    expect(exec).toHaveBeenCalledWith("glab", [
      "api",
      "-X",
      "POST",
      "groups/my-group/epics/7/issues/42",
      "--field",
      "issue_id=100",
    ]);
  });

  it("throws on invalid epic config format", async () => {
    const exec = mockExec();
    await expect(assignToEpic(exec, 42, 100, "not-a-number")).rejects.toThrow(
      "Invalid epic config",
    );
  });

  it("throws when group path lookup fails", async () => {
    const exec = vi.fn(async () => ({
      stdout: "",
      stderr: "401 Unauthorized",
      code: 1,
      killed: false,
    }));

    await expect(assignToEpic(exec, 42, 100, "&7")).rejects.toThrow(
      "Failed to discover group path",
    );
  });

  it("encodes group path with slashes", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (args.includes("--jq")) {
        return { stdout: "my-group/sub-group\n", stderr: "", code: 0, killed: false };
      }
      return { stdout: "{}", stderr: "", code: 0, killed: false };
    });

    await assignToEpic(exec, 42, 100, "&7");

    const secondCall = exec.mock.calls[1];
    expect(secondCall[1]).toContain("groups/my-group%2Fsub-group/epics/7/issues/42");
  });
});

// ── SyncToolSchema ──

describe("SyncToolSchema", () => {
  it("exports a TypeBox schema with optional milestone_id and roadmap_path", () => {
    expect(SyncToolSchema).toBeDefined();
    expect(SyncToolSchema.type).toBe("object");
    expect(SyncToolSchema.properties.milestone_id).toBeDefined();
    expect(SyncToolSchema.properties.roadmap_path).toBeDefined();
  });
});
