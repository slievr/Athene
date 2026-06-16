import { describe, it, expect } from "vitest";
import { validateConfig } from "../config.js";

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

  it("parses an explicit project-list scope with discover + rules", () => {
    const cfg = validateConfig({
      ...base,
      metaOrchestrators: {
        "meta-1": { scope: { projects: ["web", "api"] }, discover: true, rules: "prefer api" },
      },
    });
    const m = cfg.metaOrchestrators?.["meta-1"];
    expect(m?.scope).toEqual({ projects: ["web", "api"] });
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

  it("rejects an explicit scope referencing an unknown project", () => {
    expect(() =>
      validateConfig({
        ...base,
        metaOrchestrators: { "meta-1": { scope: { projects: ["web", "ghost"] } } },
      }),
    ).toThrow(/unknown project 'ghost'/);
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
