/**
 * Resolve which projects a meta orchestrator can route into, from its scope.
 *
 * - scope "all"  → every registered project (insertion order preserved)
 * - scope list   → the listed project IDs that exist in config.projects
 *
 * Resolved against the GLOBAL registry at `meta-start` (resolve-at-start; there
 * is no live auto-discovery — re-run `meta-start` to refresh). Pure — no I/O.
 */
import type { MetaOrchestratorConfig, OrchestratorConfig, ProjectConfig } from "./types.js";

export function resolveInScopeProjects(
  config: OrchestratorConfig,
  meta: MetaOrchestratorConfig,
): Array<[string, ProjectConfig]> {
  const entries = Object.entries(config.projects);
  if (meta.scope === "all") {
    return entries;
  }
  const wanted = new Set(meta.scope.projects);
  return entries.filter(([id]) => wanted.has(id));
}

/** The ordered list of in-scope project IDs. */
export function resolveInScopeProjectIds(
  config: OrchestratorConfig,
  meta: MetaOrchestratorConfig,
): string[] {
  return resolveInScopeProjects(config, meta).map(([id]) => id);
}
