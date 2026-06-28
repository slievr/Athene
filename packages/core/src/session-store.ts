import type { Database as DB } from "better-sqlite3";
import type {
  Session,
  CanonicalSessionLifecycle,
  ActivityDetection,
  ActivitySignal,
} from "./types.js";

export interface SessionStore {
  create(session: Session): void;
  get(id: string): Session | null;
  list(projectId?: string): Session[];
  update(id: string, patch: Partial<Session>): void;
  setKV(sessionId: string, key: string, value: string): void;
  getKV(sessionId: string, key: string): string | null;
  getAllKV(sessionId: string): Record<string, string>;
  remove(id: string): void;
}

interface SessionRow {
  id: string;
  project_id: string;
  lifecycle: string;
  branch: string | null;
  issue_id: string | null;
  workspace_path: string | null;
  runtime_handle: string | null;
  agent_info: string | null;
  created_at: number;
  last_activity_at: number | null;
  activity: string | null;
  activity_signal: string;
}

function rowToSession(row: SessionRow, kv: Record<string, string>): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    status: "spawning", // derived by deriveLegacyStatus — caller handles this
    activity: row.activity ? (JSON.parse(row.activity) as ActivityDetection).state : null,
    activitySignal: JSON.parse(row.activity_signal) as ActivitySignal,
    lifecycle: JSON.parse(row.lifecycle) as CanonicalSessionLifecycle,
    branch: row.branch,
    issueId: row.issue_id,
    pr: null, // derived from lifecycle.pr by session-manager
    prs: [],
    workspacePath: row.workspace_path,
    runtimeHandle: row.runtime_handle ? JSON.parse(row.runtime_handle) : null,
    agentInfo: row.agent_info ? JSON.parse(row.agent_info) : null,
    createdAt: new Date(row.created_at),
    lastActivityAt: row.last_activity_at !== null
      ? new Date(row.last_activity_at)
      : (() => { throw new Error(`session ${row.id} has null last_activity_at`); })(),
    metadata: kv,
  };
}

export function createSessionStore(db: DB): SessionStore {
  const stmts = {
    insert: db.prepare(`
      INSERT INTO sessions (id, project_id, lifecycle, branch, issue_id, workspace_path,
        runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal)
      VALUES (@id, @projectId, @lifecycle, @branch, @issueId, @workspacePath,
        @runtimeHandle, @agentInfo, @createdAt, @lastActivityAt, @activity, @activitySignal)
    `),
    selectById: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    selectByProject: db.prepare(
      `SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`,
    ),
    selectAll: db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`),
    delete: db.prepare(`DELETE FROM sessions WHERE id = ?`),
    selectKV: db.prepare(`SELECT key, value FROM session_kv WHERE session_id = ?`),
    upsertKV: db.prepare(
      `INSERT INTO session_kv (session_id, key, value) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value`,
    ),
    selectOneKV: db.prepare(`SELECT value FROM session_kv WHERE session_id = ? AND key = ?`),
  };

  function getKVMap(sessionId: string): Record<string, string> {
    const rows = stmts.selectKV.all(sessionId) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  }

  return {
    create(session: Session): void {
      stmts.insert.run({
        id: session.id,
        projectId: session.projectId,
        lifecycle: JSON.stringify(session.lifecycle),
        branch: session.branch,
        issueId: session.issueId,
        workspacePath: session.workspacePath,
        runtimeHandle: session.runtimeHandle ? JSON.stringify(session.runtimeHandle) : null,
        agentInfo: session.agentInfo ? JSON.stringify(session.agentInfo) : null,
        createdAt: session.createdAt.getTime(),
        lastActivityAt: session.lastActivityAt.getTime(),
        activity: session.activity ? JSON.stringify({ state: session.activity }) : null,
        activitySignal: JSON.stringify(session.activitySignal),
      });
    },

    get(id: string): Session | null {
      const row = stmts.selectById.get(id) as SessionRow | undefined;
      if (!row) return null;
      return rowToSession(row, getKVMap(id));
    },

    list(projectId?: string): Session[] {
      const rows = projectId
        ? (stmts.selectByProject.all(projectId) as SessionRow[])
        : (stmts.selectAll.all() as SessionRow[]);
      return rows.map((row) => rowToSession(row, getKVMap(row.id)));
    },

    update(id: string, patch: Partial<Session>): void {
      // Note: status, pr, and prs are derived/in-memory fields and intentionally not stored.
      // They are computed from lifecycle state and session manager context.
      const sets: string[] = [];
      const values: unknown[] = [];

      if (patch.lifecycle !== undefined) {
        sets.push("lifecycle = ?");
        values.push(JSON.stringify(patch.lifecycle));
      }
      if (patch.branch !== undefined) {
        sets.push("branch = ?");
        values.push(patch.branch);
      }
      if (patch.issueId !== undefined) {
        sets.push("issue_id = ?");
        values.push(patch.issueId);
      }
      if (patch.workspacePath !== undefined) {
        sets.push("workspace_path = ?");
        values.push(patch.workspacePath);
      }
      if (patch.runtimeHandle !== undefined) {
        sets.push("runtime_handle = ?");
        values.push(patch.runtimeHandle ? JSON.stringify(patch.runtimeHandle) : null);
      }
      if (patch.agentInfo !== undefined) {
        sets.push("agent_info = ?");
        values.push(patch.agentInfo ? JSON.stringify(patch.agentInfo) : null);
      }
      if (patch.lastActivityAt !== undefined) {
        sets.push("last_activity_at = ?");
        values.push(patch.lastActivityAt.getTime());
      }
      if (patch.activity !== undefined) {
        sets.push("activity = ?");
        values.push(patch.activity ? JSON.stringify({ state: patch.activity }) : null);
      }
      if (patch.activitySignal !== undefined) {
        sets.push("activity_signal = ?");
        values.push(JSON.stringify(patch.activitySignal));
      }

      if (sets.length === 0) return;
      values.push(id);
      db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    },

    setKV(sessionId: string, key: string, value: string): void {
      stmts.upsertKV.run(sessionId, key, value);
    },

    getKV(sessionId: string, key: string): string | null {
      const row = stmts.selectOneKV.get(sessionId, key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    getAllKV(sessionId: string): Record<string, string> {
      return getKVMap(sessionId);
    },

    remove(id: string): void {
      stmts.delete.run(id);
    },
  };
}
