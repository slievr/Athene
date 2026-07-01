import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openDb, closeDb } from "../db.js";
import { createSessionStore } from "../session-store.js";
import type { Database as DB } from "better-sqlite3";
import type { Session, CanonicalSessionLifecycle, ActivitySignal } from "../types.js";

function makeLifecycle(): CanonicalSessionLifecycle {
  const now = new Date().toISOString();
  return {
    version: 2,
    session: {
      kind: "worker",
      state: "not_started",
      reason: "spawn_requested",
      startedAt: null,
      completedAt: null,
      terminatedAt: null,
      lastTransitionAt: now,
    },
    pr: {
      state: "none",
      reason: "not_created",
      number: null,
      url: null,
      lastObservedAt: null,
    },
    runtime: {
      state: "unknown",
      reason: "spawn_incomplete",
      lastObservedAt: null,
      handle: null,
      tmuxName: null,
    },
  };
}

function makeActivitySignal(): ActivitySignal {
  return { state: "null", activity: null, source: "none" };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-session-1",
    projectId: "test-project",
    status: "spawning",
    activity: null,
    activitySignal: makeActivitySignal(),
    lifecycle: makeLifecycle(),
    branch: "feat/test",
    issueId: null,
    pr: null,
    prs: [],
    workspacePath: "/tmp/test",
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(1000000),
    lastActivityAt: new Date(1000000),
    metadata: {},
    ...overrides,
  };
}

describe("SessionStore", () => {
  let dir: string;
  let db: DB;
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athene-store-test-"));
    db = openDb(join(dir, "athene.db"));
    store = createSessionStore(db);
  });

  afterEach(() => {
    closeDb(db);
    rmSync(dir, { recursive: true });
  });

  it("creates and retrieves a session", () => {
    const session = makeSession();
    store.create(session);
    const retrieved = store.get("test-session-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("test-session-1");
    expect(retrieved!.projectId).toBe("test-project");
  });

  it("lists sessions filtered by projectId", () => {
    store.create(makeSession({ id: "s1", projectId: "proj-a" }));
    store.create(makeSession({ id: "s2", projectId: "proj-b" }));
    store.create(makeSession({ id: "s3", projectId: "proj-a" }));

    const projA = store.list("proj-a");
    expect(projA).toHaveLength(2);
    expect(projA.map((s: Session) => s.id)).toEqual(expect.arrayContaining(["s1", "s3"]));
  });

  it("updates a session field", () => {
    store.create(makeSession());
    store.update("test-session-1", { branch: "updated-branch" });
    const updated = store.get("test-session-1");
    expect(updated!.branch).toBe("updated-branch");
  });

  it("stores and retrieves key-value pairs", () => {
    store.create(makeSession());
    store.setKV("test-session-1", "custom_key", "custom_value");
    expect(store.getKV("test-session-1", "custom_key")).toBe("custom_value");
  });

  it("deletes session and cascades KV deletion", () => {
    store.create(makeSession());
    store.setKV("test-session-1", "k", "v");
    store.remove("test-session-1");
    expect(store.get("test-session-1")).toBeNull();
    expect(store.getKV("test-session-1", "k")).toBeNull();
  });
});
