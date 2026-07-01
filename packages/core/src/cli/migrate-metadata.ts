#!/usr/bin/env node
/**
 * One-shot migration: reads all flat-file session metadata directories and
 * inserts them into the per-project SQLite database. Safe to run multiple
 * times — existing sessions are skipped (checked via store.get before create).
 */
import { readdirSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { openDb } from "../db.js";
import { createSessionStore } from "../session-store.js";
import { createInitialCanonicalLifecycle } from "../lifecycle-state.js";
import { createActivitySignal } from "../activity-signal.js";

const AO_HOME = join(homedir(), ".agent-orchestrator");
const PROJECTS_DIR = join(AO_HOME, "projects");

function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") result[k] = v;
      else if (v !== null && v !== undefined) result[k] = JSON.stringify(v);
    }
  } catch {
    // Legacy key=value format (pre-JSON)
    for (const line of text.split("\n")) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      result[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return result;
}

async function migrate(): Promise<void> {
  if (!existsSync(PROJECTS_DIR)) {
    console.log(`No projects directory found at ${PROJECTS_DIR} — nothing to migrate.`);
    return;
  }

  const projectIds = readdirSync(PROJECTS_DIR).filter((d) => {
    const sessionsDir = join(PROJECTS_DIR, d, "sessions");
    return existsSync(sessionsDir);
  });

  if (projectIds.length === 0) {
    console.log("No projects with sessions found — nothing to migrate.");
    return;
  }

  for (const projectId of projectIds) {
    const projectDir = join(PROJECTS_DIR, projectId);
    const sessionsDir = join(projectDir, "sessions");
    const dbPath = join(projectDir, "athene.db");

    mkdirSync(projectDir, { recursive: true });
    const db = openDb(dbPath);
    const store = createSessionStore(db);

    const sessionFiles = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    console.log(
      `Migrating ${sessionFiles.length} sessions for project ${projectId}...`,
    );

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of sessionFiles) {
      const sessionId = file.slice(0, -".json".length);
      if (!sessionId || sessionId.startsWith(".")) continue;

      const sessionFile = join(sessionsDir, file);
      if (!existsSync(sessionFile)) continue;

      // Skip if already migrated
      try {
        if (store.get(sessionId)) {
          skipped++;
          continue;
        }
      } catch {
        // Store.get may fail if schema is out of date — try create anyway
      }

      try {
        const raw = parseKV(readFileSync(sessionFile, "utf-8").trim());

        const lifecycle = raw["lifecycle"]
          ? (JSON.parse(raw["lifecycle"]) as ReturnType<typeof createInitialCanonicalLifecycle>)
          : createInitialCanonicalLifecycle("worker", new Date(parseInt(raw["createdAt"] ?? "0", 10) || Date.now()));

        const createdAtMs = raw["createdAt"]
          ? (new Date(raw["createdAt"]).getTime() || parseInt(raw["createdAt"], 10) || Date.now())
          : Date.now();

        store.create({
          id: sessionId,
          projectId: raw["project"] ?? projectId,
          status: "done",
          activity: null,
          activitySignal: createActivitySignal("unavailable"),
          lifecycle,
          branch: raw["branch"] ?? null,
          issueId: raw["issue"] ?? null,
          pr: null,
          prs: [],
          workspacePath: raw["worktree"] ?? raw["workspacePath"] ?? null,
          runtimeHandle: raw["runtimeHandle"] ? JSON.parse(raw["runtimeHandle"]) : null,
          agentInfo: null,
          createdAt: new Date(createdAtMs),
          lastActivityAt: new Date(createdAtMs),
          metadata: raw,
        });

        // Persist all KV pairs so plugin-specific keys survive
        for (const [key, value] of Object.entries(raw)) {
          store.setKV(sessionId, key, value);
        }

        migrated++;
      } catch (err) {
        console.warn(`  Skipping session ${sessionId}: ${(err as Error).message}`);
        errors++;
      }
    }

    db.close();
    console.log(
      `  Done: ${projectId} — ${migrated} migrated, ${skipped} skipped, ${errors} errors`,
    );
  }

  console.log("Migration complete.");
}

migrate().catch(console.error);
