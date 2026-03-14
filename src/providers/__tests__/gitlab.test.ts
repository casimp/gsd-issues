import { describe, it, expect, vi } from "vitest";
import { GitLabProvider } from "../gitlab.js";
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

describe("GitLabProvider", () => {
  describe("createIssue", () => {
    it("parses IID from URL in stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://gitlab.com/group/project/-/issues/42\n"),
      );
      const provider = new GitLabProvider(exec);

      const issue = await provider.createIssue({ title: "Bug fix" });

      expect(issue.id).toBe(42);
      expect(issue.title).toBe("Bug fix");
      expect(issue.state).toBe("open");
      expect(issue.url).toBe("https://gitlab.com/group/project/-/issues/42");
      expect(issue.labels).toEqual([]);
    });

    it("includes --yes and --no-editor flags", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://gitlab.com/g/p/-/issues/1\n"),
      );
      const provider = new GitLabProvider(exec);

      await provider.createIssue({ title: "Test" });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--yes");
      expect(args).toContain("--no-editor");
    });

    it("passes all optional fields when provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://gitlab.com/g/p/-/issues/7\n"),
      );
      const provider = new GitLabProvider(exec);

      await provider.createIssue({
        title: "Full issue",
        description: "Detailed desc",
        milestone: "v1.0",
        assignee: "alice",
        weight: 3,
        labels: ["bug", "urgent"],
      });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--description");
      expect(args[args.indexOf("--description") + 1]).toBe("Detailed desc");
      expect(args).toContain("--milestone");
      expect(args[args.indexOf("--milestone") + 1]).toBe("v1.0");
      expect(args).toContain("--assignee");
      expect(args[args.indexOf("--assignee") + 1]).toBe("alice");
      expect(args).toContain("--weight");
      expect(args[args.indexOf("--weight") + 1]).toBe("3");
      expect(args).toContain("--label");
      expect(args[args.indexOf("--label") + 1]).toBe("bug,urgent");
    });

    it("omits optional fields when not provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://gitlab.com/g/p/-/issues/1\n"),
      );
      const provider = new GitLabProvider(exec);

      await provider.createIssue({ title: "Minimal" });

      const args = exec.mock.calls[0][1];
      expect(args).not.toContain("--description");
      expect(args).not.toContain("--milestone");
      expect(args).not.toContain("--assignee");
      expect(args).not.toContain("--weight");
      expect(args).not.toContain("--label");
    });

    it("throws ProviderError on malformed stdout", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("Something unexpected happened\n"),
      );
      const provider = new GitLabProvider(exec);

      await expect(provider.createIssue({ title: "Fail" }))
        .rejects.toThrow(ProviderError);

      try {
        await provider.createIssue({ title: "Fail" });
      } catch (err) {
        // re-mock for this second call
      }
    });

    it("throws ProviderError on non-zero exit code with diagnostic fields", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "authentication failed"),
      );
      const provider = new GitLabProvider(exec);

      try {
        await provider.createIssue({ title: "Fail" });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        const pe = err as ProviderError;
        expect(pe.provider).toBe("gitlab");
        expect(pe.operation).toBe("createIssue");
        expect(pe.exitCode).toBe(1);
        expect(pe.stderr).toBe("authentication failed");
      }
    });
  });

  describe("closeIssue", () => {
    it("calls glab issue close with the IID", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitLabProvider(exec);

      await provider.closeIssue({ issueId: 42 });

      expect(exec).toHaveBeenCalledOnce();
      expect(exec.mock.calls[0][0]).toBe("glab");
      expect(exec.mock.calls[0][1]).toEqual(["issue", "close", "42"]);
    });

    it("applies done label after closing when doneLabel is set", async () => {
      const exec = vi.fn<ExecFn>()
        .mockResolvedValueOnce(ok("Closed"))
        .mockResolvedValueOnce(ok("Updated"));
      const provider = new GitLabProvider(exec);

      await provider.closeIssue({ issueId: 10, doneLabel: "status::done" });

      expect(exec).toHaveBeenCalledTimes(2);
      // second call: update with label
      expect(exec.mock.calls[1][1]).toEqual([
        "issue", "update", "10", "--label", "status::done",
      ]);
    });

    it("skips label update when doneLabel is not set", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Closed"));
      const provider = new GitLabProvider(exec);

      await provider.closeIssue({ issueId: 5 });

      expect(exec).toHaveBeenCalledOnce();
    });
  });

  describe("listIssues", () => {
    it("parses JSON output into Issue array", async () => {
      const glabOutput = JSON.stringify([
        {
          iid: 1,
          title: "First issue",
          state: "opened",
          web_url: "https://gitlab.com/g/p/-/issues/1",
          labels: ["bug"],
        },
        {
          iid: 2,
          title: "Second issue",
          state: "closed",
          web_url: "https://gitlab.com/g/p/-/issues/2",
          labels: [],
        },
      ]);
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok(glabOutput));
      const provider = new GitLabProvider(exec);

      const issues = await provider.listIssues();

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        id: 1,
        title: "First issue",
        state: "open",
        url: "https://gitlab.com/g/p/-/issues/1",
        labels: ["bug"],
      });
      expect(issues[1].state).toBe("closed");
    });

    it("passes filters as CLI args", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("[]"));
      const provider = new GitLabProvider(exec);

      await provider.listIssues({
        state: "open",
        milestone: "v2.0",
        labels: ["feature"],
        assignee: "bob",
      });

      const args = exec.mock.calls[0][1];
      expect(args).toContain("--state");
      expect(args[args.indexOf("--state") + 1]).toBe("opened");
      expect(args).toContain("--milestone");
      expect(args[args.indexOf("--milestone") + 1]).toBe("v2.0");
      expect(args).toContain("--label");
      expect(args[args.indexOf("--label") + 1]).toBe("feature");
      expect(args).toContain("--assignee");
      expect(args[args.indexOf("--assignee") + 1]).toBe("bob");
    });

    it("maps open state filter to 'opened' for glab", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("[]"));
      const provider = new GitLabProvider(exec);

      await provider.listIssues({ state: "open" });

      const args = exec.mock.calls[0][1];
      expect(args[args.indexOf("--state") + 1]).toBe("opened");
    });

    it("throws ProviderError on non-zero exit", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        fail(1, "project not found"),
      );
      const provider = new GitLabProvider(exec);

      await expect(provider.listIssues()).rejects.toThrow(ProviderError);
    });
  });

  describe("addLabels", () => {
    it("calls glab issue update with comma-joined labels", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(ok("Updated"));
      const provider = new GitLabProvider(exec);

      await provider.addLabels(15, ["priority::high", "type::bug"]);

      expect(exec.mock.calls[0][1]).toEqual([
        "issue", "update", "15", "--label", "priority::high,type::bug",
      ]);
    });
  });

  describe("projectPath", () => {
    it("passes cwd option when projectPath is provided", async () => {
      const exec = vi.fn<ExecFn>().mockResolvedValueOnce(
        ok("https://gitlab.com/g/p/-/issues/1\n"),
      );
      const provider = new GitLabProvider(exec, "/my/project");

      await provider.createIssue({ title: "Test" });

      expect(exec.mock.calls[0][2]).toEqual({ cwd: "/my/project" });
    });
  });
});
