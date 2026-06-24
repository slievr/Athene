import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionManager } from "../session-manager.js";
import { readMetadataRaw } from "../metadata.js";
import { getMetaSessionsDir, getMetaWorkspaceDir } from "../paths.js";
import {
  setupTestContext,
  teardownTestContext,
  createMockRegistry,
  type TestContext,
} from "./test-utils.js";

vi.mock("../activity-events.js", () => ({
  recordActivityEvent: vi.fn(),
}));

let ctx: TestContext;

beforeEach(() => {
  ctx = setupTestContext();
  ctx.config.orchestrators = {
    "orch-1": { scope: "all", discover: false },
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  teardownTestContext(ctx);
});

describe("ensureOrchestrator", () => {
  it("spawns an orchestrator under _meta with role orchestrator and no worktree", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const session = await sm.ensureOrchestrator({
      name: "orch-1",
      systemPrompt: "You are the orchestrator.",
    });

    expect(session.id).toBe("orch-1");
    expect(session.projectId).toBe("_meta");
    expect(session.metadata["role"]).toBe("orchestrator");
    expect(session.lifecycle.session.kind).toBe("orchestrator");

    // Persisted under the reserved _meta scope.
    const persisted = readMetadataRaw(getMetaSessionsDir("orch-1"), "orch-1");
    expect(persisted?.["role"]).toBe("orchestrator");
    expect(persisted?.["project"]).toBe("_meta");

    // No git worktree — the workspace plugin's create() is never called.
    expect(ctx.mockWorkspace.create).not.toHaveBeenCalled();
    // The runtime IS created (the agent must launch somewhere).
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("dedups concurrent ensureOrchestrator calls — single runtime, no orphan", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const [a, b] = await Promise.all([
      sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" }),
      sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" }),
    ]);

    expect(a.id).toBe("orch-1");
    expect(b.id).toBe("orch-1");
    // Exactly one runtime created — the second call shared the in-flight promise.
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("relaunches a persisted-but-dead orchestrator instead of returning it", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const first = await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });
    expect(first.id).toBe("orch-1");

    // Simulate the runtime dying: _meta sessions aren't supervised, so the
    // persisted state stays `working`. The reuse path must probe liveness.
    vi.mocked(ctx.mockAgent.isProcessRunning).mockResolvedValue(false);
    vi.mocked(ctx.mockRuntime.create).mockClear();

    const relaunched = await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });

    expect(relaunched.id).toBe("orch-1");
    // Dead runtime detected → stale metadata cleared and a fresh runtime spawned.
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("returns projectId _meta on the reuse path (parity with spawn)", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });
    const reused = await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });
    expect(reused.projectId).toBe("_meta");
  });

  it("reuses a live orchestrator session instead of spawning again", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const first = await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });
    vi.mocked(ctx.mockRuntime.create).mockClear();

    const second = await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: "p" });

    expect(second.id).toBe(first.id);
    // Reused — no second runtime spawn.
    expect(ctx.mockRuntime.create).not.toHaveBeenCalled();
  });

  it("delivers the routing prompt via AGENTS.md when the agent is opencode", async () => {
    // OpenCode reads its prompt from a workspace AGENTS.md, not systemPromptFile.
    const opencodeRegistry = createMockRegistry({
      runtime: ctx.mockRuntime,
      agent: { ...ctx.mockAgent, name: "opencode" },
      workspace: ctx.mockWorkspace,
    });
    ctx.config.defaults.agent = "opencode";
    const sm = createSessionManager({ config: ctx.config, registry: opencodeRegistry });

    const prompt = "ORCHESTRATOR ROUTING CATALOG: route web→web, api→api.";
    await sm.ensureOrchestrator({ name: "orch-1", systemPrompt: prompt });

    const agentsMd = join(getMetaWorkspaceDir("orch-1"), "AGENTS.md");
    expect(existsSync(agentsMd)).toBe(true);
    expect(readFileSync(agentsMd, "utf-8")).toContain(prompt);
  });
});

describe("SessionManager interface", () => {
  it("does not expose spawnOrchestrator on the SessionManager interface", () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    expect("spawnOrchestrator" in sm).toBe(false);
    expect("relaunchOrchestrator" in sm).toBe(false);
  });
});

describe("worker ownership stamping", () => {
  it("stamps orchestratorOwner='default' on workers spawned with no orchestrator context", async () => {
    vi.stubEnv("ATHENE_CALLER_TYPE", "human");
    vi.stubEnv("ATHENE_ORCHESTRATOR_NAME", "");
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    const session = await sm.spawn({ projectId: "my-app", prompt: "do work" });
    expect(session.metadata["orchestratorOwner"]).toBe("default");
  });

  it("stamps orchestratorOwner from ATHENE_ORCHESTRATOR_NAME when caller is orchestrator", async () => {
    vi.stubEnv("ATHENE_CALLER_TYPE", "orchestrator");
    vi.stubEnv("ATHENE_ORCHESTRATOR_NAME", "orch-1");
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    const session = await sm.spawn({ projectId: "my-app", prompt: "do work" });
    expect(session.metadata["orchestratorOwner"]).toBe("orch-1");
  });
});
