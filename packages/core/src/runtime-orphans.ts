/**
 * Runtime orphan reconciliation.
 *
 * AO spawns one runtime session (tmux session / pty-host) per worker. When a
 * session's tracked metadata is removed or marked terminal but its runtime
 * session lingers, that runtime session becomes an *orphan* — it leaks memory
 * and CPU with nothing tracking it. This module reconciles the set of live
 * runtime sessions against tracked session metadata and reaps the orphans.
 *
 * CRITICAL SAFETY: only sessions whose names match the AO naming convention
 * (`<sessionPrefix>-<number>`) are ever considered. Human-created tmux sessions
 * — or AO orchestrator sessions, which are deliberately excluded — are never
 * selected for reaping. See `isAoRuntimeSessionName`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isWindows } from "./platform.js";
import type { Runtime, RuntimeSessionSummary } from "./types.js";

const execFileAsync = promisify(execFile);

/** Default grace period before a never-tracked runtime session can be reaped. */
export const DEFAULT_ORPHAN_GRACE_MS = 120_000;

/**
 * CRITICAL SAFETY filter. Returns true ONLY for runtime session names that
 * follow AO's worker naming convention `<sessionPrefix>-<number>` for one of the
 * supplied project prefixes. Anchored and prefix-escaped so arbitrary human
 * sessions can never match. Orchestrator sessions (`<prefix>-orchestrator[-n]`)
 * are intentionally NOT matched — they are long-lived coordinators and are left
 * alone.
 */
export function isAoRuntimeSessionName(
  name: string,
  sessionPrefixes: Iterable<string>,
): boolean {
  for (const prefix of sessionPrefixes) {
    if (!prefix) continue;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`^${escaped}-\\d+$`).test(name)) return true;
  }
  return false;
}

export interface RuntimeOrphanInput {
  /** Every live runtime session observed (across one runtime). */
  liveSessions: RuntimeSessionSummary[];
  /** Ids of tracked sessions that are NON-terminal (still alive in AO's view). */
  activeTrackedIds: Set<string>;
  /** Project session prefixes the matcher is allowed to consider. */
  sessionPrefixes: string[];
  /** Sessions younger than this (by createdAt) are spared (create/race window). */
  graceMs: number;
  /** Current time in epoch ms. */
  nowMs: number;
}

/**
 * Pure reconciliation: an AO-named runtime session is an orphan when it has no
 * non-terminal tracked session AND it is older than the grace period. Sessions
 * with an unknown createdAt cannot be grace-gated and are eligible immediately.
 */
export function findRuntimeOrphans(input: RuntimeOrphanInput): RuntimeSessionSummary[] {
  const { liveSessions, activeTrackedIds, sessionPrefixes, graceMs, nowMs } = input;
  return liveSessions.filter((s) => {
    if (!isAoRuntimeSessionName(s.id, sessionPrefixes)) return false; // SAFETY gate
    if (activeTrackedIds.has(s.id)) return false; // tracked & non-terminal → keep
    if (typeof s.createdAt === "number" && nowMs - s.createdAt < graceMs) return false;
    return true;
  });
}

export interface RuntimeForReconcile {
  runtime: Runtime;
  /** Prefixes whose sessions this runtime may own. */
  sessionPrefixes: string[];
}

export interface OrphanReapOutcome {
  id: string;
  runtimeName: string;
  reaped: boolean;
  error?: string;
}

export interface RuntimeOrphanReport {
  /** Every live AO-named runtime session seen, across all runtimes. */
  liveAoSessions: RuntimeSessionSummary[];
  /** The subset judged to be orphans. */
  orphans: RuntimeSessionSummary[];
  /** Per-orphan reap outcomes (empty when reap is false). */
  outcomes: OrphanReapOutcome[];
}

export interface ReconcileRuntimeOrphansOptions {
  runtimes: RuntimeForReconcile[];
  activeTrackedIds: Set<string>;
  graceMs?: number;
  nowMs?: number;
  /** When true, orphans are destroyed; otherwise the report is detection-only. */
  reap?: boolean;
  /** Optional logger invoked once per reaped (or failed) orphan. */
  log?: (message: string, data: Record<string, unknown>) => void;
}

/**
 * Enumerate live runtime sessions, find orphans, and (optionally) reap them via
 * `Runtime.destroy()`. Best-effort and resilient: runtimes without
 * `listSessions` are skipped, enumeration failures are swallowed, and a single
 * failed destroy is recorded without aborting the rest.
 */
export async function reconcileRuntimeOrphans(
  options: ReconcileRuntimeOrphansOptions,
): Promise<RuntimeOrphanReport> {
  const {
    runtimes,
    activeTrackedIds,
    graceMs = DEFAULT_ORPHAN_GRACE_MS,
    nowMs = Date.now(),
    reap = false,
    log,
  } = options;

  const liveAoSessions: RuntimeSessionSummary[] = [];
  const orphans: RuntimeSessionSummary[] = [];
  const outcomes: OrphanReapOutcome[] = [];

  for (const { runtime, sessionPrefixes } of runtimes) {
    if (typeof runtime.listSessions !== "function") continue;

    let live: RuntimeSessionSummary[];
    try {
      live = await runtime.listSessions();
    } catch {
      continue; // enumeration is best-effort
    }

    for (const session of live) {
      if (isAoRuntimeSessionName(session.id, sessionPrefixes)) liveAoSessions.push(session);
    }

    const runtimeOrphans = findRuntimeOrphans({
      liveSessions: live,
      activeTrackedIds,
      sessionPrefixes,
      graceMs,
      nowMs,
    });

    for (const orphan of runtimeOrphans) {
      orphans.push(orphan);
      if (!reap) continue;
      try {
        await runtime.destroy({
          id: orphan.id,
          runtimeName: runtime.name,
          data: orphan.handleData ?? {},
        });
        outcomes.push({ id: orphan.id, runtimeName: runtime.name, reaped: true });
        log?.(`reaped orphan runtime session ${orphan.id}`, {
          sessionId: orphan.id,
          runtime: runtime.name,
          reason: "no non-terminal tracked session",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outcomes.push({ id: orphan.id, runtimeName: runtime.name, reaped: false, error: message });
        log?.(`failed to reap orphan runtime session ${orphan.id}`, {
          sessionId: orphan.id,
          runtime: runtime.name,
          error: message,
        });
      }
    }
  }

  return { liveAoSessions, orphans, outcomes };
}

export interface RuntimeResourceUsage {
  pid: number;
  rssMb?: number;
  cpuPercent?: number;
}

/**
 * Parse `ps -o pid=,rss=,pcpu=` output (rss in KB) into per-pid usage with RSS
 * converted to MB. Malformed rows are ignored.
 */
export function parsePsResourceOutput(output: string): Map<number, RuntimeResourceUsage> {
  const usage = new Map<number, RuntimeResourceUsage>();
  for (const rawLine of output.replaceAll("\r\n", "\n").split("\n")) {
    const parts = rawLine.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const rssKb = Number(parts[1]);
    const cpu = Number(parts[2]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (!Number.isFinite(rssKb) || !Number.isFinite(cpu)) continue;
    usage.set(pid, { pid, rssMb: Math.round(rssKb / 1024), cpuPercent: cpu });
  }
  return usage;
}

/**
 * Best-effort RSS/CPU lookup for a set of pids via `ps`. POSIX-only; returns an
 * empty map on Windows, when given no pids, or on any failure.
 */
export async function readProcessResourceUsage(
  pids: number[],
): Promise<Map<number, RuntimeResourceUsage>> {
  const valid = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  if (isWindows() || valid.length === 0) return new Map();
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-o", "pid=,rss=,pcpu=", "-p", valid.join(",")],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return parsePsResourceOutput(stdout);
  } catch {
    return new Map();
  }
}
