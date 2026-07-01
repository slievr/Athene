import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    lifecycle TEXT NOT NULL DEFAULT '{}',
    branch TEXT,
    issue_id TEXT,
    workspace_path TEXT,
    runtime_handle TEXT,
    agent_info TEXT,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER,
    activity TEXT,
    activity_signal TEXT NOT NULL DEFAULT 'none'
  );

  CREATE TABLE IF NOT EXISTS session_kv (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (session_id, key)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
`;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec(SCHEMA);
  return db;
}

export function closeDb(db: DB): void {
  db.close();
}
