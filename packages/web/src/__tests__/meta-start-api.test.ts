import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createInitialCanonicalLifecycle,
  createActivitySignal,
  type Session,
  type SessionManager,
  type OrchestratorConfig,
  type PluginRegistry,
} from "@made-by-moonlight/athene-core";

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  const lifecycle = createInitialCanonicalLifecycle("worker", new Date("2025-01-01T00:00:00Z"));
  lifecycle.session.state = "working";
  lifecycle.session.reason = "task_in_progress";
  lifecycle.session.startedAt = lifecycle.session.lastTransitionAt;
  lifecycle.runtime.state = "alive";
  lifecycle.runtime.reason = "process_running";
  return {
    projectId: "_meta",
    status: "working",
    activity: "active",
    activitySignal: createActivitySignal("valid", {
      activity: "active",
      timestamp: new Date("2025-01-01T00:00:00Z"),
      source: "native",
    }),
    lifecycle,
    branch: null,
    issueId: null,
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    lastActivityAt: new Date("2025-01-01T00:00:00Z"),
    metadata: {},
    ...overrides,
    prs: overrides.prs ?? (overrides.pr ? [overrides.pr] : []),
  };
}

const metaSession = makeSession({ id: "meta-coordinator-1" });

const mockEnsureMetaOrchestrator = vi.fn(async () => metaSession);

const mockSessionManager: Partial<SessionManager> = {
  ensureMetaOrchestrator: mockEnsureMetaOrchestrator,
};

const mockConfig: OrchestratorConfig = {
  configPath: "/tmp/ao-test/agent-orchestrator.yaml",
  port: 3000,
  readyThresholdMs: 300_000,
  defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
  projects: {
    "my-app": {
      name: "My App",
      repo: "acme/my-app",
      path: "/tmp/my-app",
      defaultBranch: "main",
    },
  },
  metaOrchestrators: {
    "fleet-manager": {
      agent: "claude-code",
      scope: "all",
      systemPrompt: "You are a meta orchestrator.",
    },
  },
  notifiers: {},
  notificationRouting: { urgent: [], action: [], warning: [], info: [] },
  reactions: {},
};

const mockRegistry: PluginRegistry = {
  register: vi.fn(),
  get: vi.fn(),
  list: vi.fn(() => []),
  loadBuiltins: vi.fn(async () => {}),
  loadFromConfig: vi.fn(async () => {}),
};

vi.mock("@made-by-moonlight/athene-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@made-by-moonlight/athene-core")>();
  return {
    ...actual,
    generateMetaOrchestratorPrompt: vi.fn(() => "generated-system-prompt"),
  };
});

vi.mock("@/lib/services", () => ({
  getServices: vi.fn(async () => ({
    config: mockConfig,
    registry: mockRegistry,
    sessionManager: mockSessionManager,
  })),
}));

import { POST } from "@/app/api/meta/[name]/start/route";

function makeRequest(name: string): NextRequest {
  return new NextRequest(`http://localhost/api/meta/${name}/start`, { method: "POST" });
}

describe("POST /api/meta/[name]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureMetaOrchestrator.mockResolvedValue(metaSession);
  });

  it("starts a configured meta orchestrator and returns 200 with sessionId", async () => {
    const res = await POST(makeRequest("fleet-manager"), {
      params: Promise.resolve({ name: "fleet-manager" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("meta-coordinator-1");
    expect(mockEnsureMetaOrchestrator).toHaveBeenCalledWith({
      name: "fleet-manager",
      systemPrompt: "generated-system-prompt",
      agent: "claude-code",
    });
  });

  it("returns 404 for an unknown meta orchestrator name", async () => {
    const res = await POST(makeRequest("unknown-meta"), {
      params: Promise.resolve({ name: "unknown-meta" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/unknown-meta/i);
    expect(mockEnsureMetaOrchestrator).not.toHaveBeenCalled();
  });

  it("returns 500 when ensureMetaOrchestrator throws", async () => {
    mockEnsureMetaOrchestrator.mockRejectedValueOnce(new Error("runtime unavailable"));

    const res = await POST(makeRequest("fleet-manager"), {
      params: Promise.resolve({ name: "fleet-manager" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("runtime unavailable");
  });
});
