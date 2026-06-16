import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllProjectsMock, getServicesMock } = vi.hoisted(() => ({
  getAllProjectsMock: vi.fn(),
  getServicesMock: vi.fn(),
}));

vi.mock("@/lib/project-name", () => ({
  getAllProjects: getAllProjectsMock,
}));

vi.mock("@/lib/services", () => ({
  getServices: getServicesMock,
  getSCM: vi.fn(),
}));

vi.mock("@/lib/serialize", () => ({
  sessionToDashboard: (s: { id: string; projectId: string }) => ({ id: s.id, projectId: s.projectId }),
  enrichSessionsMetadataFast: vi.fn().mockResolvedValue(undefined),
  enrichSessionPR: vi.fn(),
}));

import { getMetaPageData } from "@/lib/meta-page-data";

const session = (id: string, projectId: string, metadata: Record<string, string>) => ({
  id,
  projectId,
  metadata,
  pr: null,
  lifecycle: { session: { state: "working" }, pr: { state: "none" }, runtime: { state: "alive" } },
  status: "working",
});

const config = {
  projects: { web: { sessionPrefix: "web" }, api: { sessionPrefix: "api" } },
  metaOrchestrators: { "meta-1": { scope: "all", discover: false } },
  dashboard: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  getAllProjectsMock.mockReturnValue([
    { id: "web", name: "Web", sessionPrefix: "web" },
    { id: "api", name: "Api", sessionPrefix: "api" },
  ]);
});

describe("getMetaPageData", () => {
  it("returns null for an unknown meta orchestrator", async () => {
    getServicesMock.mockResolvedValue({
      config,
      registry: {},
      sessionManager: { listCached: vi.fn().mockResolvedValue([]) },
    });
    expect(await getMetaPageData("nope")).toBeNull();
  });

  it("returns only sessions owned by the named meta orchestrator", async () => {
    const sessions = [
      session("web-1", "web", { ownerKind: "meta", metaOwner: "meta-1" }),
      session("web-2", "web", {}), // project-owned → excluded
      session("api-1", "api", { ownerKind: "meta", metaOwner: "other" }), // other meta → excluded
      session("meta-1", "_meta", { role: "meta-orchestrator", ownerKind: "meta", metaOwner: "meta-1" }), // coordinator → excluded
    ];
    getServicesMock.mockResolvedValue({
      config,
      registry: {},
      sessionManager: { listCached: vi.fn().mockResolvedValue(sessions) },
    });

    const data = await getMetaPageData("meta-1");
    expect(data).not.toBeNull();
    expect(data!.sessions.map((s) => s.id)).toEqual(["web-1"]);
    expect(data!.projects.map((p) => p.id)).toEqual(["web", "api"]);
  });
});
