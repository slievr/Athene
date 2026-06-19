import chalk from "chalk";
import type {
  CIStatus,
  ReviewDecision,
  ActivityState,
  ContextWindowUsage,
} from "@made-by-moonlight/athene-core";

/** Fraction above which a session's context window is flagged as nearly full. */
export const CONTEXT_WINDOW_WARN_PCT = 0.8;

export function header(title: string): string {
  const line = "─".repeat(76);
  return [
    chalk.dim(`┌${line}┐`),
    chalk.dim("│") + chalk.bold(` ${title}`.padEnd(76)) + chalk.dim("│"),
    chalk.dim(`└${line}┘`),
  ].join("\n");
}

export function banner(title: string): string {
  const line = "═".repeat(76);
  return [
    chalk.dim(`╔${line}╗`),
    chalk.dim("║") + chalk.bold.cyan(` ${title}`.padEnd(76)) + chalk.dim("║"),
    chalk.dim(`╚${line}╝`),
  ].join("\n");
}

export function formatAge(epochMs: number): string {
  const diff = Math.floor((Date.now() - epochMs) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "working":
      return chalk.green(status);
    case "idle":
      return chalk.yellow(status);
    case "pr_open":
    case "review_pending":
      return chalk.blue(status);
    case "approved":
    case "mergeable":
    case "merged":
      return chalk.green(status);
    case "ci_failed":
    case "errored":
    case "stuck":
      return chalk.red(status);
    case "changes_requested":
    case "needs_input":
      return chalk.magenta(status);
    case "spawning":
      return chalk.cyan(status);
    case "killed":
    case "cleanup":
      return chalk.gray(status);
    default:
      return status;
  }
}

export function ciStatusIcon(status: CIStatus | null): string {
  switch (status) {
    case "passing":
      return chalk.green("pass");
    case "failing":
      return chalk.red("fail");
    case "pending":
      return chalk.yellow("pend");
    case "none":
    case null:
      return chalk.dim("-");
  }
}

export function reviewDecisionIcon(decision: ReviewDecision | null): string {
  switch (decision) {
    case "approved":
      return chalk.green("ok");
    case "changes_requested":
      return chalk.red("chg!");
    case "pending":
      return chalk.yellow("rev?");
    case "none":
    case null:
      return chalk.dim("-");
  }
}

export function activityIcon(activity: ActivityState | null): string {
  switch (activity) {
    case "active":
      return chalk.green("working");
    case "ready":
      return chalk.cyan("ready");
    case "idle":
      return chalk.yellow("idle");
    case "waiting_input":
      return chalk.magenta("waiting");
    case "blocked":
      return chalk.red("blocked");
    case "exited":
      return chalk.dim("exited");
    case null:
      return chalk.dim("unknown");
  }
}

/** Compact token count: 145000 → "145k", 1000000 → "1.0M". */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * Format context-window occupancy for terminal output, e.g. "ctx 145k/200k (73%)".
 * Flags occupancy over {@link CONTEXT_WINDOW_WARN_PCT} with a red warning marker.
 */
export function formatContextWindow(ctx: ContextWindowUsage): string {
  const pct = Math.round(ctx.pct * 100);
  const label = `ctx ${formatTokenCount(ctx.usedTokens)}/${formatTokenCount(ctx.limitTokens)} (${pct}%)`;
  if (ctx.pct > CONTEXT_WINDOW_WARN_PCT) return chalk.red(`⚠ ${label}`);
  if (pct >= 60) return chalk.yellow(label);
  return chalk.dim(label);
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** Pad/truncate a string to exactly `width` visible characters */
export function padCol(str: string, width: number): string {
  // Strip ANSI codes to measure visible length
  const visible = str.replace(ANSI_RE, "");
  if (visible.length > width) {
    // Truncate visible content, re-apply truncation
    const plain = visible.slice(0, width - 1) + "\u2026";
    return plain.padEnd(width);
  }
  // Pad with spaces based on visible length
  const padding = width - visible.length;
  return str + " ".repeat(Math.max(0, padding));
}
