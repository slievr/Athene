import { describe, it, expect, vi } from "vitest";
import type * as AtheneCore from "@made-by-moonlight/athene-core";

vi.mock("@made-by-moonlight/athene-core", async (importActual) => {
  // Keep the REAL core constants (ACTIVITY_STATE, SESSION_STATUS, CI_STATUS, …)
  // that @/lib/types → getAttentionLevel depends on; override only the metadata
  // readers so the test doesn't touch disk.
  const actual = await importActual<typeof AtheneCore>();
  return {
    ...actual,
    getMetaSessionsDir: (name: string) => `/tmp/_meta/${name}/sessions`,
    readMetadataRaw: () => ({ role: "meta-orchestrator" }),
    sessionFromMetadata: (name: string) => ({
      id: name,
      projectId: "_meta",
      runtimeHandle: { id: "rt-1" },
      metadata: {},
    }),
  };
});

vi.mock("@/lib/serialize", () => ({
  // A live meta serializes to a "working" lifecycle (sessionState working,
  // runtime alive) so getAttentionLevel resolves to "working" — matching the
  // persisted-but-unsupervised _meta session shape.
  sessionToDashboard: (s: { id: string }) => ({
    id: s.id,
    activity: "active",
    status: "working",
    lifecycle: { sessionState: "working", runtimeState: "alive", prState: "none" },
  }),
}));

import { listSidebarOrchestrators } from "@/lib/orchestrators";
import { getAttentionLevel } from "@/lib/types";

const config = {
  metaOrchestrators: { "meta-1": { scope: "all", discover: false } },
  defaults: { agent: "claude-code" },
} as never;

const registryWith = (isProcessRunning: () => Promise<boolean>) =>
  ({ get: () => ({ isProcessRunning }) }) as never;

describe("listSidebarOrchestrators liveness", () => {
  it("reflects a non-live (idle) dot when the orchestrator runtime is dead", async () => {
    const result = await listSidebarOrchestrators(config, registryWith(async () => false));
    expect(result[0]!.session?.activity).toBe("idle");
    expect(result[0]!.session?.status).toBe("idle");
  });

  it("neutralizes the lifecycle so the dead-runtime dot is NOT a glowing 'working' level", async () => {
    // Regression for ath-rev-22: the activity/status overrides alone don't change
    // the dot level — getAttentionLevel reads lifecycle.sessionState first and
    // falls through to "working" for any non-terminal lifecycle. The dead path
    // must terminate the lifecycle so the dot stops glowing.
    const result = await listSidebarOrchestrators(config, registryWith(async () => false));
    expect(result[0]!.session?.lifecycle?.sessionState).toBe("terminated");
    expect(result[0]!.session?.lifecycle?.runtimeState).toBe("exited");
    expect(getAttentionLevel(result[0]!.session!)).not.toBe("working");
  });

  it("keeps the live activity (and a working dot) when the orchestrator runtime is running", async () => {
    const result = await listSidebarOrchestrators(config, registryWith(async () => true));
    expect(result[0]!.session?.activity).toBe("active");
    expect(result[0]!.session?.status).toBe("working");
    // A live orchestrator still resolves to a glowing "working" dot.
    expect(getAttentionLevel(result[0]!.session!)).toBe("working");
  });

  it("does not stall when the runtime probe never resolves (bounded; uncertain → keep live)", async () => {
    // A probe that never resolves must not hang the page-data build — it is raced
    // against the timeout, which yields the uncertain/live state.
    const neverResolves = () => new Promise<boolean>(() => {});
    const start = Date.now();
    const result = await listSidebarOrchestrators(config, registryWith(neverResolves), 30);
    expect(Date.now() - start).toBeLessThan(2_000); // resolved via timeout, didn't hang
    // Uncertain → not marked dead → keeps the live dot.
    expect(result[0]!.session?.activity).toBe("active");
    expect(getAttentionLevel(result[0]!.session!)).toBe("working");
  });
});
