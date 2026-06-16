import { describe, it, expect } from "vitest";
import { resolveMetaName, partitionMetaSessions } from "../../src/commands/meta.js";
import type { Session } from "@made-by-moonlight/athene-core";

const sess = (over: Partial<Session>): Session =>
  ({
    id: "web-1",
    projectId: "web",
    status: "working",
    issueId: null,
    metadata: {},
    lifecycle: { session: { state: "working" }, pr: { state: "none" }, runtime: { state: "alive" } },
    ...over,
  }) as unknown as Session;

describe("resolveMetaName", () => {
  it("throws when none are configured", () => {
    expect(() => resolveMetaName([])).toThrow(/No meta orchestrators/);
  });

  it("defaults to the sole configured meta", () => {
    expect(resolveMetaName(["meta-1"])).toBe("meta-1");
  });

  it("returns the requested name when valid", () => {
    expect(resolveMetaName(["a", "b"], "b")).toBe("b");
  });

  it("throws for an unknown requested name", () => {
    expect(() => resolveMetaName(["a", "b"], "c")).toThrow(/Unknown meta orchestrator/);
  });

  it("throws when ambiguous (multiple, none requested)", () => {
    expect(() => resolveMetaName(["a", "b"])).toThrow(/specify one/);
  });
});

describe("partitionMetaSessions", () => {
  it("splits owned workers from in-scope peers", () => {
    const sessions = [
      sess({ id: "web-1", projectId: "web", metadata: { ownerKind: "meta", metaOwner: "meta-1" } }),
      sess({ id: "web-2", projectId: "web", metadata: {} }), // peer (project-owned, in scope)
      sess({ id: "api-1", projectId: "api", metadata: { ownerKind: "meta", metaOwner: "other" } }), // other meta, in scope → peer
      sess({ id: "zzz-1", projectId: "zzz", metadata: {} }), // out of scope → ignored
    ];
    const { owned, peers } = partitionMetaSessions(sessions, "meta-1", ["web", "api"]);
    expect(owned.map((s) => s.id)).toEqual(["web-1"]);
    expect(peers.map((s) => s.id).sort()).toEqual(["api-1", "web-2"]);
  });

  it("excludes terminal peers", () => {
    const sessions = [
      sess({
        id: "web-9",
        projectId: "web",
        metadata: {},
        lifecycle: {
          session: { state: "terminated" },
          pr: { state: "none" },
          runtime: { state: "missing" },
        } as unknown as Session["lifecycle"],
      }),
    ];
    const { peers } = partitionMetaSessions(sessions, "meta-1", ["web"]);
    expect(peers).toEqual([]);
  });
});
