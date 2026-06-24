import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig, validateWrappedConfig } from "../config.js";
import { generateMetaOrchestratorPrompt } from "../meta-orchestrator-prompt.js";

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
    const prompt = generateMetaOrchestratorPrompt({ config, name: "meta-1" });
    expect(prompt).toContain("meta-1");
    expect(prompt).toContain("prefer api for billing");
  });

  it("loads a multi-project explicit scope (validated against the full registry, not a projection)", () => {
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
        "      projects: [web, api]",
        "",
      ].join("\n"),
    );

    // Both web and api are registered, so the explicit scope must NOT throw even
    // if individual projects degrade during effective resolution.
    const config = loadConfig(configPath);
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
  });

  it("still fails loud when an explicit scope references a truly-unregistered project", () => {
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
        "      projects: [web, ghost]",
        "",
      ].join("\n"),
    );

    expect(() => loadConfig(configPath)).toThrow(/unknown project 'ghost'/);
  });

  it("wrapped local config fails loud on a meta scope referencing an unregistered project", () => {
    const projDir = join(tempRoot, "proj");
    mkdirSync(projDir, { recursive: true });
    const wrappedPath = join(projDir, "agent-orchestrator.yaml");
    writeFileSync(
      wrappedPath,
      [
        "projects:",
        "  web:",
        `    path: ${join(tempRoot, "web")}`,
        "metaOrchestrators:",
        "  meta-1:",
        "    scope:",
        "      projects: [web, ghost]",
        "",
      ].join("\n"),
    );
    expect(() => loadConfig(wrappedPath)).toThrow(/unknown project 'ghost'/);
  });

  it("wrapped local config with all-valid meta scope ids loads", () => {
    const projDir = join(tempRoot, "proj2");
    mkdirSync(projDir, { recursive: true });
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
        "      projects: [web, api]",
        "",
      ].join("\n"),
    );
    const config = loadConfig(wrappedPath);
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
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
// The builder already fails loud on an unknown meta scope, but the `??` fallback
// must not silently load a bad scope. The fallback is wired through
// validateWrappedConfig, so this asserts that guard fails loud (and loads a valid
// scope) directly — proving the fallback honors the same invariant as the builder.
describe("validateWrappedConfig (canonical-global fallback guard)", () => {
  it("fails loud on a meta scope referencing an unregistered project", () => {
    expect(() =>
      validateWrappedConfig({
        projects: { web: { path: "/tmp/web" } },
        metaOrchestrators: { "meta-1": { scope: { projects: ["web", "ghost"] } } },
      }),
    ).toThrow(/unknown project 'ghost'/);
  });

  it("accepts a meta scope whose projects are all registered", () => {
    const config = validateWrappedConfig({
      projects: { web: { path: "/tmp/web" }, api: { path: "/tmp/api" } },
      metaOrchestrators: { "meta-1": { scope: { projects: ["web", "api"] } } },
    });
    expect(config.metaOrchestrators?.["meta-1"]).toBeDefined();
  });
});
