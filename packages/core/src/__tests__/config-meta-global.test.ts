import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig, validateWrappedConfig } from "../config.js";
import { generateOrchestratorPrompt } from "../orchestrator-prompt.js";

// Regression test for ath-rev-14 #2: metaOrchestrators must survive loading the
// canonical global config (~/.agent-orchestrator/config.yaml) — the path
// buildEffectiveConfigFromGlobalConfigPath takes — not be dropped while the
// effective config is rebuilt field-by-field.
describe("metaOrchestrators via the global config path", () => {
  let tempRoot: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `ao-meta-global-${randomUUID()}`);
    mkdirSync(join(tempRoot, ".agent-orchestrator"), { recursive: true });
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempRoot;
    process.env["USERPROFILE"] = tempRoot;
  });

  afterEach(() => {
    process.env["HOME"] = originalHome;
    process.env["USERPROFILE"] = originalUserProfile;
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("preserves metaOrchestrators so meta-start can resolve the named meta", () => {
    const configPath = join(tempRoot, ".agent-orchestrator", "config.yaml");
    writeFileSync(
      configPath,
      [
        "projects: {}",
        "metaOrchestrators:",
        "  platform:",
        "    scope: all",
        "  meta-1:",
        "    scope: all",
        "    rules: prefer api for billing",
        "",
      ].join("\n"),
    );

    const config = loadConfig(configPath);

    // The whole point: not dropped by the effective-config builder.
    expect(config.metaOrchestrators).toBeDefined();
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
    expect(config.metaOrchestrators?.["meta-1"].scope).toBe("all");

    // And `athene meta-start meta-1` resolves it instead of "Unknown meta orchestrator".
    const prompt = generateOrchestratorPrompt({ config, name: "meta-1" });
    expect(prompt).toContain("meta-1");
    expect(prompt).toContain("prefer api for billing");
  });

  it("loads a multi-project explicit scope (directory paths, not project IDs)", () => {
    mkdirSync(join(tempRoot, "web"), { recursive: true });
    mkdirSync(join(tempRoot, "api"), { recursive: true });
    const configPath = join(tempRoot, ".agent-orchestrator", "config.yaml");
    writeFileSync(
      configPath,
      [
        "projects:",
        "  web:",
        `    path: ${join(tempRoot, "web")}`,
        "  api:",
        `    path: ${join(tempRoot, "api")}`,
        "metaOrchestrators:",
        "  meta-1:",
        "    scope:",
        `      - ${join(tempRoot, "web")}`,
        `      - ${join(tempRoot, "api")}`,
        "",
      ].join("\n"),
    );

    const config = loadConfig(configPath);
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
    expect(config.metaOrchestrators?.["meta-1"].scope).toEqual([
      join(tempRoot, "web"),
      join(tempRoot, "api"),
    ]);
  });

  it("loads without error when scope references a directory path not in projects (no registry validation)", () => {
    mkdirSync(join(tempRoot, "web"), { recursive: true });
    const configPath = join(tempRoot, ".agent-orchestrator", "config.yaml");
    writeFileSync(
      configPath,
      [
        "projects:",
        "  web:",
        `    path: ${join(tempRoot, "web")}`,
        "metaOrchestrators:",
        "  meta-1:",
        "    scope:",
        `      - ${join(tempRoot, "web")}`,
        `      - ${join(tempRoot, "ghost")}`,
        "",
      ].join("\n"),
    );

    // Scope is directory paths — no registry validation, so this must not throw.
    expect(() => loadConfig(configPath)).not.toThrow();
  });

  it("wrapped local config with directory-path scope loads", () => {
    const projDir = join(tempRoot, "proj");
    mkdirSync(projDir, { recursive: true });
    mkdirSync(join(tempRoot, "web"), { recursive: true });
    mkdirSync(join(tempRoot, "api"), { recursive: true });
    const wrappedPath = join(projDir, "agent-orchestrator.yaml");
    writeFileSync(
      wrappedPath,
      [
        "projects:",
        "  web:",
        `    path: ${join(tempRoot, "web")}`,
        "  api:",
        `    path: ${join(tempRoot, "api")}`,
        "metaOrchestrators:",
        "  meta-1:",
        "    scope:",
        `      - ${join(tempRoot, "web")}`,
        `      - ${join(tempRoot, "api")}`,
        "",
      ].join("\n"),
    );
    const config = loadConfig(wrappedPath);
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
  });
});

// Regression: orchestrators key written by appendOrchestrator must survive
// buildEffectiveConfigFromGlobalConfigPath (it previously only forwarded metaOrchestrators).
describe("orchestrators key preserved through global config path", () => {
  let tempRoot: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `ao-orch-global-${randomUUID()}`);
    mkdirSync(join(tempRoot, ".agent-orchestrator"), { recursive: true });
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempRoot;
    process.env["USERPROFILE"] = tempRoot;
  });

  afterEach(() => {
    process.env["HOME"] = originalHome;
    process.env["USERPROFILE"] = originalUserProfile;
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("preserves orchestrators key so generateOrchestratorPrompt does not throw Unknown orchestrator", () => {
    const configPath = join(tempRoot, ".agent-orchestrator", "config.yaml");
    writeFileSync(
      configPath,
      [
        "projects: {}",
        "orchestrators:",
        "  fleet:",
        "    scope: all",
        "",
      ].join("\n"),
    );

    const config = loadConfig(configPath);
    expect(config.orchestrators?.["fleet"]).toBeDefined();

    // This must not throw "Unknown orchestrator: fleet"
    const prompt = generateOrchestratorPrompt({ config, name: "fleet" });
    expect(prompt).toContain("fleet");
  });
});

// dual-read: metaOrchestrators in global config is exposed as orchestrators
describe("dual-read: metaOrchestrators in global config", () => {
  let tempRoot: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `ao-meta-dualread-${randomUUID()}`);
    mkdirSync(join(tempRoot, ".agent-orchestrator"), { recursive: true });
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = tempRoot;
    process.env["USERPROFILE"] = tempRoot;
  });

  afterEach(() => {
    process.env["HOME"] = originalHome;
    process.env["USERPROFILE"] = originalUserProfile;
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("loads metaOrchestrators from global config and exposes as orchestrators", () => {
    const configPath = join(tempRoot, ".agent-orchestrator", "config.yaml");
    writeFileSync(
      configPath,
      ["projects: {}", "metaOrchestrators:", "  g1:", "    scope: all", ""].join("\n"),
    );
    const config = loadConfig(configPath);
    expect(config.metaOrchestrators?.g1 ?? config.orchestrators?.g1).toBeDefined();
  });
});

// ath-rev-21 #2: the canonical-global branch is
// `buildEffectiveConfigFromGlobalConfigPath(path) ?? validateWrappedConfig(normalizedParsed)`.
// Scope now uses directory paths — no registry validation. These tests confirm the
// new behavior: validateWrappedConfig accepts any directory-path scope without throwing.
describe("validateWrappedConfig (canonical-global fallback guard)", () => {
  it("does not throw on a scope with directory paths (no registry validation)", () => {
    expect(() =>
      validateWrappedConfig({
        projects: { web: { path: "/tmp/web" } },
        metaOrchestrators: { "meta-1": { scope: ["/tmp/web", "/tmp/ghost"] } },
      }),
    ).not.toThrow();
  });

  it("accepts a directory-path scope", () => {
    const config = validateWrappedConfig({
      projects: { web: { path: "/tmp/web" }, api: { path: "/tmp/api" } },
      metaOrchestrators: { "meta-1": { scope: ["/tmp/web", "/tmp/api"] } },
    });
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
    expect(config.metaOrchestrators?.["meta-1"].scope).toEqual(["/tmp/web", "/tmp/api"]);
  });
});
