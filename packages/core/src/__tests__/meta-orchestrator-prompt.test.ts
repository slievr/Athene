import { describe, it, expect } from "vitest";
import { generateMetaOrchestratorPrompt } from "../meta-orchestrator-prompt.js";
import type { OrchestratorConfig } from "../types.js";

const makeConfig = (over: Partial<OrchestratorConfig> = {}): OrchestratorConfig =>
  ({
    configPath: "/tmp/agent-orchestrator.yaml",
    port: 3000,
    defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
    projects: {
      web: {
        name: "Web",
        repo: "org/web",
        path: "/x/web",
        defaultBranch: "main",
        sessionPrefix: "web",
        description: "UI app",
      },
      api: {
        name: "Api",
        repo: "org/api",
        path: "/x/api",
        defaultBranch: "main",
        sessionPrefix: "api",
        description: "backend",
      },
    },
    notifiers: {},
    notificationRouting: { urgent: [], action: [], warning: [], info: [] },
    reactions: {},
    readyThresholdMs: 300_000,
    metaOrchestrators: {
      "meta-1": { scope: { projects: ["web"] }, discover: true, rules: "prefer api" },
    },
    ...over,
  }) as OrchestratorConfig;

describe("generateMetaOrchestratorPrompt", () => {
  it("renders the catalog, dashboard URL, scope and rules", () => {
    const p = generateMetaOrchestratorPrompt({ config: makeConfig(), name: "meta-1" });
    expect(p).toContain("meta-1");
    expect(p).toContain("web");
    expect(p).toContain("UI app");
    expect(p).toContain("/meta/meta-1");
    expect(p).toContain("prefer api");
    // scope:{projects:[web]} should NOT include api in the catalog
    expect(p).not.toContain("backend");
  });

  it("renders scope:all over every project", () => {
    const cfg = makeConfig({ metaOrchestrators: { platform: { scope: "all", discover: false } } });
    const p = generateMetaOrchestratorPrompt({ config: cfg, name: "platform" });
    expect(p).toContain("UI app");
    expect(p).toContain("backend");
    expect(p).toContain("all registered projects");
  });

  it("omits the rules section when no rules are configured", () => {
    const cfg = makeConfig({ metaOrchestrators: { "meta-1": { scope: { projects: ["web"] }, discover: false } } });
    const p = generateMetaOrchestratorPrompt({ config: cfg, name: "meta-1" });
    expect(p).not.toContain("Project-Specific Rules");
    expect(p).not.toContain("prefer api");
  });

  it("throws for an unknown meta orchestrator name", () => {
    expect(() => generateMetaOrchestratorPrompt({ config: makeConfig(), name: "nope" })).toThrow(
      /Unknown meta orchestrator/,
    );
  });
});
