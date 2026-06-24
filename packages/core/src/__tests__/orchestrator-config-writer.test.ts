import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import {
  appendOrchestrator,
  ensureOrchestratorUUIDs,
  updateOrchestrator,
  deleteOrchestrator,
} from "../orchestrator-config-writer.js";

describe("appendOrchestrator", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("adds a new entry to a config with no existing orchestrators", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, { name: "main", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("main:");
    expect(result).toContain("scope: all");
    expect(result).toContain("discover: true");
    expect(result).toContain("orchestrators:");
    expect(result).not.toContain("metaOrchestrators:");
  });

  it("adds a new entry alongside an existing orchestrators block", () => {
    writeFileSync(
      configPath,
      "projects: {}\norchestrators:\n  existing:\n    scope: all\n    discover: true\n",
      "utf-8",
    );

    appendOrchestrator(configPath, { name: "new-one", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("existing:");
    expect(result).toContain("new-one:");
  });

  it("writes explicit project scope as array", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, {
      name: "scoped",
      scope: ["/path/to/proj-a", "/path/to/proj-b"],
    });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("proj-a");
    expect(result).toContain("proj-b");
  });

  it("writes agent field when provided", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, { name: "m", scope: "all", agent: "codex" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("agent: codex");
  });

  it("omits agent field when not provided", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, { name: "m", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).not.toContain("agent:");
  });

  it("always sets discover: true", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, { name: "m", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("discover: true");
  });

  it("leaves a pre-existing metaOrchestrators key untouched", () => {
    writeFileSync(
      configPath,
      "projects: {}\nmetaOrchestrators:\n  legacy:\n    scope: all\n    discover: true\n",
      "utf-8",
    );

    appendOrchestrator(configPath, { name: "new-one", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("metaOrchestrators:");
    expect(result).toContain("legacy:");
    expect(result).toContain("orchestrators:");
    expect(result).toContain("new-one:");
  });
});

describe("appendOrchestrator — UUID and label", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("assigns a UUID to newly appended orchestrators", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    appendOrchestrator(configPath, { name: "my-orch", scope: "all" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("stores the optional display label as the 'name' field", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    appendOrchestrator(configPath, { name: "my-orch", scope: "all", label: "My Orch" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"].name).toBe("My Orch");
  });
});

describe("ensureOrchestratorUUIDs", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("assigns UUIDs to entries missing them and writes back", () => {
    writeFileSync(
      configPath,
      `projects: {}\norchestrators:\n  existing:\n    scope: all\n    discover: false\n`,
      "utf-8",
    );
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["existing"].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("does not overwrite existing UUIDs", () => {
    const existingId = "11111111-1111-1111-1111-111111111111";
    writeFileSync(
      configPath,
      `projects: {}\norchestrators:\n  existing:\n    id: "${existingId}"\n    scope: all\n`,
      "utf-8",
    );
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["existing"].id).toBe(existingId);
  });

  it("migrates legacy { projects: string[] } scope to string[]", () => {
    writeFileSync(
      configPath,
      `projects: {}\norchestrators:\n  existing:\n    scope:\n      projects:\n        - /tmp/repo\n`,
      "utf-8",
    );
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(Array.isArray(orchs["existing"].scope)).toBe(true);
    expect(orchs["existing"].scope).toEqual(["/tmp/repo"]);
  });

  it("is a no-op when all entries already have UUIDs", () => {
    const content = `projects: {}\norchestrators:\n  existing:\n    id: "22222222-2222-2222-2222-222222222222"\n    scope: all\n`;
    writeFileSync(configPath, content, "utf-8");
    ensureOrchestratorUUIDs(configPath);
    expect(readFileSync(configPath, "utf-8")).toBe(readFileSync(configPath, "utf-8")); // no change
  });
});

describe("updateOrchestrator", () => {
  let tmpDir: string;
  let configPath: string;
  const id = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
    writeFileSync(
      configPath,
      `projects: {}\norchestrators:\n  my-orch:\n    id: "${id}"\n    scope: all\n    discover: false\n`,
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("updates the display name by UUID", () => {
    updateOrchestrator(configPath, id, { name: "Updated" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"].name).toBe("Updated");
  });

  it("updates scope by UUID", () => {
    updateOrchestrator(configPath, id, { scope: ["/tmp/repo"] });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"].scope).toEqual(["/tmp/repo"]);
  });

  it("updates discover by UUID", () => {
    updateOrchestrator(configPath, id, { discover: true });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"].discover).toBe(true);
  });

  it("throws when UUID not found", () => {
    expect(() => updateOrchestrator(configPath, "nonexistent", {})).toThrow("not found");
  });
});

describe("deleteOrchestrator", () => {
  let tmpDir: string;
  let configPath: string;
  const id = "44444444-4444-4444-4444-444444444444";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("removes the entry by UUID", () => {
    writeFileSync(
      configPath,
      `projects: {}\norchestrators:\n  my-orch:\n    id: "${id}"\n    scope: all\n`,
      "utf-8",
    );
    deleteOrchestrator(configPath, id);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = doc.orchestrators as Record<string, Record<string, unknown>>;
    expect(orchs["my-orch"]).toBeUndefined();
  });

  it("throws when UUID not found", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    expect(() => deleteOrchestrator(configPath, "nonexistent")).toThrow("not found");
  });
});
