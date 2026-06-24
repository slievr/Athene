import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/services", () => ({
  getServices: vi.fn(),
  invalidatePortfolioServicesCache: vi.fn(),
}));

vi.mock("@made-by-moonlight/athene-core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    appendOrchestrator: vi.fn(),
    generateOrchestratorPrompt: vi.fn(() => "system-prompt"),
  };
});

vi.mock("@/lib/observability", () => ({
  getCorrelationId: vi.fn(() => "test-correlation-id"),
  jsonWithCorrelation: vi.fn(
    (body: unknown, init: ResponseInit) => new Response(JSON.stringify(body), init),
  ),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────

import { POST } from "@/app/api/meta/route";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { appendOrchestrator } from "@made-by-moonlight/athene-core";

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/meta", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const mockEnsureOrchestrator = vi.fn(async () => ({ id: "meta-session-1" }));

const mockConfig = {
  configPath: "/tmp/agent-orchestrator.yaml",
  metaOrchestrators: {} as Record<string, unknown>,
  projects: { "proj-a": {}, "proj-b": {} },
};

beforeEach(() => {
  vi.mocked(getServices).mockResolvedValue({
    config: mockConfig,
    sessionManager: { ensureOrchestrator: mockEnsureOrchestrator },
  } as never);
  mockEnsureOrchestrator.mockResolvedValue({ id: "meta-session-1" });
  vi.mocked(appendOrchestrator).mockImplementation(() => undefined);
  vi.mocked(invalidatePortfolioServicesCache).mockImplementation(() => undefined);
  mockConfig.metaOrchestrators = {};
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/meta", () => {
  it("returns 400 for invalid name characters", async () => {
    const res = await POST(makeRequest({ name: "bad name!", scope: "all" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/);
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(makeRequest({ scope: "all" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when name already exists", async () => {
    mockConfig.metaOrchestrators = { existing: { scope: "all", discover: true } };
    const res = await POST(makeRequest({ name: "existing", scope: "all" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("existing");
  });

  it("returns 400 for unknown project ID in scope", async () => {
    const res = await POST(
      makeRequest({ name: "m", scope: { projects: ["proj-a", "unknown-project"] } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unknown-project");
  });

  it("happy path: writes config, invalidates cache, starts session, returns 201", async () => {
    const res = await POST(makeRequest({ name: "main", scope: "all" }));
    expect(res.status).toBe(201);

    expect(appendOrchestrator).toHaveBeenCalledWith("/tmp/agent-orchestrator.yaml", {
      name: "main",
      scope: "all",
      agent: undefined,
    });
    expect(invalidatePortfolioServicesCache).toHaveBeenCalled();
    expect(mockEnsureOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ name: "main" }),
    );

    const body = await res.json();
    expect(body).toEqual({ sessionId: "meta-session-1" });
  });

  it("happy path with specific project scope and agent override", async () => {
    const res = await POST(
      makeRequest({ name: "scoped", scope: { projects: ["proj-a"] }, agent: "codex" }),
    );
    expect(res.status).toBe(201);
    expect(appendOrchestrator).toHaveBeenCalledWith(
      "/tmp/agent-orchestrator.yaml",
      expect.objectContaining({ scope: { projects: ["proj-a"] }, agent: "codex" }),
    );
  });

  it("returns 500 when ensureOrchestrator throws", async () => {
    mockEnsureOrchestrator.mockRejectedValueOnce(new Error("runtime failure"));
    const res = await POST(makeRequest({ name: "m", scope: "all" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("runtime failure");
  });
});
