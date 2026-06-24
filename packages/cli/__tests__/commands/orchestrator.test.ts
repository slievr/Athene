import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { registerMeta } from "../../src/commands/meta.js";
import {
  resolveOrchestratorName,
  partitionOrchestratorSessions,
  loadOrchestratorRegistryConfig,
  // Backward-compat aliases — verify they still work.
  resolveMetaName,
  partitionMetaSessions,
  loadMetaRegistryConfig,
} from "../../src/commands/orchestrator.js";
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

describe("resolveOrchestratorName", () => {
  it("throws when none are configured", () => {
    expect(() => resolveOrchestratorName([])).toThrow(/No orchestrators are configured/);
  });

  it("defaults to the sole configured orchestrator", () => {
    expect(resolveOrchestratorName(["orch-1"])).toBe("orch-1");
  });

  it("returns the requested name when valid", () => {
    expect(resolveOrchestratorName(["a", "b"], "b")).toBe("b");
  });

  it("throws for an unknown requested name", () => {
    expect(() => resolveOrchestratorName(["a", "b"], "c")).toThrow(/Unknown orchestrator/);
  });

  it("throws when ambiguous (multiple, none requested)", () => {
    expect(() => resolveOrchestratorName(["a", "b"])).toThrow(/specify one/);
  });
});

describe("resolveMetaName (backward-compat alias)", () => {
  it("delegates to resolveOrchestratorName", () => {
    expect(resolveMetaName(["meta-1"])).toBe("meta-1");
  });
});

describe("partitionOrchestratorSessions", () => {
  it("splits owned workers from in-scope peers", () => {
    const sessions = [
      sess({ id: "web-1", projectId: "web", metadata: { ownerKind: "meta", metaOwner: "meta-1" } }),
      sess({ id: "web-2", projectId: "web", metadata: {} }), // peer (project-owned, in scope)
      sess({ id: "api-1", projectId: "api", metadata: { ownerKind: "meta", metaOwner: "other" } }), // other meta, in scope → peer
      sess({ id: "zzz-1", projectId: "zzz", metadata: {} }), // out of scope → ignored
    ];
    const { owned, peers } = partitionOrchestratorSessions(sessions, "meta-1", ["web", "api"]);
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
    const { peers } = partitionOrchestratorSessions(sessions, "meta-1", ["web"]);
    expect(peers).toEqual([]);
  });
});

describe("partitionMetaSessions (backward-compat alias)", () => {
  it("delegates to partitionOrchestratorSessions", () => {
    const sessions = [
      sess({ id: "web-1", projectId: "web", metadata: { metaOwner: "my-orch" } }),
    ];
    const { owned } = partitionMetaSessions(sessions, "my-orch", ["web"]);
    expect(owned.map((s) => s.id)).toEqual(["web-1"]);
  });
});

describe("loadOrchestratorRegistryConfig", () => {
  let tempRoot: string;
  let globalPath: string;
  let originalAoGlobalConfig: string | undefined;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `ao-orchestrator-registry-${randomUUID()}`);
    mkdirSync(tempRoot, { recursive: true });
    globalPath = join(tempRoot, "config.yaml");
    originalAoGlobalConfig = process.env["ATHENE_GLOBAL_CONFIG"];
    process.env["ATHENE_GLOBAL_CONFIG"] = globalPath;
  });

  afterEach(() => {
    if (originalAoGlobalConfig === undefined) delete process.env["ATHENE_GLOBAL_CONFIG"];
    else process.env["ATHENE_GLOBAL_CONFIG"] = originalAoGlobalConfig;
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("loads the GLOBAL registry (with orchestrators), not a cwd flat-local projection", () => {
    // Use the canonical metaOrchestrators key so the global config builder
    // propagates it through the loading chain (orchestrators is normalized from
    // metaOrchestrators inside validateConfig).
    writeFileSync(
      globalPath,
      ["projects: {}", "metaOrchestrators:", "  platform:", "    scope: all", ""].join("\n"),
    );

    const config = loadOrchestratorRegistryConfig();
    // Orchestrators live only in the global registry — a flat-local config
    // would not carry them. Their presence (via normalization) proves we loaded
    // the global config.
    expect(config.orchestrators?.platform ?? config.metaOrchestrators?.platform).toBeDefined();
    expect(config.configPath).toBe(globalPath);
  });

  it("also works via loadMetaRegistryConfig backward-compat alias", () => {
    writeFileSync(
      globalPath,
      ["projects: {}", "metaOrchestrators:", "  platform:", "    scope: all", ""].join("\n"),
    );

    const config = loadMetaRegistryConfig();
    expect(config.metaOrchestrators?.platform).toBeDefined();
    expect(config.configPath).toBe(globalPath);
  });
});

describe("meta-start deprecation alias", () => {
  it("meta-start <name> emits a deprecation warning", async () => {
    const program = new Command();
    registerMeta(program);

    // Stub out the forwarding parse so it doesn't actually try to run
    // `orchestrator start` (which would hit real I/O and process.exit).
    const parseSpy = vi.spyOn(program, "parse").mockReturnValue(program);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await program.parseAsync(["meta-start", "my-orch"], { from: "user" });
    } catch {
      // shouldn't throw now, but guard anyway
    }
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    warnSpy.mockRestore();
    parseSpy.mockRestore();
  });
});
