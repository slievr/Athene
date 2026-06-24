/**
 * Orchestrator Prompt Generator — renders the portfolio-scoped coordinator
 * prompt. Injected via `athene start <name>`.
 *
 * Renders the in-scope project catalog, scope/discover settings, the
 * dashboard URL, and an optional project-specific rules block.
 */

import orchestratorTemplate from "./prompts/orchestrator.md";
import type { OrchestratorConfig, OrchestratorEntryConfig } from "./types.js";
import { resolveInScopeProjects } from "./orchestrator-scope.js";

export interface OrchestratorPromptConfig {
  config: OrchestratorConfig;
  name: string;
}

interface OrchestratorPromptRenderData {
  metaName: string;
  dashboardUrl: string;
  scopeDescription: string;
  discoverDescription: string;
  projectCatalog: string;
  rules: string;
}

function buildProjectCatalog(config: OrchestratorConfig, name: string): string {
  const orchestrator = config.orchestrators?.[name];
  if (!orchestrator) {
    throw new Error(`Unknown orchestrator: ${name}`);
  }
  const inScope = resolveInScopeProjects(config, orchestrator);
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

function createRenderData(opts: OrchestratorPromptConfig): OrchestratorPromptRenderData {
  const orchestrator: OrchestratorEntryConfig | undefined = opts.config.orchestrators?.[opts.name];
  if (!orchestrator) {
    throw new Error(`Unknown orchestrator: ${opts.name}`);
  }
  const port = opts.config.port ?? 3000;
  const scopeDescription =
    orchestrator.scope === "all"
      ? "all registered projects"
      : `projects: ${orchestrator.scope.projects.join(", ")}`;

  return {
    metaName: opts.name,
    dashboardUrl: `http://localhost:${port}/meta/${opts.name}`,
    scopeDescription,
    discoverDescription: orchestrator.discover
      ? "enabled — newly-registered projects appear in `athene meta-status` and the dashboard immediately (both read live config); this prompt's catalog above is a snapshot from meta-start, so restart the orchestrator to surface new projects here"
      : "disabled",
    projectCatalog: buildProjectCatalog(opts.config, opts.name),
    rules: orchestrator.rules?.trim() ?? "",
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

function renderTemplate(template: string, data: OrchestratorPromptRenderData): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, rawKey: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, rawKey)) {
      throw new Error(`Unresolved template placeholder: ${rawKey}`);
    }
    return data[rawKey as keyof OrchestratorPromptRenderData];
  });
}

/** Generate the orchestrator prompt content for the named orchestrator. */
export function generateOrchestratorPrompt(opts: OrchestratorPromptConfig): string {
  const data = createRenderData(opts);
  const withSections = resolveOptionalSection(
    orchestratorTemplate.trim(),
    "RULES_SECTION",
    data.rules.length > 0,
  );
  return renderTemplate(withSections, data).trim();
}
