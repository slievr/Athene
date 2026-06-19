import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ENV,
  legacyEnvName,
  type OrchestratorConfig,
  type SessionManager,
} from "@made-by-moonlight/athene-core";
import type * as AoCoreType from "@made-by-moonlight/athene-core";

// Regression coverage for the non-breaking AO_*→ATHENE_* dual-read decision:
// the execute route reads CODE_REVIEW_COMMAND via getEnvString(), so a legacy
// AO_CODE_REVIEW_COMMAND set by an older caller must still be honored.

const { mockConfig, mockSessionManager, mockExecuteCodeReviewRun, mockCreateShellRunner } =
  vi.hoisted(() => ({
    mockConfig: {
      configPath: "/tmp/ao/agent-orchestrator.yaml",
      readyThresholdMs: 300_000,
      defaults: { runtime: "tmux", agent: "codex", workspace: "worktree", notifiers: [] },
      projects: {
        app: {
          name: "App",
          path: "/tmp/app",
          defaultBranch: "main",
          sessionPrefix: "app",
        },
      },
      notifiers: {},
      notificationRouting: { urgent: [], action: [], warning: [], info: [] },
      reactions: {},
    } satisfies OrchestratorConfig,
    mockSessionManager: {} as SessionManager,
    mockExecuteCodeReviewRun: vi.fn(async () => ({ id: "run-1", status: "completed" })),
    mockCreateShellRunner: vi.fn(() => async () => ({})),
  }));

vi.mock("@made-by-moonlight/athene-core", async () => {
  const actual = (await vi.importActual(
    "@made-by-moonlight/athene-core",
  )) as typeof AoCoreType;
  return {
    ...actual,
    // Keep getEnvString/ENV/legacyEnvName real; only stub the review entry points.
    executeCodeReviewRun: mockExecuteCodeReviewRun,
    createShellCodeReviewRunner: mockCreateShellRunner,
  };
});

vi.mock("@/lib/services", () => ({
  getServices: vi.fn(async () => ({
    config: mockConfig,
    sessionManager: mockSessionManager,
  })),
}));

import { POST as POST_EXECUTE } from "@/app/api/reviews/execute/route";

const LEGACY_REVIEW_CMD = legacyEnvName(ENV.CODE_REVIEW_COMMAND);

function makeRequest(): NextRequest {
  return new NextRequest(new URL("/api/reviews/execute", "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify({ projectId: "app", runId: "run-1" }),
  } as ConstructorParameters<typeof NextRequest>[1]);
}

let originalNew: string | undefined;
let originalLegacy: string | undefined;

beforeEach(() => {
  originalNew = process.env[ENV.CODE_REVIEW_COMMAND];
  originalLegacy = process.env[LEGACY_REVIEW_CMD];
  Reflect.deleteProperty(process.env, ENV.CODE_REVIEW_COMMAND);
  Reflect.deleteProperty(process.env, LEGACY_REVIEW_CMD);
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalNew === undefined) Reflect.deleteProperty(process.env, ENV.CODE_REVIEW_COMMAND);
  else process.env[ENV.CODE_REVIEW_COMMAND] = originalNew;
  if (originalLegacy === undefined) Reflect.deleteProperty(process.env, LEGACY_REVIEW_CMD);
  else process.env[LEGACY_REVIEW_CMD] = originalLegacy;
});

describe("POST /api/reviews/execute legacy env fallback", () => {
  it("honors legacy AO_CODE_REVIEW_COMMAND via getEnvString()", async () => {
    process.env[LEGACY_REVIEW_CMD] = "echo legacy-review";

    const res = await POST_EXECUTE(makeRequest());

    expect(res.status).toBe(200);
    // Reading the legacy var must still build a shell runner from its value.
    expect(mockCreateShellRunner).toHaveBeenCalledWith("echo legacy-review");
    expect(mockExecuteCodeReviewRun).toHaveBeenCalledWith(
      expect.objectContaining({ runReviewer: expect.any(Function) }),
      expect.objectContaining({ projectId: "app", runId: "run-1" }),
    );
  });

  it("prefers ATHENE_CODE_REVIEW_COMMAND over the legacy alias", async () => {
    process.env[LEGACY_REVIEW_CMD] = "echo legacy-review";
    process.env[ENV.CODE_REVIEW_COMMAND] = "echo new-review";

    const res = await POST_EXECUTE(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCreateShellRunner).toHaveBeenCalledWith("echo new-review");
  });
});
