import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { retirePerProjectOrchestrators } from "../../migration/retire-per-project-orchestrators.js";

function makeFixture() {
  const base = mkdtempSync(join(tmpdir(), "ao-migration-test-"));
  // Per-project orchestrator under projects/proj1/sessions/
  const projSessions = join(base, "projects", "proj1", "sessions");
  mkdirSync(projSessions, { recursive: true });
  writeFileSync(join(projSessions, "proj1-orchestrator.json"), JSON.stringify({
    role: "orchestrator",
    project: "proj1",
    status: "working",
  }));

  // Meta orchestrator under projects/_meta/orch1/sessions/
  const metaSessions = join(base, "projects", "_meta", "orch1", "sessions");
  mkdirSync(metaSessions, { recursive: true });
  writeFileSync(join(metaSessions, "orch1.json"), JSON.stringify({
    role: "meta-orchestrator",
    project: "_meta",
    status: "idle",
  }));

  // Global config file
  const configPath = join(base, "config.yaml");
  writeFileSync(configPath, "metaOrchestrators:\n  orch1:\n    scope: all\n");

  // Marker dir
  const migrationsDir = join(base, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  return { base, projSessions, metaSessions, configPath, migrationsDir };
}

let fixture: ReturnType<typeof makeFixture>;

beforeEach(() => { fixture = makeFixture(); });
afterEach(() => rmSync(fixture.base, { recursive: true, force: true }));

it("archives per-project orchestrator session file", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  expect(existsSync(join(fixture.projSessions, "proj1-orchestrator.json"))).toBe(false);
  // archived
  const archiveDir = join(fixture.base, "archive");
  expect(existsSync(archiveDir)).toBe(true);
});

it("rewrites _meta session role to 'orchestrator'", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  const { readFileSync } = await import("node:fs");
  const raw = JSON.parse(readFileSync(join(fixture.metaSessions, "orch1.json"), "utf-8"));
  expect(raw.role).toBe("orchestrator");
});

it("ensures default orchestrator config entry", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  const { readFileSync } = await import("node:fs");
  const cfg = readFileSync(fixture.configPath, "utf-8");
  expect(cfg).toContain("default:");
});

it("writes marker file so migration does not re-run", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  expect(existsSync(join(fixture.base, "migrations", "retire-per-project-orchestrators.done"))).toBe(true);
});

it("is idempotent: second run is a no-op", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  // Run again — should not throw or corrupt state
  await expect(
    retirePerProjectOrchestrators(fixture.base, fixture.configPath, null)
  ).resolves.not.toThrow();
});
