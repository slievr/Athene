import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSessionManager } from "../session-manager.js";
import { readMetadataRaw, writeMetadata } from "../metadata.js";
import { setupTestContext, teardownTestContext, makeHandle, type TestContext } from "./test-utils.js";

vi.mock("../activity-events.js", () => ({
  recordActivityEvent: vi.fn(),
}));

let ctx: TestContext;
let sessionsDir: string;

beforeEach(() => {
  ctx = setupTestContext();
  ({ sessionsDir } = ctx);
  ctx.config.projects["my-app"]!.agent = "mock-agent";
});

afterEach(() => {
  vi.useRealTimers();
  teardownTestContext(ctx);
});

describe("spawn collision guard", () => {
  it("hard-refuses a duplicate issue and creates no resources", async () => {
    // Seed a live (working) session that already owns ENG-42.
    writeMetadata(sessionsDir, "app-1", {
      worktree: "/tmp/ws",
      branch: "feat/eng-42",
      status: "working",
      project: "my-app",
      agent: "mock-agent",
      issue: "ENG-42",
      runtimeHandle: makeHandle("rt-existing"),
    });

    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    await expect(sm.spawn({ projectId: "my-app", issueId: "ENG-42" })).rejects.toThrow(
      /SPAWN REFUSED: app-1 already owns ENG-42/,
    );

    // Guard runs before any resource creation — no worktree/runtime created.
    expect(ctx.mockWorkspace.create).not.toHaveBeenCalled();
    expect(ctx.mockRuntime.create).not.toHaveBeenCalled();
  });

  it("stamps ownerKind=meta and metaOwner on a meta-dispatched worker", async () => {
    vi.useFakeTimers();
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const spawnPromise = sm.spawn({
      projectId: "my-app",
      prompt: "do a thing",
      ownerKind: "meta",
      metaOwner: "meta-1",
    });
    await vi.runAllTimersAsync();
    const session = await spawnPromise;

    expect(session.metadata["ownerKind"]).toBe("meta");
    expect(session.metadata["metaOwner"]).toBe("meta-1");

    const persisted = readMetadataRaw(sessionsDir, session.id);
    expect(persisted?.["ownerKind"]).toBe("meta");
    expect(persisted?.["metaOwner"]).toBe("meta-1");
  });

  it("defaults to project ownership when no owner flags are given", async () => {
    vi.useFakeTimers();
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const spawnPromise = sm.spawn({ projectId: "my-app", prompt: "do a thing" });
    await vi.runAllTimersAsync();
    const session = await spawnPromise;

    expect(session.metadata["ownerKind"]).toBeUndefined();
    expect(session.metadata["metaOwner"]).toBeUndefined();
  });
});
