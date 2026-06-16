import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export interface MetaOrchestratorWriteInput {
  name: string;
  scope: "all" | { projects: string[] };
  agent?: string;
}

/**
 * Append a new meta orchestrator entry to the config YAML file at configPath.
 * Reads, merges, and writes back. Normalizes YAML formatting (comments lost).
 */
export function appendMetaOrchestrator(
  configPath: string,
  input: MetaOrchestratorWriteInput,
): void {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  const existing = (doc.metaOrchestrators ?? {}) as Record<string, unknown>;
  existing[input.name] = {
    scope: input.scope,
    discover: true,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.metaOrchestrators = existing;
  writeFileSync(configPath, stringify(doc), "utf-8");
}
