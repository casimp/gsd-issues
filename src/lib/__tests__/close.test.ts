import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  IssueProvider,
  CloseIssueOpts,
  IssueMapEntry,
} from "../../providers/types.js";
import { ProviderError } from "../../providers/types.js";
import type { Config } from "../config.js";
import { saveIssueMap } from "../issue-map.js";
import { closeSliceIssue, type CloseOptions, type CloseResult } from "../close.js";

// ── Helpers ──

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: "gitlab",
    milestone: "M001",
    done_label: "status::done",
    gitlab: {
      project_path: "group/project",
      project_id: 42,
    },
    ...overrides,
  };
}

function makeGitHubConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: "github",
    milestone: "M001",
    github: {
      repo: "owner/repo",
      close_reason: "completed",
    },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<IssueMapEntry> = {}): IssueMapEntry {
  return {
    localId: "S01",
    issueId: 100,
    provider: "gitlab",
    url: "https://gitlab.com/group/project/-/issues/100",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockProvider(
  closeFn?: (opts: CloseIssueOpts) => Promise<void>,
): IssueProvider {
  return {
    name: "gitlab",
    createIssue: vi.fn(async () => ({
      id: 1,
      title: "test",
      state: "open" as const,
      url: "https://example.com",
      labels: [],
    })),
    closeIssue: closeFn ?? vi.fn(async () => {}),
    listIssues: vi.fn(async () => []),
    addLabels: vi.fn(async () => {}),
  };
}

function mockGitHubProvider(
  closeFn?: (opts: CloseIssueOpts) => Promise<void>,
): IssueProvider {
  return {
    ...mockProvider(closeFn),
    name: "github",
  };
}

// ── Tests ──

describe("closeSliceIssue", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "close-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("closes GitLab issue with done label", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [makeEntry()]);

    const provider = mockProvider();
    const config = makeConfig();
    const emit = vi.fn();

    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
      emit,
    });

    expect(result.closed).toBe(true);
    if (result.closed) {
      expect(result.issueId).toBe(100);
      expect(result.url).toBe("https://gitlab.com/group/project/-/issues/100");
    }

    expect(provider.closeIssue).toHaveBeenCalledWith({
      issueId: 100,
      doneLabel: "status::done",
      reason: undefined,
    });
  });

  it("closes GitHub issue with close reason", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [
      makeEntry({
        provider: "github",
        url: "https://github.com/owner/repo/issues/50",
        issueId: 50,
      }),
    ]);

    const provider = mockGitHubProvider();
    const config = makeGitHubConfig();

    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
    });

    expect(result.closed).toBe(true);
    expect(provider.closeIssue).toHaveBeenCalledWith({
      issueId: 50,
      doneLabel: undefined,
      reason: "completed",
    });
  });

  it("returns no-mapping when entry not found", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [makeEntry({ localId: "S99" })]);

    const provider = mockProvider();
    const config = makeConfig();

    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
    });

    expect(result).toEqual({ closed: false, reason: "no-mapping" });
    expect(provider.closeIssue).not.toHaveBeenCalled();
  });

  it("returns no-mapping when map file does not exist", async () => {
    const mapPath = join(tmpDir, "nonexistent", "ISSUE-MAP.json");

    const provider = mockProvider();
    const config = makeConfig();

    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
    });

    expect(result).toEqual({ closed: false, reason: "no-mapping" });
  });

  it("treats already-closed issue as success", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [makeEntry()]);

    const closeFn = vi.fn(async () => {
      throw new ProviderError(
        "Issue already closed",
        "gitlab",
        "closeIssue",
        1,
        "Issue has already been closed",
        "glab issue close 100",
      );
    });

    const provider = mockProvider(closeFn);
    const config = makeConfig();
    const emit = vi.fn();

    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
      emit,
    });

    expect(result.closed).toBe(true);
    // Event should still be emitted
    expect(emit).toHaveBeenCalledWith("gsd-issues:close-complete", {
      milestone: "M001",
      sliceId: "S01",
      issueId: 100,
      url: "https://gitlab.com/group/project/-/issues/100",
    });
  });

  it("emits gsd-issues:close-complete on successful close", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [makeEntry()]);

    const provider = mockProvider();
    const config = makeConfig();
    const emit = vi.fn();

    await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
      emit,
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("gsd-issues:close-complete", {
      milestone: "M001",
      sliceId: "S01",
      issueId: 100,
      url: "https://gitlab.com/group/project/-/issues/100",
    });
  });

  it("does not emit event when not closed (no mapping)", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, []);

    const provider = mockProvider();
    const config = makeConfig();
    const emit = vi.fn();

    await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId: "M001",
      sliceId: "S01",
      emit,
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it("rethrows non-already-closed ProviderError", async () => {
    const mapPath = join(tmpDir, "ISSUE-MAP.json");
    await saveIssueMap(mapPath, [makeEntry()]);

    const closeFn = vi.fn(async () => {
      throw new ProviderError(
        "Permission denied",
        "gitlab",
        "closeIssue",
        1,
        "403 Forbidden",
        "glab issue close 100",
      );
    });

    const provider = mockProvider(closeFn);
    const config = makeConfig();

    await expect(
      closeSliceIssue({
        provider,
        config,
        mapPath,
        milestoneId: "M001",
        sliceId: "S01",
      }),
    ).rejects.toThrow("Permission denied");
  });
});
