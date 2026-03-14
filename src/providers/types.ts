/**
 * Core types for gsd-issues provider abstraction.
 *
 * These types define the contract consumed by S02–S05.
 * Provider implementations (GitLab, GitHub) implement IssueProvider.
 * All CLI interactions go through ExecFn (matching pi.exec() signature).
 */

// ── ExecFn: matches pi.exec() signature ──

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Function signature matching `pi.exec()`.
 * shell: false — no piping, no globbing, no shell expansion.
 */
export type ExecFn = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

// ── Issue types ──

export interface Issue {
  /** Provider-specific issue ID (IID for GitLab, number for GitHub) */
  id: number;
  /** Issue title */
  title: string;
  /** Issue state: open or closed */
  state: "open" | "closed";
  /** Full URL to the issue in the web UI */
  url: string;
  /** Labels attached to the issue */
  labels: string[];
}

export interface CreateIssueOpts {
  title: string;
  description?: string;
  milestone?: string;
  assignee?: string;
  labels?: string[];
  weight?: number;
}

export interface CloseIssueOpts {
  issueId: number;
  /** GitHub-only: 'completed' | 'not planned'. Ignored by GitLab. */
  reason?: "completed" | "not planned";
  /** GitLab-only: label to add on close (e.g. a "done" label). */
  doneLabel?: string;
}

export interface IssueFilter {
  state?: "open" | "closed" | "all";
  milestone?: string;
  labels?: string[];
  assignee?: string;
}

// ── IssueProvider interface ──

export interface IssueProvider {
  /** Provider name for diagnostics */
  readonly name: "github" | "gitlab";

  /** Create an issue, return the created issue with its ID */
  createIssue(opts: CreateIssueOpts): Promise<Issue>;

  /** Close an issue by ID */
  closeIssue(opts: CloseIssueOpts): Promise<void>;

  /** List issues matching the filter */
  listIssues(filter?: IssueFilter): Promise<Issue[]>;

  /** Add labels to an existing issue */
  addLabels(issueId: number, labels: string[]): Promise<void>;
}

// ── Issue map persistence ──

export interface IssueMapEntry {
  /** Local identifier (e.g. slice ID like "S01") */
  localId: string;
  /** Provider issue ID */
  issueId: number;
  /** Provider name */
  provider: "github" | "gitlab";
  /** Full URL to the issue */
  url: string;
  /** When this mapping was created */
  createdAt: string;
}

// ── ProviderError ──

/**
 * Typed error for all provider failures.
 * Carries diagnostic context so a future agent can inspect
 * exactly which CLI call failed and why.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly operation: string,
    public readonly exitCode: number,
    public readonly stderr: string,
    public readonly command: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
