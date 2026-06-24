import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";

export interface OrchestratorWriteInput {
  name: string;
  scope: "all" | string[];
  agent?: string;
  /** Display label — stored as the `name` field in config. */
  label?: string;
}

export interface OrchestratorUpdateInput {
  /** Display label. */
  name?: string;
  scope?: "all" | string[];
  discover?: boolean;
}

function readOrchMap(configPath: string): {
  doc: Record<string, unknown>;
  orchMap: Record<string, Record<string, unknown>>;
  key: "orchestrators" | "metaOrchestrators";
} {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  const key: "orchestrators" | "metaOrchestrators" = doc.orchestrators
    ? "orchestrators"
    : "metaOrchestrators";
  const orchMap = (doc[key] ?? {}) as Record<string, Record<string, unknown>>;
  return { doc, orchMap, key };
}

function writeOrchMap(
  configPath: string,
  doc: Record<string, unknown>,
  orchMap: Record<string, Record<string, unknown>>,
  key: "orchestrators" | "metaOrchestrators",
): void {
  doc[key] = orchMap;
  writeFileSync(configPath, stringify(doc), "utf-8");
}

/**
 * Append a new orchestrator entry. Auto-assigns a stable UUID as `id`.
 * The optional `label` is stored as the `name` field (display label).
 */
export function appendOrchestrator(configPath: string, input: OrchestratorWriteInput): void {
  const { doc, orchMap } = readOrchMap(configPath);
  orchMap[input.name] = {
    id: randomUUID(),
    scope: input.scope,
    discover: true,
    ...(input.label !== undefined ? { name: input.label } : {}),
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.orchestrators = orchMap;
  writeFileSync(configPath, stringify(doc), "utf-8");
}

/**
 * Assign UUIDs to orchestrator entries missing them and migrate legacy
 * `{ projects: string[] }` scope to `string[]`. No-op when all entries
 * already have UUIDs and correct scope format.
 */
export function ensureOrchestratorUUIDs(configPath: string): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  let dirty = false;

  for (const entry of Object.values(orchMap)) {
    if (!entry.id) {
      entry.id = randomUUID();
      dirty = true;
    }
    const scope = entry.scope as unknown;
    if (scope && typeof scope === "object" && !Array.isArray(scope)) {
      const legacy = scope as { projects?: unknown };
      if (Array.isArray(legacy.projects)) {
        entry.scope = legacy.projects as string[];
        dirty = true;
      }
    }
  }

  if (dirty) writeOrchMap(configPath, doc, orchMap, key);
}

/**
 * Update fields of the orchestrator identified by UUID.
 * Throws if no entry with that `id` exists.
 */
export function updateOrchestrator(
  configPath: string,
  id: string,
  updates: OrchestratorUpdateInput,
): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  const entry = Object.values(orchMap).find((v) => v.id === id);
  if (!entry) throw new Error(`Orchestrator with id '${id}' not found`);

  if (updates.name !== undefined) entry.name = updates.name;
  if (updates.scope !== undefined) entry.scope = updates.scope;
  if (updates.discover !== undefined) entry.discover = updates.discover;

  writeOrchMap(configPath, doc, orchMap, key);
}

/**
 * Remove the orchestrator entry identified by UUID.
 * Throws if no entry with that `id` exists.
 */
export function deleteOrchestrator(configPath: string, id: string): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  const slug = Object.keys(orchMap).find((k) => orchMap[k].id === id);
  if (!slug) throw new Error(`Orchestrator with id '${id}' not found`);

  delete orchMap[slug];
  writeOrchMap(configPath, doc, orchMap, key);
}
