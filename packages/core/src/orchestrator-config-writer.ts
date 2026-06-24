import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export interface OrchestratorWriteInput {
  name: string;
  scope: "all" | { projects: string[] };
  agent?: string;
}

/**
 * Append a new orchestrator entry to the config YAML file at configPath.
 * Reads, merges, and writes back. Normalizes YAML formatting (comments lost).
 */
export function appendOrchestrator(configPath: string, input: OrchestratorWriteInput): void {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  // Write to `orchestrators`; a pre-existing `metaOrchestrators` key is left as-is
  // (dual-read handles it on load).
  const existing = (doc.orchestrators ?? {}) as Record<string, unknown>;
  existing[input.name] = {
    scope: input.scope,
    discover: true,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.orchestrators = existing;
  writeFileSync(configPath, stringify(doc), "utf-8");
}
