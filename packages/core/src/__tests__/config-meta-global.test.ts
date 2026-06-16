import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config.js";
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
});
