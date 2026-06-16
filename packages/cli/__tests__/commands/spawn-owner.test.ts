import { describe, it, expect } from "vitest";
import { parseSpawnOwner } from "../../src/commands/spawn.js";

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
