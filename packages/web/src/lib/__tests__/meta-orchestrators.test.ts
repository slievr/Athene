import { describe, it, expect, vi } from "vitest";

vi.mock("@made-by-moonlight/athene-core", () => ({
  getMetaSessionsDir: (name: string) => `/tmp/_meta/${name}/sessions`,
  readMetadataRaw: () => ({ role: "meta-orchestrator" }),
  sessionFromMetadata: (name: string) => ({
    id: name,
    projectId: "_meta",
    runtimeHandle: { id: "rt-1" },
    metadata: {},
  }),
}));

vi.mock("@/lib/serialize", () => ({
  sessionToDashboard: (s: { id: string }) => ({ id: s.id, activity: "active", status: "working" }),
}));

import { listSidebarMetaOrchestrators } from "@/lib/meta-orchestrators";

const config = {
  metaOrchestrators: { "meta-1": { scope: "all", discover: false } },
  defaults: { agent: "claude-code" },
} as never;

const registryWith = (isProcessRunning: () => Promise<boolean>) =>
  ({ get: () => ({ isProcessRunning }) }) as never;

describe("listSidebarMetaOrchestrators liveness", () => {
  it("reflects a non-live (idle) dot when the meta runtime is dead", async () => {
    const result = await listSidebarMetaOrchestrators(config, registryWith(async () => false));
    expect(result[0]!.session?.activity).toBe("idle");
    expect(result[0]!.session?.status).toBe("idle");
  });

  it("keeps the live activity when the meta runtime is running", async () => {
    const result = await listSidebarMetaOrchestrators(config, registryWith(async () => true));
    expect(result[0]!.session?.activity).toBe("active");
    expect(result[0]!.session?.status).toBe("working");
  });
});
