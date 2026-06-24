import { describe, it, expect } from "vitest";
import { validateConfig, assertMetaScopeProjectsExist } from "../config.js";
import { isOrchestratorSession } from "../types.js";


const base = {
  projects: {
    web: { path: "/tmp/web", description: "UI app", sessionPrefix: "web" },
    api: { path: "/tmp/api", description: "backend", sessionPrefix: "api" },
  },
};

describe("metaOrchestrators config", () => {
  it("parses scope:all and defaults discover to false", () => {
    const cfg = validateConfig({ ...base, metaOrchestrators: { platform: { scope: "all" } } });
    expect(cfg.metaOrchestrators?.platform.scope).toBe("all");
    expect(cfg.metaOrchestrators?.platform.discover).toBe(false);
  });

  it("parses an explicit directory-path scope with discover + rules", () => {
    const cfg = validateConfig({
      ...base,
      metaOrchestrators: {
        "meta-1": { scope: ["/tmp/web", "/tmp/api"], discover: true, rules: "prefer api" },
      },
    });
    const m = cfg.metaOrchestrators?.["meta-1"];
    expect(m?.scope).toEqual(["/tmp/web", "/tmp/api"]);
    expect(m?.discover).toBe(true);
    expect(m?.rules).toBe("prefer api");
  });

  it("keeps per-project description", () => {
    const cfg = validateConfig(base);
    expect(cfg.projects.web.description).toBe("UI app");
  });

  it("rejects a project literally named _meta", () => {
    expect(() => validateConfig({ projects: { _meta: { path: "/tmp/x" } } })).toThrow(/_meta/);
  });

  it("does NOT reject explicit scopes during validateConfig (directory paths)", () => {
    expect(() =>
      validateConfig({
        ...base,
        metaOrchestrators: { "meta-1": { scope: ["/tmp/web", "/nonexistent/path"] } },
      }),
    ).not.toThrow();
  });

  it("assertMetaScopeProjectsExist is a no-op (scope uses directory paths, not project IDs)", () => {
    // Should not throw regardless of scope content
    expect(() =>
      assertMetaScopeProjectsExist(
        { myorch: { scope: ["/nonexistent/path"] } },
        ["project-a"],
      ),
    ).not.toThrow();
  });

  it("assertMetaScopeProjectsExist accepts undefined", () => {
    expect(() => assertMetaScopeProjectsExist(undefined, ["project-a"])).not.toThrow();
  });

  it("accepts scope:all without project validation", () => {
    const cfg = validateConfig({ ...base, metaOrchestrators: { platform: { scope: "all" } } });
    expect(cfg.metaOrchestrators?.platform.scope).toBe("all");
  });

  it("surfaces a clean Zod error (not a TypeError) when projects is omitted", () => {
    let thrown: unknown;
    try {
      validateConfig({ metaOrchestrators: { platform: { scope: "all" } } } as never);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeTruthy();
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    // The superRefine must not blow up on undefined `projects`.
    expect(message).not.toMatch(/Cannot convert undefined or null to object/);
  });
});

describe("dual-read: orchestrators / metaOrchestrators", () => {
  it("parses orchestrators key (new)", () => {
    const cfg = validateConfig({
      ...base,
      orchestrators: { platform: { scope: "all" } },
    });
    expect(cfg.orchestrators?.platform.scope).toBe("all");
  });

  it("parses metaOrchestrators key (legacy) and exposes it as orchestrators", () => {
    const cfg = validateConfig({
      ...base,
      metaOrchestrators: { platform: { scope: "all" } },
    });
    expect(cfg.orchestrators?.platform.scope).toBe("all");
  });

  it("new orchestrators key takes precedence when both present (merge, orchestrators wins on conflict)", () => {
    const cfg = validateConfig({
      ...base,
      orchestrators: { orch: { scope: "all" }, shared: { scope: "all", discover: false } },
      metaOrchestrators: { old: { scope: "all" }, shared: { scope: "all", discover: true } },
    });
    // orchestrators-only entry preserved
    expect(cfg.orchestrators?.orch).toBeDefined();
    // metaOrchestrators-only entry is merged in
    expect(cfg.orchestrators?.old).toBeDefined();
    // conflicting key: orchestrators wins (discover: false beats discover: true)
    expect(cfg.orchestrators?.shared).toMatchObject({ scope: "all", discover: false });
  });
});

describe("backward-compat: old metadata still loads", () => {
  it("role='meta-orchestrator' → isOrchestratorSession returns true", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });

  it("metaOrchestrators config key still parses and is exposed as orchestrators", () => {
    const cfg = validateConfig({ ...base, metaOrchestrators: { old: { scope: "all" } } });
    expect(cfg.orchestrators?.old).toBeDefined();
  });
});
