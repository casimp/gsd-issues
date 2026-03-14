import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ToolResultEvent,
  CommandDefinition,
  ToolDefinition,
} from "../../index.js";
import type { Config } from "../../lib/config.js";
import type { IssueMapEntry, ExecResult } from "../../providers/types.js";
import { saveIssueMap } from "../../lib/issue-map.js";

// ── Helpers ──

function makeCtx(): ExtensionCommandContext {
  return {
    ui: {
      notify: vi.fn(),
      select: vi.fn(async () => ""),
      input: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
    },
    hasUI: true,
  };
}

function makeExec(overrides: Partial<ExecResult> = {}) {
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
    on: vi.fn(),
    exec: makeExec(),
    events: { emit: vi.fn() },
    ...overrides,
  };
}

async function setupConfigAndMap(
  tmpDir: string,
  config: Config,
  entries: IssueMapEntry[],
  milestoneId = "M001",
): Promise<void> {
  // Write config
  const gsdDir = join(tmpDir, ".gsd");
  await mkdir(gsdDir, { recursive: true });
  await writeFile(
    join(gsdDir, "issues.json"),
    JSON.stringify(config, null, 2),
  );

  // Write STATE.md
  await writeFile(
    join(gsdDir, "STATE.md"),
    `# GSD State\n\n## Active Milestone\nM001\n`,
  );

  // Write roadmap and issue map
  const milestoneDir = join(gsdDir, "milestones", milestoneId);
  await mkdir(milestoneDir, { recursive: true });
  await writeFile(
    join(milestoneDir, `${milestoneId}-ROADMAP.md`),
    `# Roadmap\n\n- [ ] **S01: Test slice** \`risk:medium\` \`depends:[]\`\n`,
  );

  if (entries.length > 0) {
    await saveIssueMap(join(milestoneDir, "ISSUE-MAP.json"), entries);
  }
}

const GITLAB_CONFIG: Config = {
  provider: "gitlab",
  milestone: "M001",
  done_label: "status::done",
  gitlab: {
    project_path: "group/project",
    project_id: 42,
  },
};

const GITHUB_CONFIG: Config = {
  provider: "github",
  milestone: "M001",
  github: {
    repo: "owner/repo",
    close_reason: "completed",
  },
};

const DEFAULT_ENTRY: IssueMapEntry = {
  localId: "S01",
  issueId: 100,
  provider: "gitlab",
  url: "https://gitlab.com/group/project/-/issues/100",
  createdAt: "2025-01-01T00:00:00.000Z",
};

// ── Command tests ──

describe("handleClose command", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "close-cmd-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(tmpDir, { recursive: true });
  });

  it("closes issue for given slice ID", async () => {
    const exec = makeExec();
    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close S01", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Closed issue #100"),
      "info",
    );
    expect(exec).toHaveBeenCalled();
  });

  it("reports error when slice ID is missing", async () => {
    const pi = makePi();
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "error",
    );
  });

  it("reports error when config is missing", async () => {
    // No config file created
    const pi = makePi();
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close S01", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config found"),
      "error",
    );
  });

  it("notifies when no mapping found", async () => {
    const exec = makeExec();
    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, []);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close S99", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issue mapping found"),
      "info",
    );
  });

  it("reports provider errors", async () => {
    const exec = makeExec({ code: 1, stderr: "permission denied" });
    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close S01", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Failed to close"),
      "error",
    );
  });
});

// ── Tool registration tests ──

describe("gsd_issues_close tool registration", () => {
  it("registers tool with correct name and schema", async () => {
    const registerTool = vi.fn();
    const pi = makePi({ registerTool });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // Find the close tool registration
    const closeCall = registerTool.mock.calls.find(
      (call) => call[0] === "gsd_issues_close",
    );
    expect(closeCall).toBeDefined();

    const toolDef = closeCall![1] as ToolDefinition;
    expect(toolDef.description).toBeTruthy();
    expect(toolDef.parameters).toBeDefined();
    expect(typeof toolDef.execute).toBe("function");
  });

  it("tool executes close and returns result", async () => {
    let tmpDir: string;
    const origCwd = process.cwd();

    try {
      tmpDir = await mkdtemp(join(tmpdir(), "close-tool-"));
      process.chdir(tmpDir);

      const exec = makeExec();
      await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

      const registerTool = vi.fn();
      const pi = makePi({ registerTool, exec });

      const extensionFactory = (await import("../../index.js")).default;
      extensionFactory(pi);

      const closeCall = registerTool.mock.calls.find(
        (call) => call[0] === "gsd_issues_close",
      );
      const toolDef = closeCall![1] as ToolDefinition;

      const ctx = makeCtx();
      const result = await toolDef.execute({ slice_id: "S01" }, ctx);

      expect(result.content[0].text).toContain("Closed issue #100");
    } finally {
      process.chdir(origCwd);
      await rm(tmpDir!, { recursive: true });
    }
  });
});

// ── Hook wiring tests ──

describe("tool_result hook", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "hook-test-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(tmpDir, { recursive: true });
  });

  it("registers a tool_result handler on pi.on", async () => {
    const onFn = vi.fn();
    const pi = makePi({ on: onFn });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    expect(onFn).toHaveBeenCalledWith("tool_result", expect.any(Function));
  });

  it("triggers close when summary file is written", async () => {
    const exec = makeExec();
    const emit = vi.fn();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec, events: { emit } });

    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // Get the registered handler
    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    // Simulate writing a summary file
    await handler({
      toolName: "write",
      input: {
        path: join(
          tmpDir,
          ".gsd/milestones/M001/slices/S01/S01-SUMMARY.md",
        ),
      },
      content: "summary content",
      isError: false,
    });

    // Should have called exec (to close the issue)
    expect(exec).toHaveBeenCalled();
    // Should have emitted close event
    expect(emit).toHaveBeenCalledWith(
      "gsd-issues:close-complete",
      expect.objectContaining({
        sliceId: "S01",
        milestone: "M001",
      }),
    );
  });

  it("skips non-summary paths", async () => {
    const exec = makeExec();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    await handler({
      toolName: "write",
      input: { path: ".gsd/milestones/M001/slices/S01/S01-PLAN.md" },
      content: "plan content",
      isError: false,
    });

    // exec should not have been called for a non-summary path
    expect(exec).not.toHaveBeenCalled();
  });

  it("skips error results", async () => {
    const exec = makeExec();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    await handler({
      toolName: "write",
      input: {
        path: ".gsd/milestones/M001/slices/S01/S01-SUMMARY.md",
      },
      content: "error content",
      isError: true,
    });

    expect(exec).not.toHaveBeenCalled();
  });

  it("skips non-write tools", async () => {
    const exec = makeExec();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    await handler({
      toolName: "read_file",
      input: {
        path: ".gsd/milestones/M001/slices/S01/S01-SUMMARY.md",
      },
      content: "content",
      isError: false,
    });

    expect(exec).not.toHaveBeenCalled();
  });

  it("does not throw when config is missing", async () => {
    // No config set up — handler should catch and return silently
    const exec = makeExec();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    // Should not throw
    await expect(
      handler({
        toolName: "write",
        input: {
          path: join(
            tmpDir,
            ".gsd/milestones/M001/slices/S01/S01-SUMMARY.md",
          ),
        },
        content: "content",
        isError: false,
      }),
    ).resolves.toBeUndefined();

    // exec should not have been called since config load failed
    expect(exec).not.toHaveBeenCalled();
  });

  it("skips write to wrong directory structure", async () => {
    const exec = makeExec();
    const onFn = vi.fn();
    const pi = makePi({ on: onFn, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const handler = onFn.mock.calls.find(
      (call) => call[0] === "tool_result",
    )![1] as (event: ToolResultEvent) => Promise<void>;

    // Summary file but not in .gsd/milestones structure
    await handler({
      toolName: "write",
      input: { path: "/some/other/path/S01-SUMMARY.md" },
      content: "content",
      isError: false,
    });

    expect(exec).not.toHaveBeenCalled();
  });
});
