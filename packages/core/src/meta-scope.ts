/**
 * Resolve which projects a meta orchestrator can route into, from its scope.
 *
 * - scope "all"  → every registered project (insertion order preserved)
 * - scope list   → the listed project IDs that exist in config.projects
 *
 * Shared by the prompt generator (catalog rendering) and the supervisor's
 * `discover` reconcile path. Pure — no I/O.
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

/**
 * Reconcile a meta orchestrator's in-scope project set against the current
 * global config, so newly-registered projects become routable without a restart.
 *
 * - scope "all": always the full current project set (discover is redundant).
 * - explicit list, discover off: just the listed projects that still exist.
 * - explicit list, discover on: the listed projects PLUS any project registered
 *   since the last reconcile (i.e. present in config but absent from
 *   `previousIds`). This is the documented "discover also adds newly-registered
 *   projects" behavior.
 *
 * Pure — callers pass `previousIds` (the last reconciled set) and persist the
 * returned set as the new baseline.
 */
export function reconcileMetaScopeIds(
  config: OrchestratorConfig,
  meta: MetaOrchestratorConfig,
  previousIds: string[],
): string[] {
  const base = resolveInScopeProjectIds(config, meta);
  if (meta.scope === "all" || !meta.discover) {
    return base;
  }
  const known = new Set(previousIds);
  const newlyRegistered = Object.keys(config.projects).filter((id) => !known.has(id));
  return Array.from(new Set([...base, ...newlyRegistered]));
}
