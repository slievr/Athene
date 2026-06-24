import { describe, it, expect } from "vitest";
import { parseSpawnOwner, effectiveOwnerOptions, inferSpawnOwner } from "../../src/commands/spawn.js";

describe("parseSpawnOwner", () => {
  it("returns empty owner when no flags are given", () => {
    expect(parseSpawnOwner({})).toEqual({ ownerKind: undefined, metaOwner: undefined });
  });

  it("accepts meta ownership with a meta owner", () => {
    expect(parseSpawnOwner({ ownerKind: "meta", metaOwner: "meta-1" })).toEqual({
      ownerKind: "meta",
      metaOwner: "meta-1",
    });
  });

  it("accepts explicit project ownership", () => {
    expect(parseSpawnOwner({ ownerKind: "project" })).toEqual({
      ownerKind: "project",
      metaOwner: undefined,
    });
  });

  it("rejects an invalid owner kind", () => {
    expect(() => parseSpawnOwner({ ownerKind: "bogus" })).toThrow(/owner-kind/);
  });

  it("requires a meta owner when ownerKind is meta", () => {
    expect(() => parseSpawnOwner({ ownerKind: "meta" })).toThrow(/meta-owner/);
  });

  it("rejects a meta owner without ownerKind meta", () => {
    expect(() => parseSpawnOwner({ metaOwner: "meta-1" })).toThrow(/owner-kind meta/);
  });
});

describe("effectiveOwnerOptions (env auto-stamp)", () => {
  it("auto-stamps meta ownership from the meta runtime env", () => {
    const out = effectiveOwnerOptions(
      {},
      { ATHENE_CALLER_TYPE: "meta-orchestrator", ATHENE_META_NAME: "meta-1" },
    );
    expect(out).toEqual({ ownerKind: "meta", metaOwner: "meta-1" });
    // ...and validates/stamps cleanly through parseSpawnOwner.
    expect(parseSpawnOwner(out)).toEqual({ ownerKind: "meta", metaOwner: "meta-1" });
  });

  it("does not stamp for a per-project orchestrator env", () => {
    expect(effectiveOwnerOptions({}, { ATHENE_CALLER_TYPE: "orchestrator" })).toEqual({});
  });

  it("does not stamp when meta env is incomplete", () => {
    expect(effectiveOwnerOptions({}, { ATHENE_CALLER_TYPE: "meta-orchestrator" })).toEqual({});
  });

  it("lets explicit flags override the env", () => {
    const env = { ATHENE_CALLER_TYPE: "meta-orchestrator", ATHENE_META_NAME: "meta-1" };
    expect(effectiveOwnerOptions({ ownerKind: "project" }, env)).toEqual({ ownerKind: "project" });
  });

  it("auto-stamps from the legacy AO_* env names (dual-read)", () => {
    const out = effectiveOwnerOptions(
      {},
      { AO_CALLER_TYPE: "meta-orchestrator", AO_META_NAME: "meta-1" },
    );
    expect(out).toEqual({ ownerKind: "meta", metaOwner: "meta-1" });
  });

  it("prefers the canonical ATHENE_* names over the legacy AO_* names", () => {
    const out = effectiveOwnerOptions(
      {},
      {
        ATHENE_CALLER_TYPE: "meta-orchestrator",
        ATHENE_META_NAME: "from-athene",
        AO_META_NAME: "from-ao",
      },
    );
    expect(out).toEqual({ ownerKind: "meta", metaOwner: "from-athene" });
  });
});

describe("inferSpawnOwner (env auto-stamp)", () => {
  it("ATHENE_META_NAME falls back when ATHENE_ORCHESTRATOR_NAME is absent", () => {
    const env = { ATHENE_CALLER_TYPE: "meta-orchestrator", ATHENE_META_NAME: "legacy-orch" };
    const owner = inferSpawnOwner(env as Record<string, string | undefined>, {});
    expect(owner.orchestratorOwner).toBe("legacy-orch");
  });
});
