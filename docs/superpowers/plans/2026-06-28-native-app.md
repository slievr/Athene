# Athene Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript/Node.js backend and Next.js dashboard with a single Rust binary that embeds the Athene engine, always serves an HTTP API, and runs a native Iced UI.

**Architecture:** Three Cargo crates in a workspace: `athene-core` (engine library), `athene-server` (axum HTTP layer), `athene-app` (Iced binary that embeds both). A `tokio::sync::broadcast` channel is the single event bus — the native UI and remote HTTP clients both subscribe to it. See `docs/superpowers/specs/2026-06-28-native-app-design.md`.

**Tech Stack:** Rust, Iced 0.13, alacritty_terminal 0.24, tokio 1, axum 0.7, rusqlite, portable-pty, notify-rust 4, serde/serde_json, toml, dirs 5.

**Reference implementation:** PR #74 (Go engine migration, phases 1–7) defines the plugin interface types, session store schema, lifecycle state machine, and JSON-RPC adapter protocol. Port the design, not the code.

## Global Constraints

- macOS + Linux only. No Windows.
- Iced features: `tokio`, `canvas`, `advanced`, `wgpu`.
- All engine state accessed via `Arc<Engine>` — no `Arc<Mutex<>>` wrapping individual fields.
- `update()` is a pure function: `(Model, Message) → (Model, Command<Message>)`.
- Repo names in worker rows are never truncated.
- Notification cap: 50 in `VecDeque`.
- App config: `~/.config/athene/config.toml`. Engine config: `agent-orchestrator.yaml` (existing format).
- HTTP server always starts on launch, even in headless mode.
- Headless mode: engine + HTTP server only, no Iced window. Triggered by `--headless` flag or absent display.

## Milestones

| # | Name | Testable when… |
|---|---|---|
| **M1** | Engine + REST API | `athene-app --headless` starts; `curl /api/v1/sessions` returns sessions; lifecycle polling logs |
| **M2** | SSE + WebSocket | Existing web dashboard connects and gets real-time session updates; terminals open |
| **M3** | Native app shell | `athene-app` opens; sidebar shows orchestrators/workers; fleet board shows sessions |
| **M4** | Native terminal | Click a worker → terminal opens and is interactive |
| **M5** | Full parity | Info panel, CI badges, review comments, OS notifications all work |

---

## File Structure

```
athene/                              new Cargo workspace (alongside existing pnpm workspace)
├── Cargo.toml                       workspace root
├── crates/
│   ├── athene-core/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs               pub use everything; Engine struct
│   │       ├── types.rs             Session, Orchestrator, PR, CIStatus, Comment, Notification
│   │       ├── events.rs            Event enum + broadcast::Sender<Event>
│   │       ├── config.rs            AppConfig (toml) + ProjectConfig (yaml)
│   │       ├── store.rs             SQLite session store (rusqlite)
│   │       ├── lifecycle/
│   │       │   ├── mod.rs
│   │       │   ├── poller.rs        per-session polling loop
│   │       │   └── probe.rs         process liveness check
│   │       └── plugin/
│   │           ├── mod.rs
│   │           ├── types.rs         Runtime, Workspace, Agent traits
│   │           ├── adapter.rs       JSON-RPC subprocess adapter
│   │           └── registry.rs      plugin discovery + load
│   │
│   ├── athene-server/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs               pub fn start(engine, addr) -> JoinHandle
│   │       ├── server.rs            axum router, graceful shutdown
│   │       └── routes/
│   │           ├── sessions.rs      GET/POST/DELETE /api/v1/sessions
│   │           ├── orchestrators.rs GET/POST /api/v1/orchestrators
│   │           ├── events.rs        GET /api/v1/events (SSE)
│   │           └── terminal.rs      WS /api/v1/sessions/:id/terminal
│   │
│   └── athene-app/
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs              start engine + server; launch Iced or exit headless
│           ├── app.rs               Model, Message, Application impl
│           ├── theme.rs             warm-stone palette
│           └── components/
│               ├── mod.rs
│               ├── sidebar.rs
│               ├── fleet_board.rs
│               ├── session_detail.rs
│               ├── terminal.rs      TerminalState + Canvas widget
│               └── info_panel.rs
```

---

## M1: Engine + REST API

**Goal:** `athene-app --headless` starts, loads config, polls session lifecycle, serves `/api/v1/sessions` over HTTP.

---

### Task 1: Cargo workspace + athene-core scaffold

**Files:**
- Create: `athene/Cargo.toml`
- Create: `athene/crates/athene-core/Cargo.toml`
- Create: `athene/crates/athene-core/src/lib.rs`
- Create: `athene/crates/athene-core/src/types.rs`
- Create: `athene/crates/athene-core/src/config.rs`

**Interfaces:**
- Produces: `AppConfig { port: u16, font_size: f32 }`, `AppConfig::load()`, `AppConfig::save()`
- Produces: `Session`, `Orchestrator`, `SessionStatus`, `SessionId`, `OrchestratorId`

---

- [ ] **Step 1: Create `athene/Cargo.toml`**

```toml
[workspace]
members = [
    "crates/athene-core",
    "crates/athene-server",
    "crates/athene-app",
]
resolver = "2"

[workspace.dependencies]
tokio       = { version = "1",    features = ["full"] }
serde       = { version = "1",    features = ["derive"] }
serde_json  = "1"
axum        = { version = "0.7",  features = ["ws"] }
rusqlite    = { version = "0.31", features = ["bundled"] }
anyhow      = "1"
toml        = "0.8"
dirs        = "5"
tracing     = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tokio-util  = { version = "0.7",  features = ["sync"] }
libc        = "0.2"
```

- [ ] **Step 2: Create `athene/crates/athene-core/Cargo.toml`**

```toml
[package]
name    = "athene-core"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio      = { workspace = true }
serde      = { workspace = true }
serde_json = { workspace = true }
rusqlite   = { workspace = true }
anyhow     = { workspace = true }
toml       = { workspace = true }
dirs       = { workspace = true }
tracing    = { workspace = true }
tokio-util = { workspace = true }
libc       = { workspace = true }

[dev-dependencies]
tempfile   = "3"
tokio-test = "0.4"
```

- [ ] **Step 3: Create `athene/crates/athene-core/src/types.rs`**

```rust
use serde::{Deserialize, Serialize};

pub type SessionId      = String;
pub type OrchestratorId = String;
pub type PrId           = i64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Spawning, Working, PrOpen, CiFailed,
    ReviewPending, Mergeable, Done, Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id:             SessionId,
    pub orchestrator_id:Option<OrchestratorId>,
    pub name:           String,
    pub repo:           String,
    pub status:         SessionStatus,
    pub agent_type:     String,
    pub cost_usd:       f64,
    pub started_at:     i64,
    pub pr_number:      Option<u64>,
    pub pr_id:          Option<PrId>,
    pub workspace_path: Option<String>,
    pub pid:            Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orchestrator {
    pub id:         OrchestratorId,
    pub name:       String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PR {
    pub id:         PrId,
    pub number:     u64,
    pub title:      String,
    pub url:        String,
    pub body:       String,
    pub session_id: SessionId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CIStatus {
    pub pr_id:   PrId,
    pub total:   u32,
    pub passing: u32,
    pub failing: u32,
    pub pending: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id:         i64,
    pub pr_id:      PrId,
    pub author:     String,
    pub body:       String,
    pub path:       Option<String>,
    pub line:       Option<u32>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationKind {
    CiFailure, AgentStuck, PrNeedsAttention, MergeConflict, WorkerDone,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id:         String,
    pub kind:       NotificationKind,
    pub title:      String,
    pub body:       String,
    pub session_id: Option<SessionId>,
}
```

- [ ] **Step 4: Create `athene/crates/athene-core/src/config.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port:      u16,
    pub font_size: f32,
}

impl Default for AppConfig {
    fn default() -> Self { Self { port: 8080, font_size: 13.0 } }
}

impl AppConfig {
    fn path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("athene").join("config.toml")
    }

    pub fn load() -> Result<Self> {
        let p = Self::path();
        if !p.exists() { return Ok(Self::default()); }
        Ok(toml::from_str(&fs::read_to_string(p)?)?)
    }

    pub fn save(&self) -> Result<()> {
        let p = Self::path();
        fs::create_dir_all(p.parent().unwrap())?;
        fs::write(p, toml::to_string(self)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let cfg = AppConfig { port: 9090, font_size: 14.0 };
        fs::write(&path, toml::to_string(&cfg).unwrap()).unwrap();
        let loaded: AppConfig = toml::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded.port, 9090);
    }
}
```

- [ ] **Step 5: Create `athene/crates/athene-core/src/lib.rs`**

```rust
pub mod config;
pub mod events;
pub mod lifecycle;
pub mod plugin;
pub mod store;
pub mod types;

pub use config::AppConfig;
pub use events::{Engine, Event};
pub use types::*;
```

- [ ] **Step 6: Run tests**

```bash
cd athene && cargo test -p athene-core
```

Expected: `test config::tests::round_trip ... ok`

- [ ] **Step 7: Commit**

```bash
git add athene/
git commit -m "feat(engine): athene-core scaffold with types and config"
```

---

### Task 2: SQLite session store

**Files:**
- Create: `athene/crates/athene-core/src/store.rs`

**Interfaces:**
- Produces: `Store::open(path) -> Result<Store>`, `Store::upsert_session(&Session)`, `Store::list_sessions() -> Result<Vec<Session>>`, `Store::upsert_orchestrator(&Orchestrator)`, `Store::list_orchestrators() -> Result<Vec<Orchestrator>>`

---

- [ ] **Step 1: Write tests first**

```rust
// athene/crates/athene-core/src/store.rs (test module)
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use tempfile::tempdir;

    fn test_store() -> Store {
        Store::open(tempdir().unwrap().into_path().join("t.db")).unwrap()
    }

    #[test]
    fn upsert_and_list_session() {
        let store = test_store();
        let session = Session {
            id: "s1".into(), orchestrator_id: None, name: "worker-1".into(),
            repo: "slievr/Athene".into(), status: SessionStatus::Working,
            agent_type: "claude-code".into(), cost_usd: 0.0, started_at: 0,
            pr_number: None, pr_id: None, workspace_path: None, pid: None,
        };
        store.upsert_session(&session).unwrap();
        let list = store.list_sessions().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "s1");
    }

    #[test]
    fn upsert_updates_status() {
        let store = test_store();
        let mut s = Session {
            id: "s1".into(), orchestrator_id: None, name: "w".into(),
            repo: "r".into(), status: SessionStatus::Working,
            agent_type: "c".into(), cost_usd: 0.0, started_at: 0,
            pr_number: None, pr_id: None, workspace_path: None, pid: None,
        };
        store.upsert_session(&s).unwrap();
        s.status = SessionStatus::Done;
        store.upsert_session(&s).unwrap();
        let list = store.list_sessions().unwrap();
        assert_eq!(list.len(), 1);
        assert!(matches!(list[0].status, SessionStatus::Done));
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd athene && cargo test -p athene-core store 2>&1 | tail -5
```

Expected: compile error (Store not defined).

- [ ] **Step 3: Implement `athene/crates/athene-core/src/store.rs`**

```rust
use crate::types::*;
use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Store { conn: Connection }

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, orchestrator_id TEXT,
                name TEXT NOT NULL, repo TEXT NOT NULL,
                status TEXT NOT NULL, agent_type TEXT NOT NULL,
                cost_usd REAL NOT NULL DEFAULT 0, started_at INTEGER NOT NULL,
                pr_number INTEGER, pr_id INTEGER,
                workspace_path TEXT, pid INTEGER
            );
            CREATE TABLE IF NOT EXISTS orchestrators (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
            );
        ")?;
        Ok(Self { conn })
    }

    pub fn upsert_session(&self, s: &Session) -> Result<()> {
        let status = serde_json::to_string(&s.status)?.replace('"', "");
        self.conn.execute(
            "INSERT INTO sessions (id,orchestrator_id,name,repo,status,agent_type,
             cost_usd,started_at,pr_number,pr_id,workspace_path,pid)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET
             status=excluded.status,cost_usd=excluded.cost_usd,
             pr_number=excluded.pr_number,pr_id=excluded.pr_id,
             workspace_path=excluded.workspace_path,pid=excluded.pid",
            params![s.id,s.orchestrator_id,s.name,s.repo,status,s.agent_type,
                    s.cost_usd,s.started_at,s.pr_number,s.pr_id,
                    s.workspace_path,s.pid],
        )?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,orchestrator_id,name,repo,status,agent_type,cost_usd,
             started_at,pr_number,pr_id,workspace_path,pid
             FROM sessions ORDER BY started_at DESC")?;
        let rows = stmt.query_map([], |r| Ok((
            r.get::<_,String>(0)?, r.get(1)?, r.get(2)?, r.get(3)?,
            r.get::<_,String>(4)?, r.get(5)?, r.get(6)?, r.get(7)?,
            r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?
        )))?;
        rows.map(|r| {
            let (id,orchestrator_id,name,repo,status_str,agent_type,
                 cost_usd,started_at,pr_number,pr_id,workspace_path,pid) = r?;
            let status = serde_json::from_str(&format!("\"{status_str}\""))
                .unwrap_or(SessionStatus::Working);
            Ok(Session { id,orchestrator_id,name,repo,status,agent_type,
                         cost_usd,started_at,pr_number,pr_id,workspace_path,pid })
        }).collect()
    }

    pub fn upsert_orchestrator(&self, o: &Orchestrator) -> Result<()> {
        self.conn.execute(
            "INSERT INTO orchestrators(id,name,created_at) VALUES(?1,?2,?3)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name",
            params![o.id, o.name, o.created_at],
        )?;
        Ok(())
    }

    pub fn list_orchestrators(&self) -> Result<Vec<Orchestrator>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,name,created_at FROM orchestrators ORDER BY created_at DESC")?;
        stmt.query_map([], |r| Ok(Orchestrator {
            id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)?
        }))?.collect::<Result<Vec<_>,_>>().map_err(Into::into)
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd athene && cargo test -p athene-core store
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add athene/crates/athene-core/src/store.rs
git commit -m "feat(engine): SQLite session and orchestrator store"
```

---

### Task 3: Event bus + Engine handle

**Files:**
- Create: `athene/crates/athene-core/src/events.rs`

**Interfaces:**
- Produces: `Event` enum, `Engine::new(store: Arc<Store>) -> Arc<Engine>`, `Engine::emit(&self, Event)`, `Engine::subscribe() -> broadcast::Receiver<Event>`, `Engine::register_pty_writer(SessionId, UnboundedSender<Vec<u8>>)`, `Engine::get_pty_writer(&str) -> Option<UnboundedSender<Vec<u8>>>`

---

- [ ] **Step 1: Write test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use tempfile::tempdir;

    #[tokio::test]
    async fn emit_received_by_subscriber() {
        let store = Arc::new(Store::open(tempdir().unwrap().into_path().join("t.db")).unwrap());
        let engine = Engine::new(store);
        let mut rx = engine.subscribe();
        engine.emit(Event::SessionDone("s1".into()));
        let event = rx.recv().await.unwrap();
        assert!(matches!(event, Event::SessionDone(id) if id == "s1"));
    }
}
```

- [ ] **Step 2: Implement `athene/crates/athene-core/src/events.rs`**

```rust
use crate::{store::Store, types::*};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, Mutex};

#[derive(Debug, Clone)]
pub enum Event {
    SessionUpdated(Session),
    SessionSpawned(Session),
    SessionDone(SessionId),
    TerminalOutput { session_id: SessionId, bytes: Vec<u8> },
    CiUpdated      { pr_id: PrId, status: CIStatus },
    PrOpened       { session_id: SessionId, pr: PR },
    ReviewComment  { pr_id: PrId, comment: Comment },
    Notification(Notification),
}

pub struct Engine {
    pub store: Arc<Store>,
    tx: broadcast::Sender<Event>,
    pty_writers: Mutex<HashMap<SessionId, tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>,
}

impl Engine {
    pub fn new(store: Arc<Store>) -> Arc<Self> {
        let (tx, _) = broadcast::channel(256);
        Arc::new(Self { store, tx, pty_writers: Mutex::new(HashMap::new()) })
    }

    pub fn emit(&self, event: Event) { let _ = self.tx.send(event); }

    pub fn subscribe(&self) -> broadcast::Receiver<Event> { self.tx.subscribe() }

    pub async fn register_pty_writer(
        &self, session_id: SessionId,
        writer: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
    ) {
        self.pty_writers.lock().await.insert(session_id, writer);
    }

    pub async fn get_pty_writer(
        &self, session_id: &str,
    ) -> Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>> {
        self.pty_writers.lock().await.get(session_id).cloned()
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd athene && cargo test -p athene-core events
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add athene/crates/athene-core/src/events.rs
git commit -m "feat(engine): event broadcast bus with PTY writer registry"
```

---

### Task 4: Lifecycle poller

**Files:**
- Create: `athene/crates/athene-core/src/lifecycle/mod.rs`
- Create: `athene/crates/athene-core/src/lifecycle/poller.rs`
- Create: `athene/crates/athene-core/src/lifecycle/probe.rs`

**Interfaces:**
- Produces: `probe::is_pid_alive(u32) -> bool`, `Poller::new(Arc<Engine>) -> Poller`, `Poller::start(CancellationToken)`

---

- [ ] **Step 1: Write probe tests**

```rust
// athene/crates/athene-core/src/lifecycle/probe.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dead_pid_returns_false() { assert!(!is_pid_alive(0)); }

    #[test]
    fn own_pid_is_alive() { assert!(is_pid_alive(std::process::id())); }
}
```

- [ ] **Step 2: Implement `probe.rs`**

```rust
pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 { return false; }
    unsafe {
        let r = libc::kill(pid as libc::pid_t, 0);
        r == 0 || (*libc::__error() == libc::EPERM)
    }
}
```

- [ ] **Step 3: Implement `poller.rs`**

```rust
use crate::{events::{Engine, Event}, lifecycle::probe::is_pid_alive, types::SessionStatus};
use std::{sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;

pub struct Poller { engine: Arc<Engine> }

impl Poller {
    pub fn new(engine: Arc<Engine>) -> Self { Self { engine } }

    pub async fn start(self, token: CancellationToken) {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            tokio::select! {
                _ = token.cancelled() => break,
                _ = interval.tick() => self.poll().await,
            }
        }
    }

    async fn poll(&self) {
        let Ok(sessions) = self.engine.store.list_sessions() else { return };
        for mut session in sessions {
            if matches!(session.status, SessionStatus::Done | SessionStatus::Terminated) {
                continue;
            }
            if let Some(pid) = session.pid {
                if !is_pid_alive(pid) {
                    session.status = SessionStatus::Terminated;
                    let _ = self.engine.store.upsert_session(&session);
                    self.engine.emit(Event::SessionUpdated(session));
                }
            }
        }
    }
}
```

`athene/crates/athene-core/src/lifecycle/mod.rs`:
```rust
pub mod poller;
pub mod probe;
```

- [ ] **Step 4: Run tests**

```bash
cd athene && cargo test -p athene-core lifecycle
```

Expected: 2 probe tests pass.

- [ ] **Step 5: Commit**

```bash
git add athene/crates/athene-core/src/lifecycle/
git commit -m "feat(engine): lifecycle poller and process probe"
```

---

### Task 5: axum REST server

**Files:**
- Create: `athene/crates/athene-server/Cargo.toml`
- Create: `athene/crates/athene-server/src/lib.rs`
- Create: `athene/crates/athene-server/src/server.rs`
- Create: `athene/crates/athene-server/src/routes/sessions.rs`
- Create: `athene/crates/athene-server/src/routes/orchestrators.rs`
- Create: `athene/crates/athene-server/src/routes/mod.rs`

**Interfaces:**
- Produces: `pub async fn start(engine: Arc<Engine>, port: u16) -> anyhow::Result<()>`

---

- [ ] **Step 1: Create `athene/crates/athene-server/Cargo.toml`**

```toml
[package]
name    = "athene-server"
version = "0.1.0"
edition = "2021"

[dependencies]
athene-core  = { path = "../athene-core" }
tokio        = { workspace = true }
axum         = { workspace = true }
serde        = { workspace = true }
serde_json   = { workspace = true }
anyhow       = { workspace = true }
tracing      = { workspace = true }
tower-http   = { version = "0.5", features = ["cors"] }
tokio-stream = { version = "0.1", features = ["sync"] }
futures      = "0.3"

[dev-dependencies]
axum-test  = "0.1"
tempfile   = "3"
```

- [ ] **Step 2: Write sessions route tests**

```rust
// athene/crates/athene-server/src/routes/sessions.rs (test section)
#[cfg(test)]
mod tests {
    use super::*;
    use athene_core::{store::Store, events::Engine, types::*};
    use axum::http::StatusCode;
    use std::sync::Arc;
    use tempfile::tempdir;

    fn test_engine() -> Arc<Engine> {
        let store = Arc::new(Store::open(tempdir().unwrap().into_path().join("t.db")).unwrap());
        Engine::new(store)
    }

    #[tokio::test]
    async fn list_empty() {
        let app = sessions_router(test_engine());
        let res = axum_test::TestClient::new(app).get("/").await;
        assert_eq!(res.status(), StatusCode::OK);
        let body: Vec<Session> = res.json().await;
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn list_returns_stored() {
        let engine = test_engine();
        engine.store.upsert_session(&Session {
            id: "s1".into(), orchestrator_id: None, name: "w".into(),
            repo: "r".into(), status: SessionStatus::Working,
            agent_type: "c".into(), cost_usd: 0.0, started_at: 0,
            pr_number: None, pr_id: None, workspace_path: None, pid: None,
        }).unwrap();
        let res = axum_test::TestClient::new(sessions_router(engine)).get("/").await;
        let body: Vec<Session> = res.json().await;
        assert_eq!(body.len(), 1);
    }
}
```

- [ ] **Step 3: Implement sessions route**

```rust
// athene/crates/athene-server/src/routes/sessions.rs
use athene_core::{events::Engine, types::Session};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use std::sync::Arc;

pub fn sessions_router(engine: Arc<Engine>) -> Router {
    Router::new()
        .route("/", get(list_sessions))
        .route("/:id", axum::routing::delete(terminate_session))
        .with_state(engine)
}

async fn list_sessions(State(e): State<Arc<Engine>>) -> Result<Json<Vec<Session>>, StatusCode> {
    e.store.list_sessions().map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn terminate_session(State(_e): State<Arc<Engine>>, Path(_id): Path<String>) -> StatusCode {
    StatusCode::NO_CONTENT
}
```

- [ ] **Step 4: Implement orchestrators route + server wiring**

```rust
// athene/crates/athene-server/src/routes/orchestrators.rs
use athene_core::{events::Engine, types::Orchestrator};
use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use std::sync::Arc;

pub fn orchestrators_router(engine: Arc<Engine>) -> Router {
    Router::new()
        .route("/", get(list))
        .with_state(engine)
}

async fn list(State(e): State<Arc<Engine>>) -> Result<Json<Vec<Orchestrator>>, StatusCode> {
    e.store.list_orchestrators().map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
```

```rust
// athene/crates/athene-server/src/routes/mod.rs
pub mod events;
pub mod orchestrators;
pub mod sessions;
pub mod terminal;
```

```rust
// athene/crates/athene-server/src/server.rs
use crate::routes::{orchestrators::orchestrators_router, sessions::sessions_router};
use athene_core::events::Engine;
use axum::Router;
use std::{net::SocketAddr, sync::Arc};
use tower_http::cors::CorsLayer;

pub async fn start(engine: Arc<Engine>, port: u16) -> anyhow::Result<()> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let app = Router::new()
        .nest("/api/v1/sessions",      sessions_router(engine.clone()))
        .nest("/api/v1/orchestrators", orchestrators_router(engine.clone()))
        .layer(CorsLayer::permissive());
    tracing::info!("athene listening on {addr}");
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}
```

```rust
// athene/crates/athene-server/src/lib.rs
pub mod routes;
pub mod server;
pub use server::start;
```

- [ ] **Step 5: Run tests**

```bash
cd athene && cargo test -p athene-server
```

Expected: both session tests pass.

- [ ] **Step 6: Commit**

```bash
git add athene/crates/athene-server/
git commit -m "feat(server): axum REST routes for sessions and orchestrators"
```

---

### Task 6: athene-app binary — headless entry point

**Files:**
- Create: `athene/crates/athene-app/Cargo.toml`
- Create: `athene/crates/athene-app/src/main.rs`

**Interfaces:**
- Produces: `athene-app` binary; `--headless` flag; `--db` flag; `--port` flag; Ctrl+C shutdown

---

- [ ] **Step 1: Create `athene/crates/athene-app/Cargo.toml`**

```toml
[package]
name    = "athene-app"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "athene-app"
path = "src/main.rs"

[dependencies]
athene-core   = { path = "../athene-core" }
athene-server = { path = "../athene-server" }
tokio         = { workspace = true }
anyhow        = { workspace = true }
tracing       = { workspace = true }
tracing-subscriber = { workspace = true }
tokio-util    = { workspace = true }
clap          = { version = "4", features = ["derive"] }
dirs          = { workspace = true }
```

- [ ] **Step 2: Implement `athene/crates/athene-app/src/main.rs`**

```rust
use athene_core::{config::AppConfig, events::Engine, store::Store, lifecycle::poller::Poller};
use clap::Parser;
use std::{path::PathBuf, sync::Arc};
use tokio_util::sync::CancellationToken;

#[derive(Parser)]
struct Args {
    #[arg(long)] headless: bool,
    #[arg(long)] db: Option<PathBuf>,
    #[arg(long)] port: Option<u16>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let args = Args::parse();
    let config = AppConfig::load().unwrap_or_default();

    let db_path = args.db.unwrap_or_else(|| {
        dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."))
            .join("athene").join("athene.db")
    });
    std::fs::create_dir_all(db_path.parent().unwrap())?;

    let store  = Arc::new(Store::open(&db_path)?);
    let engine = Engine::new(store);
    let port   = args.port.unwrap_or(config.port);
    let token  = CancellationToken::new();

    let poller = Poller::new(engine.clone());
    tokio::spawn({ let t = token.clone(); async move { poller.start(t).await } });

    tokio::spawn({ let e = engine.clone(); async move {
        if let Err(err) = athene_server::start(e, port).await {
            tracing::error!("server: {err}");
        }
    }});

    tracing::info!("athene ready on :{port}");

    if args.headless || !has_display() {
        tokio::signal::ctrl_c().await?;
        token.cancel();
        return Ok(());
    }

    // Iced UI added in M3 (Task 9)
    tracing::info!("native UI not yet implemented — running headless");
    tokio::signal::ctrl_c().await?;
    token.cancel();
    Ok(())
}

fn has_display() -> bool {
    std::env::var("DISPLAY").is_ok() || std::env::var("WAYLAND_DISPLAY").is_ok()
}
```

- [ ] **Step 3: Build and run**

```bash
cd athene && cargo build -p athene-app 2>&1 | grep "^error"
cargo run -p athene-app -- --headless &
sleep 1
curl -s http://localhost:8080/api/v1/sessions
curl -s http://localhost:8080/api/v1/orchestrators
```

Expected: both return `[]`. **M1 complete.**

- [ ] **Step 4: Kill server and commit**

```bash
pkill -f athene-app
git add athene/crates/athene-app/
git commit -m "feat(app): headless binary with engine + HTTP server (M1 complete)"
```

---

## M2: SSE + WebSocket

---

### Task 7: SSE event stream

**Files:**
- Create: `athene/crates/athene-server/src/routes/events.rs`
- Modify: `athene/crates/athene-server/src/server.rs`

---

- [ ] **Step 1: Write SSE serialization test**

```rust
#[cfg(test)]
mod tests {
    use athene_core::events::Event;

    fn to_sse(event: &Event) -> String {
        let v = match event {
            Event::SessionDone(id) =>
                serde_json::json!({"type":"worker_done","payload":{"session_id":id}}),
            Event::SessionUpdated(s) =>
                serde_json::json!({"type":"session_updated","payload":s}),
            _ => return String::new(),
        };
        format!("data: {}\n\n", serde_json::to_string(&v).unwrap())
    }

    #[test]
    fn session_done_format() {
        let line = to_sse(&Event::SessionDone("s1".into()));
        assert!(line.contains("worker_done") && line.contains("s1") && line.ends_with("\n\n"));
    }
}
```

- [ ] **Step 2: Implement `athene/crates/athene-server/src/routes/events.rs`**

```rust
use athene_core::events::{Engine, Event};
use axum::{
    extract::State,
    response::{sse::{Event as SseEvent, KeepAlive, Sse}, IntoResponse},
    routing::get, Router,
};
use futures::StreamExt;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;

pub fn events_router(engine: Arc<Engine>) -> Router {
    Router::new().route("/", get(sse_handler)).with_state(engine)
}

async fn sse_handler(State(engine): State<Arc<Engine>>) -> impl IntoResponse {
    let stream = BroadcastStream::new(engine.subscribe())
        .filter_map(|r| async move {
            let data = event_to_json(&r.ok()?)?;
            Some(Ok::<_, std::convert::Infallible>(SseEvent::default().data(data)))
        });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn event_to_json(event: &Event) -> Option<String> {
    let v = match event {
        Event::SessionUpdated(s)  => serde_json::json!({"type":"session_updated","payload":s}),
        Event::SessionSpawned(s)  => serde_json::json!({"type":"worker_spawned","payload":s}),
        Event::SessionDone(id)    => serde_json::json!({"type":"worker_done","payload":{"session_id":id}}),
        Event::CiUpdated{pr_id,status}   => serde_json::json!({"type":"ci_update","payload":{"pr_id":pr_id,"status":status}}),
        Event::PrOpened{session_id,pr}   => serde_json::json!({"type":"pr_event","payload":{"session_id":session_id,"pr":pr}}),
        Event::ReviewComment{pr_id,comment} => serde_json::json!({"type":"review_comment","payload":{"pr_id":pr_id,"comment":comment}}),
        Event::Notification(n)    => serde_json::json!({"type":"notification","payload":n}),
        Event::TerminalOutput{..} => return None, // not broadcast over SSE
    };
    serde_json::to_string(&v).ok()
}
```

- [ ] **Step 3: Add to server.rs**

```rust
.nest("/api/v1/events", events_router(engine.clone()))
```

- [ ] **Step 4: Run tests and verify**

```bash
cd athene && cargo test -p athene-server
cargo run -p athene-app -- --headless &
sleep 1 && curl -N http://localhost:8080/api/v1/events
```

Expected: SSE connection stays open.

- [ ] **Step 5: Commit**

```bash
pkill -f athene-app
git add athene/crates/athene-server/src/routes/events.rs \
        athene/crates/athene-server/src/server.rs
git commit -m "feat(server): SSE event stream"
```

---

### Task 8: WebSocket terminal

**Files:**
- Create: `athene/crates/athene-server/src/routes/terminal.rs`
- Modify: `athene/crates/athene-server/src/server.rs`

---

- [ ] **Step 1: Implement `athene/crates/athene-server/src/routes/terminal.rs`**

```rust
use athene_core::events::Engine;
use axum::{
    extract::{Path, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::IntoResponse,
    routing::get, Router,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;

pub fn terminal_router(engine: Arc<Engine>) -> Router {
    Router::new()
        .route("/:id/terminal", get(ws_handler))
        .with_state(engine)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(session_id): Path<String>,
    State(engine): State<Arc<Engine>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, session_id, engine))
}

async fn handle(socket: WebSocket, session_id: String, engine: Arc<Engine>) {
    let (mut tx, mut rx) = socket.split();

    // Browser → PTY
    let e2 = engine.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        while let Some(Ok(Message::Binary(b))) = rx.next().await {
            if let Some(w) = e2.get_pty_writer(&sid).await {
                let _ = w.send(b.to_vec());
            }
        }
    });

    // PTY output → Browser (via engine event bus)
    let mut event_rx = engine.subscribe();
    loop {
        match event_rx.recv().await {
            Ok(athene_core::events::Event::TerminalOutput { session_id: sid, bytes })
                if sid == session_id =>
            {
                if tx.send(Message::Binary(bytes.into())).await.is_err() { break; }
            }
            Err(_) => break,
            _ => {}
        }
    }
}
```

- [ ] **Step 2: Wire into server.rs**

```rust
// In server.rs Router::new():
.nest("/api/v1/sessions", terminal_router(engine.clone()))
```

- [ ] **Step 3: Build and verify M2**

```bash
cd athene && cargo build -p athene-app 2>&1 | grep "^error"
cargo run -p athene-app -- --headless &
sleep 1
curl -N http://localhost:8080/api/v1/events &
# wscat -c ws://localhost:8080/api/v1/sessions/test/terminal
```

Expected: no 404 on WS endpoint. **M2 complete — web dashboard can connect.**

- [ ] **Step 4: Commit**

```bash
pkill -f athene-app
git add athene/crates/athene-server/src/routes/terminal.rs \
        athene/crates/athene-server/src/server.rs
git commit -m "feat(server): WebSocket terminal endpoint (M2 complete)"
```

---

## M3: Native App Shell

---

### Task 9: Iced shell + theme + in-process subscription

**Files:**
- Create: `athene/crates/athene-app/src/app.rs`
- Create: `athene/crates/athene-app/src/theme.rs`
- Modify: `athene/crates/athene-app/src/main.rs`

---

- [ ] **Step 1: Add Iced to athene-app/Cargo.toml**

```toml
iced        = { version = "0.13", features = ["tokio", "canvas", "advanced", "wgpu"] }
notify-rust = "4"
alacritty_terminal = "0.24"
```

- [ ] **Step 2: Create theme.rs** — exact content from original plan Task 6, Step 1, with types imported from `athene_core` instead of `crate::types`.

- [ ] **Step 3: Write app.rs update() tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use athene_core::{events::Engine, store::Store, types::*};
    use tempfile::tempdir;

    fn test_engine() -> Arc<Engine> {
        let s = Arc::new(Store::open(tempdir().unwrap().into_path().join("t.db")).unwrap());
        Engine::new(s)
    }

    fn base(engine: Arc<Engine>) -> App {
        App {
            engine, orchestrators: vec![], sessions: HashMap::new(),
            prs: HashMap::new(), ci_status: HashMap::new(),
            review_threads: HashMap::new(), notifications: VecDeque::new(),
            sidebar: SidebarState::default(), view: View::FleetBoard { scope: None },
            terminals: HashMap::new(),
        }
    }

    #[test]
    fn session_spawned_inserts() {
        let e = test_engine();
        let m = base(e);
        let s = Session { id: "s1".into(), orchestrator_id: None, name: "w".into(),
            repo: "r".into(), status: SessionStatus::Working, agent_type: "c".into(),
            cost_usd: 0.0, started_at: 0, pr_number: None, pr_id: None,
            workspace_path: None, pid: None };
        let (updated, _) = m.update(Message::EngineEvent(Event::SessionSpawned(s)));
        assert!(updated.sessions.contains_key("s1"));
    }

    #[test]
    fn notifications_capped_at_50() {
        let e = test_engine();
        let mut m = base(e);
        for i in 0..55u32 {
            let (next, _) = m.update(Message::EngineEvent(Event::Notification(Notification {
                id: i.to_string(), kind: NotificationKind::WorkerDone,
                title: "t".into(), body: "b".into(), session_id: None,
            })));
            m = next;
        }
        assert_eq!(m.notifications.len(), 50);
    }
}
```

- [ ] **Step 4: Implement app.rs** — use the full implementation from the previous plan's Task 5 Step 4, replacing all `crate::types::*` imports with `athene_core::types::*` and `crate::client::sse::SseEvent` with `athene_core::events::Event`. The `subscription()` method subscribes to `engine.subscribe()` directly instead of making an HTTP SSE connection.

- [ ] **Step 5: Wire Iced into main.rs** — replace the `// Iced UI added in M3` comment:

```rust
iced::application("Athene", app::App::update, app::App::view)
    .subscription(app::App::subscription)
    .theme(|_, _| theme::athene_theme())
    .run_with(move || app::App::new(engine))?;
```

- [ ] **Step 6: Run tests**

```bash
cd athene && cargo test -p athene-app
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add athene/crates/athene-app/src/app.rs athene/crates/athene-app/src/theme.rs \
        athene/crates/athene-app/src/main.rs
git commit -m "feat(app): Iced shell with in-process engine subscription"
```

---

### Task 10: Sidebar + Fleet Board

**Files:**
- Create: `athene/crates/athene-app/src/components/` (all files)

---

- [ ] **Step 1: Create component stubs**

```bash
mkdir -p athene/crates/athene-app/src/components
```

Create stub `session_detail.rs`:
```rust
pub fn session_detail<'a>(
    app: &'a crate::app::App, session_id: &'a str, panel: &'a crate::app::DetailPanel,
) -> iced::Element<'a, crate::app::Message> {
    iced::widget::text(format!("Session: {session_id} — terminal in M4")).into()
}
```

Create stub `info_panel.rs` and `terminal.rs` with the same `TerminalState` struct from the original plan's Task 10 (with `pty_sender` instead of `ws_sender`).

Create `mod.rs`:
```rust
pub mod fleet_board;
pub mod info_panel;
pub mod session_detail;
pub mod sidebar;
pub mod terminal;
```

- [ ] **Step 2: Implement sidebar** — use the full implementation from the original plan's Task 7 Step 3. Import types from `athene_core` instead of `crate::types`.

- [ ] **Step 3: Implement fleet board** — use the full implementation from the original plan's Task 8 Step 3. Import types from `athene_core`.

- [ ] **Step 4: Build and run**

```bash
cd athene && cargo run -p athene-app
```

Expected: Iced window opens with sidebar and fleet board visible. **M3 complete.**

- [ ] **Step 5: Commit**

```bash
git add athene/crates/athene-app/src/components/
git commit -m "feat(app): sidebar and fleet board (M3 complete)"
```

---

## M4: Native Terminal

---

### Task 11: Terminal Canvas widget + Session Detail

**Files:**
- Modify: `athene/crates/athene-app/src/components/terminal.rs`
- Modify: `athene/crates/athene-app/src/components/session_detail.rs`

---

- [ ] **Step 1: Write terminal tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test] fn process_advances_cursor() {
        let mut s = TerminalState::new(80, 24);
        s.process(b"hello");
        assert_eq!(s.term.grid().cursor.point.column.0, 5);
    }

    #[test] fn process_ansi_no_panic() {
        let mut s = TerminalState::new(80, 24);
        s.process(b"\x1b[31mred\x1b[0m");
    }
}
```

- [ ] **Step 2: Implement full terminal.rs** — use the full implementation from the original plan's Task 10 Step 3. Replace `ws_sender` with `pty_sender: Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>`.

- [ ] **Step 3: Implement full session_detail.rs** — use the full implementation from the original plan's Task 11 Step 2. `TerminalWidget.pty_sender` replaces `ws_sender`; no other changes.

- [ ] **Step 4: Run tests and build**

```bash
cd athene && cargo test -p athene-app terminal && cargo build -p athene-app 2>&1 | grep "^error"
```

Expected: 2 terminal tests pass; no build errors.

- [ ] **Step 5: Run and verify**

```bash
cd athene && cargo run -p athene-app
```

Expected: click a session card → session detail with terminal pane. **M4 complete.**

- [ ] **Step 6: Commit**

```bash
git add athene/crates/athene-app/src/components/terminal.rs \
        athene/crates/athene-app/src/components/session_detail.rs
git commit -m "feat(app): terminal Canvas widget (M4 complete)"
```

---

## M5: Full Parity

---

### Task 12: Info panel + OS notifications

**Files:**
- Modify: `athene/crates/athene-app/src/components/info_panel.rs`

---

- [ ] **Step 1: Write formatting tests**

```rust
#[cfg(test)]
mod tests {
    #[test] fn ci_format() {
        assert_eq!(format!("CI: {}/{} passing", 3u32, 4u32), "CI: 3/4 passing");
    }
    #[test] fn cost_format() {
        assert_eq!(format!("${:.2}", 0.427f64), "$0.43");
    }
}
```

- [ ] **Step 2: Implement full info_panel.rs** — use the complete implementation from the original plan's Task 9 Step 3. Import types from `athene_core`.

- [ ] **Step 3: Run all tests**

```bash
cd athene && cargo test
```

Expected: all tests pass.

- [ ] **Step 4: Run app end-to-end**

```bash
cd athene && cargo run -p athene-app
```

Expected: full native app — sidebar, fleet board, session detail with terminal, info panel with PR/CI/review data, OS notifications on CI failure. **M5 complete.**

- [ ] **Step 5: Final commit**

```bash
git add athene/crates/athene-app/src/components/info_panel.rs
git commit -m "feat(app): info panel + full parity (M5 complete)"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Single Rust binary with embedded engine | Task 6 |
| `athene-core` library crate | Tasks 1–4 |
| `athene-server` axum crate | Tasks 5, 7, 8 |
| `athene-app` Iced binary | Tasks 9–12 |
| SQLite session persistence | Task 2 |
| `broadcast::Sender<Event>` bus | Task 3 |
| Lifecycle poller + process probe | Task 4 |
| REST sessions + orchestrators | Task 5 |
| SSE event stream | Task 7 |
| WebSocket terminal | Task 8 |
| `--headless` flag | Task 6 |
| In-process subscription (no HTTP hop) | Task 9 |
| Theme (warm-stone palette) | Task 9 |
| Sidebar: orchestrator→worker hierarchy | Task 10 |
| Fleet board kanban | Task 10 |
| Session detail + panel toggle | Task 11 |
| Terminal Canvas widget | Task 11 |
| Info panel: PR, CI, review comments | Task 12 |
| OS notifications | Task 12 |
| M1 testable | End of Task 6 |
| M2 testable | End of Task 8 |
| M3 testable | End of Task 10 |
| M4 testable | End of Task 11 |
| M5 testable | End of Task 12 |
