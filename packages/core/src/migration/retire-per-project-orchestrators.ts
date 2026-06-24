import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { Runtime, RuntimeHandle } from "../types.js";
import { appendOrchestrator } from "../orchestrator-config-writer.js";

const MARKER_FILE = "retire-per-project-orchestrators.done";

export async function retirePerProjectOrchestrators(
  aoBaseDir: string,
  globalConfigPath: string,
  runtime: Runtime | null,
): Promise<void> {
  const markerPath = join(aoBaseDir, "migrations", MARKER_FILE);
  if (existsSync(markerPath)) return; // idempotent

  const projectsDir = join(aoBaseDir, "projects");
  if (existsSync(projectsDir)) {
    for (const projectId of readdirSync(projectsDir)) {
      if (projectId === "_meta") continue; // skip the reserved meta scope
      const sessionsDir = join(projectsDir, projectId, "sessions");
      if (!existsSync(sessionsDir)) continue;
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(sessionsDir, file);
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
          if (raw["role"] !== "orchestrator") continue;
          // Best-effort runtime kill (pass null when runtime not available)
          if (runtime) {
            try {
              const handle = typeof raw["runtimeHandle"] === "string"
                ? (JSON.parse(raw["runtimeHandle"]) as unknown)
                : raw["runtimeHandle"] ?? null;
              if (handle) await runtime.destroy(handle as RuntimeHandle).catch(() => {});
            } catch { /* ignore */ }
          }
          // Archive: move file to archive directory
          const archiveDir = join(aoBaseDir, "archive", projectId);
          mkdirSync(archiveDir, { recursive: true });
          const destPath = join(archiveDir, file);
          try {
            renameSync(filePath, destPath);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "EXDEV") {
              copyFileSync(filePath, destPath);
              unlinkSync(filePath);
            } else {
              throw err;
            }
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  // Rewrite _meta session roles from "meta-orchestrator" → "orchestrator"
  const metaDir = join(projectsDir, "_meta");
  if (existsSync(metaDir)) {
    for (const name of readdirSync(metaDir)) {
      const sessionsDir = join(metaDir, name, "sessions");
      if (!existsSync(sessionsDir)) continue;
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(sessionsDir, file);
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
          if (raw["role"] === "meta-orchestrator") {
            writeFileSync(filePath, JSON.stringify({ ...raw, role: "orchestrator" }, null, 2));
          }
        } catch { /* skip */ }
      }
    }
  }

  // Ensure default orchestrator entry in global config
  if (existsSync(globalConfigPath)) {
    try {
      const doc = (parse(readFileSync(globalConfigPath, "utf-8")) ?? {}) as Record<string, unknown>;
      const existing = (doc["orchestrators"] ?? doc["metaOrchestrators"] ?? {}) as Record<string, unknown>;
      if (!Object.hasOwn(existing, "default")) {
        appendOrchestrator(globalConfigPath, { name: "default", scope: "all" });
      }
    } catch { /* do not corrupt config on parse error */ }
  }

  // Write marker
  const migrationsDir = join(aoBaseDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(markerPath, "", "utf-8");
}
