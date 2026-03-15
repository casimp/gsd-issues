import { describe, it, expect, vi } from "vitest";
import { GitHubProvider } from "../github.js";
import { ProviderError } from "../types.js";
import type { ExecFn, ExecResult } from "../types.js";

/** Helper: build a successful ExecResult */
function ok(stdout: string, stderr = ""): ExecResult {
  return { stdout, stderr, code: 0, killed: false };
}

/** Helper: build a failed ExecResult */
function fail(code: number, stderr: string): ExecResult {
  return { stdout: "", stderr, code, killed: false };
}

describe("GitHubProvider", () => {
  describe("createIssue", () => {
    it("parses issue number from URL in stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/owner/repo/issues/99\n"),
      );
      const provider = new GitHubProvider(exec);

      const issue = await provider.createIssue({ title: "New feature" });

      expect(issue.id).toBe(99);
      expect(issue.title).toBe("New feature");
      expect(issue.state).toBe("open");
      expect(issue.url).toBe("https://github.com/owner/repo/issues/99");
      expect(issue.labels).toEqual([]);
    });

    it("always passes --body flag to avoid interactive mode", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/issues/1\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createIssue({ title: "No desc" });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--body");
      expect(args[args.indexOf("--body") + 1]).toBe("");
    });

    it("passes all optional fields when provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/issues/5\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createIssue({
        title: "Full issue",
        description: "Body text",
        milestone: "Sprint 1",
        assignee: "charlie",
        labels: ["enhancement", "p1"],
      });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--body");
      expect(args[args.indexOf("--body") + 1]).toBe("Body text");
      expect(args).toContain("--milestone");
      expect(args[args.indexOf("--milestone") + 1]).toBe("Sprint 1");
      expect(args).toContain("--assignee");
      expect(args[args.indexOf("--assignee") + 1]).toBe("charlie");
      expect(args).toContain("--label");
      expect(args[args.indexOf("--label") + 1]).toBe("enhancement,p1");
    });

    it("omits optional fields when not provided (except --body)", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/issues/1\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createIssue({ title: "Minimal" });

      const args = exec.mock.calls[0][1];
      expect(args).not.toContain("--milestone");
      expect(args).not.toContain("--assignee");
      expect(args).not.toContain("--label");
    });

    it("ignores weight (GitLab-only)", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/issues/1\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createIssue({ title: "Weighted", weight: 5 });

      const args = exec.mock.calls[0][1];
      expect(args).not.toContain("--weight");
    });

    it("throws ProviderError on malformed stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("Unexpected output with no URL\n"),
      );
      const provider = new GitHubProvider(exec);

      await expect(provider.createIssue({ title: "Bad" }))
        .rejects.toThrow(ProviderError);
    });

    it("throws ProviderError on non-zero exit code with diagnostic fields", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "HTTP 401: Bad credentials"),
      );
      const provider = new GitHubProvider(exec);

      try {
        await provider.createIssue({ title: "Fail" });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        const pe = err as ProviderError;
        expect(pe.provider).toBe("github");
        expect(pe.operation).toBe("createIssue");
        expect(pe.exitCode).toBe(1);
        expect(pe.stderr).toBe("HTTP 401: Bad credentials");
      }
    });
  });

  describe("closeIssue", () => {
    it("calls gh issue close with the issue number", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitHubProvider(exec);

      await provider.closeIssue({ issueId: 42 });

      expect(exec.mock.calls[0][0]).toBe("gh");
      expect(exec.mock.calls[0][1]).toEqual(["issue", "close", "42"]);
    });

    it("passes --reason completed", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitHubProvider(exec);

      await provider.closeIssue({ issueId: 10, reason: "completed" });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--reason");
      expect(args[args.indexOf("--reason") + 1]).toBe("completed");
    });

    it("passes --reason 'not planned'", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitHubProvider(exec);

      await provider.closeIssue({ issueId: 10, reason: "not planned" });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--reason");
      expect(args[args.indexOf("--reason") + 1]).toBe("not planned");
    });

    it("omits --reason when not provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitHubProvider(exec);

      await provider.closeIssue({ issueId: 5 });

      const args = exec.mock.calls[0][1];
      expect(args).not.toContain("--reason");
    });

    it("throws ProviderError on failure", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "issue not found"),
      );
      const provider = new GitHubProvider(exec);

      await expect(provider.closeIssue({ issueId: 999 }))
        .rejects.toThrow(ProviderError);
    });
  });

  describe("listIssues", () => {
    it("uses --json with correct field selection", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("[]"));
      const provider = new GitHubProvider(exec);

      await provider.listIssues();

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--json");
      expect(args[args.indexOf("--json") + 1]).toBe(
        "number,title,state,url,labels,milestone,assignees,body",
      );
    });

    it("parses JSON output into Issue array", async () => {
      const ghOutput = JSON.stringify([
        {
          number: 10,
          title: "Bug report",
          state: "OPEN",
          url: "https://github.com/o/r/issues/10",
          labels: [{ name: "bug" }],
          milestone: { title: "v1" },
          assignees: [{ login: "dev" }],
          body: "This is the bug description",
        },
        {
          number: 11,
          title: "Closed issue",
          state: "CLOSED",
          url: "https://github.com/o/r/issues/11",
          labels: [],
          milestone: null,
          assignees: [],
          body: null,
        },
      ]);
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok(ghOutput));
      const provider = new GitHubProvider(exec);

      const issues = await provider.listIssues();

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        id: 10,
        title: "Bug report",
        state: "open",
        url: "https://github.com/o/r/issues/10",
        labels: ["bug"],
        milestone: "v1",
        assignee: "dev",
        description: "This is the bug description",
      });
      expect(issues[1]).toEqual({
        id: 11,
        title: "Closed issue",
        state: "closed",
        url: "https://github.com/o/r/issues/11",
        labels: [],
        milestone: undefined,
        assignee: undefined,
        description: undefined,
      });
    });

    it("passes filters as CLI args", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("[]"));
      const provider = new GitHubProvider(exec);

      await provider.listIssues({
        state: "closed",
        milestone: "Sprint 2",
        labels: ["wontfix"],
        assignee: "dave",
      });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--state");
      expect(args[args.indexOf("--state") + 1]).toBe("closed");
      expect(args).toContain("--milestone");
      expect(args[args.indexOf("--milestone") + 1]).toBe("Sprint 2");
      expect(args).toContain("--label");
      expect(args[args.indexOf("--label") + 1]).toBe("wontfix");
      expect(args).toContain("--assignee");
      expect(args[args.indexOf("--assignee") + 1]).toBe("dave");
    });

    it("passes state filter directly (no translation needed)", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("[]"));
      const provider = new GitHubProvider(exec);

      await provider.listIssues({ state: "open" });

      const args = exec.mock.calls[0][1];
      expect(args[args.indexOf("--state") + 1]).toBe("open");
    });

    it("throws ProviderError on non-zero exit", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "no repository"),
      );
      const provider = new GitHubProvider(exec);

      await expect(provider.listIssues()).rejects.toThrow(ProviderError);
    });
  });

  describe("addLabels", () => {
    it("uses gh issue edit --add-label with comma-joined labels", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok(""));
      const provider = new GitHubProvider(exec);

      await provider.addLabels(20, ["help wanted", "good first issue"]);

      expect(exec.mock.calls[0][1]).toEqual([
        "issue", "edit", "20", "--add-label", "help wanted,good first issue",
      ]);
    });
  });

  describe("projectPath", () => {
    it("passes cwd option when projectPath is provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/issues/1\n"),
      );
      const provider = new GitHubProvider(exec, "/my/project");

      await provider.createIssue({ title: "Test" });

      expect(exec.mock.calls[0][2]).toEqual({ cwd: "/my/project" });
    });
  });

  describe("createPR", () => {
    it("creates PR with all fields and parses URL and number from stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/owner/repo/pull/17\n"),
      );
      const provider = new GitHubProvider(exec);

      const result = await provider.createPR({
        title: "Add feature",
        body: "Description here",
        headBranch: "feature-branch",
        baseBranch: "main",
      });

      expect(result.url).toBe("https://github.com/owner/repo/pull/17");
      expect(result.number).toBe(17);

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--title");
      expect(args[args.indexOf("--title") + 1]).toBe("Add feature");
      expect(args).toContain("--body");
      expect(args[args.indexOf("--body") + 1]).toBe("Description here");
      expect(args).toContain("--base");
      expect(args[args.indexOf("--base") + 1]).toBe("main");
      expect(args).toContain("--head");
      expect(args[args.indexOf("--head") + 1]).toBe("feature-branch");
    });

    it("appends Closes #N when closesIssueId is provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/pull/5\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createPR({
        title: "Fix bug",
        body: "Fixes the thing",
        headBranch: "fix",
        baseBranch: "main",
        closesIssueId: 42,
      });

      const args = exec.mock.calls[0][1];
      const bodyIdx = args.indexOf("--body") + 1;
      expect(args[bodyIdx]).toBe("Fixes the thing\n\nCloses #42");
    });

    it("passes --draft flag when draft is true", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/pull/3\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createPR({
        title: "WIP",
        body: "",
        headBranch: "wip",
        baseBranch: "main",
        draft: true,
      });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--draft");
    });

    it("omits --draft flag when draft is not set", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/pull/1\n"),
      );
      const provider = new GitHubProvider(exec);

      await provider.createPR({
        title: "Ready",
        body: "",
        headBranch: "feature",
        baseBranch: "main",
      });

      const args = exec.mock.calls[0][1];
      expect(args).not.toContain("--draft");
    });

    it("throws ProviderError on non-zero exit code", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "pull request create failed"),
      );
      const provider = new GitHubProvider(exec);

      try {
        await provider.createPR({
          title: "Fail",
          body: "",
          headBranch: "x",
          baseBranch: "main",
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        const pe = err as ProviderError;
        expect(pe.provider).toBe("github");
        expect(pe.operation).toBe("createPR");
        expect(pe.exitCode).toBe(1);
        expect(pe.stderr).toBe("pull request create failed");
      }
    });

    it("throws ProviderError when URL cannot be parsed from stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("Unexpected output with no PR URL\n"),
      );
      const provider = new GitHubProvider(exec);

      await expect(
        provider.createPR({
          title: "Bad",
          body: "",
          headBranch: "x",
          baseBranch: "main",
        }),
      ).rejects.toThrow(ProviderError);
    });

    it("passes cwd through when projectPath is set", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://github.com/o/r/pull/8\n"),
      );
      const provider = new GitHubProvider(exec, "/my/project");

      await provider.createPR({
        title: "Test",
        body: "",
        headBranch: "branch",
        baseBranch: "main",
      });

      expect(exec.mock.calls[0][2]).toEqual({ cwd: "/my/project" });
    });
  });
});
