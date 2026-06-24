import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendOrchestrator } from "../orchestrator-config-writer.js";

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

  it("writes explicit project scope", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendOrchestrator(configPath, {
      name: "scoped",
      scope: { projects: ["proj-a", "proj-b"] },
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
