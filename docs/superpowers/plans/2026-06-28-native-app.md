# Athene Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native desktop app for Athene (macOS + Linux) in Rust using Iced, connecting to the Go backend as a pure client with GPU-accelerated rendering and a full terminal emulator.

**Architecture:** A standalone Rust binary in `packages/app/` with an Iced `Application` shell, tokio async runtime, and three client layers: SSE subscription (session events), HTTP (REST calls), and WebSocket (terminal I/O per session). The entire UI is driven by a single immutable `Model` — Elm-style, one `update()` mutation point.

**Tech Stack:** Rust, Iced 0.13, alacritty_terminal 0.24, tokio 1, reqwest 0.12, tokio-tungstenite 0.24, notify-rust 4, serde/serde_json, toml, dirs 5.

## Global Constraints

- macOS + Linux only. No Windows support.
- Iced features required: `tokio`, `canvas`, `advanced`, `wgpu`.
- No inline `style=` attributes — Iced widget styling only.
- All app state lives in `Model`. No `Arc<Mutex<>>` shared state except inside subscriptions (where it is unavoidable for the channel).
- `update()` must remain a pure function: takes `(Model, Message)`, returns `(Model, Command<Message>)`.
- Repo names in worker rows are never truncated.
- Notification cap: 50 entries in `VecDeque<Notification>`.
- Config persisted to `~/.config/athene/config.toml`.
- No dependency on TypeScript packages.

## Go Backend API Contract (prerequisite)

The Go backend must expose these endpoints before the native app can connect:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/events` | GET (SSE) | Multiplexed event stream |
| `/api/v1/orchestrators` | GET | List all orchestrators |
| `/api/v1/sessions` | GET | List all sessions |
| `/api/v1/orchestrators` | POST | Create orchestrator |
| `/api/v1/sessions/{id}/terminal` | WebSocket | Terminal I/O |

SSE event envelope format:
```json
{ "type": "session_updated", "payload": { ... } }
{ "type": "ci_update",       "payload": { ... } }
{ "type": "pr_event",        "payload": { ... } }
{ "type": "review_comment",  "payload": { ... } }
{ "type": "notification",    "payload": { ... } }
{ "type": "worker_spawned",  "payload": { ... } }
{ "type": "worker_done",     "payload": { "session_id": "..." } }
```

---

## File Structure

```
packages/app/
├── Cargo.toml                   # workspace + package, all dependencies
├── src/
│   ├── main.rs                  # binary entry: load config, launch iced::application()
│   ├── app.rs                   # Model, Message, Application impl (update, view, subscription)
│   ├── config.rs                # AppConfig struct: read/write ~/.config/athene/config.toml
│   ├── theme.rs                 # Custom Iced Theme (Athene warm-stone palette)
│   ├── types.rs                 # Domain types: Session, Orchestrator, PR, CIStatus, etc.
│   ├── client/
│   │   ├── mod.rs               # pub use sse::*, websocket::*
│   │   ├── sse.rs               # SSE Subscription + SseEvent deserialization
│   │   └── websocket.rs         # WebSocket Subscription per terminal session
│   └── components/
│       ├── mod.rs               # pub use all components
│       ├── sidebar.rs           # SidebarState + sidebar() view function
│       ├── fleet_board.rs       # fleet_board() view function + session card
│       ├── session_detail.rs    # session_detail() + pane_grid state
│       ├── terminal.rs          # TerminalState + TerminalWidget Canvas Program
│       └── info_panel.rs        # info_panel() view function
```

---

## Task 1: Crate Scaffold

**Files:**
- Create: `packages/app/Cargo.toml`
- Create: `packages/app/src/main.rs`
- Create: `packages/app/src/config.rs`

**Interfaces:**
- Produces: `AppConfig { server_url: String, font_size: f32 }`, `AppConfig::load() -> Result<AppConfig>`, `AppConfig::save(&self) -> Result<()>`

---

- [ ] **Step 1: Create `packages/app/Cargo.toml`**

```toml
[workspace]
members = ["."]

[package]
name = "athene-app"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "athene-app"
path = "src/main.rs"

[dependencies]
iced = { version = "0.13", features = ["tokio", "canvas", "advanced", "wgpu"] }
alacritty_terminal = "0.24"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
notify-rust = "4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
futures = "0.3"
dirs = "5"

[dev-dependencies]
tokio-test = "0.4"
```

- [ ] **Step 2: Create `packages/app/src/config.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_url: String,
    pub font_size: f32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_url: "http://localhost:8080".into(),
            font_size: 13.0,
        }
    }
}

impl AppConfig {
    fn path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("athene")
            .join("config.toml")
    }

    pub fn load() -> anyhow::Result<Self> {
        let path = Self::path();
        if !path.exists() {
            return Ok(Self::default());
        }
        let text = fs::read_to_string(&path)?;
        Ok(toml::from_str(&text)?)
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::path();
        fs::create_dir_all(path.parent().unwrap())?;
        fs::write(&path, toml::to_string(self)?)?;
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
        let cfg = AppConfig {
            server_url: "http://localhost:9999".into(),
            font_size: 14.0,
        };
        fs::write(&path, toml::to_string(&cfg).unwrap()).unwrap();
        let loaded: AppConfig = toml::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded.server_url, "http://localhost:9999");
        assert_eq!(loaded.font_size, 14.0);
    }
}
```

Add `tempfile = "3"` to `[dev-dependencies]` in `Cargo.toml`.

- [ ] **Step 3: Create `packages/app/src/main.rs`** (minimal window)

```rust
mod app;
mod config;
mod theme;
mod types;
mod client;
mod components;

fn main() -> iced::Result {
    let config = config::AppConfig::load().unwrap_or_default();
    iced::application("Athene", app::App::update, app::App::view)
        .subscription(app::App::subscription)
        .theme(|_, _| theme::athene_theme())
        .run_with(move || app::App::new(config.clone()))
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd packages/app && cargo build 2>&1 | head -40
```

Expected: compile errors only for missing modules (`app`, `theme`, `types`, `client`, `components`) — not syntax errors.

- [ ] **Step 5: Add anyhow to dependencies and run tests**

Add to `[dependencies]`: `anyhow = "1"`

```bash
cd packages/app && cargo test config
```

Expected: `test config::tests::round_trip ... ok`

- [ ] **Step 6: Commit**

```bash
git add packages/app/
git commit -m "feat(app): scaffold Rust native app crate with config"
```

---

## Task 2: Domain Types + SSE Event Deserialization

**Files:**
- Create: `packages/app/src/types.rs`
- Create: `packages/app/src/client/mod.rs`
- Create: `packages/app/src/client/sse.rs` (deserialization only — subscription added in Task 3)

**Interfaces:**
- Produces: `SessionId`, `OrchestratorId`, `PrId`, `Session`, `Orchestrator`, `PR`, `CIStatus`, `Comment`, `Notification`, `NotificationKind`, `SessionStatus`, `SseEvent`

---

- [ ] **Step 1: Create `packages/app/src/types.rs`**

```rust
use serde::{Deserialize, Serialize};

pub type SessionId = String;
pub type OrchestratorId = String;
pub type PrId = u64;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Spawning,
    Working,
    PrOpen,
    CiFailed,
    ReviewPending,
    Mergeable,
    Done,
    Terminated,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Session {
    pub id: SessionId,
    pub orchestrator_id: Option<OrchestratorId>,
    pub name: String,
    pub repo: String,            // e.g. "slievr/Athene"
    pub status: SessionStatus,
    pub agent_type: String,
    pub cost_usd: f64,
    pub started_at: u64,         // unix timestamp seconds
    pub pr_number: Option<u64>,
    pub pr_id: Option<PrId>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Orchestrator {
    pub id: OrchestratorId,
    pub name: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PR {
    pub id: PrId,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub body: String,
    pub session_id: SessionId,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CIStatus {
    pub pr_id: PrId,
    pub total: u32,
    pub passing: u32,
    pub failing: u32,
    pub pending: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Comment {
    pub id: u64,
    pub pr_id: PrId,
    pub author: String,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NotificationKind {
    CiFailure,
    AgentStuck,
    PrNeedsAttention,
    MergeConflict,
    WorkerDone,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Notification {
    pub id: String,
    pub kind: NotificationKind,
    pub title: String,
    pub body: String,
    pub session_id: Option<SessionId>,
}
```

- [ ] **Step 2: Create `packages/app/src/client/mod.rs`**

```rust
pub mod sse;
pub mod websocket;
```

- [ ] **Step 3: Write tests for SSE event deserialization in `packages/app/src/client/sse.rs`**

```rust
use serde::Deserialize;
use crate::types::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum SseEvent {
    SessionUpdated(Session),
    CiUpdate(CIStatus),
    PrEvent(PR),
    ReviewComment(Comment),
    Notification(Notification),
    WorkerSpawned(Session),
    WorkerDone { session_id: SessionId },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_session_updated() {
        let json = r#"{
            "type": "session_updated",
            "payload": {
                "id": "s1", "orchestrator_id": "o1", "name": "worker-1",
                "repo": "slievr/Athene", "status": "working",
                "agent_type": "claude-code", "cost_usd": 0.42,
                "started_at": 1000000, "pr_number": null, "pr_id": null
            }
        }"#;
        let event: SseEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, SseEvent::SessionUpdated(s) if s.id == "s1"));
    }

    #[test]
    fn deserialize_ci_update() {
        let json = r#"{
            "type": "ci_update",
            "payload": { "pr_id": 74, "total": 4, "passing": 3, "failing": 1, "pending": 0 }
        }"#;
        let event: SseEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, SseEvent::CiUpdate(ci) if ci.failing == 1));
    }

    #[test]
    fn deserialize_worker_done() {
        let json = r#"{ "type": "worker_done", "payload": { "session_id": "s42" } }"#;
        let event: SseEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, SseEvent::WorkerDone { session_id } if session_id == "s42"));
    }

    #[test]
    fn deserialize_notification() {
        let json = r#"{
            "type": "notification",
            "payload": {
                "id": "n1", "kind": "ci_failure",
                "title": "CI failed", "body": "3 checks failing",
                "session_id": "s1"
            }
        }"#;
        let event: SseEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event,
            SseEvent::Notification(n) if n.kind == NotificationKind::CiFailure
        ));
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/app && cargo test sse
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/types.rs packages/app/src/client/
git commit -m "feat(app): domain types and SSE event deserialization"
```

---

## Task 3: SSE Subscription

**Files:**
- Modify: `packages/app/src/client/sse.rs`

**Interfaces:**
- Consumes: `SseEvent` (Task 2), `Message` (defined here as placeholder, wired in Task 5)
- Produces: `sse_subscription(server_url: String) -> Subscription<SseEvent>` — an Iced subscription that emits `SseEvent` values and reconnects on drop

---

- [ ] **Step 1: Add the SSE subscription function to `packages/app/src/client/sse.rs`**

Add below the existing deserialization code:

```rust
use futures::StreamExt;
use iced::subscription;

pub fn sse_subscription(server_url: String) -> iced::Subscription<SseEvent> {
    subscription::channel(
        std::any::TypeId::of::<SseEvent>(),
        100,
        move |mut output| {
            let url = server_url.clone();
            async move {
                loop {
                    match connect_sse(&url, &mut output).await {
                        Ok(()) => {}
                        Err(e) => {
                            eprintln!("SSE error: {e}, reconnecting in 2s");
                            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        }
                    }
                }
            }
        },
    )
}

async fn connect_sse(
    server_url: &str,
    output: &mut futures::channel::mpsc::Sender<SseEvent>,
) -> anyhow::Result<()> {
    use iced::futures::SinkExt;

    let url = format!("{server_url}/api/v1/events");
    let response = reqwest::get(&url).await?;
    let mut stream = response.bytes_stream();

    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // SSE lines are separated by "\n\n"
        while let Some(pos) = buf.find("\n\n") {
            let block = buf[..pos].to_string();
            buf = buf[pos + 2..].to_string();

            for line in block.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(event) = serde_json::from_str::<SseEvent>(data) {
                        let _ = output.send(event).await;
                    }
                }
            }
        }
    }
    Ok(())
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/app && cargo check 2>&1 | grep "^error"
```

Expected: no errors (warnings about unused imports are OK at this stage).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/client/sse.rs
git commit -m "feat(app): SSE subscription with auto-reconnect"
```

---

## Task 4: WebSocket Subscription

**Files:**
- Create: `packages/app/src/client/websocket.rs`

**Interfaces:**
- Produces:
  - `ws_subscription(server_url: String, session_id: SessionId) -> Subscription<WsEvent>`
  - `enum WsEvent { Output(SessionId, Vec<u8>), Connected(SessionId, WsSender), Disconnected(SessionId) }`
  - `struct WsSender(tokio::sync::mpsc::UnboundedSender<Vec<u8>>)` with `fn send(&self, bytes: Vec<u8>)`

---

- [ ] **Step 1: Write tests for `packages/app/src/client/websocket.rs`**

```rust
use super::*;

#[test]
fn ws_sender_clones() {
    // WsSender must be Clone so it can be stored in Model
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    let sender = WsSender(tx);
    let _clone = sender.clone();
}
```

- [ ] **Step 2: Implement `packages/app/src/client/websocket.rs`**

```rust
use crate::types::SessionId;
use futures::{SinkExt, StreamExt};
use iced::subscription;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

#[derive(Debug, Clone)]
pub struct WsSender(pub tokio::sync::mpsc::UnboundedSender<Vec<u8>>);

impl WsSender {
    pub fn send(&self, bytes: Vec<u8>) {
        let _ = self.0.send(bytes);
    }
}

#[derive(Debug, Clone)]
pub enum WsEvent {
    Connected(SessionId, WsSender),
    Output(SessionId, Vec<u8>),
    Disconnected(SessionId),
}

pub fn ws_subscription(server_url: String, session_id: SessionId) -> iced::Subscription<WsEvent> {
    subscription::channel(
        session_id.clone(),
        100,
        move |mut output| {
            let url = server_url
                .replace("http://", "ws://")
                .replace("https://", "wss://");
            let sid = session_id.clone();
            async move {
                loop {
                    let ws_url = format!("{url}/api/v1/sessions/{sid}/terminal");
                    match connect_async(&ws_url).await {
                        Ok((ws_stream, _)) => {
                            let (mut write, mut read) = ws_stream.split();
                            let (tx, mut rx) =
                                tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
                            let sender = WsSender(tx);
                            let _ = output
                                .send(WsEvent::Connected(sid.clone(), sender))
                                .await;

                            // Forward outbound bytes to WebSocket
                            let sid2 = sid.clone();
                            tokio::spawn(async move {
                                while let Some(bytes) = rx.recv().await {
                                    let _ = write
                                        .send(WsMessage::Binary(bytes.into()))
                                        .await;
                                    let _ = sid2; // keep alive
                                }
                            });

                            // Forward inbound bytes as WsEvent::Output
                            while let Some(msg) = read.next().await {
                                match msg {
                                    Ok(WsMessage::Binary(b)) => {
                                        let _ = output
                                            .send(WsEvent::Output(sid.clone(), b.to_vec()))
                                            .await;
                                    }
                                    Ok(WsMessage::Text(t)) => {
                                        let _ = output
                                            .send(WsEvent::Output(
                                                sid.clone(),
                                                t.into_bytes(),
                                            ))
                                            .await;
                                    }
                                    Err(_) | Ok(WsMessage::Close(_)) => break,
                                    _ => {}
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("WS connect error for {sid}: {e}");
                        }
                    }
                    let _ = output.send(WsEvent::Disconnected(sid.clone())).await;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        },
    )
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/app && cargo test websocket
```

Expected: `test client::websocket::tests::ws_sender_clones ... ok`

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/client/websocket.rs
git commit -m "feat(app): WebSocket subscription for terminal I/O"
```

---

## Task 5: App Shell — Model, Message, update(), subscription()

**Files:**
- Create: `packages/app/src/app.rs`
- Create: `packages/app/src/components/mod.rs` (stub)
- Create: `packages/app/src/theme.rs` (stub)
- Modify: `packages/app/src/main.rs`

**Interfaces:**
- Consumes: `AppConfig` (Task 1), `SseEvent` (Task 2), `WsEvent` + `WsSender` (Task 4), all types (Task 2)
- Produces: `App` struct with `new()`, `update()`, `view()`, `subscription()` — the Iced Application

---

- [ ] **Step 1: Create stub files so the crate compiles**

`packages/app/src/theme.rs`:
```rust
pub fn athene_theme() -> iced::Theme {
    iced::Theme::Dark
}
```

`packages/app/src/components/mod.rs`:
```rust
pub mod fleet_board;
pub mod info_panel;
pub mod session_detail;
pub mod sidebar;
pub mod terminal;
```

Create empty stub files for each component module (content filled in Tasks 7–11):
```bash
for f in fleet_board info_panel session_detail sidebar terminal; do
  touch packages/app/src/components/${f}.rs
done
```

- [ ] **Step 2: Write tests for `update()` routing in `packages/app/src/app.rs`**

Write tests before the implementation (TDD):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn base_model() -> App {
        App {
            server_url: "http://localhost:8080".into(),
            connection: ConnectionState::Disconnected,
            orchestrators: vec![],
            sessions: std::collections::HashMap::new(),
            prs: std::collections::HashMap::new(),
            ci_status: std::collections::HashMap::new(),
            review_threads: std::collections::HashMap::new(),
            notifications: std::collections::VecDeque::new(),
            sidebar: SidebarState::default(),
            view: View::FleetBoard { scope: None },
            terminals: std::collections::HashMap::new(),
        }
    }

    #[test]
    fn session_updated_inserts_session() {
        let model = base_model();
        let session = Session {
            id: "s1".into(), orchestrator_id: None, name: "worker-1".into(),
            repo: "slievr/Athene".into(), status: SessionStatus::Working,
            agent_type: "claude-code".into(), cost_usd: 0.0,
            started_at: 0, pr_number: None, pr_id: None,
        };
        let (updated, _) = model.update(Message::SseEvent(
            crate::client::sse::SseEvent::SessionUpdated(session)
        ));
        assert!(updated.sessions.contains_key("s1"));
    }

    #[test]
    fn session_selected_changes_view() {
        let mut model = base_model();
        model.sessions.insert("s1".into(), Session {
            id: "s1".into(), orchestrator_id: None, name: "worker-1".into(),
            repo: "slievr/Athene".into(), status: SessionStatus::Working,
            agent_type: "claude-code".into(), cost_usd: 0.0,
            started_at: 0, pr_number: None, pr_id: None,
        });
        let (updated, _) = model.update(Message::SessionSelected("s1".into()));
        assert!(matches!(
            updated.view,
            View::SessionDetail { session_id, .. } if session_id == "s1"
        ));
    }

    #[test]
    fn notifications_capped_at_50() {
        let mut model = base_model();
        for i in 0..55u32 {
            let (m, _) = model.update(Message::SseEvent(
                crate::client::sse::SseEvent::Notification(Notification {
                    id: i.to_string(), kind: NotificationKind::WorkerDone,
                    title: "done".into(), body: "".into(), session_id: None,
                })
            ));
            model = m;
        }
        assert_eq!(model.notifications.len(), 50);
    }

    #[test]
    fn orchestrator_toggle_flips_expansion() {
        let mut model = base_model();
        model.orchestrators.push(Orchestrator {
            id: "o1".into(), name: "fix-auth".into(), created_at: 0,
        });
        model.sidebar.expanded.insert("o1".into(), true);
        let (updated, _) = model.update(Message::OrchestratorToggled("o1".into()));
        assert_eq!(updated.sidebar.expanded.get("o1"), Some(&false));
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/app && cargo test app::tests 2>&1 | tail -5
```

Expected: compile error — `App`, `Message`, etc. not yet defined. That's correct.

- [ ] **Step 4: Implement `packages/app/src/app.rs`**

```rust
use std::collections::{HashMap, HashSet, VecDeque};
use iced::{Command, Element, Subscription};
use crate::{
    client::{
        sse::{sse_subscription, SseEvent},
        websocket::{ws_subscription, WsEvent, WsSender},
    },
    config::AppConfig,
    types::*,
};

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Connected,
    Reconnecting,
    Disconnected,
}

#[derive(Debug, Clone, Default)]
pub struct SidebarState {
    pub expanded: HashMap<OrchestratorId, bool>,
    pub selected_session: Option<SessionId>,
    pub selected_orchestrator: Option<OrchestratorId>,
}

#[derive(Debug, Clone)]
pub enum View {
    FleetBoard { scope: Option<OrchestratorId> },
    SessionDetail { session_id: SessionId, panel: DetailPanel },
}

#[derive(Debug, Clone, PartialEq)]
pub enum DetailPanel {
    Split,
    Terminal,
    Info,
}

// TerminalState and EventProxy are defined in components::terminal (Task 10).
// Import them here — do NOT redefine them in this file.
use crate::components::terminal::{EventProxy, TerminalState};

pub struct App {
    pub server_url: String,
    pub connection: ConnectionState,
    pub orchestrators: Vec<Orchestrator>,
    pub sessions: HashMap<SessionId, Session>,
    pub prs: HashMap<SessionId, PR>,
    pub ci_status: HashMap<PrId, CIStatus>,
    pub review_threads: HashMap<PrId, Vec<Comment>>,
    pub notifications: VecDeque<Notification>,
    pub sidebar: SidebarState,
    pub view: View,
    pub terminals: HashMap<SessionId, TerminalState>,
}

#[derive(Debug, Clone)]
pub enum Message {
    // SSE events (demuxed from SseEvent)
    SseEvent(SseEvent),
    // WebSocket events
    WsEvent(WsEvent),
    // Terminal input from keyboard
    TerminalInput { session_id: SessionId, bytes: Vec<u8> },
    // Navigation
    SessionSelected(SessionId),
    OrchestratorSelected(OrchestratorId),
    OrchestratorToggled(OrchestratorId),
    DetailPanelChanged(DetailPanel),
    // UI
    SpawnOrchestratorPressed,
    DismissNotification(usize),
    // Pane grid resize
    PaneResized(iced::widget::pane_grid::ResizeEvent),
    // Connection
    ServerUrlChanged(String),
}

impl App {
    pub fn new(config: AppConfig) -> (Self, Command<Message>) {
        let app = Self {
            server_url: config.server_url,
            connection: ConnectionState::Disconnected,
            orchestrators: vec![],
            sessions: HashMap::new(),
            prs: HashMap::new(),
            ci_status: HashMap::new(),
            review_threads: HashMap::new(),
            notifications: VecDeque::new(),
            sidebar: SidebarState::default(),
            view: View::FleetBoard { scope: None },
            terminals: HashMap::new(),
        };
        (app, Command::none())
    }

    pub fn update(mut self, message: Message) -> (Self, Command<Message>) {
        match message {
            Message::SseEvent(event) => {
                match event {
                    SseEvent::SessionUpdated(s) | SseEvent::WorkerSpawned(s) => {
                        self.sessions.insert(s.id.clone(), s);
                    }
                    SseEvent::WorkerDone { session_id } => {
                        if let Some(s) = self.sessions.get_mut(&session_id) {
                            s.status = SessionStatus::Done;
                        }
                    }
                    SseEvent::CiUpdate(ci) => {
                        self.ci_status.insert(ci.pr_id, ci);
                    }
                    SseEvent::PrEvent(pr) => {
                        self.prs.insert(pr.session_id.clone(), pr);
                    }
                    SseEvent::ReviewComment(comment) => {
                        self.review_threads
                            .entry(comment.pr_id)
                            .or_default()
                            .push(comment);
                    }
                    SseEvent::Notification(n) => {
                        // Fire OS notification
                        let title = n.title.clone();
                        let body = n.body.clone();
                        let _ = std::thread::spawn(move || {
                            let _ = notify_rust::Notification::new()
                                .summary(&title)
                                .body(&body)
                                .show();
                        });
                        self.notifications.push_front(n);
                        if self.notifications.len() > 50 {
                            self.notifications.pop_back();
                        }
                    }
                }
            }
            Message::WsEvent(event) => match event {
                WsEvent::Connected(session_id, sender) => {
                    if let Some(t) = self.terminals.get_mut(&session_id) {
                        t.sender = Some(sender);
                    }
                }
                WsEvent::Output(session_id, bytes) => {
                    if let Some(t) = self.terminals.get_mut(&session_id) {
                        t.process(&bytes); // calls term.process() + cache.clear()
                    }
                }
                WsEvent::Disconnected(session_id) => {
                    if let Some(t) = self.terminals.get_mut(&session_id) {
                        t.sender = None;
                    }
                }
            },
            Message::TerminalInput { session_id, bytes } => {
                if let Some(t) = self.terminals.get(&session_id) {
                    if let Some(sender) = &t.sender {
                        sender.send(bytes);
                    }
                }
            }
            Message::SessionSelected(id) => {
                // Lazily create terminal state if not exists
                if !self.terminals.contains_key(&id) {
                    self.terminals.insert(id.clone(), TerminalState::new(80, 24));
                }
                self.sidebar.selected_session = Some(id.clone());
                self.view = View::SessionDetail {
                    session_id: id,
                    panel: DetailPanel::Split,
                };
            }
            Message::OrchestratorSelected(id) => {
                self.sidebar.selected_orchestrator = Some(id.clone());
                self.view = View::FleetBoard { scope: Some(id) };
            }
            Message::OrchestratorToggled(id) => {
                let entry = self.sidebar.expanded.entry(id).or_insert(true);
                *entry = !*entry;
            }
            Message::DetailPanelChanged(panel) => {
                if let View::SessionDetail { panel: ref mut p, .. } = self.view {
                    *p = panel;
                }
            }
            Message::PaneResized(_) => {}
            Message::SpawnOrchestratorPressed => {}
            Message::DismissNotification(idx) => {
                self.notifications.remove(idx);
            }
            Message::ServerUrlChanged(url) => {
                self.server_url = url;
            }
        }
        (self, Command::none())
    }

    pub fn view(&self) -> Element<Message> {
        // Stub: replaced in Task 7+
        iced::widget::text("Athene loading...").into()
    }

    pub fn subscription(&self) -> Subscription<Message> {
        let sse = sse_subscription(self.server_url.clone())
            .map(Message::SseEvent);

        let ws_subs: Vec<Subscription<Message>> = self
            .terminals
            .keys()
            .map(|id| {
                ws_subscription(self.server_url.clone(), id.clone())
                    .map(Message::WsEvent)
            })
            .collect();

        Subscription::batch(std::iter::once(sse).chain(ws_subs))
    }
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/app && cargo test app::tests
```

Expected: 4 tests pass.

- [ ] **Step 6: Verify full compile**

```bash
cd packages/app && cargo build 2>&1 | grep "^error"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/
git commit -m "feat(app): app shell with Model, Message, update, subscriptions"
```

---

## Task 6: Theme

**Files:**
- Modify: `packages/app/src/theme.rs`

**Interfaces:**
- Produces: `athene_theme() -> iced::Theme`, color constants `BG_BASE`, `BG_SURFACE`, `ACCENT_GREEN`, `STATUS_*` for use in components

---

- [ ] **Step 1: Replace the stub theme with the Athene warm-stone palette**

```rust
use iced::{
    color,
    widget::{button, container, scrollable, text},
    Background, Border, Color, Theme,
};

// Warm stone palette (mirrors globals.css dark mode tokens)
pub const BG_BASE: Color = color!(0x1a1714);
pub const BG_SURFACE: Color = color!(0x252118);
pub const BG_ELEVATED: Color = color!(0x2e2a24);
pub const BG_SIDEBAR: Color = color!(0x211e1a);
pub const BORDER_DEFAULT: Color = color!(0x3d3830, 0.6);
pub const TEXT_PRIMARY: Color = color!(0xe8e4de);
pub const TEXT_SECONDARY: Color = color!(0xa09880);
pub const TEXT_MUTED: Color = color!(0x6b6358);
pub const ACCENT_AMBER: Color = color!(0xd4a843);
pub const STATUS_WORKING: Color = color!(0x4ade80);
pub const STATUS_PR_OPEN: Color = color!(0x60a5fa);
pub const STATUS_CI_FAILED: Color = color!(0xf87171);
pub const STATUS_REVIEW: Color = color!(0xfbbf24);
pub const STATUS_MERGEABLE: Color = color!(0xa78bfa);
pub const STATUS_DONE: Color = color!(0x6b6358);

pub fn athene_theme() -> Theme {
    Theme::custom(
        "Athene".into(),
        iced::theme::Palette {
            background: BG_BASE,
            text: TEXT_PRIMARY,
            primary: ACCENT_AMBER,
            success: STATUS_WORKING,
            danger: STATUS_CI_FAILED,
        },
    )
}

pub fn status_color(status: &crate::types::SessionStatus) -> Color {
    use crate::types::SessionStatus::*;
    match status {
        Spawning | Working => STATUS_WORKING,
        PrOpen => STATUS_PR_OPEN,
        CiFailed => STATUS_CI_FAILED,
        ReviewPending => STATUS_REVIEW,
        Mergeable => STATUS_MERGEABLE,
        Done | Terminated => STATUS_DONE,
    }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd packages/app && cargo check 2>&1 | grep "^error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/theme.rs
git commit -m "feat(app): Athene warm-stone theme"
```

---

## Task 7: Sidebar

**Files:**
- Modify: `packages/app/src/components/sidebar.rs`
- Modify: `packages/app/src/app.rs` (wire `view()`)

**Interfaces:**
- Consumes: `App` (Model), `Message`
- Produces: `sidebar(app: &App) -> Element<Message>`

---

- [ ] **Step 1: Write tests for sidebar state logic**

In `packages/app/src/components/sidebar.rs`:

```rust
#[cfg(test)]
mod tests {
    use crate::{app::SidebarState, types::*};
    use std::collections::HashMap;

    #[test]
    fn workers_for_orchestrator() {
        let sessions: HashMap<SessionId, Session> = [
            ("s1".to_string(), Session {
                id: "s1".into(), orchestrator_id: Some("o1".into()),
                name: "w1".into(), repo: "slievr/Athene".into(),
                status: SessionStatus::Working, agent_type: "claude-code".into(),
                cost_usd: 0.0, started_at: 0, pr_number: None, pr_id: None,
            }),
            ("s2".to_string(), Session {
                id: "s2".into(), orchestrator_id: Some("o2".into()),
                name: "w2".into(), repo: "slievr/API".into(),
                status: SessionStatus::PrOpen, agent_type: "claude-code".into(),
                cost_usd: 0.0, started_at: 0, pr_number: None, pr_id: None,
            }),
        ].into_iter().collect();

        let workers: Vec<&Session> = sessions.values()
            .filter(|s| s.orchestrator_id.as_deref() == Some("o1"))
            .collect();
        assert_eq!(workers.len(), 1);
        assert_eq!(workers[0].repo, "slievr/Athene");
    }

    #[test]
    fn standalone_sessions_have_no_orchestrator() {
        let sessions: Vec<Session> = vec![
            Session {
                id: "s3".into(), orchestrator_id: None,
                name: "standalone".into(), repo: "slievr/Athene".into(),
                status: SessionStatus::Working, agent_type: "claude-code".into(),
                cost_usd: 0.0, started_at: 0, pr_number: None, pr_id: None,
            },
        ];
        let standalones: Vec<&Session> = sessions.iter()
            .filter(|s| s.orchestrator_id.is_none())
            .collect();
        assert_eq!(standalones.len(), 1);
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/app && cargo test sidebar
```

Expected: 2 tests pass.

- [ ] **Step 3: Implement `sidebar()` view function**

```rust
use crate::{app::{App, Message, SidebarState}, theme, types::*};
use iced::{
    widget::{button, column, container, row, scrollable, text, Space},
    Alignment, Color, Element, Length,
};

pub fn sidebar(app: &App) -> Element<Message> {
    let header = container(
        row![
            text("⬡ Athene").size(16).color(theme::TEXT_PRIMARY),
            Space::with_width(Length::Fill),
            button(text("+ Spawn").size(12))
                .on_press(Message::SpawnOrchestratorPressed)
                .style(spawn_button_style),
        ]
        .align_items(Alignment::Center)
        .padding(12),
    )
    .style(|_| container::Style {
        background: Some(iced::Background::Color(theme::BG_SIDEBAR)),
        ..Default::default()
    });

    let mut orch_items: Vec<Element<Message>> = app
        .orchestrators
        .iter()
        .map(|orch| orchestrator_node(app, orch))
        .collect();

    // Standalone sessions (no orchestrator_id)
    let standalones: Vec<&Session> = app
        .sessions
        .values()
        .filter(|s| s.orchestrator_id.is_none())
        .collect();

    if !standalones.is_empty() {
        orch_items.push(
            container(
                text("Standalone")
                    .size(11)
                    .color(theme::TEXT_MUTED),
            )
            .padding([8, 12, 4, 12])
            .into(),
        );
        for session in standalones {
            orch_items.push(worker_row(app, session, 0));
        }
    }

    let content = scrollable(
        column(orch_items).spacing(0).width(Length::Fill),
    )
    .height(Length::Fill);

    container(column![header, content].spacing(0))
        .width(220)
        .height(Length::Fill)
        .style(|_| container::Style {
            background: Some(iced::Background::Color(theme::BG_SIDEBAR)),
            border: Border {
                color: theme::BORDER_DEFAULT,
                width: 1.0,
                radius: 0.0.into(),
            },
            ..Default::default()
        })
        .into()
}

fn orchestrator_node<'a>(app: &'a App, orch: &'a Orchestrator) -> Element<'a, Message> {
    let is_expanded = app.sidebar.expanded.get(&orch.id).copied().unwrap_or(true);
    let chevron = if is_expanded { "▼" } else { "▶" };

    let orch_row = button(
        row![
            text(chevron).size(10).color(theme::TEXT_MUTED),
            Space::with_width(4),
            text(&orch.name).size(13).color(theme::TEXT_PRIMARY),
        ]
        .align_items(Alignment::Center),
    )
    .on_press(Message::OrchestratorToggled(orch.id.clone()))
    .padding([4, 12])
    .width(Length::Fill)
    .style(iced::widget::button::text);

    let mut items: Vec<Element<Message>> = vec![orch_row.into()];

    if is_expanded {
        let workers: Vec<&Session> = app
            .sessions
            .values()
            .filter(|s| s.orchestrator_id.as_deref() == Some(&orch.id))
            .collect();
        for worker in workers {
            items.push(worker_row(app, worker, 16));
        }
    }

    column(items).spacing(0).into()
}

fn worker_row<'a>(app: &'a App, session: &'a Session, indent: u16) -> Element<'a, Message> {
    let is_selected = app.sidebar.selected_session.as_deref() == Some(&session.id);
    let dot_color = theme::status_color(&session.status);

    // Extract just the repo name (last segment after '/')
    let repo_short = session.repo.split('/').last().unwrap_or(&session.repo);

    let row_content = row![
        Space::with_width(indent),
        // Status dot
        container(Space::with_width(6).height(6))
            .style(move |_| container::Style {
                background: Some(iced::Background::Color(dot_color)),
                border: Border { radius: 3.0.into(), ..Default::default() },
                ..Default::default()
            }),
        Space::with_width(6),
        text(&session.name).size(12).color(theme::TEXT_SECONDARY),
        Space::with_width(Length::Fill),
        text(repo_short).size(11).color(theme::TEXT_MUTED),
        Space::with_width(8),
    ]
    .align_items(Alignment::Center);

    let bg = if is_selected {
        theme::BG_ELEVATED
    } else {
        Color::TRANSPARENT
    };

    button(row_content)
        .on_press(Message::SessionSelected(session.id.clone()))
        .padding([3, 8])
        .width(Length::Fill)
        .style(move |_, _| iced::widget::button::Style {
            background: Some(iced::Background::Color(bg)),
            ..Default::default()
        })
        .into()
}

fn spawn_button_style(
    _theme: &iced::Theme,
    _status: iced::widget::button::Status,
) -> iced::widget::button::Style {
    iced::widget::button::Style {
        background: Some(iced::Background::Color(theme::ACCENT_AMBER)),
        text_color: theme::BG_BASE,
        border: Border { radius: 4.0.into(), ..Default::default() },
        ..Default::default()
    }
}
```

- [ ] **Step 4: Wire sidebar into `app.rs` `view()`**

Replace the stub `view()` in `app.rs`:

```rust
pub fn view(&self) -> Element<Message> {
    use iced::widget::{column, container, row};
    use crate::components::sidebar::sidebar;

    let titlebar = container(
        row![
            iced::widget::text("⬡ Athene").size(14).color(crate::theme::TEXT_PRIMARY),
            iced::widget::Space::with_width(iced::Length::Fill),
            iced::widget::text(match &self.connection {
                ConnectionState::Connected => "● connected",
                ConnectionState::Reconnecting => "○ reconnecting",
                ConnectionState::Disconnected => "○ disconnected",
            })
            .size(11)
            .color(crate::theme::TEXT_MUTED),
            iced::widget::Space::with_width(8),
        ]
        .padding(8),
    )
    .style(|_| iced::widget::container::Style {
        background: Some(iced::Background::Color(crate::theme::BG_SURFACE)),
        ..Default::default()
    })
    .width(iced::Length::Fill);

    let main = match &self.view {
        View::FleetBoard { .. } | View::SessionDetail { .. } => {
            // Stub: replaced in Tasks 8 and 11
            container(iced::widget::text("Main panel"))
                .width(iced::Length::Fill)
                .height(iced::Length::Fill)
                .into()
        }
    };

    let body = row![sidebar(self), main].spacing(0);
    column![titlebar, body].into()
}
```

- [ ] **Step 5: Build and verify window displays with sidebar**

```bash
cd packages/app && cargo run
```

Expected: a dark window with sidebar showing "⬡ Athene" and "+ Spawn" button. No crash.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/sidebar.rs packages/app/src/app.rs
git commit -m "feat(app): sidebar with orchestrator→worker hierarchy"
```

---

## Task 8: Fleet Board

**Files:**
- Modify: `packages/app/src/components/fleet_board.rs`
- Modify: `packages/app/src/app.rs` (`view()` — wire fleet board)

**Interfaces:**
- Consumes: `App` (sessions, orchestrators, ci_status), `OrchestratorId` scope
- Produces: `fleet_board(app: &App, scope: Option<&OrchestratorId>) -> Element<Message>`

---

- [ ] **Step 1: Write tests for fleet board column assignment**

```rust
#[cfg(test)]
mod tests {
    use crate::types::SessionStatus;

    fn column_for_status(status: &SessionStatus) -> &'static str {
        match status {
            SessionStatus::Spawning | SessionStatus::Working => "working",
            SessionStatus::PrOpen => "pr_open",
            SessionStatus::CiFailed => "ci_failed",
            SessionStatus::ReviewPending => "review_pending",
            SessionStatus::Mergeable => "mergeable",
            SessionStatus::Done => "done",
            SessionStatus::Terminated => "done",
        }
    }

    #[test]
    fn status_to_column_mapping() {
        assert_eq!(column_for_status(&SessionStatus::Working), "working");
        assert_eq!(column_for_status(&SessionStatus::CiFailed), "ci_failed");
        assert_eq!(column_for_status(&SessionStatus::Mergeable), "mergeable");
        assert_eq!(column_for_status(&SessionStatus::Terminated), "done");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd packages/app && cargo test fleet_board
```

Expected: 1 test passes.

- [ ] **Step 3: Implement `packages/app/src/components/fleet_board.rs`**

```rust
use crate::{app::{App, Message}, theme, types::*};
use iced::{
    widget::{button, column, container, row, scrollable, text, Space},
    Alignment, Color, Element, Length,
};

const COLUMNS: &[(&str, &str)] = &[
    ("Working", "working"),
    ("PR Open", "pr_open"),
    ("CI Failed", "ci_failed"),
    ("Review", "review_pending"),
    ("Mergeable", "mergeable"),
    ("Done", "done"),
];

pub fn fleet_board<'a>(
    app: &'a App,
    scope: Option<&'a OrchestratorId>,
) -> Element<'a, Message> {
    let scope_header = scope.and_then(|id| {
        app.orchestrators.iter().find(|o| &o.id == id)
    });

    let sessions_in_scope: Vec<&Session> = app.sessions.values()
        .filter(|s| match scope {
            Some(oid) => s.orchestrator_id.as_ref() == Some(oid),
            None => true,
        })
        .collect();

    let scope_text = match scope_header {
        Some(orch) => {
            let repos: std::collections::HashSet<&str> = sessions_in_scope
                .iter()
                .map(|s| s.repo.as_str())
                .collect();
            format!(
                "{}  ·  {} workers  ·  {} repos",
                orch.name,
                sessions_in_scope.len(),
                repos.len()
            )
        }
        None => format!("All workers  ·  {}", sessions_in_scope.len()),
    };

    let header = container(
        text(scope_text).size(13).color(theme::TEXT_SECONDARY),
    )
    .padding([8, 16])
    .width(Length::Fill);

    let columns: Vec<Element<Message>> = COLUMNS
        .iter()
        .map(|(label, key)| {
            let cards: Vec<Element<Message>> = sessions_in_scope
                .iter()
                .filter(|s| column_key(&s.status) == *key)
                .map(|s| session_card(app, s))
                .collect();

            let col = column![
                text(*label)
                    .size(11)
                    .color(theme::TEXT_MUTED),
                Space::with_height(8),
                scrollable(
                    column(cards).spacing(8).width(Length::Fill)
                ).height(Length::Fill),
            ]
            .spacing(0)
            .padding([0, 8])
            .width(200);

            container(col)
                .height(Length::Fill)
                .style(|_| iced::widget::container::Style {
                    border: iced::Border {
                        color: theme::BORDER_DEFAULT,
                        width: 1.0,
                        radius: 0.0.into(),
                    },
                    ..Default::default()
                })
                .into()
        })
        .collect();

    let board = scrollable(
        row(columns).spacing(0).height(Length::Fill),
    )
    .direction(scrollable::Direction::Horizontal(
        scrollable::Scrollbar::default(),
    ));

    container(column![header, board])
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
}

fn session_card<'a>(app: &'a App, session: &'a Session) -> Element<'a, Message> {
    let is_selected = app.sidebar.selected_session.as_deref() == Some(&session.id);
    let dot = theme::status_color(&session.status);
    let repo_short = session.repo.split('/').last().unwrap_or(&session.repo);
    let cost = format!("${:.2}", session.cost_usd);

    let ci_badge: Option<Element<Message>> =
        session.pr_id.and_then(|pr_id| app.ci_status.get(&pr_id)).map(|ci| {
            let label = format!("{}/{}", ci.passing, ci.total);
            let color = if ci.failing > 0 { theme::STATUS_CI_FAILED } else { theme::STATUS_WORKING };
            text(label).size(10).color(color).into()
        });

    let mut card_col = column![
        row![
            container(Space::with_width(6).height(6))
                .style(move |_| iced::widget::container::Style {
                    background: Some(iced::Background::Color(dot)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    ..Default::default()
                }),
            Space::with_width(6),
            text(&session.name).size(12).color(theme::TEXT_PRIMARY),
        ]
        .align_items(Alignment::Center),
        text(repo_short).size(11).color(theme::TEXT_MUTED),
        row![
            text(&cost).size(10).color(theme::TEXT_MUTED),
            Space::with_width(Length::Fill),
        ]
        .align_items(Alignment::Center),
    ]
    .spacing(3);

    if let Some(badge) = ci_badge {
        card_col = card_col.push(badge);
    }

    let bg = if is_selected { theme::BG_ELEVATED } else { theme::BG_SURFACE };

    button(container(card_col).padding(10))
        .on_press(Message::SessionSelected(session.id.clone()))
        .width(Length::Fill)
        .style(move |_, _| iced::widget::button::Style {
            background: Some(iced::Background::Color(bg)),
            border: iced::Border {
                color: theme::BORDER_DEFAULT,
                width: 1.0,
                radius: 6.0.into(),
            },
            ..Default::default()
        })
        .into()
}

fn column_key(status: &SessionStatus) -> &'static str {
    match status {
        SessionStatus::Spawning | SessionStatus::Working => "working",
        SessionStatus::PrOpen => "pr_open",
        SessionStatus::CiFailed => "ci_failed",
        SessionStatus::ReviewPending => "review_pending",
        SessionStatus::Mergeable => "mergeable",
        SessionStatus::Done | SessionStatus::Terminated => "done",
    }
}
```

- [ ] **Step 4: Wire fleet board into `app.rs` `view()`**

In the `View::FleetBoard` match arm of `view()`, replace the stub:

```rust
View::FleetBoard { scope } => {
    crate::components::fleet_board::fleet_board(self, scope.as_ref())
}
```

- [ ] **Step 5: Run and visually verify fleet board**

```bash
cd packages/app && cargo run
```

Expected: fleet board renders with 6 status columns. No crash.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/fleet_board.rs packages/app/src/app.rs
git commit -m "feat(app): fleet board kanban with status columns"
```

---

## Task 9: Info Panel

**Files:**
- Modify: `packages/app/src/components/info_panel.rs`

**Interfaces:**
- Consumes: `Session`, `Option<&PR>`, `Option<&CIStatus>`, `Option<&Vec<Comment>>`
- Produces: `info_panel(session: &Session, pr: Option<&PR>, ci: Option<&CIStatus>, comments: &[Comment]) -> Element<Message>`

---

- [ ] **Step 1: Write tests for info panel data formatting**

```rust
#[cfg(test)]
mod tests {
    use crate::types::*;

    fn format_ci(ci: &CIStatus) -> String {
        format!("CI: {}/{} passing", ci.passing, ci.total)
    }

    fn format_cost(cost: f64) -> String {
        format!("${:.2}", cost)
    }

    #[test]
    fn ci_label_format() {
        let ci = CIStatus { pr_id: 1, total: 4, passing: 3, failing: 1, pending: 0 };
        assert_eq!(format_ci(&ci), "CI: 3/4 passing");
    }

    #[test]
    fn cost_format() {
        assert_eq!(format_cost(0.427), "$0.43");
        assert_eq!(format_cost(0.0), "$0.00");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd packages/app && cargo test info_panel
```

Expected: 2 tests pass.

- [ ] **Step 3: Implement `packages/app/src/components/info_panel.rs`**

```rust
use crate::{app::Message, theme, types::*};
use iced::{
    widget::{column, container, row, scrollable, text, Space},
    Color, Element, Length,
};

pub fn info_panel<'a>(
    session: &'a Session,
    pr: Option<&'a PR>,
    ci: Option<&'a CIStatus>,
    comments: &'a [Comment],
) -> Element<'a, Message> {
    let mut sections: Vec<Element<Message>> = vec![];

    // PR section
    if let Some(pr) = pr {
        sections.push(section_header("Pull Request"));
        sections.push(
            text(format!("#{} {}", pr.number, pr.title))
                .size(13)
                .color(theme::TEXT_PRIMARY)
                .into(),
        );
        if !pr.body.is_empty() {
            sections.push(Space::with_height(4).into());
            sections.push(
                text(&pr.body)
                    .size(11)
                    .color(theme::TEXT_SECONDARY)
                    .into(),
            );
        }
        sections.push(Space::with_height(12).into());
    }

    // CI section
    if let Some(ci) = ci {
        sections.push(section_header("CI"));
        let (label, color) = if ci.failing > 0 {
            (format!("{}/{} passing  ·  {} failing", ci.passing, ci.total, ci.failing),
             theme::STATUS_CI_FAILED)
        } else if ci.pending > 0 {
            (format!("{}/{} passing  ·  {} pending", ci.passing, ci.total, ci.pending),
             theme::STATUS_REVIEW)
        } else {
            (format!("{}/{} passing", ci.passing, ci.total), theme::STATUS_WORKING)
        };
        sections.push(text(label).size(12).color(color).into());
        sections.push(Space::with_height(12).into());
    }

    // Review comments
    if !comments.is_empty() {
        sections.push(section_header(&format!("{} Review Comments", comments.len())));
        for comment in comments {
            sections.push(comment_item(comment));
            sections.push(Space::with_height(8).into());
        }
    }

    if sections.is_empty() {
        sections.push(
            text("No PR yet")
                .size(12)
                .color(theme::TEXT_MUTED)
                .into(),
        );
    }

    scrollable(
        container(column(sections).spacing(0).padding(16))
            .width(Length::Fill),
    )
    .height(Length::Fill)
    .into()
}

fn section_header(label: &str) -> Element<Message> {
    column![
        text(label.to_uppercase())
            .size(10)
            .color(theme::TEXT_MUTED),
        Space::with_height(6),
    ]
    .into()
}

fn comment_item(comment: &Comment) -> Element<Message> {
    let location = comment
        .path
        .as_deref()
        .map(|p| {
            format!(
                "{} L{}",
                p.split('/').last().unwrap_or(p),
                comment.line.unwrap_or(0)
            )
        });

    let mut col = column![
        row![
            text(&comment.author).size(11).color(theme::ACCENT_AMBER),
            Space::with_width(8),
            if let Some(loc) = location {
                text(loc).size(10).color(theme::TEXT_MUTED)
            } else {
                text("").size(10)
            },
        ],
        Space::with_height(3),
        text(&comment.body).size(12).color(theme::TEXT_SECONDARY),
    ]
    .spacing(0);

    container(col)
        .padding(8)
        .style(|_| iced::widget::container::Style {
            background: Some(iced::Background::Color(theme::BG_ELEVATED)),
            border: iced::Border {
                color: theme::BORDER_DEFAULT,
                width: 1.0,
                radius: 4.0.into(),
            },
            ..Default::default()
        })
        .into()
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/info_panel.rs
git commit -m "feat(app): info panel with PR, CI, and review comments"
```

---

## Task 10: Terminal Canvas Widget

**Files:**
- Modify: `packages/app/src/components/terminal.rs`

**Interfaces:**
- Consumes: `TerminalState` from `app.rs`, font size from `AppConfig`
- Produces:
  - `struct TerminalState { term: Term<EventProxy>, sender: Option<WsSender>, cache: Cache }`
  - `struct TerminalWidget<'a> { state: &'a TerminalState, font_size: f32 }`
  - `impl canvas::Program<Message> for TerminalWidget<'_>`

---

- [ ] **Step 1: Write tests for terminal byte processing**

```rust
#[cfg(test)]
mod tests {
    use alacritty_terminal::{
        config::Config as TermConfig,
        term::{Term, SizeInfo},
    };
    use crate::app::EventProxy;

    fn make_term() -> Term<EventProxy> {
        let size = SizeInfo::new(80.0, 24.0, 8.0, 16.0, 0.0, 0.0, false);
        Term::new(TermConfig::default(), &size, EventProxy)
    }

    #[test]
    fn process_plain_text() {
        use alacritty_terminal::term::Term;
        let mut term = make_term();
        term.process(b"hello");
        // After processing, cursor has advanced
        let point = term.grid().cursor.point;
        assert_eq!(point.column.0, 5);
    }

    #[test]
    fn process_ansi_color() {
        use alacritty_terminal::term::Term;
        let mut term = make_term();
        // ESC[31m = red foreground
        term.process(b"\x1b[31mred\x1b[0m");
        // No panic = success for basic ANSI parsing
    }

    #[test]
    fn process_clear_screen() {
        use alacritty_terminal::term::Term;
        let mut term = make_term();
        term.process(b"hello\x1b[2J"); // clear screen
        // No panic = success
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd packages/app && cargo test terminal::tests
```

Expected: 3 tests pass.

- [ ] **Step 3: Implement `packages/app/src/components/terminal.rs`**

```rust
use alacritty_terminal::{
    grid::Dimensions,
    index::{Column, Line, Point},
    term::{cell::Flags, color::Colors, Term},
    vte::ansi::{Color as AnsiColor, NamedColor},
};
use iced::{
    mouse,
    widget::canvas::{self, Cache, Canvas, Frame, Geometry, Path, Stroke, Text},
    Color, Font, Point as IcedPoint, Rectangle, Size,
};
use crate::app::Message;

// EventProxy defined here (canonical location) and re-exported.
// app.rs imports it via: use crate::components::terminal::EventProxy;
#[derive(Clone)]
pub struct EventProxy;

impl alacritty_terminal::event::EventListener for EventProxy {
    fn send_event(&self, _event: alacritty_terminal::event::Event) {}
}

pub struct TerminalState {
    pub term: Term<EventProxy>,
    pub sender: Option<crate::client::websocket::WsSender>,
    cache: Cache, // private — use TerminalState::process(), not term.process() directly
}

pub struct TerminalWidget<'a> {
    pub state: &'a TerminalState,
    pub font_size: f32,
    pub session_id: crate::types::SessionId,
}

impl TerminalState {
    pub fn new(cols: u16, rows: u16) -> Self {
        use alacritty_terminal::{config::Config as TermConfig, term::SizeInfo};
        let cell_width = 8.0_f32;
        let cell_height = 16.0_f32;
        let size = SizeInfo::new(
            cols as f32 * cell_width,
            rows as f32 * cell_height,
            cell_width,
            cell_height,
            0.0,
            0.0,
            false,
        );
        let term = Term::new(TermConfig::default(), &size, EventProxy);
        Self { term, sender: None, cache: Cache::new() }
    }

    pub fn process(&mut self, bytes: &[u8]) {
        self.term.process(bytes);
        self.cache.clear(); // invalidate cache so Canvas redraws
    }
}

fn ansi_to_iced(color: AnsiColor, colors: &Colors) -> Color {
    match color {
        AnsiColor::Named(named) => named_to_iced(named),
        AnsiColor::Spec(rgb) => Color::from_rgb8(rgb.r, rgb.g, rgb.b),
        AnsiColor::Indexed(idx) => {
            if let Some(rgb) = colors[idx as usize] {
                Color::from_rgb8(rgb.r, rgb.g, rgb.b)
            } else {
                Color::WHITE
            }
        }
    }
}

fn named_to_iced(named: NamedColor) -> Color {
    // Map standard ANSI 16 colors to Athene-themed variants
    match named {
        NamedColor::Black | NamedColor::DimBlack => Color::from_rgb8(0x1a, 0x17, 0x14),
        NamedColor::Red | NamedColor::DimRed => Color::from_rgb8(0xf8, 0x71, 0x71),
        NamedColor::Green | NamedColor::DimGreen => Color::from_rgb8(0x4a, 0xde, 0x80),
        NamedColor::Yellow | NamedColor::DimYellow => Color::from_rgb8(0xfb, 0xbf, 0x24),
        NamedColor::Blue | NamedColor::DimBlue => Color::from_rgb8(0x60, 0xa5, 0xfa),
        NamedColor::Magenta | NamedColor::DimMagenta => Color::from_rgb8(0xa7, 0x8b, 0xfa),
        NamedColor::Cyan | NamedColor::DimCyan => Color::from_rgb8(0x34, 0xd3, 0x99),
        NamedColor::White | NamedColor::DimWhite => Color::from_rgb8(0xe8, 0xe4, 0xde),
        NamedColor::BrightBlack => Color::from_rgb8(0x6b, 0x63, 0x58),
        NamedColor::BrightRed => Color::from_rgb8(0xfc, 0xa5, 0xa5),
        NamedColor::BrightGreen => Color::from_rgb8(0x86, 0xef, 0xac),
        NamedColor::BrightYellow => Color::from_rgb8(0xfd, 0xe6, 0x8a),
        NamedColor::BrightBlue => Color::from_rgb8(0x93, 0xc5, 0xfd),
        NamedColor::BrightMagenta => Color::from_rgb8(0xc4, 0xb5, 0xfd),
        NamedColor::BrightCyan => Color::from_rgb8(0x6e, 0xe7, 0xb7),
        NamedColor::BrightWhite => Color::from_rgb8(0xff, 0xff, 0xff),
        NamedColor::Foreground => Color::from_rgb8(0xe8, 0xe4, 0xde),
        NamedColor::Background => Color::from_rgb8(0x1a, 0x17, 0x14),
        _ => Color::WHITE,
    }
}

impl<'a> canvas::Program<Message> for TerminalWidget<'a> {
    type State = ();

    fn draw(
        &self,
        _state: &(),
        renderer: &iced::Renderer,
        _theme: &iced::Theme,
        bounds: Rectangle,
        _cursor: mouse::Cursor,
    ) -> Vec<Geometry> {
        let cell_w = self.font_size * 0.6;
        let cell_h = self.font_size * 1.4;

        let geo = self.state.cache.draw(renderer, bounds.size(), |frame| {
            // Fill background
            frame.fill_rectangle(
                IcedPoint::ORIGIN,
                bounds.size(),
                Color::from_rgb8(0x1a, 0x17, 0x14),
            );

            let grid = self.state.term.grid();
            let colors = self.state.term.colors();
            let num_cols = grid.columns();
            let num_rows = grid.screen_lines();

            for row_idx in 0..num_rows {
                let line = Line(row_idx as i32);
                // Batch background fills
                let mut bg_start: Option<(usize, Color)> = None;

                for col_idx in 0..num_cols {
                    let point = Point { line, column: Column(col_idx) };
                    let cell = &grid[point];
                    let bg_color = ansi_to_iced(cell.bg, colors);

                    match bg_start {
                        Some((start, c)) if c == bg_color => {
                            // extend current run
                        }
                        Some((start, c)) => {
                            // flush previous run
                            let run_w = (col_idx - start) as f32 * cell_w;
                            frame.fill_rectangle(
                                IcedPoint::new(start as f32 * cell_w, row_idx as f32 * cell_h),
                                Size::new(run_w, cell_h),
                                c,
                            );
                            bg_start = Some((col_idx, bg_color));
                        }
                        None => {
                            bg_start = Some((col_idx, bg_color));
                        }
                    }
                }
                // flush last run
                if let Some((start, c)) = bg_start {
                    let run_w = (num_cols - start) as f32 * cell_w;
                    frame.fill_rectangle(
                        IcedPoint::new(start as f32 * cell_w, row_idx as f32 * cell_h),
                        Size::new(run_w, cell_h),
                        c,
                    );
                }

                // Draw text
                for col_idx in 0..num_cols {
                    let point = Point { line, column: Column(col_idx) };
                    let cell = &grid[point];
                    if cell.c == ' ' || cell.c == '\0' {
                        continue;
                    }
                    let fg = ansi_to_iced(cell.fg, colors);
                    frame.fill_text(canvas::Text {
                        content: cell.c.to_string(),
                        position: IcedPoint::new(
                            col_idx as f32 * cell_w,
                            row_idx as f32 * cell_h,
                        ),
                        color: fg,
                        size: iced::Pixels(self.font_size),
                        font: Font::MONOSPACE,
                        horizontal_alignment: iced::alignment::Horizontal::Left,
                        vertical_alignment: iced::alignment::Vertical::Top,
                        shaping: iced::widget::text::Shaping::Advanced,
                        ..canvas::Text::default()
                    });
                }
            }

            // Draw cursor
            let cursor_point = grid.cursor.point;
            let cx = cursor_point.column.0 as f32 * cell_w;
            let cy = (cursor_point.line.0 as usize) as f32 * cell_h;
            frame.fill_rectangle(
                IcedPoint::new(cx, cy),
                Size::new(cell_w, cell_h),
                Color { a: 0.7, ..Color::WHITE },
            );
        });

        vec![geo]
    }

    fn update(
        &self,
        _state: &mut (),
        event: canvas::Event,
        _bounds: Rectangle,
        _cursor: mouse::Cursor,
    ) -> (canvas::event::Status, Option<Message>) {
        match event {
            canvas::Event::Keyboard(iced::keyboard::Event::KeyPressed {
                key,
                modifiers,
                ..
            }) => {
                if let Some(bytes) = key_to_bytes(&key, modifiers) {
                    return (
                        canvas::event::Status::Captured,
                        Some(Message::TerminalInput {
                            session_id: self.session_id.clone(),
                            bytes,
                        }),
                    );
                }
            }
            _ => {}
        }
        (canvas::event::Status::Ignored, None)
    }
}

fn key_to_bytes(
    key: &iced::keyboard::Key,
    _modifiers: iced::keyboard::Modifiers,
) -> Option<Vec<u8>> {
    use iced::keyboard::Key;
    match key {
        Key::Character(c) => Some(c.as_str().as_bytes().to_vec()),
        Key::Named(iced::keyboard::key::Named::Enter) => Some(b"\r".to_vec()),
        Key::Named(iced::keyboard::key::Named::Backspace) => Some(b"\x7f".to_vec()),
        Key::Named(iced::keyboard::key::Named::Tab) => Some(b"\t".to_vec()),
        Key::Named(iced::keyboard::key::Named::Escape) => Some(b"\x1b".to_vec()),
        Key::Named(iced::keyboard::key::Named::ArrowUp) => Some(b"\x1b[A".to_vec()),
        Key::Named(iced::keyboard::key::Named::ArrowDown) => Some(b"\x1b[B".to_vec()),
        Key::Named(iced::keyboard::key::Named::ArrowRight) => Some(b"\x1b[C".to_vec()),
        Key::Named(iced::keyboard::key::Named::ArrowLeft) => Some(b"\x1b[D".to_vec()),
        _ => None,
    }
}
```

- [ ] **Step 4: Run terminal tests**

```bash
cd packages/app && cargo test terminal
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/terminal.rs
git commit -m "feat(app): terminal Canvas widget with alacritty_terminal"
```

---

## Task 11: Session Detail

**Files:**
- Modify: `packages/app/src/components/session_detail.rs`
- Modify: `packages/app/src/app.rs` (`view()` — wire session detail)

**Interfaces:**
- Consumes: `App`, `SessionId`, `DetailPanel`
- Produces: `session_detail(app: &App, session_id: &SessionId, panel: &DetailPanel) -> Element<Message>`

---

- [ ] **Step 1: Write tests for detail panel toggle**

```rust
#[cfg(test)]
mod tests {
    use crate::app::DetailPanel;

    #[test]
    fn panel_cycles() {
        let panels = [DetailPanel::Split, DetailPanel::Terminal, DetailPanel::Info];
        assert_ne!(panels[0], panels[1]);
        assert_ne!(panels[1], panels[2]);
    }
}
```

- [ ] **Step 2: Implement `packages/app/src/components/session_detail.rs`**

```rust
use crate::{
    app::{App, DetailPanel, Message},
    components::{info_panel::info_panel, terminal::{TerminalWidget, TerminalState}},
    theme,
    types::*,
};
use iced::{
    widget::{button, canvas::Canvas, column, container, pane_grid, row, text, Space},
    Alignment, Element, Length,
};

pub fn session_detail<'a>(
    app: &'a App,
    session_id: &'a SessionId,
    panel: &'a DetailPanel,
) -> Element<'a, Message> {
    let session = match app.sessions.get(session_id) {
        Some(s) => s,
        None => return text("Session not found").into(),
    };

    let pr = app.prs.get(session_id);
    let ci = pr.and_then(|p| app.ci_status.get(&p.id));
    let comments: &[Comment] = pr
        .and_then(|p| app.review_threads.get(&p.id))
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let header = session_header(session);

    let panel_toggles = row![
        panel_toggle_btn("Terminal", DetailPanel::Terminal, panel),
        panel_toggle_btn("Split", DetailPanel::Split, panel),
        panel_toggle_btn("Info", DetailPanel::Info, panel),
    ]
    .spacing(4);

    let main: Element<Message> = match panel {
        DetailPanel::Terminal => {
            if let Some(term_state) = app.terminals.get(session_id) {
                Canvas::new(TerminalWidget {
                    state: term_state,
                    font_size: 13.0,
                    session_id: session_id.clone(),
                })
                .width(Length::Fill)
                .height(Length::Fill)
                .into()
            } else {
                text("Connecting...").color(theme::TEXT_MUTED).into()
            }
        }
        DetailPanel::Info => {
            info_panel(session, pr, ci, comments)
        }
        DetailPanel::Split => {
            // Use a simple row split (pane_grid for resizable version)
            row![
                container(
                    if let Some(term_state) = app.terminals.get(session_id) {
                        Canvas::new(TerminalWidget {
                            state: term_state,
                            font_size: 13.0,
                            session_id: session_id.clone(),
                        })
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .into()
                    } else {
                        text("Connecting...").color(theme::TEXT_MUTED).into()
                    }
                )
                .width(Length::FillPortion(2)),
                container(info_panel(session, pr, ci, comments))
                    .width(Length::FillPortion(1))
                    .style(|_| iced::widget::container::Style {
                        border: iced::Border {
                            color: theme::BORDER_DEFAULT,
                            width: 1.0,
                            radius: 0.0.into(),
                        },
                        ..Default::default()
                    }),
            ]
            .height(Length::Fill)
            .into()
        }
    };

    column![
        header,
        container(panel_toggles).padding([4, 16]),
        main,
    ]
    .into()
}

fn session_header(session: &Session) -> Element<Message> {
    let status_color = theme::status_color(&session.status);
    let status_label = format!("{:?}", session.status).to_lowercase().replace('_', " ");
    let cost = format!("${:.2}", session.cost_usd);

    container(
        row![
            text(&session.name).size(14).color(theme::TEXT_PRIMARY),
            Space::with_width(8),
            text("·").color(theme::TEXT_MUTED),
            Space::with_width(8),
            text(&session.repo).size(13).color(theme::ACCENT_AMBER),
            Space::with_width(8),
            text("·").color(theme::TEXT_MUTED),
            Space::with_width(8),
            container(Space::with_width(6).height(6))
                .style(move |_| iced::widget::container::Style {
                    background: Some(iced::Background::Color(status_color)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    ..Default::default()
                }),
            Space::with_width(4),
            text(&status_label).size(12).color(theme::TEXT_SECONDARY),
            Space::with_width(Length::Fill),
            text(&cost).size(12).color(theme::TEXT_MUTED),
            Space::with_width(16),
        ]
        .align_items(Alignment::Center)
        .padding([8, 16]),
    )
    .style(|_| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_SURFACE)),
        border: iced::Border {
            color: theme::BORDER_DEFAULT,
            width: 1.0,
            radius: 0.0.into(),
        },
        ..Default::default()
    })
    .width(Length::Fill)
    .into()
}

fn panel_toggle_btn(
    label: &str,
    target: DetailPanel,
    current: &DetailPanel,
) -> Element<Message> {
    let is_active = &target == current;
    let bg = if is_active { theme::BG_ELEVATED } else { iced::Color::TRANSPARENT };

    button(text(label).size(11))
        .on_press(Message::DetailPanelChanged(target))
        .padding([3, 8])
        .style(move |_, _| iced::widget::button::Style {
            background: Some(iced::Background::Color(bg)),
            border: iced::Border {
                color: theme::BORDER_DEFAULT,
                width: 1.0,
                radius: 4.0.into(),
            },
            text_color: if is_active { theme::TEXT_PRIMARY } else { theme::TEXT_MUTED },
            ..Default::default()
        })
        .into()
}
```

- [ ] **Step 3: Wire session detail into `app.rs` `view()`**

Replace the `View::SessionDetail` stub in `view()`:

```rust
View::SessionDetail { session_id, panel } => {
    crate::components::session_detail::session_detail(self, session_id, panel)
}
```

- [ ] **Step 4: Build and verify**

```bash
cd packages/app && cargo build 2>&1 | grep "^error"
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd packages/app && cargo test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/session_detail.rs packages/app/src/app.rs
git commit -m "feat(app): session detail with terminal, info panel, and toggle"
```

---

## Task 12: Connection State + Titlebar Status

**Files:**
- Modify: `packages/app/src/app.rs`

**Interfaces:**
- Produces: `Message::SseConnected`, `Message::SseDisconnected` — emitted by SSE subscription; routed to `ConnectionState`

---

- [ ] **Step 1: Write tests for connection state transitions**

```rust
#[test]
fn sse_connected_updates_state() {
    let model = base_model();
    let (updated, _) = model.update(Message::SseConnected);
    assert!(matches!(updated.connection, ConnectionState::Connected));
}

#[test]
fn sse_disconnected_triggers_reconnecting() {
    let mut model = base_model();
    model.connection = ConnectionState::Connected;
    let (updated, _) = model.update(Message::SseDisconnected);
    assert!(matches!(updated.connection, ConnectionState::Reconnecting));
}
```

- [ ] **Step 2: Add `SseConnected` and `SseDisconnected` to `Message` enum in `app.rs`**

```rust
// Add to Message enum:
SseConnected,
SseDisconnected,
```

- [ ] **Step 3: Add match arms in `update()`**

```rust
Message::SseConnected => {
    self.connection = ConnectionState::Connected;
}
Message::SseDisconnected => {
    self.connection = ConnectionState::Reconnecting;
}
```

- [ ] **Step 4: Emit these messages from `sse_subscription` in `client/sse.rs`**

Change the SSE subscription return type to `SseMessage` and add connection events:

```rust
#[derive(Debug, Clone)]
pub enum SseMessage {
    Connected,
    Event(SseEvent),
    Disconnected,
}
```

Update `connect_sse` to emit `SseMessage::Connected` on successful connection and `SseMessage::Disconnected` when the stream ends.

Update `subscription()` in `app.rs` to map `SseMessage`:

```rust
let sse = sse_subscription(self.server_url.clone()).map(|msg| match msg {
    SseMessage::Connected => Message::SseConnected,
    SseMessage::Event(e) => Message::SseEvent(e),
    SseMessage::Disconnected => Message::SseDisconnected,
});
```

- [ ] **Step 5: Run tests**

```bash
cd packages/app && cargo test
```

Expected: all tests pass including the two new connection tests.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/
git commit -m "feat(app): connection state tracking with SSE connect/disconnect"
```

---

## Task 13: First-Run Setup + Integration Smoke Test

**Files:**
- Modify: `packages/app/src/main.rs`
- Modify: `packages/app/src/app.rs` (first-run view)

**Interfaces:**
- Produces: a first-run prompt view shown when `server_url` is the default value and no connection has been established

---

- [ ] **Step 1: Add first-run view to `View` enum**

```rust
// Add to View enum in app.rs:
Setup,
```

- [ ] **Step 2: Initialize to `View::Setup` when config is default**

In `App::new()`:

```rust
let is_first_run = config.server_url == AppConfig::default().server_url;
let view = if is_first_run {
    View::Setup
} else {
    View::FleetBoard { scope: None }
};
```

- [ ] **Step 3: Implement `View::Setup` arm in `view()`**

```rust
View::Setup => {
    use iced::widget::{text_input, column, container, button, text, Space};
    container(
        column![
            text("Welcome to Athene").size(24).color(crate::theme::TEXT_PRIMARY),
            Space::with_height(8),
            text("Enter your Athene server URL to continue.")
                .size(13)
                .color(crate::theme::TEXT_SECONDARY),
            Space::with_height(16),
            text_input("http://localhost:8080", &self.server_url)
                .on_input(Message::ServerUrlChanged)
                .padding(10)
                .size(14),
            Space::with_height(12),
            button(text("Connect").size(13))
                .on_press(Message::ConnectPressed)
                .padding([8, 20])
                .style(|_, _| iced::widget::button::Style {
                    background: Some(iced::Background::Color(crate::theme::ACCENT_AMBER)),
                    text_color: crate::theme::BG_BASE,
                    border: iced::Border { radius: 6.0.into(), ..Default::default() },
                    ..Default::default()
                }),
        ]
        .spacing(0)
        .max_width(400),
    )
    .center_x()
    .center_y()
    .width(Length::Fill)
    .height(Length::Fill)
    .into()
}
```

- [ ] **Step 4: Add `ConnectPressed` to `Message` and handle in `update()`**

```rust
// Message enum:
ConnectPressed,

// update() arm:
Message::ConnectPressed => {
    let cfg = AppConfig {
        server_url: self.server_url.clone(),
        font_size: 13.0,
    };
    let _ = cfg.save();
    self.view = View::FleetBoard { scope: None };
}
```

- [ ] **Step 5: Run the full app end-to-end**

```bash
cd packages/app && cargo run
```

Expected:
1. First-run setup screen appears with URL input
2. Enter a server URL and click Connect
3. Fleet board appears with empty columns
4. If Go backend is running at that URL: sidebar populates with orchestrators/sessions from SSE

- [ ] **Step 6: Run all tests one final time**

```bash
cd packages/app && cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/
git commit -m "feat(app): first-run setup screen and end-to-end wiring"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Rust binary in `packages/app/` | Task 1 |
| Config at `~/.config/athene/config.toml` | Task 1 |
| Domain types (Session, Orchestrator, PR, etc.) | Task 2 |
| SSE event deserialization | Task 2 |
| SSE subscription with auto-reconnect | Task 3 |
| WebSocket subscription per terminal | Task 4 |
| Model, Message, update(), subscription() | Task 5 |
| Athene warm-stone theme | Task 6 |
| Sidebar: orchestrator→worker hierarchy | Task 7 |
| Sidebar: repo displayed per worker | Task 7 |
| Sidebar: [+ Spawn] button | Task 7 |
| Sidebar: collapse/expand per orchestrator | Task 7 |
| Fleet board: kanban by status | Task 8 |
| Fleet board: scope by orchestrator | Task 8 |
| Session cards: name, repo, cost, CI badge | Task 8 |
| Info panel: PR, CI, review comments | Task 9 |
| Terminal: alacritty_terminal VT emulation | Task 10 |
| Terminal: Canvas widget rendering | Task 10 |
| Terminal: keyboard input → WebSocket | Task 10 |
| Session detail: header with repo always visible | Task 11 |
| Session detail: Split/Terminal/Info toggle | Task 11 |
| OS notifications via notify-rust | Task 5 (inline in update()) |
| Connection state indicator in titlebar | Task 12 |
| First-run server URL prompt | Task 13 |
