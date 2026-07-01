package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

const schema = `
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
`

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

type Session struct {
	ID             string            `json:"id"`
	ProjectID      string            `json:"projectId"`
	Lifecycle      json.RawMessage   `json:"lifecycle"`
	Branch         *string           `json:"branch,omitempty"`
	IssueID        *string           `json:"issueId,omitempty"`
	WorkspacePath  *string           `json:"workspacePath,omitempty"`
	RuntimeHandle  json.RawMessage   `json:"runtimeHandle,omitempty"`
	AgentInfo      json.RawMessage   `json:"agentInfo,omitempty"`
	CreatedAt      int64             `json:"createdAt"`
	LastActivityAt *int64            `json:"lastActivityAt,omitempty"`
	Activity       json.RawMessage   `json:"activity,omitempty"`
	ActivitySignal string            `json:"activitySignal"`
	KV             map[string]string `json:"metadata,omitempty"`
}

func (s *Store) GetSession(id string) (*Session, error) {
	row := s.db.QueryRow(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions WHERE id = ?`, id)
	sess, err := scanSession(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.KV, err = s.getKV(id)
	return sess, err
}

func (s *Store) ListSessions(projectID string) ([]*Session, error) {
	var rows *sql.Rows
	var err error
	if projectID != "" {
		rows, err = s.db.Query(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions WHERE project_id = ? ORDER BY created_at DESC`, projectID)
	} else {
		rows, err = s.db.Query(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions ORDER BY created_at DESC`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*Session
	for rows.Next() {
		sess, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sess.KV, err = s.getKV(sess.ID)
		if err != nil {
			log.Printf("getKV for session %s: %v", sess.ID, err)
		}
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

func (s *Store) getKV(sessionID string) (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM session_kv WHERE session_id = ?`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	kv := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		kv[k] = v
	}
	return kv, rows.Err()
}

type scanner interface {
	Scan(...any) error
}

func scanSession(s scanner) (*Session, error) {
	var sess Session
	return &sess, s.Scan(
		&sess.ID, &sess.ProjectID, &sess.Lifecycle,
		&sess.Branch, &sess.IssueID, &sess.WorkspacePath,
		&sess.RuntimeHandle, &sess.AgentInfo,
		&sess.CreatedAt, &sess.LastActivityAt,
		&sess.Activity, &sess.ActivitySignal,
	)
}
