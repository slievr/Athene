/**
 * Lifecycle State Machine — pure state transition and event mapping functions.
 *
 * This module contains stateless functions extracted from lifecycle-manager.ts
 * that operate on lifecycle state objects, session statuses, and event types.
 * All functions here are pure (no I/O, no side effects).
 */

import type {
  CanonicalSessionLifecycle,
  EventPriority,
  EventType,
  ProcessProbeResult,
  ReactionResult,
  SessionStatus,
} from "./types.js";
import { isProcessProbeIndeterminate } from "./types.js";

/** Probe result from a runtime or process liveness check. */
export interface ProbeResult {
  state: "alive" | "dead" | "unknown";
  failed: boolean;
  indeterminate?: boolean;
}

/** Infer a reasonable priority from event type. */
export function inferPriority(type: EventType): EventPriority {
  if (type.includes("stuck") || type.includes("needs_input") || type.includes("errored")) {
    return "urgent";
  }
  if (type.startsWith("summary.")) {
    return "info";
  }
  if (
    type.includes("approved") ||
    type.includes("ready") ||
    type.includes("merged") ||
    type.includes("completed")
  ) {
    return "action";
  }
  if (type.includes("fail") || type.includes("changes_requested") || type.includes("conflicts")) {
    return "warning";
  }
  return "info";
}

/** Determine which event type corresponds to a status transition. */
export function statusToEventType(
  _from: SessionStatus | undefined,
  to: SessionStatus,
): EventType | null {
  switch (to) {
    case "working":
      return "session.working";
    case "pr_open":
      return "pr.created";
    case "ci_failed":
      return "ci.failing";
    case "review_pending":
      return "review.pending";
    case "changes_requested":
      return "review.changes_requested";
    case "approved":
      return "review.approved";
    case "mergeable":
      return "merge.ready";
    case "merged":
      return "merge.completed";
    case "needs_input":
      return "session.needs_input";
    case "stuck":
      return "session.stuck";
    case "errored":
      return "session.errored";
    case "killed":
      return "session.killed";
    default:
      return null;
  }
}

/** Determine which event type corresponds to a PR state transition. */
export function prStateToEventType(
  from: CanonicalSessionLifecycle["pr"]["state"],
  to: CanonicalSessionLifecycle["pr"]["state"],
): EventType | null {
  if (from === to) return null;
  switch (to) {
    case "closed":
      return "pr.closed";
    default:
      return null;
  }
}

/** Map event type to reaction config key. */
export function eventToReactionKey(eventType: EventType): string | null {
  switch (eventType) {
    case "pr.closed":
      return "pr-closed";
    case "ci.failing":
      return "ci-failed";
    case "review.changes_requested":
      return "changes-requested";
    case "automated_review.found":
      return "bugbot-comments";
    case "merge.conflicts":
      return "merge-conflicts";
    case "merge.ready":
      return "approved-and-green";
    case "session.stuck":
      return "agent-stuck";
    case "session.needs_input":
      return "agent-needs-input";
    case "session.killed":
      return "agent-exited";
    case "summary.all_complete":
      return "all-complete";
    default:
      return null;
  }
}

/** Derive the log level for a status transition. */
export function transitionLogLevel(status: SessionStatus): "info" | "warn" | "error" {
  const eventType = statusToEventType(undefined, status);
  if (!eventType) {
    return "info";
  }
  const priority = inferPriority(eventType);
  if (priority === "urgent") {
    return "error";
  }
  if (priority === "warning") {
    return "warn";
  }
  return "info";
}

/** Convert a ProcessProbeResult to a normalized ProbeResult. */
export function processProbeResultToProbeResult(result: ProcessProbeResult): ProbeResult {
  if (isProcessProbeIndeterminate(result)) {
    return { state: "unknown", failed: false, indeterminate: true };
  }
  return { state: result ? "alive" : "dead", failed: false };
}

/** Split a space-separated evidence string into individual signal tokens. */
export function splitEvidenceSignals(evidence: string): string[] {
  return evidence
    .split(/\s+/)
    .map((signal) => signal.trim())
    .filter((signal) => signal.length > 0);
}

/** Extract the primary reason string from a canonical lifecycle for observability. */
export function primaryLifecycleReason(lifecycle: CanonicalSessionLifecycle): string {
  if (lifecycle.session.state === "detecting") return lifecycle.session.reason;
  if (lifecycle.pr.reason !== "not_created" && lifecycle.pr.reason !== "in_progress") {
    return lifecycle.pr.reason;
  }
  if (lifecycle.runtime.reason !== "process_running") {
    return lifecycle.runtime.reason;
  }
  return lifecycle.session.reason;
}

/** Build structured observability data for a lifecycle transition. */
export function buildTransitionObservabilityData(
  previous: CanonicalSessionLifecycle,
  next: CanonicalSessionLifecycle,
  oldStatus: SessionStatus,
  newStatus: SessionStatus,
  evidence: string,
  detectingAttempts: number,
  statusTransition: boolean,
  reaction?: { key: string; result: ReactionResult | null },
): Record<string, unknown> {
  return {
    oldStatus,
    newStatus,
    statusTransition,
    previousSessionState: previous.session.state,
    newSessionState: next.session.state,
    previousSessionReason: previous.session.reason,
    newSessionReason: next.session.reason,
    previousPRState: previous.pr.state,
    newPRState: next.pr.state,
    previousPRReason: previous.pr.reason,
    newPRReason: next.pr.reason,
    previousRuntimeState: previous.runtime.state,
    newRuntimeState: next.runtime.state,
    previousRuntimeReason: previous.runtime.reason,
    newRuntimeReason: next.runtime.reason,
    primaryReason: primaryLifecycleReason(next),
    evidence,
    signalsConsulted: splitEvidenceSignals(evidence),
    detectingAttempts,
    recoveryAction: reaction?.result?.action ?? null,
    reactionKey: reaction?.key ?? null,
    reactionSuccess: reaction?.result?.success ?? null,
    escalated: reaction?.result?.escalated ?? null,
  };
}
