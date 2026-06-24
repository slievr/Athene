import { describe, it, expect } from "vitest";
import {
  resolveInScopeProjects,
  resolveInScopeProjectIds,
  reconcileMetaScopeIds,
} from "../orchestrator-scope.js";
import type { OrchestratorEntryConfig, OrchestratorConfig, ProjectConfig } from "../types.js";

const proj = (name: string): ProjectConfig =>
  ({ name, path: `/x/${name}`, defaultBranch: "main", sessionPrefix: name }) as ProjectConfig;

const makeConfig = (ids: string[]): OrchestratorConfig =>
  ({ projects: Object.fromEntries(ids.map((id) => [id, proj(id)])) }) as OrchestratorConfig;

const all: OrchestratorEntryConfig = { scope: "all", discover: false };
const list = (projects: string[], discover = false): OrchestratorEntryConfig => ({
  scope: { projects },
  discover,
});

describe("resolveInScopeProjects", () => {
  it("returns every project for scope:all (insertion order)", () => {
    const cfg = makeConfig(["web", "api", "athene"]);
    expect(resolveInScopeProjectIds(cfg, all)).toEqual(["web", "api", "athene"]);
  });

  it("returns only listed projects that exist", () => {
    const cfg = makeConfig(["web", "api"]);
    expect(resolveInScopeProjectIds(cfg, list(["web", "ghost"]))).toEqual(["web"]);
  });

  it("returns project configs as tuples", () => {
    const cfg = makeConfig(["web"]);
    const tuples = resolveInScopeProjects(cfg, all);
    expect(tuples[0]![0]).toBe("web");
    expect(tuples[0]![1].name).toBe("web");
  });
});

describe("reconcileMetaScopeIds", () => {
  it("adds a project registered after startup to a discover:true list scope", () => {
    // Startup baseline was just [web]; api registered later.
    const cfg = makeConfig(["web", "api"]);
    const result = reconcileMetaScopeIds(cfg, list(["web"], true), ["web"]);
    expect(result).toContain("web");
    expect(result).toContain("api");
  });

  it("does NOT pull pre-existing out-of-list projects into scope (full baseline)", () => {
    // api already existed at startup (in the baseline) but is NOT in the allow-list,
    // so discover must not add it — the allow-list is preserved.
    const cfg = makeConfig(["web", "api"]);
    const result = reconcileMetaScopeIds(cfg, list(["web"], true), ["web", "api"]);
    expect(result).toEqual(["web"]);
  });

  it("does NOT add new projects when discover is off", () => {
    const cfg = makeConfig(["web", "api"]);
    expect(reconcileMetaScopeIds(cfg, list(["web"], false), ["web"])).toEqual(["web"]);
  });

  it("scope:all always reflects the full current set", () => {
    const cfg = makeConfig(["web", "api", "next"]);
    expect(reconcileMetaScopeIds(cfg, all, ["web"])).toEqual(["web", "api", "next"]);
  });
});
