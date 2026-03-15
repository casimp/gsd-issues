import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "../../index.js";
import type { Config } from "../../lib/config.js";
import type { IssueMapEntry, ExecResult } from "../../providers/types.js";
import { saveIssueMap } from "../../lib/issue-map.js";

// ── Helpers ──

function makeCtx(overrides: Partial<ExtensionCommandContext["ui"]> = {}): ExtensionCommandContext {
  return {
    ui: {
      notify: vi.fn(),
      select: vi.fn(async () => ""),
      input: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      ...overrides,
    },
    hasUI: true,
    waitForIdle: vi.fn(async () => {}),
    newSession: vi.fn(async () => ({ cancelled: false })),
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
    sendMessage: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

async function setupPrScenario(
  tmpDir: string,
  config: Config,
  opts: {
    milestoneId?: string;
    metaBranch?: string;
    issueMap?: IssueMapEntry[];
    roadmapTitle?: string;
  } = {},
): Promise<void> {
  const milestoneId = opts.milestoneId ?? "M001";

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

  // Milestone dir
  const milestoneDir = join(gsdDir, "milestones", milestoneId);
  await mkdir(milestoneDir, { recursive: true });

  // META.json
  if (opts.metaBranch !== undefined) {
    await writeFile(
      join(milestoneDir, `${milestoneId}-META.json`),
      JSON.stringify({ integrationBranch: opts.metaBranch }),
    );
  }

  // ROADMAP.md
  const roadmapTitle = opts.roadmapTitle ?? "Test Roadmap";
  await writeFile(
    join(milestoneDir, `${milestoneId}-ROADMAP.md`),
    `# ${roadmapTitle}\n\n- [ ] **S01: Test slice** \`risk:medium\` \`depends:[]\`\n`,
  );

  // ISSUE-MAP.json
  if (opts.issueMap) {
    await saveIssueMap(join(milestoneDir, "ISSUE-MAP.json"), opts.issueMap);
  }
}

const GITLAB_CONFIG: Config = {
  provider: "gitlab",
  milestone: "M001",
  gitlab: {
    project_path: "group/project",
    project_id: 42,
  },
};

const DEFAULT_MAP_ENTRY: IssueMapEntry = {
  localId: "M001",
  issueId: 99,
  provider: "gitlab",
  url: "https://gitlab.com/group/project/-/issues/99",
  createdAt: "2025-01-01T00:00:00.000Z",
};

// ── Command tests ──

describe("handlePr command", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pr-cmd-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(tmpDir, { recursive: true });
  });

  it("creates PR with full interactive flow", async () => {
    const exec = makeExec();
    // Mock createPR response
    (exec as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "Branch pushed", stderr: "", code: 0, killed: false };
      }
      // Provider CLI calls (gh/glab) for createPR
      if (cmd === "gh" || cmd === "glab") {
        return {
          stdout: JSON.stringify({ web_url: "https://gitlab.com/group/project/-/merge_requests/5", iid: 5 }),
          stderr: "",
          code: 0,
          killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    });

    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
      issueMap: [DEFAULT_MAP_ENTRY],
    });

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    // Preview shown
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("gsd/M001/S01"),
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Closes #99"),
      "info",
    );

    // Confirmation asked
    expect(ctx.ui.confirm).toHaveBeenCalledWith("Create pull request?");

    // Git push was called
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "gsd/M001/S01"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("resolves milestone from config when no arg", async () => {
    const exec = makeExec();
    (exec as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "", stderr: "", code: 0, killed: false };
      }
      if (cmd === "glab") {
        return {
          stdout: JSON.stringify({ web_url: "https://gitlab.com/merge_requests/1", iid: 1 }),
          stderr: "",
          code: 0,
          killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    });

    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
    });

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr", ctx, pi);

    // Should still proceed (using config milestone M001)
    expect(ctx.ui.confirm).toHaveBeenCalled();
  });

  it("resolves milestone from config when not in args", async () => {
    // Config has milestone "M001" — no arg passed, should use config value
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
    });

    const exec = makeExec();
    (exec as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "", stderr: "", code: 0, killed: false };
      }
      if (cmd === "glab") {
        return {
          stdout: JSON.stringify({ web_url: "https://gitlab.com/mr/1", iid: 1 }),
          stderr: "",
          code: 0,
          killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    });

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr", ctx, pi);

    // Should use M001 from config
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M001"),
      "info",
    );
  });

  it("cancels when user rejects confirmation", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
    });

    const exec = makeExec();
    const pi = makePi({ exec });
    const ctx = makeCtx({ confirm: vi.fn(async () => false) });

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith("PR creation cancelled.", "info");
    // No git push after cancel
    expect(exec).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["push"]),
      expect.anything(),
    );
  });

  it("reports error when config is missing", async () => {
    // No config file
    const pi = makePi();
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config found"),
      "error",
    );
  });

  it("reports error when integration branch is missing", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      // No metaBranch → no META.json
    });

    const pi = makePi();
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No integration branch configured"),
      "error",
    );
  });

  it("reports same-branch error", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "main",
    });

    const pi = makePi();
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("cannot create a PR from a branch to itself"),
      "error",
    );
  });

  it("reports push failure to user", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
    });

    const exec = makeExec({ code: 128, stderr: "fatal: remote origin not found" });
    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Failed to create PR"),
      "error",
    );
  });

  it("shows PR without Closes #N when no ISSUE-MAP entry", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      metaBranch: "gsd/M001/S01",
      // No issueMap
    });

    const exec = makeExec();
    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr M001", ctx, pi);

    // Preview should mention no issue mapping
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issue mapping"),
      "info",
    );
  });

  it("parses --milestone flag", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      milestoneId: "M002",
      metaBranch: "gsd/M002/S01",
    });

    const exec = makeExec();
    (exec as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "", stderr: "", code: 0, killed: false };
      }
      if (cmd === "glab") {
        return {
          stdout: JSON.stringify({ web_url: "https://gitlab.com/mr/1", iid: 1 }),
          stderr: "",
          code: 0,
          killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    });

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr --milestone M002", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M002"),
      "info",
    );
  });

  it("parses --milestone=VALUE format", async () => {
    await setupPrScenario(tmpDir, GITLAB_CONFIG, {
      milestoneId: "M003",
      metaBranch: "gsd/M003/S01",
    });

    const exec = makeExec();
    (exec as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "push") {
        return { stdout: "", stderr: "", code: 0, killed: false };
      }
      if (cmd === "glab") {
        return {
          stdout: JSON.stringify({ web_url: "https://gitlab.com/mr/1", iid: 1 }),
          stderr: "",
          code: 0,
          killed: false,
        };
      }
      return { stdout: "", stderr: "", code: 0, killed: false };
    });

    const pi = makePi({ exec });
    const ctx = makeCtx();

    const { handlePr } = await import("../pr.js");
    await handlePr("pr --milestone=M003", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M003"),
      "info",
    );
  });
});
