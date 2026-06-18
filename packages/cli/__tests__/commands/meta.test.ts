import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  resolveMetaName,
  partitionMetaSessions,
  loadMetaRegistryConfig,
  formatDiscoverStatus,
} from "../../src/commands/meta.js";
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

describe("formatDiscoverStatus", () => {
  it("never claims live auto-discovery, even when discover is true", () => {
    const on = formatDiscoverStatus(true);
    expect(on).toContain("no effect in v1");
    expect(on).toMatch(/re-run `athene meta-start`/i);
    expect(on).not.toMatch(/enabled|immediately|live/i);
  });

  it("says 'off' and points to meta-start refresh when discover is false", () => {
    const off = formatDiscoverStatus(false);
    expect(off).toContain("off");
    expect(off).toMatch(/re-run `athene meta-start`/i);
    expect(off).not.toMatch(/enabled|immediately|live/i);
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

describe("loadMetaRegistryConfig", () => {
  let tempRoot: string;
  let globalPath: string;
  let originalAoGlobalConfig: string | undefined;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `ao-meta-registry-${randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    globalPath = join(tempRoot, "config.yaml");
    // Point getGlobalConfigPath() at our temp global config (independent of cwd /
    // the worktree's own agent-orchestrator.yaml).
    originalAoGlobalConfig = process.env["AO_GLOBAL_CONFIG"];
    process.env["AO_GLOBAL_CONFIG"] = globalPath;
  });

  afterEach(() => {
    if (originalAoGlobalConfig === undefined) delete process.env["AO_GLOBAL_CONFIG"];
    else process.env["AO_GLOBAL_CONFIG"] = originalAoGlobalConfig;
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("loads the GLOBAL registry (with metaOrchestrators), not a cwd flat-local projection", () => {
    writeFileSync(
      globalPath,
      ["projects: {}", "metaOrchestrators:", "  platform:", "    scope: all", ""].join("\n"),
    );

    const config = loadMetaRegistryConfig();
    // Meta orchestrators live only in the global registry — a flat-local config
    // would not carry them. Their presence proves we loaded the global config.
    expect(config.metaOrchestrators?.platform).toBeDefined();
    expect(config.configPath).toBe(globalPath);
  });
});
