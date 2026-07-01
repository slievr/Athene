import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  SessionNotFoundError,
  SessionNotRestorableError,
  createInitialCanonicalLifecycle,
  createActivitySignal,
  updateMetadata,
  type Session,
  type SessionManager,
  type OrchestratorConfig,
  type PluginRegistry,
  type SCM,
} from "@made-by-moonlight/athene-core";


// ── Mock Data ─────────────────────────────────────────────────────────
// Provides test sessions covering the key states the dashboard needs.

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  const lifecycle = createInitialCanonicalLifecycle("worker", new Date());
  lifecycle.session.state = "working";
  lifecycle.session.reason = "task_in_progress";
  lifecycle.session.startedAt = lifecycle.session.lastTransitionAt;
  lifecycle.runtime.state = "alive";
  lifecycle.runtime.reason = "process_running";
  return {
    projectId: "my-app",
    status: "working",
    activity: "active",
    activitySignal: createActivitySignal("valid", {
      activity: "active",
      timestamp: new Date(),
      source: "native",
    }),
    lifecycle,
    branch: null,
    issueId: null,
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
    prs: overrides.prs ?? (overrides.pr ? [overrides.pr] : []),
  };
}

const testSessions: Session[] = [
  makeSession({ id: "backend-3", status: "needs_input", activity: "waiting_input" }),
  makeSession({
    id: "backend-7",
    status: "mergeable",
    activity: "idle",
    pr: {
      number: 432,
      url: "https://github.com/acme/my-app/pull/432",
      title: "feat: health check",
      owner: "acme",
      repo: "my-app",
      branch: "feat/health-check",
      baseBranch: "main",
      isDraft: false,
    },
  }),
  makeSession({ id: "backend-9", status: "working", activity: "active" }),
  makeSession({
    id: "frontend-1",
    status: "killed",
    activity: "exited",
    projectId: "my-app",
    issueId: "INT-1270",
    branch: "feat/INT-1270-table",
  }),
];

const _multiProjectSessions: Session[] = [
  makeSession({
    id: "app-orchestrator",
    projectId: "my-app",
    metadata: { role: "orchestrator" },
  }),
  makeSession({
    id: "backend-3",
    projectId: "my-app",
    status: "working",
    activity: "active",
  }),
  makeSession({
    id: "docs-orchestrator",
    projectId: "docs-app",
    metadata: { role: "orchestrator" },
  }),
  makeSession({
    id: "docs-2",
    projectId: "docs-app",
    status: "review_pending",
    activity: "idle",
  }),
];

// ── Mock Services ─────────────────────────────────────────────────────

const mockSessionManager: SessionManager = {
  list: vi.fn(async () => testSessions),
  listCached: vi.fn(async () => testSessions),
  invalidateCache: vi.fn(),
  get: vi.fn(async (id: string) => testSessions.find((s) => s.id === id) ?? null),
  spawn: vi.fn(async (config) =>
    makeSession({
      id: `session-${Date.now()}`,
      projectId: config.projectId,
      issueId: config.issueId ?? null,
      status: "spawning",
    }),
  ),
  kill: vi.fn(async (id: string) => {
    if (!testSessions.find((s) => s.id === id)) {
      throw new SessionNotFoundError(id);
    }
  }),
  send: vi.fn(async (id: string) => {
    if (!testSessions.find((s) => s.id === id)) {
      throw new SessionNotFoundError(id);
    }
  }),
  cleanup: vi.fn(async () => ({ killed: [], skipped: [], errors: [] })),
  spawnOrchestrator: vi.fn(),
  ensureOrchestrator: vi.fn(),
  relaunchOrchestrator: vi.fn(),
  remap: vi.fn(async () => "ses_mock"),
  restore: vi.fn(async (id: string) => {
    const session = testSessions.find((s) => s.id === id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    // Simulate SessionNotRestorableError for non-terminal sessions
    if (session.status === "working" && session.activity !== "exited") {
      throw new SessionNotRestorableError(id, "session is not in a terminal state");
    }
    return { ...session, status: "spawning" as const, activity: "active" as const };
  }),
};

const mockSCM: SCM = {
  name: "github",
  detectPR: vi.fn(async () => null),
  getPRState: vi.fn(async () => "open" as const),
  mergePR: vi.fn(async () => {}),
  closePR: vi.fn(async () => {}),
  getCIChecks: vi.fn(async () => []),
  getCISummary: vi.fn(async () => "passing" as const),
  getReviews: vi.fn(async () => []),
  getReviewDecision: vi.fn(async () => "approved" as const),
  getPendingComments: vi.fn(async () => []),
  getAutomatedComments: vi.fn(async () => []),
  getMergeability: vi.fn(async () => ({
    mergeable: true,
    ciPassing: true,
    approved: true,
    noConflicts: true,
    blockers: [],
  })),
};

const mockRegistry: PluginRegistry = {
  register: vi.fn(),
  get: vi.fn(() => mockSCM) as PluginRegistry["get"],
  list: vi.fn(() => []),
  loadBuiltins: vi.fn(async () => {}),
  loadFromConfig: vi.fn(async () => {}),
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
      sessionPrefix: "my-app",
      scm: { plugin: "github" },
    },
    "docs-app": {
      name: "Docs App",
      repo: "acme/docs-app",
      path: "/tmp/docs-app",
      defaultBranch: "main",
      sessionPrefix: "docs",
      scm: { plugin: "github" },
    },
  },
  notifiers: {},
  notificationRouting: { urgent: [], action: [], warning: [], info: [] },
  reactions: {},
};

vi.mock("@/lib/services", () => ({
  getServices: vi.fn(async () => ({
    config: mockConfig,
    registry: mockRegistry,
    sessionManager: mockSessionManager,
  })),
  getVerifyIssues: vi.fn(async () => []),
  getSCM: vi.fn(() => mockSCM),
  invalidatePortfolioServicesCache: vi.fn(),
}));

vi.mock("@/lib/engine-client", () => ({
  listSessions: vi.fn(async () => testSessions),
  getSession: vi.fn(async (id: string) => testSessions.find((s) => s.id === id) ?? null),
}));

// Mock filesystem-touching core helpers so PATCH /api/sessions/:id doesn't
// write to the user's actual ~/.agent-orchestrator dir during tests. Spread
// the real module first so the rest of the test file (types, errors, etc.)
// keeps working. Factory must self-contain its mocks because vi.mock is
// hoisted above any module-level declarations.
vi.mock("@made-by-moonlight/athene-core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    updateMetadata: vi.fn(),
    getProjectSessionsDir: vi.fn(() => "/tmp/ao-test/sessions"),
    readAgentReportAuditTrailAsync: vi.fn(async () => []),
    appendOrchestrator: vi.fn(),
    generateOrchestratorPrompt: vi.fn(() => "mock orchestrator system prompt"),
  };
});

// ── Import routes after mocking ───────────────────────────────────────

import * as engineClient from "@/lib/engine-client";
import { GET as sessionsGET } from "@/app/api/sessions/route";
import {
  GET as sessionDetailGET,
  PATCH as sessionDetailPATCH,
} from "@/app/api/sessions/[id]/route";
import { POST as orchestratorsPOST } from "@/app/api/orchestrators/route";
import { POST as spawnPOST } from "@/app/api/spawn/route";
import { POST as sendPOST } from "@/app/api/sessions/[id]/send/route";
import { POST as messagePOST } from "@/app/api/sessions/[id]/message/route";
import { POST as killPOST } from "@/app/api/sessions/[id]/kill/route";
import { POST as restorePOST } from "@/app/api/sessions/[id]/restore/route";
import { POST as remapPOST } from "@/app/api/sessions/[id]/remap/route";
import { POST as mergePOST } from "@/app/api/prs/[id]/merge/route";
import { GET as observabilityGET } from "@/app/api/observability/route";
import { GET as runtimeTerminalGET } from "@/app/api/runtime/terminal/route";
import { GET as verifyGET, POST as verifyPOST } from "@/app/api/verify/route";
import { GET as patchesGET } from "@/app/api/sessions/patches/route";

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    init as ConstructorParameters<typeof NextRequest>[1],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set default return values
  (mockSessionManager.list as ReturnType<typeof vi.fn>).mockResolvedValue(testSessions);
  (mockSessionManager.listCached as ReturnType<typeof vi.fn>).mockResolvedValue(testSessions);
  (mockSessionManager.get as ReturnType<typeof vi.fn>).mockImplementation(
    async (id: string) => testSessions.find((s) => s.id === id) ?? null,
  );
});

describe("API Routes", () => {
  // ── GET /api/sessions ──────────────────────────────────────────────

  describe("GET /api/sessions", () => {
    it("returns sessions array from engine", async () => {
      const res = await sessionsGET(makeRequest("http://localhost:3000/api/sessions"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBe(testSessions.length);
    });

    it("passes projectId query param to engine client", async () => {
      const listSessionsSpy = vi.spyOn(engineClient, "listSessions");
      await sessionsGET(makeRequest("http://localhost:3000/api/sessions?project=my-app"));
      expect(listSessionsSpy).toHaveBeenCalledWith("my-app");
    });

    it("passes undefined projectId when query param is absent", async () => {
      const listSessionsSpy = vi.spyOn(engineClient, "listSessions");
      await sessionsGET(makeRequest("http://localhost:3000/api/sessions"));
      expect(listSessionsSpy).toHaveBeenCalledWith(undefined);
    });
  });

  describe("GET /api/sessions/[id]", () => {
    it("returns session data from engine", async () => {
      const res = await sessionDetailGET(
        makeRequest("http://localhost:3000/api/sessions/backend-7"),
        { params: Promise.resolve({ id: "backend-7" }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe("backend-7");
    });

    it("returns 404 when engine returns null", async () => {
      vi.spyOn(engineClient, "getSession").mockResolvedValueOnce(null);
      const res = await sessionDetailGET(
        makeRequest("http://localhost:3000/api/sessions/does-not-exist"),
        { params: Promise.resolve({ id: "does-not-exist" }) },
      );
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/sessions/[id] ───────────────────────────────────────

  describe("PATCH /api/sessions/[id]", () => {
    function patchRequest(id: string, body: unknown): NextRequest {
      return makeRequest(`http://localhost:3000/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    beforeEach(() => {
      vi.mocked(updateMetadata).mockReset();
    });

    it("persists a sanitized displayName and sets the user-set flag", async () => {
      const res = await sessionDetailPATCH(
        patchRequest("backend-7", { displayName: "  PR 432 review  " }),
        {
          params: Promise.resolve({ id: "backend-7" }),
        },
      );

      expect(res.status).toBe(200);
      expect(vi.mocked(updateMetadata)).toHaveBeenCalledTimes(1);
      const [, sessionId, updates] = vi.mocked(updateMetadata).mock.calls[0];
      expect(sessionId).toBe("backend-7");
      // Whitespace is collapsed and trimmed before persist; flag is set so the
      // dashboard knows to promote this name above PR/issue titles.
      expect(updates).toEqual({ displayName: "PR 432 review", displayNameUserSet: "true" });
      expect(mockSessionManager.invalidateCache).toHaveBeenCalled();
    });

    it("treats null displayName as a clear and unsets the user-set flag", async () => {
      const res = await sessionDetailPATCH(patchRequest("backend-7", { displayName: null }), {
        params: Promise.resolve({ id: "backend-7" }),
      });

      expect(res.status).toBe(200);
      expect(vi.mocked(updateMetadata)).toHaveBeenCalledWith(expect.any(String), "backend-7", {
        displayName: "",
        displayNameUserSet: "",
      });
    });

    it("strips control characters", async () => {
      const res = await sessionDetailPATCH(patchRequest("backend-7", { displayName: "FooBar" }), {
        params: Promise.resolve({ id: "backend-7" }),
      });
      expect(res.status).toBe(200);
      expect(vi.mocked(updateMetadata)).toHaveBeenCalledWith(expect.any(String), "backend-7", {
        displayName: "FooBar",
        displayNameUserSet: "true",
      });
    });

    it("truncates names longer than 80 characters", async () => {
      const longName = "a".repeat(120);
      const res = await sessionDetailPATCH(patchRequest("backend-7", { displayName: longName }), {
        params: Promise.resolve({ id: "backend-7" }),
      });
      expect(res.status).toBe(200);
      const [, , updates] = vi.mocked(updateMetadata).mock.calls[0];
      expect((updates as { displayName: string }).displayName.length).toBe(80);
    });

    it("returns 400 when displayName field is missing", async () => {
      const res = await sessionDetailPATCH(patchRequest("backend-7", {}), {
        params: Promise.resolve({ id: "backend-7" }),
      });
      expect(res.status).toBe(400);
      expect(vi.mocked(updateMetadata)).not.toHaveBeenCalled();
    });

    it("returns 400 when displayName is not a string or null", async () => {
      const res = await sessionDetailPATCH(patchRequest("backend-7", { displayName: 42 }), {
        params: Promise.resolve({ id: "backend-7" }),
      });
      expect(res.status).toBe(400);
      expect(vi.mocked(updateMetadata)).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid JSON", async () => {
      const req = makeRequest("http://localhost:3000/api/sessions/backend-7", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      const res = await sessionDetailPATCH(req, { params: Promise.resolve({ id: "backend-7" }) });
      expect(res.status).toBe(400);
    });

    it("returns 404 when the session is unknown", async () => {
      const res = await sessionDetailPATCH(patchRequest("does-not-exist", { displayName: "x" }), {
        params: Promise.resolve({ id: "does-not-exist" }),
      });
      expect(res.status).toBe(404);
      expect(vi.mocked(updateMetadata)).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/runtime/terminal", () => {
    function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void>) {
      const saved: Record<string, string | undefined> = {};
      for (const key of Object.keys(overrides)) {
        saved[key] = process.env[key];
        if (overrides[key] === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = overrides[key];
        }
      }
      return fn().finally(() => {
        for (const key of Object.keys(saved)) {
          if (saved[key] === undefined) {
            Reflect.deleteProperty(process.env, key);
          } else {
            process.env[key] = saved[key];
          }
        }
      });
    }

    it("returns runtime direct terminal port from server env", async () => {
      await withEnv({ DIRECT_TERMINAL_PORT: "14803", TERMINAL_PORT: "14802" }, async () => {
        const res = await runtimeTerminalGET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.directTerminalPort).toBe("14803");
        expect(data.terminalPort).toBe("14802");
      });
    });

    it("falls back to default ports when env vars are absent", async () => {
      await withEnv({ DIRECT_TERMINAL_PORT: undefined, TERMINAL_PORT: undefined }, async () => {
        const res = await runtimeTerminalGET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.directTerminalPort).toBe("14801");
        expect(data.terminalPort).toBe("14800");
      });
    });

    it("falls back to default ports for non-numeric env values", async () => {
      await withEnv({ DIRECT_TERMINAL_PORT: "abc", TERMINAL_PORT: "not-a-port" }, async () => {
        const res = await runtimeTerminalGET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.directTerminalPort).toBe("14801");
        expect(data.terminalPort).toBe("14800");
      });
    });

    it("falls back to default ports for out-of-range port values", async () => {
      await withEnv({ DIRECT_TERMINAL_PORT: "99999", TERMINAL_PORT: "0" }, async () => {
        const res = await runtimeTerminalGET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.directTerminalPort).toBe("14801");
        expect(data.terminalPort).toBe("14800");
      });
    });

    it("returns null proxyWsPath when TERMINAL_WS_PATH is absent", async () => {
      await withEnv(
        { TERMINAL_WS_PATH: undefined, NEXT_PUBLIC_TERMINAL_WS_PATH: undefined },
        async () => {
          const res = await runtimeTerminalGET();
          expect(res.status).toBe(200);
          const data = await res.json();
          expect(data.proxyWsPath).toBeNull();
        },
      );
    });

    it("rejects proxyWsPath that does not start with /", async () => {
      await withEnv({ TERMINAL_WS_PATH: "no-leading-slash" }, async () => {
        const res = await runtimeTerminalGET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.proxyWsPath).toBeNull();
      });
    });

    it("sets Cache-Control: no-store header", async () => {
      const res = await runtimeTerminalGET();
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  // ── POST /api/spawn ────────────────────────────────────────────────

  describe("POST /api/spawn", () => {
    it("creates a session with valid input", async () => {
      const req = makeRequest("/api/spawn", {
        method: "POST",
        body: JSON.stringify({ projectId: "my-app", issueId: "INT-100" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await spawnPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session).toBeDefined();
      expect(data.session.projectId).toBe("my-app");
      expect(data.session.status).toBe("spawning");
      expect(res.headers.get("x-correlation-id")).toBeTruthy();
    });

    it("returns 400 when projectId is missing", async () => {
      const req = makeRequest("/api/spawn", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const res = await spawnPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/projectId/);
    });

    it("returns 404 when projectId does not exist in config", async () => {
      const req = makeRequest("/api/spawn", {
        method: "POST",
        body: JSON.stringify({ projectId: "mono-orchestrator" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await spawnPOST(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Unknown project: mono-orchestrator");
      expect(mockSessionManager.spawn).not.toHaveBeenCalled();
    });

    it("returns 400 with invalid JSON", async () => {
      const req = makeRequest("/api/spawn", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await spawnPOST(req);
      expect(res.status).toBe(400);
    });

    it("handles missing issueId gracefully", async () => {
      const req = makeRequest("/api/spawn", {
        method: "POST",
        body: JSON.stringify({ projectId: "my-app" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await spawnPOST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session.issueId).toBeNull();
    });
  });

  describe("POST /api/orchestrators", () => {
    it("creates and starts a named orchestrator", async () => {
      (mockSessionManager.ensureOrchestrator as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeSession({ id: "orch-1", projectId: "_meta", metadata: { role: "orchestrator" } }),
      );

      const req = makeRequest("/api/orchestrators", {
        method: "POST",
        body: JSON.stringify({ name: "orch-1", scope: "all" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await orchestratorsPOST(req);

      expect(res.status).toBe(201);
      expect(mockSessionManager.ensureOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({ name: "orch-1" }),
      );
      const data = await res.json();
      expect(data.sessionId).toBe("orch-1");
    });

    it("returns 500 when ensureOrchestrator fails", async () => {
      (mockSessionManager.ensureOrchestrator as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("runtime unavailable"),
      );

      const req = makeRequest("/api/orchestrators", {
        method: "POST",
        body: JSON.stringify({ name: "orch-1", scope: "all" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await orchestratorsPOST(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("runtime unavailable");
    });

    it("returns 400 when name is missing", async () => {
      // POST /api/orchestrators now creates named orchestrators; `name` is required.
      const req = makeRequest("/api/orchestrators", {
        method: "POST",
        body: JSON.stringify({ scope: "all" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await orchestratorsPOST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/name/);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = makeRequest("/api/orchestrators", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });

      const res = await orchestratorsPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid JSON body/);
    });

    it("returns 400 when scope is invalid", async () => {
      // POST /api/orchestrators now creates named orchestrators; scope must be "all" or { projects: [...] }.
      const req = makeRequest("/api/orchestrators", {
        method: "POST",
        body: JSON.stringify({ name: "test-orch", scope: "invalid-scope" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await orchestratorsPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/scope/);
    });

  });

  // ── POST /api/sessions/:id/send ────────────────────────────────────

  describe("POST /api/sessions/:id/send", () => {
    it("sends a message to a valid session", async () => {
      const req = makeRequest("/api/sessions/backend-3/send", {
        method: "POST",
        body: JSON.stringify({ message: "Fix the tests" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await sendPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.message).toBe("Fix the tests");
    });

    it("returns 404 for unknown session", async () => {
      (mockSessionManager.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new SessionNotFoundError("nonexistent"),
      );
      const req = makeRequest("/api/sessions/nonexistent/send", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await sendPOST(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });

    it("returns 400 when message is missing", async () => {
      const req = makeRequest("/api/sessions/backend-3/send", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const res = await sendPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/message/);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = makeRequest("/api/sessions/backend-3/send", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await sendPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 for control-char-only message", async () => {
      const req = makeRequest("/api/sessions/backend-3/send", {
        method: "POST",
        body: JSON.stringify({ message: "\x00\x01\x02" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await sendPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/empty/);
    });
  });

  describe("POST /api/sessions/:id/message", () => {
    it("sends a message to a valid session", async () => {
      const req = makeRequest("/api/sessions/backend-3/message", {
        method: "POST",
        body: JSON.stringify({ message: "Fix the tests" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await messagePOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("returns 404 for unknown session", async () => {
      (mockSessionManager.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new SessionNotFoundError("nonexistent"),
      );

      const req = makeRequest("/api/sessions/nonexistent/message", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await messagePOST(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });

    it("returns 400 when message is missing", async () => {
      const req = makeRequest("/api/sessions/backend-3/message", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const res = await messagePOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/message/);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = makeRequest("/api/sessions/backend-3/message", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await messagePOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 for control-char-only message", async () => {
      const req = makeRequest("/api/sessions/backend-3/message", {
        method: "POST",
        body: JSON.stringify({ message: "\x00\x01\x02" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await messagePOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/empty/);
    });
  });

  // ── POST /api/sessions/:id/kill ────────────────────────────────────

  describe("POST /api/sessions/:id/kill", () => {
    it("kills a valid session", async () => {
      const req = makeRequest("/api/sessions/backend-3/kill", { method: "POST" });
      const res = await killPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.sessionId).toBe("backend-3");
    });

    it("returns 404 for unknown session", async () => {
      (mockSessionManager.kill as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new SessionNotFoundError("nonexistent"),
      );
      const req = makeRequest("/api/sessions/nonexistent/kill", { method: "POST" });
      const res = await killPOST(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/sessions/:id/restore ─────────────────────────────────

  describe("POST /api/sessions/:id/restore", () => {
    it("restores a killed session", async () => {
      const req = makeRequest("/api/sessions/frontend-1/restore", { method: "POST" });
      const res = await restorePOST(req, { params: Promise.resolve({ id: "frontend-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.sessionId).toBe("frontend-1");
    });

    it("returns 404 for unknown session", async () => {
      const req = makeRequest("/api/sessions/nonexistent/restore", { method: "POST" });
      const res = await restorePOST(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });

    it("returns 409 for active session", async () => {
      const req = makeRequest("/api/sessions/backend-9/restore", { method: "POST" });
      const res = await restorePOST(req, { params: Promise.resolve({ id: "backend-9" }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/not in a terminal state/);
    });
  });

  describe("POST /api/sessions/:id/remap", () => {
    it("remaps a valid session", async () => {
      const req = makeRequest("/api/sessions/backend-3/remap", { method: "POST" });
      const res = await remapPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.opencodeSessionId).toBe("ses_mock");
      expect(mockSessionManager.remap).toHaveBeenCalledWith("backend-3", true);
    });

    it("returns 404 when session is missing", async () => {
      (mockSessionManager.remap as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new SessionNotFoundError("missing"),
      );
      const req = makeRequest("/api/sessions/missing/remap", { method: "POST" });
      const res = await remapPOST(req, { params: Promise.resolve({ id: "missing" }) });
      expect(res.status).toBe(404);
    });

    it("returns 422 for non-opencode sessions", async () => {
      (mockSessionManager.remap as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Session backend-3 is not using the opencode agent"),
      );
      const req = makeRequest("/api/sessions/backend-3/remap", { method: "POST" });
      const res = await remapPOST(req, { params: Promise.resolve({ id: "backend-3" }) });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toMatch(/not using the opencode agent/);
    });
  });

  // ── POST /api/prs/:id/merge ────────────────────────────────────────

  describe("POST /api/prs/:id/merge", () => {
    it("merges a mergeable PR", async () => {
      const req = makeRequest("/api/prs/432/merge", { method: "POST" });
      const res = await mergePOST(req, { params: Promise.resolve({ id: "432" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.prNumber).toBe(432);
    });

    it("returns 404 for unknown PR", async () => {
      const req = makeRequest("/api/prs/99999/merge", { method: "POST" });
      const res = await mergePOST(req, { params: Promise.resolve({ id: "99999" }) });
      expect(res.status).toBe(404);
    });

    it("returns 422 for non-mergeable PR", async () => {
      (mockSCM.getMergeability as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        mergeable: false,
        ciPassing: false,
        approved: false,
        noConflicts: true,
        blockers: ["CI checks failing", "Needs review"],
      });
      const req = makeRequest("/api/prs/432/merge", { method: "POST" });
      const res = await mergePOST(req, { params: Promise.resolve({ id: "432" }) });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toMatch(/not mergeable/);
      expect(data.blockers).toBeDefined();
    });

    it("returns 400 for non-numeric PR id", async () => {
      const req = makeRequest("/api/prs/abc/merge", { method: "POST" });
      const res = await mergePOST(req, { params: Promise.resolve({ id: "abc" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid PR number/);
    });

    it("returns 409 for merged PR", async () => {
      (mockSCM.getPRState as ReturnType<typeof vi.fn>).mockResolvedValueOnce("merged");
      const req = makeRequest("/api/prs/432/merge", { method: "POST" });
      const res = await mergePOST(req, { params: Promise.resolve({ id: "432" }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/merged/);
    });
  });

  describe("GET /api/observability", () => {
    it("returns observability summary with correlation header", async () => {
      const req = makeRequest("/api/observability", { method: "GET" });
      const res = await observabilityGET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-correlation-id")).toBeTruthy();
      const data = await res.json();
      expect(data).toHaveProperty("generatedAt");
      expect(data).toHaveProperty("overallStatus");
      expect(data).toHaveProperty("projects");
    });
  });

  describe("GET /api/verify", () => {
    it("returns verify issues", async () => {
      const res = await verifyGET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.issues)).toBe(true);
    });
  });

  describe("POST /api/verify", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = makeRequest("/api/verify", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await verifyPOST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid JSON body/);
    });
  });
  // ── GET /api/sessions/patches ──────────────────────────────────────────

  describe("GET /api/sessions/patches", () => {
    it("returns patches array with lightweight fields", async () => {
      const res = await patchesGET(makeRequest("http://localhost:3000/api/sessions/patches"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBe(testSessions.length);
    });

    it("each patch contains id, status, activity, attentionLevel, lastActivityAt", async () => {
      const res = await patchesGET(makeRequest("http://localhost:3000/api/sessions/patches"));
      const data = await res.json();
      for (const patch of data.sessions) {
        expect(patch).toHaveProperty("id");
        expect(patch).toHaveProperty("status");
        expect(patch).toHaveProperty("activity");
        expect(patch).toHaveProperty("attentionLevel");
        expect(patch).toHaveProperty("lastActivityAt");
      }
    });

    it("filters by project query param", async () => {
      const res = await patchesGET(
        makeRequest("http://localhost:3000/api/sessions/patches?project=my-app"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    it("returns 500 when getServices throws", async () => {
      const { getServices } = await import("@/lib/services");
      vi.mocked(getServices).mockRejectedValueOnce(new Error("db down"));
      const res = await patchesGET(makeRequest("http://localhost:3000/api/sessions/patches"));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("db down");
    });
  });
});
