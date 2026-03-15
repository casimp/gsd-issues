import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionCommandContext,
  ExtensionAPI,
  ExtensionUI,
  ToolDefinition,
} from "../../index.js";
import type {
  ExecFn,
  ExecResult,
  IssueProvider,
  CreateIssueOpts,
  Issue,
} from "../../providers/types.js";
import type { Config } from "../../lib/config.js";

// ── Helpers ──

function makeUI(overrides: Partial<ExtensionUI> = {}): ExtensionUI {
  return {
    notify: vi.fn(),
    select: vi.fn(async () => ""),
    input: vi.fn(async () => ""),
    confirm: vi.fn(async () => true),
    ...overrides,
  };
}

function makeCtx(uiOverrides: Partial<ExtensionUI> = {}): ExtensionCommandContext {
  return {
    ui: makeUI(uiOverrides),
    hasUI: true,
  };
}

function makeExec(overrides: Partial<ExecResult> = {}): ExecFn {
  return vi.fn(async () => ({
    stdout: "",
    stderr: "",
    code: 0,
    killed: false,
    ...overrides,
  }));
}

function makePi(overrides: Partial<ExtensionAPI> = {}): ExtensionAPI {
  return {
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    exec: makeExec(),
    events: { emit: vi.fn() },
    ...overrides,
  };
}

const GITLAB_CONFIG: Config = {
  provider: "gitlab",
  milestone: "M001",
  assignee: "alice",
  labels: ["gsd"],
  gitlab: {
    project_path: "group/project",
    project_id: 42,
    weight_strategy: "fibonacci",
  },
};

const GITHUB_CONFIG: Config = {
  provider: "github",
  milestone: "M001",
  labels: ["gsd"],
  github: {
    repo: "owner/repo",
  },
};

const ROADMAP_CONTENT = `# M001: Test Milestone

## Slices

- [ ] **S01: Provider abstraction** \`risk:medium\` \`depends:[]\`
  > After this: providers work end-to-end.
- [ ] **S02: Config system** \`risk:low\` \`depends:[S01]\`
  > After this: config loads from disk.
- [x] **S03: Already done** \`risk:high\` \`depends:[]\`
`;

const CONTEXT_CONTENT = `---
milestone: M001
---

# M001: Test Milestone — Context

## Project Description

This is a test milestone description.

## Why This Milestone

For testing purposes.
`;

async function setupTestDir(config: Config = GITLAB_CONFIG, roadmap: string = ROADMAP_CONTENT) {
  const tempDir = await mkdtemp(join(tmpdir(), "sync-cmd-test-"));

  // Write config
  await mkdir(join(tempDir, ".gsd"), { recursive: true });
  await writeFile(
    join(tempDir, ".gsd", "issues.json"),
    JSON.stringify(config, null, 2),
  );

  // Write STATE.md
  await writeFile(
    join(tempDir, ".gsd", "STATE.md"),
    `# GSD State\n\n**Active Milestone:** M001 — Test\n`,
  );

  // Write roadmap and context
  const milestoneDir = join(tempDir, ".gsd", "milestones", "M001");
  await mkdir(milestoneDir, { recursive: true });
  await writeFile(join(milestoneDir, "M001-ROADMAP.md"), roadmap);
  await writeFile(join(milestoneDir, "M001-CONTEXT.md"), CONTEXT_CONTENT);

  return tempDir;
}

// ── Tests ──

describe("handleSync", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates milestone issue after confirmation (happy path)", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    let issueCounter = 100;
    const exec = vi.fn(async () => ({
      stdout: `https://gitlab.com/group/project/-/issues/${issueCounter++}`,
      stderr: "",
      code: 0,
      killed: false,
    }));

    const ctx = makeCtx({ confirm: vi.fn(async () => true) });
    const pi = makePi({ exec });

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    // Should have shown milestone preview
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M001"),
      "info",
    );
    // Should have asked confirmation
    expect(ctx.ui.confirm).toHaveBeenCalledWith("Create milestone issue?");
    // Should report success
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("created"),
      "info",
    );
  });

  it("aborts with notification when user declines", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx({ confirm: vi.fn(async () => false) });
    const pi = makePi();

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Sync cancelled.", "info");
    // exec (for issue creation) should not be called
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("reports nothing to do when milestone already mapped", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    // Pre-create ISSUE-MAP.json with milestone mapped
    const milestoneDir = join(tempDir, ".gsd", "milestones", "M001");
    await writeFile(
      join(milestoneDir, "ISSUE-MAP.json"),
      JSON.stringify([
        { localId: "M001", issueId: 1, provider: "gitlab", url: "https://x/1", createdAt: "2026-01-01T00:00:00Z" },
      ]),
    );

    const ctx = makeCtx();
    const pi = makePi();

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already mapped"),
      "info",
    );
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("shows error when config is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sync-cmd-noconfig-"));
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config found"),
      "error",
    );
  });

  it("instantiates GitLabProvider for gitlab config", async () => {
    tempDir = await setupTestDir(GITLAB_CONFIG);
    process.chdir(tempDir);

    let issueCounter = 100;
    const exec = vi.fn(async () => ({
      stdout: `https://gitlab.com/group/project/-/issues/${issueCounter++}`,
      stderr: "",
      code: 0,
      killed: false,
    }));

    const ctx = makeCtx({ confirm: vi.fn(async () => true) });
    const pi = makePi({ exec });

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    // Verify glab was called (GitLabProvider uses "glab" command)
    expect(exec).toHaveBeenCalled();
    const firstCall = (exec as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe("glab");
  });

  it("instantiates GitHubProvider for github config", async () => {
    tempDir = await setupTestDir(GITHUB_CONFIG);
    process.chdir(tempDir);

    let issueCounter = 100;
    const exec = vi.fn(async () => ({
      stdout: `https://github.com/owner/repo/issues/${issueCounter++}`,
      stderr: "",
      code: 0,
      killed: false,
    }));

    const ctx = makeCtx({ confirm: vi.fn(async () => true) });
    const pi = makePi({ exec });

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    // Verify gh was called (GitHubProvider uses "gh" command)
    expect(exec).toHaveBeenCalled();
    const firstCall = (exec as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe("gh");
  });

  it("reports errors from sync in notification", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    // Provider that always fails
    const exec = vi.fn(async () => ({
      stdout: "",
      stderr: "503 Service Unavailable",
      code: 1,
      killed: false,
    }));

    const ctx = makeCtx({ confirm: vi.fn(async () => true) });
    const pi = makePi({ exec });

    const { handleSync } = await import("../sync.js");
    await handleSync("sync", ctx, pi);

    // Should report with warning level when errors exist
    const notifyCalls = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
    const resultCall = notifyCalls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("error"),
    );
    expect(resultCall).toBeDefined();
  });
});

describe("gsd_issues_sync tool registration", () => {
  it("registers tool with correct schema via pi.registerTool", async () => {
    const registerTool = vi.fn();
    const pi = makePi({ registerTool });

    // Dynamic import of the extension factory
    const mod = await import("../../index.js");
    mod.default(pi);

    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "gsd_issues_sync",
        description: expect.stringContaining("Sync a GSD milestone"),
        parameters: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            milestone_id: expect.anything(),
            roadmap_path: expect.anything(),
          }),
        }),
        execute: expect.any(Function),
      }),
    );
  });

  it("tool execute returns structured ToolResult on success", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "sync-tool-test-"));
    const originalCwd = process.cwd();

    try {
      await setupToolDir(tempDir);
      process.chdir(tempDir);

      let issueCounter = 100;
      const exec = vi.fn(async () => ({
        stdout: `https://gitlab.com/group/project/-/issues/${issueCounter++}`,
        stderr: "",
        code: 0,
        killed: false,
      }));

      const registerTool = vi.fn();
      const pi = makePi({ registerTool, exec });

      const mod = await import("../../index.js");
      mod.default(pi);

      // Get the sync tool's execute fn
      const syncCall = registerTool.mock.calls.find(
        (call) => call[0].name === "gsd_issues_sync",
      );
      const toolDef = syncCall![0] as ToolDefinition;
      const result = await toolDef.execute("test-call-id", {}, new AbortController().signal, undefined, makeCtx());

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Sync complete");
      expect(result.content[0].text).toContain("Created:");
      expect(result.details).toBeDefined();
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("tool execute returns nothing-to-sync when milestone already mapped", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "sync-tool-noop-"));
    const originalCwd = process.cwd();

    try {
      await setupToolDir(tempDir);
      process.chdir(tempDir);

      // Pre-map milestone
      const milestoneDir = join(tempDir, ".gsd", "milestones", "M001");
      await writeFile(
        join(milestoneDir, "ISSUE-MAP.json"),
        JSON.stringify([
          { localId: "M001", issueId: 1, provider: "gitlab", url: "u", createdAt: "t" },
        ]),
      );

      const registerTool = vi.fn();
      const pi = makePi({ registerTool });

      const mod = await import("../../index.js");
      mod.default(pi);

      const syncCall = registerTool.mock.calls.find(
        (call) => call[0].name === "gsd_issues_sync",
      );
      const toolDef = syncCall![0] as ToolDefinition;
      const result = await toolDef.execute("test-call-id", {}, new AbortController().signal, undefined, makeCtx());

      expect(result.content[0].text).toContain("already mapped");
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ── Tool test setup helper ──

async function setupToolDir(tempDir: string) {
  await mkdir(join(tempDir, ".gsd"), { recursive: true });
  await writeFile(
    join(tempDir, ".gsd", "issues.json"),
    JSON.stringify(GITLAB_CONFIG, null, 2),
  );
  await writeFile(
    join(tempDir, ".gsd", "STATE.md"),
    `# GSD State\n\n**Active Milestone:** M001 — Test\n`,
  );
  const milestoneDir = join(tempDir, ".gsd", "milestones", "M001");
  await mkdir(milestoneDir, { recursive: true });
  await writeFile(join(milestoneDir, "M001-ROADMAP.md"), ROADMAP_CONTENT);
  await writeFile(join(milestoneDir, "M001-CONTEXT.md"), CONTEXT_CONTENT);
}

// ── PR tool registration test ──

describe("gsd_issues_pr tool registration", () => {
  it("registers pr tool with correct name and schema", async () => {
    const registerTool = vi.fn();
    const pi = makePi({ registerTool });

    const mod = await import("../../index.js");
    mod.default(pi);

    const prCall = registerTool.mock.calls.find(
      (call) => call[0].name === "gsd_issues_pr",
    );
    expect(prCall).toBeDefined();

    const toolDef = prCall![0] as ToolDefinition;
    expect(toolDef.description).toContain("pull request");
    expect(toolDef.parameters).toBeDefined();
    expect(toolDef.parameters.properties).toHaveProperty("milestone_id");
    expect(toolDef.parameters.properties).toHaveProperty("target_branch");
    expect(typeof toolDef.execute).toBe("function");
  });
});
