import { describe, it, expect } from "vitest";
import { resolveInScopeProjects, resolveInScopeProjectIds } from "../meta-scope.js";
import type { MetaOrchestratorConfig, OrchestratorConfig, ProjectConfig } from "../types.js";

const proj = (name: string): ProjectConfig =>
  ({ name, path: `/x/${name}`, defaultBranch: "main", sessionPrefix: name }) as ProjectConfig;

const makeConfig = (ids: string[]): OrchestratorConfig =>
  ({ projects: Object.fromEntries(ids.map((id) => [id, proj(id)])) }) as OrchestratorConfig;

const all: MetaOrchestratorConfig = { scope: "all", discover: false };
const list = (projects: string[]): MetaOrchestratorConfig => ({
  scope: { projects },
  discover: false,
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

  it("resolves against the current registry (resolve-at-start; discover has no live effect)", () => {
    // A project registered after meta-start but absent from an explicit list is
    // NOT pulled in — there is no live auto-discovery in v1.
    const cfg = makeConfig(["web", "api"]);
    expect(resolveInScopeProjectIds(cfg, list(["web"]))).toEqual(["web"]);
  });
});
