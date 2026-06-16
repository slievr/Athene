import { describe, it, expect } from "vitest";
import { parseSpawnOwner, effectiveOwnerOptions } from "../../src/commands/spawn.js";

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
      { AO_CALLER_TYPE: "meta-orchestrator", AO_META_NAME: "meta-1" },
    );
    expect(out).toEqual({ ownerKind: "meta", metaOwner: "meta-1" });
    // ...and validates/stamps cleanly through parseSpawnOwner.
    expect(parseSpawnOwner(out)).toEqual({ ownerKind: "meta", metaOwner: "meta-1" });
  });

  it("does not stamp for a per-project orchestrator env", () => {
    expect(effectiveOwnerOptions({}, { AO_CALLER_TYPE: "orchestrator" })).toEqual({});
  });

  it("does not stamp when meta env is incomplete", () => {
    expect(effectiveOwnerOptions({}, { AO_CALLER_TYPE: "meta-orchestrator" })).toEqual({});
  });

  it("lets explicit flags override the env", () => {
    const env = { AO_CALLER_TYPE: "meta-orchestrator", AO_META_NAME: "meta-1" };
    expect(effectiveOwnerOptions({ ownerKind: "project" }, env)).toEqual({ ownerKind: "project" });
  });
});
