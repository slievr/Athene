import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSessionManager } from "../session-manager.js";
import { readMetadataRaw } from "../metadata.js";
import { getMetaSessionsDir } from "../paths.js";
import { setupTestContext, teardownTestContext, type TestContext } from "./test-utils.js";

vi.mock("../activity-events.js", () => ({
  recordActivityEvent: vi.fn(),
}));

let ctx: TestContext;

beforeEach(() => {
  ctx = setupTestContext();
  ctx.config.metaOrchestrators = {
    "meta-1": { scope: "all", discover: false },
  };
});

afterEach(() => {
  vi.useRealTimers();
  teardownTestContext(ctx);
});

describe("ensureMetaOrchestrator", () => {
  it("spawns a meta orchestrator under _meta with role meta-orchestrator and no worktree", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const session = await sm.ensureMetaOrchestrator({
      name: "meta-1",
      systemPrompt: "You are the meta orchestrator.",
    });

    expect(session.id).toBe("meta-1");
    expect(session.projectId).toBe("_meta");
    expect(session.metadata["role"]).toBe("meta-orchestrator");
    expect(session.lifecycle.session.kind).toBe("meta-orchestrator");

    // Persisted under the reserved _meta scope.
    const persisted = readMetadataRaw(getMetaSessionsDir("meta-1"), "meta-1");
    expect(persisted?.["role"]).toBe("meta-orchestrator");
    expect(persisted?.["project"]).toBe("_meta");

    // No git worktree — the workspace plugin's create() is never called.
    expect(ctx.mockWorkspace.create).not.toHaveBeenCalled();
    // The runtime IS created (the agent must launch somewhere).
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("dedups concurrent ensureMetaOrchestrator calls — single runtime, no orphan", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const [a, b] = await Promise.all([
      sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" }),
      sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" }),
    ]);

    expect(a.id).toBe("meta-1");
    expect(b.id).toBe("meta-1");
    // Exactly one runtime created — the second call shared the in-flight promise.
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("relaunches a persisted-but-dead meta orchestrator instead of returning it", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const first = await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });
    expect(first.id).toBe("meta-1");

    // Simulate the runtime dying: _meta sessions aren't supervised, so the
    // persisted state stays `working`. The reuse path must probe liveness.
    vi.mocked(ctx.mockAgent.isProcessRunning).mockResolvedValue(false);
    vi.mocked(ctx.mockRuntime.create).mockClear();

    const relaunched = await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });

    expect(relaunched.id).toBe("meta-1");
    // Dead runtime detected → stale metadata cleared and a fresh runtime spawned.
    expect(ctx.mockRuntime.create).toHaveBeenCalledTimes(1);
  });

  it("returns projectId _meta on the reuse path (parity with spawn)", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });
    const reused = await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });
    expect(reused.projectId).toBe("_meta");
  });

  it("reuses a live meta orchestrator session instead of spawning again", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const first = await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });
    vi.mocked(ctx.mockRuntime.create).mockClear();

    const second = await sm.ensureMetaOrchestrator({ name: "meta-1", systemPrompt: "p" });

    expect(second.id).toBe(first.id);
    // Reused — no second runtime spawn.
    expect(ctx.mockRuntime.create).not.toHaveBeenCalled();
  });
});
