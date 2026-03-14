import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ToolDefinition,
} from "../../index.js";
import type { Config } from "../../lib/config.js";
import type { ExecResult } from "../../providers/types.js";

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

async function setupConfig(
  tmpDir: string,
  config: Config,
): Promise<void> {
  const gsdDir = join(tmpDir, ".gsd");
  await mkdir(gsdDir, { recursive: true });
  await writeFile(
    join(gsdDir, "issues.json"),
    JSON.stringify(config, null, 2),
  );

  // Write STATE.md for milestone fallback
  await writeFile(
    join(gsdDir, "STATE.md"),
    `# GSD State\n\n## Active Milestone\nM001\n`,
  );
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

// GitLab list response — two issues
const GITLAB_LIST_RESPONSE = JSON.stringify([
  {
    iid: 10,
    title: "Implement auth",
    state: "opened",
    web_url: "https://gitlab.com/group/project/-/issues/10",
    labels: ["backend", "auth"],
    weight: 5,
    milestone: { title: "Sprint 1" },
    assignees: [{ username: "alice" }],
    description: "Add authentication flow",
  },
  {
    iid: 11,
    title: "Fix CSS bug",
    state: "opened",
    web_url: "https://gitlab.com/group/project/-/issues/11",
    labels: ["frontend"],
    weight: null,
    milestone: null,
    assignees: [],
    description: null,
  },
]);

// GitHub list response
const GITHUB_LIST_RESPONSE = JSON.stringify([
  {
    number: 20,
    title: "Add tests",
    state: "open",
    html_url: "https://github.com/owner/repo/issues/20",
    labels: [{ name: "testing" }],
    milestone: { title: "v1.0" },
    assignees: [{ login: "bob" }],
    body: "Need more tests",
  },
]);

// ── Command handler tests ──

describe("handleImport command", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "import-cmd-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(tmpDir, { recursive: true });
  });

  it("imports issues and notifies with formatted markdown", async () => {
    const exec = makeExec({ stdout: GITLAB_LIST_RESPONSE });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    // Should have called provider.listIssues (via exec)
    expect(exec).toHaveBeenCalled();
    // Should notify with markdown containing issue info
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("## #10: Implement auth"),
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("## #11: Fix CSS bug"),
      "info",
    );
  });

  it("emits gsd-issues:import-complete event", async () => {
    const exec = makeExec({ stdout: GITLAB_LIST_RESPONSE });
    const emit = vi.fn();
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec, events: { emit } });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    expect(emit).toHaveBeenCalledWith(
      "gsd-issues:import-complete",
      expect.objectContaining({ issueCount: 2 }),
    );
  });

  it("notifies when no issues found", async () => {
    const exec = makeExec({ stdout: "[]" });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No issues found.",
      "info",
    );
  });

  it("reports error when config is missing", async () => {
    // No config file
    const pi = makePi();
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config found"),
      "error",
    );
  });

  it("reports provider error", async () => {
    const exec = makeExec({ code: 1, stderr: "network error" });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Failed to import"),
      "error",
    );
  });

  it("parses --milestone flag", async () => {
    const exec = makeExec({ stdout: "[]" });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import --milestone Sprint2", ctx, pi);

    // The exec call should include the milestone filter
    // The exact arg depends on provider, but we verify it was called
    expect(exec).toHaveBeenCalled();
    // Check the args passed to exec include milestone filtering
    const callArgs = exec.mock.calls[0] as unknown as [string, string[]];
    const argsStr = callArgs[1].join(" ");
    // GitLab uses --milestone flag
    expect(argsStr).toContain("Sprint2");
  });

  it("parses --labels flag", async () => {
    const exec = makeExec({ stdout: "[]" });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import --labels bug,feature", ctx, pi);

    expect(exec).toHaveBeenCalled();
    const callArgs = exec.mock.calls[0] as unknown as [string, string[]];
    const argsStr = callArgs[1].join(" ");
    expect(argsStr).toContain("bug");
  });

  it("parses --milestone= and --labels= syntax", async () => {
    const exec = makeExec({ stdout: "[]" });
    await setupConfig(tmpDir, GITLAB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import --milestone=Sprint3 --labels=urgent", ctx, pi);

    expect(exec).toHaveBeenCalled();
    const callArgs = exec.mock.calls[0] as unknown as [string, string[]];
    const argsStr = callArgs[1].join(" ");
    expect(argsStr).toContain("Sprint3");
  });

  it("works with GitHub provider", async () => {
    const exec = makeExec({ stdout: GITHUB_LIST_RESPONSE });
    await setupConfig(tmpDir, GITHUB_CONFIG);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleImport } = await import("../import.js");
    await handleImport("import", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("## #20: Add tests"),
      "info",
    );
  });
});

// ── Tool registration tests ──

describe("gsd_issues_import tool registration", () => {
  it("registers tool with correct name and schema", async () => {
    const registerTool = vi.fn();
    const pi = makePi({ registerTool });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const importCall = registerTool.mock.calls.find(
      (call) => call[0].name === "gsd_issues_import",
    );
    expect(importCall).toBeDefined();

    const toolDef = importCall![0] as ToolDefinition;
    expect(toolDef.description).toBeTruthy();
    expect(toolDef.parameters).toBeDefined();
    expect(typeof toolDef.execute).toBe("function");
  });

  it("tool executes import and returns markdown", async () => {
    let tmpDir: string;
    const origCwd = process.cwd();

    try {
      tmpDir = await mkdtemp(join(tmpdir(), "import-tool-"));
      process.chdir(tmpDir);

      const exec = makeExec({ stdout: GITLAB_LIST_RESPONSE });
      await setupConfig(tmpDir, GITLAB_CONFIG);

      const registerTool = vi.fn();
      const emit = vi.fn();
      const pi = makePi({ registerTool, exec, events: { emit } });

      const extensionFactory = (await import("../../index.js")).default;
      extensionFactory(pi);

      const importCall = registerTool.mock.calls.find(
        (call) => call[0].name === "gsd_issues_import",
      );
      const toolDef = importCall![0] as ToolDefinition;

      const ctx = makeCtx();
      const result = await toolDef.execute("test-call-id", {}, new AbortController().signal, undefined, ctx);

      expect(result.content[0].text).toContain("## #10: Implement auth");
      expect(result.details).toEqual(
        expect.objectContaining({ issueCount: 2 }),
      );
      expect(emit).toHaveBeenCalledWith(
        "gsd-issues:import-complete",
        expect.objectContaining({ issueCount: 2 }),
      );
    } finally {
      process.chdir(origCwd);
      await rm(tmpDir!, { recursive: true });
    }
  });

  it("tool returns empty message when no issues", async () => {
    let tmpDir: string;
    const origCwd = process.cwd();

    try {
      tmpDir = await mkdtemp(join(tmpdir(), "import-tool-empty-"));
      process.chdir(tmpDir);

      const exec = makeExec({ stdout: "[]" });
      await setupConfig(tmpDir, GITLAB_CONFIG);

      const registerTool = vi.fn();
      const pi = makePi({ registerTool, exec });

      const extensionFactory = (await import("../../index.js")).default;
      extensionFactory(pi);

      const importCall = registerTool.mock.calls.find(
        (call) => call[0].name === "gsd_issues_import",
      );
      const toolDef = importCall![0] as ToolDefinition;

      const ctx = makeCtx();
      const result = await toolDef.execute("test-call-id", {}, new AbortController().signal, undefined, ctx);

      expect(result.content[0].text).toBe("No issues found.");
    } finally {
      process.chdir(origCwd);
      await rm(tmpDir!, { recursive: true });
    }
  });
});

// ── Switch case wiring test ──

describe("import subcommand wiring", () => {
  it("import case routes to handleImport (not stub)", async () => {
    const registerCommand = vi.fn();
    const exec = makeExec({ stdout: "[]" });
    const pi = makePi({ registerCommand, exec });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // Find the issues command registration
    const issuesCall = registerCommand.mock.calls.find(
      (call) => call[0] === "issues",
    );
    expect(issuesCall).toBeDefined();

    // Set up config so the handler doesn't fail on config load
    let tmpDir: string;
    const origCwd = process.cwd();

    try {
      tmpDir = await mkdtemp(join(tmpdir(), "import-wire-"));
      process.chdir(tmpDir);
      await setupConfig(tmpDir, GITLAB_CONFIG);

      const handler = issuesCall![1].handler;
      const ctx = makeCtx();

      await handler("import", ctx);

      // Should NOT show "not yet implemented" — the stub is replaced
      const notifyCall = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("not yet implemented"),
      );
      expect(notifyCall).toBeUndefined();
    } finally {
      process.chdir(origCwd);
      await rm(tmpDir!, { recursive: true });
    }
  });
});
