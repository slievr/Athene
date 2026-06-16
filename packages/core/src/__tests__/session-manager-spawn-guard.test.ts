import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { createSessionManager } from "../session-manager.js";
import { readMetadataRaw, writeMetadata } from "../metadata.js";
import { getProjectDir } from "../paths.js";
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

  it("still hard-refuses when the issue owner is runtime-lost (detecting, not terminal)", async () => {
    // A worker that owns ENG-50 but is transiently runtime-lost: canonical
    // session.state is `detecting` (a pending decision per #1735), NOT terminal.
    // It must still block a duplicate same-issue spawn.
    writeMetadata(sessionsDir, "app-7", {
      worktree: "/tmp/ws",
      branch: "feat/eng-50",
      status: "detecting",
      project: "my-app",
      agent: "mock-agent",
      issue: "ENG-50",
      runtimeHandle: makeHandle("rt-detecting"),
      lifecycle: {
        version: 2,
        session: {
          kind: "worker",
          state: "detecting",
          reason: "runtime_lost",
          startedAt: new Date().toISOString(),
          completedAt: null,
          terminatedAt: null,
          lastTransitionAt: new Date().toISOString(),
        },
        pr: { state: "none", reason: "not_created", number: null, url: null, lastObservedAt: null },
        runtime: {
          state: "probe_failed",
          reason: "probe_error",
          lastObservedAt: null,
          handle: makeHandle("rt-detecting"),
          tmuxName: null,
        },
      },
    });

    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    await expect(sm.spawn({ projectId: "my-app", issueId: "ENG-50" })).rejects.toThrow(
      /SPAWN REFUSED: app-7 already owns ENG-50/,
    );
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

  it("serializes concurrent same-issue spawns — exactly one wins, the other is refused", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    const results = await Promise.allSettled([
      sm.spawn({ projectId: "my-app", issueId: "ENG-77" }),
      sm.spawn({ projectId: "my-app", issueId: "ENG-77" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason)).toMatch(/SPAWN REFUSED/);
  });

  it("reaps an orphaned spawn.lock older than the stale threshold and proceeds", async () => {
    // Simulate a crashed prior spawn that left spawn.lock behind, with an mtime
    // older than staleMs (15s). The next spawn must reap it and succeed within
    // the acquire timeout, not hang/throw "Timed out acquiring spawn lock".
    const projectDir = getProjectDir("my-app");
    mkdirSync(projectDir, { recursive: true });
    const lockPath = join(projectDir, "spawn.lock");
    writeFileSync(lockPath, "");
    const twentySecondsAgo = new Date(Date.now() - 20_000);
    utimesSync(lockPath, twentySecondsAgo, twentySecondsAgo);

    vi.useFakeTimers();
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
    const spawnPromise = sm.spawn({ projectId: "my-app", prompt: "after a crash" });
    await vi.runAllTimersAsync();
    const session = await spawnPromise;

    expect(session.id).toBeTruthy();
    // The stale lock was reaped (and the new spawn's own lock released on exit).
    expect(existsSync(lockPath)).toBe(false);
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
