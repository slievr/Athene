"use client";

import { memo } from "react";
import type { ContextWindowUsage } from "@/lib/types";
import { formatContextWindowLabel, isContextWindowWarning } from "@/lib/context-window";

interface ContextWindowBadgeProps {
  contextWindow?: ContextWindowUsage | null;
  className?: string;
}

/**
 * Compact pill showing how full the agent's context window is right now.
 * Renders nothing when occupancy is unavailable (non-introspectable agents).
 * Tinted to the error token once occupancy passes the warning threshold.
 */
function ContextWindowBadgeView({ contextWindow, className }: ContextWindowBadgeProps) {
  if (!contextWindow) return null;

  const warning = isContextWindowWarning(contextWindow);
  const label = formatContextWindowLabel(contextWindow);
  const pct = Math.round(contextWindow.pct * 100);

  const classes = [
    "inline-flex items-center gap-1 rounded font-[var(--font-mono)] text-[10px] leading-none px-1.5 py-0.5",
    warning
      ? "bg-[color-mix(in_srgb,var(--color-status-error)_15%,transparent)] text-[var(--color-status-error)]"
      : "bg-[var(--color-bg-subtle)] text-[var(--color-text-tertiary)]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={`Context window ${pct}% full${warning ? " — nearly full" : ""}`}
      data-warning={warning ? "" : undefined}
    >
      {warning ? <span aria-hidden="true">⚠</span> : null}
      <span className="text-[var(--color-text-muted)]">ctx</span>
      <span>{label}</span>
    </span>
  );
}

export const ContextWindowBadge = memo(ContextWindowBadgeView);
