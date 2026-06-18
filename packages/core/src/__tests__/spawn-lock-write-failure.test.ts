import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type * as NodeFs from "node:fs";
import { createSessionManager } from "../session-manager.js";
import { getProjectDir } from "../paths.js";
import { setupTestContext, teardownTestContext, type TestContext } from "./test-utils.js";

vi.mock("../activity-events.js", () => ({
  recordActivityEvent: vi.fn(),
}));

// Keep git ls-remote off the wire (mirrors spawn-lock-network.test.ts).
vi.mock("node:child_process", () => {
  const execFileMock = vi.fn() as unknown as {
    (...args: unknown[]): unknown;
    [k: symbol]: unknown;
  };
  execFileMock[Symbol.for("nodejs.util.promisify.custom")] = () =>
    Promise.resolve({ stdout: "", stderr: "" });
  return { execFile: execFileMock };
});

// Fail ONLY the spawn-lock owner-token write; everything else is real fs.
vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof NodeFs>();
  return {
    ...actual,
    default: actual,
    writeFileSync: (path: NodeFs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (typeof path === "string" && path.endsWith("spawn.lock")) {
        throw new Error("simulated owner-token write failure");
      }
      return (actual.writeFileSync as (...a: unknown[]) => unknown)(path, ...rest);
    },
  };
});

let ctx: TestContext;

beforeEach(() => {
  ctx = setupTestContext();
  ctx.config.projects["my-app"]!.agent = "mock-agent";
});

afterEach(() => {
  vi.useRealTimers();
  teardownTestContext(ctx);
});

describe("withProjectSpawnLock owner-token write failure", () => {
  it("removes the lock and aborts so spawns don't stall until the age ceiling", async () => {
    const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });

    // The owner-token write throws; acquisition must clean up the lock it created
    // and surface the error rather than leaving an empty no-PID lock behind.
    await expect(sm.spawn({ projectId: "my-app", prompt: "x" })).rejects.toThrow(
      /spawn lock owner token/i,
    );

    // No leaked lock — a subsequent spawn isn't blocked for SPAWN_LOCK_MAX_AGE_MS.
    const lockPath = join(getProjectDir("my-app"), "spawn.lock");
    expect(existsSync(lockPath)).toBe(false);
  });
});
