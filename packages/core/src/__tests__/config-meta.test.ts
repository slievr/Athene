import { describe, it, expect } from "vitest";
import { validateConfig, assertMetaScopeProjectsExist } from "../config.js";

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

  it("does NOT reject explicit scopes during validateConfig (may be a partial projection)", () => {
    // validateConfig runs on the (possibly partial) effective projects map, so it
    // must not reject scope project IDs absent from it — that check is done against
    // the full registry by assertMetaScopeProjectsExist in the global-config path.
    expect(() =>
      validateConfig({
        ...base,
        metaOrchestrators: { "meta-1": { scope: { projects: ["web", "ghost"] } } },
      }),
    ).not.toThrow();
  });

  it("assertMetaScopeProjectsExist fails loud on a truly-unknown project (full registry)", () => {
    expect(() =>
      assertMetaScopeProjectsExist(
        { "meta-1": { scope: { projects: ["web", "ghost"] } } },
        ["web", "api"],
      ),
    ).toThrow(/unknown project 'ghost'/);
  });

  it("assertMetaScopeProjectsExist accepts a valid multi-project scope and scope:all", () => {
    expect(() =>
      assertMetaScopeProjectsExist(
        { m1: { scope: { projects: ["web", "api"] } }, m2: { scope: "all" } },
        ["web", "api"],
      ),
    ).not.toThrow();
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
