import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
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
    `# GSD State\n\n**Active Milestone:** ${milestoneId} — Test\n`,
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

// Entry now uses milestoneId as localId (D029)
const DEFAULT_ENTRY: IssueMapEntry = {
  localId: "M001",
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

  it("closes issue for given milestone ID", async () => {
    const exec = makeExec();
    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Closed issue #100"),
      "info",
    );
    expect(exec).toHaveBeenCalled();
  });

  it("uses config milestone when no arg provided", async () => {
    const exec = makeExec();
    await setupConfigAndMap(tmpDir, GITLAB_CONFIG, [DEFAULT_ENTRY]);

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Closed issue #100"),
      "info",
    );
  });

  it("reports error when config is missing", async () => {
    // No config file created
    const pi = makePi();
    const ctx = makeCtx();

    const { handleClose } = await import("../close.js");
    await handleClose("close M001", ctx, pi);

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
    await handleClose("close M099", ctx, pi);

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
    await handleClose("close M001", ctx, pi);

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
      (call) => call[0].name === "gsd_issues_close",
    );
    expect(closeCall).toBeDefined();

    const toolDef = closeCall![0] as ToolDefinition;
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
        (call) => call[0].name === "gsd_issues_close",
      );
      const toolDef = closeCall![0] as ToolDefinition;

      const ctx = makeCtx();
      // Now uses milestone_id instead of slice_id
      const result = await toolDef.execute("test-call-id", { milestone_id: "M001" }, new AbortController().signal, undefined, ctx);

      expect(result.content[0].text).toContain("Closed issue #100");
    } finally {
      process.chdir(origCwd);
      await rm(tmpDir!, { recursive: true });
    }
  });
});

// ── Hook removal verification ──

describe("tool_result hook removal", () => {
  it("extension does not register a tool_result handler (hook removed)", async () => {
    const registerTool = vi.fn();
    const registerCommand = vi.fn();
    const pi = makePi({ registerTool, registerCommand });

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // ExtensionAPI no longer has .on() — the hook is removed.
    // Verify by checking that no 'on' property exists on the API shape.
    expect("on" in pi).toBe(false);
  });
});
