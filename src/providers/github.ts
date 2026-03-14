/**
 * GitHub provider implementation.
 *
 * Wraps `gh` CLI calls through an injected ExecFn.
 * All operations use explicit argument arrays (shell: false).
 */

import type {
  ExecFn,
  Issue,
  IssueProvider,
  CreateIssueOpts,
  CloseIssueOpts,
  IssueFilter,
} from "./types.js";
import { ProviderError } from "./types.js";

/** Regex to extract issue number from a GitHub issue URL: .../issues/42 */
const ISSUE_URL_RE = /\/issues\/(\d+)/;

/** Shape returned by `gh issue list --json ...` */
interface GhListItem {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: Array<{ name: string }>;
  milestone: { title: string } | null;
  assignees: Array<{ login: string }>;
  body: string | null;
}

export class GitHubProvider implements IssueProvider {
  readonly name = "github" as const;

  constructor(
    private readonly exec: ExecFn,
    private readonly projectPath?: string,
  ) {}

  async createIssue(opts: CreateIssueOpts): Promise<Issue> {
    const args = ["issue", "create", "--title", opts.title, "--body", opts.description ?? ""];

    if (opts.milestone !== undefined) {
      args.push("--milestone", opts.milestone);
    }
    if (opts.assignee !== undefined) {
      args.push("--assignee", opts.assignee);
    }
    if (opts.labels !== undefined && opts.labels.length > 0) {
      args.push("--label", opts.labels.join(","));
    }
    // weight is GitLab-only, ignored for GitHub

    const result = await this.run("createIssue", args);

    const match = ISSUE_URL_RE.exec(result.stdout);
    if (!match) {
      throw new ProviderError(
        `Failed to parse issue number from gh output: ${result.stdout.trim()}`,
        "github",
        "createIssue",
        0,
        result.stderr,
        `gh ${args.join(" ")}`,
      );
    }

    const issueNumber = parseInt(match[1], 10);
    if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
      throw new ProviderError(
        `Parsed issue number is not a positive integer: ${match[1]}`,
        "github",
        "createIssue",
        0,
        result.stderr,
        `gh ${args.join(" ")}`,
      );
    }

    // Extract the full URL from stdout
    const urlLine = result.stdout.split("\n").find((l) => l.includes("/issues/"));
    const url = urlLine?.trim() ?? `https://github.com/owner/repo/issues/${issueNumber}`;

    return {
      id: issueNumber,
      title: opts.title,
      state: "open",
      url,
      labels: opts.labels ?? [],
    };
  }

  async closeIssue(opts: CloseIssueOpts): Promise<void> {
    const args = ["issue", "close", String(opts.issueId)];

    if (opts.reason) {
      args.push("--reason", opts.reason);
    }

    await this.run("closeIssue", args);
  }

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const args = [
      "issue",
      "list",
      "--json",
      "number,title,state,url,labels,milestone,assignees,body",
    ];

    if (filter?.state && filter.state !== "all") {
      args.push("--state", filter.state);
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

    const items: GhListItem[] = JSON.parse(result.stdout);

    return items.map((item) => ({
      id: item.number,
      title: item.title,
      state: (item.state === "OPEN" ? "open" : "closed") as "open" | "closed",
      url: item.url,
      labels: (item.labels ?? []).map((l) => l.name),
      milestone: item.milestone?.title,
      assignee: item.assignees?.[0]?.login,
      description: item.body ?? undefined,
    }));
  }

  async addLabels(issueId: number, labels: string[]): Promise<void> {
    await this.run("addLabels", [
      "issue",
      "edit",
      String(issueId),
      "--add-label",
      labels.join(","),
    ]);
  }

  /** Execute a gh command, throwing ProviderError on non-zero exit. */
  private async run(operation: string, args: string[]) {
    const execOpts = this.projectPath ? { cwd: this.projectPath } : undefined;
    const result = await this.exec("gh", args, execOpts);

    if (result.code !== 0) {
      throw new ProviderError(
        `gh ${args[0]} ${args[1] ?? ""} failed (exit ${result.code}): ${result.stderr.trim()}`,
        "github",
        operation,
        result.code,
        result.stderr,
        `gh ${args.join(" ")}`,
      );
    }

    return result;
  }
}
