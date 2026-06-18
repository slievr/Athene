import type { ContextWindowUsage } from "@/lib/types";

/** Fraction above which the context window is flagged as nearly full. */
export const CONTEXT_WINDOW_WARN_PCT = 0.8;

/** Compact token count: 145000 → "145k", 1000000 → "1.0M". */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/** Human-readable occupancy label, e.g. "145k / 200k · 73%". */
export function formatContextWindowLabel(ctx: ContextWindowUsage): string {
  const pct = Math.round(ctx.pct * 100);
  return `${formatTokenCount(ctx.usedTokens)} / ${formatTokenCount(ctx.limitTokens)} · ${pct}%`;
}

/** True when occupancy exceeds the warning threshold. */
export function isContextWindowWarning(ctx: ContextWindowUsage): boolean {
  return ctx.pct > CONTEXT_WINDOW_WARN_PCT;
}
