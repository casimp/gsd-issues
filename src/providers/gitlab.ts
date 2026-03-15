/**
 * GitLab provider implementation.
 *
 * Wraps `glab` CLI calls through an injected ExecFn.
 * All operations use explicit argument arrays (shell: false).
 */

import type {
  ExecFn,
  Issue,
  IssueProvider,
  CreateIssueOpts,
  CloseIssueOpts,
  IssueFilter,
  CreatePROpts,
  PRResult,
} from "./types.js";
import { ProviderError } from "./types.js";

/** Regex to extract IID from a GitLab issue URL: .../issues/123 */
const ISSUE_URL_RE = /\/issues\/(\d+)/;

/** Regex to extract IID from a GitLab MR URL: .../merge_requests/123 */
const MR_URL_RE = /\/merge_requests\/(\d+)/;

/** Shape returned by `glab issue list --output json` */
interface GlabListItem {
  iid: number;
  title: string;
  state: string;
  web_url: string;
  labels: string[];
  weight: number | null;
  description: string | null;
  milestone: { title: string } | null;
  assignees: Array<{ username: string }>;
}

export class GitLabProvider implements IssueProvider {
  readonly name = "gitlab" as const;

  constructor(
    private readonly exec: ExecFn,
    private readonly projectPath?: string,
  ) {}

  async createIssue(opts: CreateIssueOpts): Promise<Issue> {
    const args = ["issue", "create", "--title", opts.title, "--yes", "--no-editor"];

    if (opts.description !== undefined) {
      args.push("--description", opts.description);
    }
    if (opts.milestone !== undefined) {
      args.push("--milestone", opts.milestone);
    }
    if (opts.assignee !== undefined) {
      args.push("--assignee", opts.assignee);
    }
    if (opts.weight !== undefined) {
      args.push("--weight", String(opts.weight));
    }
    if (opts.labels !== undefined && opts.labels.length > 0) {
      args.push("--label", opts.labels.join(","));
    }

    const result = await this.run("createIssue", args);

    const match = ISSUE_URL_RE.exec(result.stdout);
    if (!match) {
      throw new ProviderError(
        `Failed to parse issue IID from glab output: ${result.stdout.trim()}`,
        "gitlab",
        "createIssue",
        0,
        result.stderr,
        `glab ${args.join(" ")}`,
      );
    }

    const iid = parseInt(match[1], 10);
    if (!Number.isFinite(iid) || iid <= 0) {
      throw new ProviderError(
        `Parsed IID is not a positive integer: ${match[1]}`,
        "gitlab",
        "createIssue",
        0,
        result.stderr,
        `glab ${args.join(" ")}`,
      );
    }

    // Extract the full URL from stdout — the line containing the issue URL
    const urlLine = result.stdout.split("\n").find((l) => l.includes("/issues/"));
    const url = urlLine?.trim() ?? `https://gitlab.com/project/-/issues/${iid}`;

    return {
      id: iid,
      title: opts.title,
      state: "open",
      url,
      labels: opts.labels ?? [],
    };
  }

  async closeIssue(opts: CloseIssueOpts): Promise<void> {
    await this.run("closeIssue", ["issue", "close", String(opts.issueId)]);

    if (opts.doneLabel) {
      await this.run("closeIssue", [
        "issue",
        "update",
        String(opts.issueId),
        "--label",
        opts.doneLabel,
      ]);
    }
  }

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const args = ["issue", "list", "--output", "json"];

    if (filter?.state && filter.state !== "all") {
      args.push("--state", filter.state === "open" ? "opened" : "closed");
    }
    if (filter?.milestone) {
      args.push("--milestone", filter.milestone);
    }
    if (filter?.labels && filter.labels.length > 0) {
      args.push("--label", filter.labels.join(","));
    }
    if (filter?.assignee) {
      args.push("--assignee", filter.assignee);
    }

    const result = await this.run("listIssues", args);

    const items: GlabListItem[] = JSON.parse(result.stdout);

    return items.map((item) => ({
      id: item.iid,
      title: item.title,
      state: (item.state === "opened" ? "open" : "closed") as "open" | "closed",
      url: item.web_url,
      labels: item.labels ?? [],
      weight: item.weight ?? undefined,
      milestone: item.milestone?.title,
      assignee: item.assignees?.[0]?.username,
      description: item.description ?? undefined,
    }));
  }

  async addLabels(issueId: number, labels: string[]): Promise<void> {
    await this.run("addLabels", [
      "issue",
      "update",
      String(issueId),
      "--label",
      labels.join(","),
    ]);
  }

  async createPR(opts: CreatePROpts): Promise<PRResult> {
    let description = opts.body;
    if (opts.closesIssueId !== undefined) {
      description += `\n\nCloses #${opts.closesIssueId}`;
    }

    const args = [
      "mr", "create",
      "--title", opts.title,
      "--description", description,
      "--target-branch", opts.baseBranch,
      "--source-branch", opts.headBranch,
      "--yes", "--no-editor",
    ];

    if (opts.draft) {
      args.push("--draft");
    }

    const result = await this.run("createPR", args);

    const match = MR_URL_RE.exec(result.stdout);
    if (!match) {
      throw new ProviderError(
        `Failed to parse MR IID from glab output: ${result.stdout.trim()}`,
        "gitlab",
        "createPR",
        0,
        result.stderr,
        `glab ${args.join(" ")}`,
      );
    }

    const mrIid = parseInt(match[1], 10);
    if (!Number.isFinite(mrIid) || mrIid <= 0) {
      throw new ProviderError(
        `Parsed MR IID is not a positive integer: ${match[1]}`,
        "gitlab",
        "createPR",
        0,
        result.stderr,
        `glab ${args.join(" ")}`,
      );
    }

    const urlLine = result.stdout.split("\n").find((l) => l.includes("/merge_requests/"));
    const url = urlLine?.trim() ?? `https://gitlab.com/project/-/merge_requests/${mrIid}`;

    return { url, number: mrIid };
  }

  /** Execute a glab command, throwing ProviderError on non-zero exit. */
  private async run(operation: string, args: string[]) {
    const execOpts = this.projectPath ? { cwd: this.projectPath } : undefined;
    const result = await this.exec("glab", args, execOpts);

    if (result.code !== 0) {
      throw new ProviderError(
        `glab ${args[0]} ${args[1] ?? ""} failed (exit ${result.code}): ${result.stderr.trim()}`,
        "gitlab",
        operation,
        result.code,
        result.stderr,
        `glab ${args.join(" ")}`,
      );
    }

    return result;
  }
}
