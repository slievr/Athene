/**
 * Meta Orchestrator Prompt Generator — renders the portfolio-scoped coordinator
 * prompt. Injected via `athene meta-start <name>`.
 *
 * Mirrors orchestrator-prompt.ts but is self-contained: it renders the in-scope
 * project catalog, scope/discover settings, the dashboard URL, and an optional
 * project-specific rules block.
 */

import metaTemplate from "./prompts/meta-orchestrator.md";
import type { OrchestratorConfig } from "./types.js";
import { resolveInScopeProjects } from "./meta-scope.js";

export interface MetaOrchestratorPromptConfig {
  config: OrchestratorConfig;
  name: string;
}

interface MetaPromptRenderData {
  metaName: string;
  dashboardUrl: string;
  scopeDescription: string;
  discoverDescription: string;
  projectCatalog: string;
  rules: string;
}

function buildProjectCatalog(config: OrchestratorConfig, name: string): string {
  const meta = config.metaOrchestrators?.[name];
  if (!meta) {
    throw new Error(`Unknown meta orchestrator: ${name}`);
  }
  const inScope = resolveInScopeProjects(config, meta);
  if (inScope.length === 0) {
    return "_(no projects in scope yet)_";
  }
  return inScope
    .map(([id, project]) => {
      const repo = project.repo ?? "no repo";
      const prefix = project.sessionPrefix ?? id;
      const description = project.description ?? "no description";
      return `- ${id} (${repo}, prefix ${prefix}): ${description}`;
    })
    .join("\n");
}

function createRenderData(opts: MetaOrchestratorPromptConfig): MetaPromptRenderData {
  const meta = opts.config.metaOrchestrators?.[opts.name];
  if (!meta) {
    throw new Error(`Unknown meta orchestrator: ${opts.name}`);
  }
  const port = opts.config.port ?? 3000;
  const scopeDescription =
    meta.scope === "all"
      ? "all registered projects"
      : `projects: ${meta.scope.projects.join(", ")}`;

  return {
    metaName: opts.name,
    dashboardUrl: `http://localhost:${port}/meta/${opts.name}`,
    scopeDescription,
    // HONEST wording (ath-rev-23): there is NO live auto-discovery. The in-scope
    // project set is resolved from the global config at `meta-start`; to pick up
    // projects registered later, re-run `athene meta-start`.
    discoverDescription: meta.discover
      ? "requested, but live auto-discovery is not enabled in this version — the in-scope project set is resolved from the global config at `meta-start`. Re-run `athene meta-start` to refresh the catalog with newly-registered projects."
      : "off — the in-scope project set is resolved from the global config at `meta-start`. Re-run `athene meta-start` to pick up newly-registered projects.",
    projectCatalog: buildProjectCatalog(opts.config, opts.name),
    rules: meta.rules?.trim() ?? "",
  };
}

/**
 * Resolve a single optional section block: {{KEY_START}}...{{KEY_END}}.
 * When `keep` is false the whole block (including markers) is removed; when true
 * the markers are stripped and the inner content kept.
 */
function resolveOptionalSection(template: string, key: string, keep: boolean): string {
  const startMarker = `{{${key}_START}}`;
  const endMarker = `{{${key}_END}}`;
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker);
  if (start === -1 && end === -1) {
    return template;
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Malformed optional section block: expected ${startMarker} before ${endMarker}`);
  }
  const before = template.slice(0, start);
  const inner = template.slice(start + startMarker.length, end);
  const after = template.slice(end + endMarker.length);
  return keep ? `${before}${inner}${after}` : `${before}${after}`;
}

function renderTemplate(template: string, data: MetaPromptRenderData): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, rawKey: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, rawKey)) {
      throw new Error(`Unresolved template placeholder: ${rawKey}`);
    }
    return data[rawKey as keyof MetaPromptRenderData];
  });
}

/** Generate the meta orchestrator prompt content for the named meta orchestrator. */
export function generateMetaOrchestratorPrompt(opts: MetaOrchestratorPromptConfig): string {
  const data = createRenderData(opts);
  const withSections = resolveOptionalSection(
    metaTemplate.trim(),
    "RULES_SECTION",
    data.rules.length > 0,
  );
  return renderTemplate(withSections, data).trim();
}
