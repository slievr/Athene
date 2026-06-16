import type { Session } from "./types.js";

export interface SpawnCollisionResult {
  /** A live session that already owns the requested issueId, if any. */
  hard: Session | null;
  /** Live sessions in the target project (surfaced as advisory for freeform work). */
  advisory: Session[];
}

export interface SpawnCollisionIntent {
  projectId: string;
  issueId?: string;
}

/**
 * Pure collision check. Callers pass the already-filtered set of LIVE
 * (non-terminal) sessions, so this function does no I/O.
 *
 * - Issue-keyed work: hard collision if any live session in the target project
 *   already owns the same issue (regardless of which coordinator owns it).
 * - Freeform work: never hard; advisory = all live peers in the target project.
 */
export function checkSpawnCollision(
  liveSessions: Session[],
  intent: SpawnCollisionIntent,
): SpawnCollisionResult {
  const peers = liveSessions.filter((s) => s.projectId === intent.projectId);
  // Compare issue IDs case-insensitively to match the dedup batch-spawn uses
  // (it lowercases issue keys), so ENG-42 and eng-42 cannot both go live.
  const wantedIssue = intent.issueId?.toLowerCase();
  const hard = wantedIssue
    ? (peers.find((s) => s.issueId?.toLowerCase() === wantedIssue) ?? null)
    : null;
  return { hard, advisory: peers };
}

/** Human-readable refusal line, e.g. "web-2 already owns ENG-42 (owner=project, status=pr_open)". */
export function formatHardRefusal(existing: Session): string {
  const owner = existing.metadata?.["ownerKind"] === "meta" ? "meta" : "project";
  return `SPAWN REFUSED: ${existing.id} already owns ${existing.issueId} (owner=${owner}, status=${existing.status})`;
}
