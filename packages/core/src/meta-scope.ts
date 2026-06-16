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
 *   *since startup* — i.e. present in `config.projects` now but absent from
 *   `baselineProjectIds`.
 *
 * NOTE: not yet wired into the supervisor/polling loop — `discover` currently
 * takes effect on meta-orchestrator restart (the prompt catalog is generated once
 * at meta-start). This helper is the building block for a future live
 * prompt-refresh path; `meta-status`/dashboard already resolve scope live.
 *
 * IMPORTANT — `baselineProjectIds` MUST be the FULL set of project IDs that were
 * registered when the meta orchestrator started (e.g. `Object.keys(startupConfig.
 * projects)`), NOT the in-scope subset. Seeding it with the in-scope subset would
 * make every already-registered out-of-list project look "newly registered" on
 * the first reconcile and silently defeat the explicit allow-list. With the full
 * startup baseline, the first reconcile finds no new projects and returns exactly
 * the configured in-scope list. Pure — no I/O.
 */
export function reconcileMetaScopeIds(
  config: OrchestratorConfig,
  meta: MetaOrchestratorConfig,
  baselineProjectIds: string[],
): string[] {
  const base = resolveInScopeProjectIds(config, meta);
  if (meta.scope === "all" || !meta.discover) {
    return base;
  }
  const baseline = new Set(baselineProjectIds);
  const newlyRegistered = Object.keys(config.projects).filter((id) => !baseline.has(id));
  return Array.from(new Set([...base, ...newlyRegistered]));
}
