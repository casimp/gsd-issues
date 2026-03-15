import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
import type { RoadmapSlice } from "../state.js";
import { saveIssueMap, loadIssueMap } from "../issue-map.js";
import {
  syncSlicesToIssues,
  assignToEpic,
  SyncToolSchema,
  type SyncOptions,
  type SyncResult,
} from "../sync.js";

// ── Helpers ──

function makeSlice(overrides: Partial<RoadmapSlice> = {}): RoadmapSlice {
  return {
    id: "S01",
    title: "Provider abstraction",
    risk: "medium",
    done: false,
    description: "providers work end-to-end.",
    ...overrides,
  };
}

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

// ── Tests ──

describe("syncSlicesToIssues", () => {
  let tempDir: string;
  let mapPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sync-test-"));
    mapPath = join(tempDir, "ISSUE-MAP.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates issues for unmapped slices", async () => {
    const provider = mockProvider();
    const slices = [makeSlice({ id: "S01" }), makeSlice({ id: "S02", title: "Config" })];

    const result = await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(2);
    expect(result.created[0].localId).toBe("S01");
    expect(result.created[1].localId).toBe("S02");
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(provider.createIssue).toHaveBeenCalledTimes(2);
  });

  it("skips already-mapped slices", async () => {
    const existingEntry: IssueMapEntry = {
      localId: "S01",
      issueId: 50,
      provider: "gitlab",
      url: "https://gitlab.com/group/project/-/issues/50",
      createdAt: "2026-03-14T00:00:00Z",
    };
    await saveIssueMap(mapPath, [existingEntry]);

    const provider = mockProvider();
    const slices = [makeSlice({ id: "S01" }), makeSlice({ id: "S02", title: "Config" })];

    const result = await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].localId).toBe("S02");
    expect(result.skipped).toEqual(["S01"]);
    expect(provider.createIssue).toHaveBeenCalledTimes(1);
  });

  it("saves map after each creation, not in batch", async () => {
    let saveCount = 0;
    const provider = mockProvider(
      vi.fn(async (opts: CreateIssueOpts) => {
        // After first issue creation, map should already have been saved
        if (saveCount > 0) {
          const mapOnDisk = await loadIssueMap(mapPath);
          expect(mapOnDisk).toHaveLength(saveCount);
        }
        const issue = makeIssue(100 + saveCount, opts.title);
        saveCount++;
        return issue;
      }),
    );

    const slices = [
      makeSlice({ id: "S01" }),
      makeSlice({ id: "S02", title: "Config" }),
      makeSlice({ id: "S03", title: "Sync" }),
    ];

    await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices,
      mapPath,
      exec: mockExec(),
    });

    // After all done, map on disk should have all 3
    const finalMap = await loadIssueMap(mapPath);
    expect(finalMap).toHaveLength(3);
  });

  it("builds correct CreateIssueOpts with config values", async () => {
    const provider = mockProvider();
    const config = makeConfig({
      assignee: "bob",
      labels: ["feature", "auto"],
    });

    await syncSlicesToIssues({
      provider,
      config,
      slices: [makeSlice({ id: "S01", title: "My Slice", risk: "high", description: "demo line" })],
      mapPath,
      exec: mockExec(),
    });

    expect(provider.createIssue).toHaveBeenCalledWith({
      title: "My Slice",
      description: "demo line\n\n[gsd:M001/S01]",
      milestone: "M001",
      assignee: "bob",
      labels: ["feature", "auto"],
      weight: 3, // fibonacci high=3
    });
  });

  it("includes description with demo line and GSD metadata tag", async () => {
    const provider = mockProvider();

    await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices: [makeSlice({ id: "S02", description: "issues are created from roadmap slices." })],
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateIssueOpts;
    expect(call.description).toContain("issues are created from roadmap slices.");
    expect(call.description).toContain("[gsd:M001/S02]");
  });

  it("handles GitLab epic assignment on success", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      // Group path lookup
      if (args.includes("--jq")) {
        return { stdout: "my-group/sub\n", stderr: "", code: 0, killed: false };
      }
      // Epic assignment
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
    await syncSlicesToIssues({
      provider,
      config,
      slices: [makeSlice({ id: "S01" })],
      mapPath,
      exec,
    });

    // Should have called exec for epic assignment
    expect(exec).toHaveBeenCalledWith("glab", expect.arrayContaining(["api"]));
  });

  it("handles epic assignment failure gracefully", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      // Group path lookup succeeds
      if (args.includes("--jq")) {
        return { stdout: "my-group\n", stderr: "", code: 0, killed: false };
      }
      // Epic assignment fails
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

    const result = await syncSlicesToIssues({
      provider: mockProvider(),
      config,
      slices: [makeSlice({ id: "S01" })],
      mapPath,
      exec,
      emit: emitFn,
    });

    // Issue should still be created despite epic failure
    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    // Epic warning should have been emitted
    expect(emitFn).toHaveBeenCalledWith(
      "gsd-issues:epic-warning",
      expect.objectContaining({ sliceId: "S01" }),
    );
  });

  it("emits sync-complete event with correct payload", async () => {
    const emitFn = vi.fn();
    const existingEntry: IssueMapEntry = {
      localId: "S01",
      issueId: 50,
      provider: "gitlab",
      url: "https://gitlab.com/group/project/-/issues/50",
      createdAt: "2026-03-14T00:00:00Z",
    };
    await saveIssueMap(mapPath, [existingEntry]);

    await syncSlicesToIssues({
      provider: mockProvider(),
      config: makeConfig(),
      slices: [makeSlice({ id: "S01" }), makeSlice({ id: "S02", title: "New" })],
      mapPath,
      exec: mockExec(),
      emit: emitFn,
    });

    expect(emitFn).toHaveBeenCalledWith("gsd-issues:sync-complete", {
      milestone: "M001",
      created: 1,
      skipped: 1,
      errors: 0,
    });
  });

  it("maps weight correctly for fibonacci strategy", async () => {
    const provider = mockProvider();
    const config = makeConfig({
      gitlab: {
        project_path: "g/p",
        project_id: 1,
        weight_strategy: "fibonacci",
      },
    });

    const slices = [
      makeSlice({ id: "S01", risk: "low" }),
      makeSlice({ id: "S02", risk: "medium" }),
      makeSlice({ id: "S03", risk: "high" }),
      makeSlice({ id: "S04", risk: "critical" }),
    ];

    await syncSlicesToIssues({
      provider,
      config,
      slices,
      mapPath,
      exec: mockExec(),
    });

    const calls = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].weight).toBe(1); // low
    expect(calls[1][0].weight).toBe(2); // medium
    expect(calls[2][0].weight).toBe(3); // high
    expect(calls[3][0].weight).toBe(5); // critical
  });

  it("maps weight correctly for linear strategy", async () => {
    const provider = mockProvider();
    const config = makeConfig({
      gitlab: {
        project_path: "g/p",
        project_id: 1,
        weight_strategy: "linear",
      },
    });

    const slices = [
      makeSlice({ id: "S01", risk: "low" }),
      makeSlice({ id: "S02", risk: "medium" }),
      makeSlice({ id: "S03", risk: "high" }),
    ];

    await syncSlicesToIssues({
      provider,
      config,
      slices,
      mapPath,
      exec: mockExec(),
    });

    const calls = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].weight).toBe(1);
    expect(calls[1][0].weight).toBe(2);
    expect(calls[2][0].weight).toBe(3);
  });

  it("omits weight when strategy is none", async () => {
    const provider = mockProvider();
    const config = makeConfig({
      gitlab: {
        project_path: "g/p",
        project_id: 1,
        weight_strategy: "none",
      },
    });

    await syncSlicesToIssues({
      provider,
      config,
      slices: [makeSlice({ id: "S01", risk: "high" })],
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.weight).toBeUndefined();
  });

  it("omits weight when no weight_strategy is configured", async () => {
    const provider = mockProvider();
    const config = makeConfig({
      provider: "github",
      github: { repo: "owner/repo" },
      gitlab: undefined,
    });

    await syncSlicesToIssues({
      provider,
      config,
      slices: [makeSlice({ id: "S01" })],
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.weight).toBeUndefined();
  });

  it("error on one slice doesn't abort others", async () => {
    let callCount = 0;
    const provider = mockProvider(
      vi.fn(async (opts: CreateIssueOpts) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Rate limit exceeded");
        }
        return makeIssue(100 + callCount, opts.title);
      }),
    );

    const slices = [
      makeSlice({ id: "S01" }),
      makeSlice({ id: "S02", title: "Will fail" }),
      makeSlice({ id: "S03", title: "Should still work" }),
    ];

    const result = await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices,
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sliceId).toBe("S02");
    expect(result.errors[0].error).toContain("Rate limit");
    expect(provider.createIssue).toHaveBeenCalledTimes(3);
  });

  it("dryRun returns preview without creating issues", async () => {
    const provider = mockProvider();

    const result = await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices: [makeSlice({ id: "S01" }), makeSlice({ id: "S02", title: "Config" })],
      mapPath,
      exec: mockExec(),
      dryRun: true,
    });

    expect(result.created).toHaveLength(2);
    expect(result.created[0].issueId).toBe(0);
    expect(result.created[0].url).toBe("(dry-run)");
    expect(provider.createIssue).not.toHaveBeenCalled();

    // Map file should not exist
    const mapOnDisk = await loadIssueMap(mapPath);
    expect(mapOnDisk).toEqual([]);
  });

  it("works with GitHub provider (no epic, no weight)", async () => {
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

    const result = await syncSlicesToIssues({
      provider,
      config,
      slices: [makeSlice({ id: "S01" })],
      mapPath,
      exec: mockExec(),
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].provider).toBe("github");
    expect(result.created[0].url).toContain("github.com");
  });

  it("handles empty slice list", async () => {
    const emitFn = vi.fn();
    const result = await syncSlicesToIssues({
      provider: mockProvider(),
      config: makeConfig(),
      slices: [],
      mapPath,
      exec: mockExec(),
      emit: emitFn,
    });

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(emitFn).toHaveBeenCalledWith("gsd-issues:sync-complete", {
      milestone: "M001",
      created: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it("description omits demo line when slice has no description", async () => {
    const provider = mockProvider();

    await syncSlicesToIssues({
      provider,
      config: makeConfig(),
      slices: [makeSlice({ id: "S01", description: "" })],
      mapPath,
      exec: mockExec(),
    });

    const call = (provider.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateIssueOpts;
    expect(call.description).toBe("\n[gsd:M001/S01]");
    expect(call.description).not.toContain("After this");
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
