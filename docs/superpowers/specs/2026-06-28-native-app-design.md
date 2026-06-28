# Athene Native App — Design Spec

**Date:** 2026-06-28 (revised 2026-06-28)
**Status:** Approved
**Scope:** Single Rust binary that embeds the Athene engine, always exposes an HTTP server, and optionally runs an Iced native UI. Replaces the TypeScript/Node.js backend and the Next.js web dashboard as the primary stack.

> **Note on PR #74 (Go engine migration):** The Go engine phases 1–7 serve as a complete design spec for the Rust engine crates — plugin interface types, session store schema, lifecycle state machine, JSON-RPC adapter protocol. Port the design, not the code. PR #74 should be closed once this work begins.

---

## Overview

A single `athene` Rust binary that does three things simultaneously:

1. **Runs the engine** — session management, lifecycle polling, plugin adapters, SQLite persistence
2. **Serves an HTTP API** — axum server always listening (e.g. `:8080`), exposing REST, SSE, and WebSocket for the web dashboard and remote clients
3. **Shows a native UI** — Iced window (GPU-accelerated, wgpu) that reads engine state via an in-process channel, with zero HTTP overhead for local use

The native UI and the HTTP server subscribe to the **same internal broadcast channel**. Remote users get identical real-time fidelity to local users. The web dashboard continues to work unchanged — it connects to the axum server exactly as it would connect to any backend.

---

## Architecture

### Single binary, three crates

```
athene/                          Cargo workspace
├── crates/
│   ├── athene-core/             Engine library: types, session store, lifecycle,
│   │                            plugin protocol, event broadcast bus
│   ├── athene-server/           axum HTTP server: REST, SSE, WebSocket terminal
│   │                            (thin layer over athene-core)
│   └── athene-app/              Iced binary: embeds athene-core + athene-server,
│                                adds native UI on top
└── Cargo.toml                   workspace root
```

### Runtime diagram

```
athene (single binary)
│
├── tokio runtime
│   │
│   ├── athene-core
│   │     ├── SessionManager       CRUD, SQLite persistence
│   │     ├── LifecyclePoller      goroutine-per-session polling loop
│   │     ├── PluginRegistry       JSON-RPC subprocess adapters (TypeScript plugins)
│   │     │                        + native Rust plugins over time
│   │     └── broadcast::Sender<Event>   ← single event bus
│   │              │
│   │              ├──▶ axum SSE handler     (remote browser / web dashboard)
│   │              └──▶ iced Subscription    (native UI — zero HTTP hop)
│   │
│   └── athene-server (axum, always on)
│         ├── GET  /api/v1/events              SSE stream
│         ├── GET  /api/v1/sessions            REST
│         ├── GET  /api/v1/orchestrators       REST
│         ├── POST /api/v1/orchestrators       REST
│         └── WS   /api/v1/sessions/:id/terminal
│
└── Iced UI (main thread — skipped in headless mode)
      └── iced::Subscription listens on broadcast::Receiver<Event>
          writes via in-process Message channel → update() → SessionManager
```

### Headless mode

When launched without a display (e.g. on a remote server), the binary starts the engine and HTTP server but skips the Iced window. The web dashboard is the UI. `--headless` flag forces this; absence of `$DISPLAY` / `$WAYLAND_DISPLAY` also triggers it on Linux.

---

## Crate Responsibilities

### `athene-core`

- `types.rs` — all shared domain types: `Session`, `Orchestrator`, `PR`, `CIStatus`, `Comment`, `Notification`, `SessionStatus`
- `store.rs` — SQLite-backed session store (rusqlite), migration runner
- `config.rs` — `agent-orchestrator.yaml` config loading + `~/.config/athene/config.toml` app config
- `lifecycle/` — poller goroutine, probe logic, state machine transitions
- `plugin/` — `PluginAdapter` trait, JSON-RPC subprocess adapter, plugin registry
- `plugins/` — native Rust implementations: `runtime-tmux`, `workspace-worktree`
- `events.rs` — `Event` enum + `broadcast::Sender<Event>` bus

### `athene-server`

- `server.rs` — axum router, bind, graceful shutdown
- `routes/sessions.rs` — REST CRUD
- `routes/orchestrators.rs` — REST CRUD
- `routes/events.rs` — SSE handler (subscribes to broadcast receiver)
- `routes/terminal.rs` — WebSocket handler (proxies PTY bytes)

### `athene-app`

- `main.rs` — starts engine + server in tokio, then launches Iced (or exits headless)
- `app.rs` — Iced `Application`: `Model`, `Message`, `update()`, `view()`, `subscription()`
- `theme.rs` — Athene warm-stone color palette
- `components/` — `sidebar`, `fleet_board`, `session_detail`, `terminal`, `info_panel`

---

## Deployable Milestones

Each milestone produces something you can run and use end-to-end.

| # | Milestone | How to test |
|---|---|---|
| 1 | **Engine + REST API** | `athene-app --headless` runs; `curl /api/v1/sessions` returns sessions; lifecycle polling works |
| 2 | **SSE + WebSocket** | Existing web dashboard connects; sessions update in real time; terminals open |
| 3 | **Native app shell** | `athene-app` opens Iced window; sidebar shows orchestrators and workers; fleet board shows sessions |
| 4 | **Native terminal** | Click a worker → terminal opens; type commands; full VT rendering |
| 5 | **Full parity** | Info panel, OS notifications, CI badges, review comments — complete web dashboard feature set in native UI |

---

## UI Layout

*(Unchanged from original design — approved in brainstorming.)*

### Overall Shell

```
┌──────────────────────────────────────────────────────────┐
│  titlebar: ⬡ Athene  ·  server status  ·  settings       │
├───────────────────┬──────────────────────────────────────┤
│                   │                                      │
│   Sidebar         │   Main Panel                         │
│                   │                                      │
│   Orchestrators   │   Fleet Board  ─or─  Session Detail  │
│   └── Workers     │                                      │
│                   │                                      │
└───────────────────┴──────────────────────────────────────┘
```

### Sidebar

```
┌─────────────────────────┐
│  ⬡ Athene    [+ Spawn]  │
├─────────────────────────┤
│  ▼ fix-auth-flow        │  ← orchestrator
│    ├ worker-1  /Athene  │  ● working
│    ├ worker-2  /API     │  ● pr_open
│    └ worker-3  /Backend │  ◐ ci_failed
│                         │
│  ▼ add-dark-mode        │
│    └ worker-4  /Athene  │  ● working
│                         │
│  ▶ refactor-billing     │  (collapsed)
│                         │
│  ─── Standalone ──────  │
│    worker-5  /Athene    │  ● working
└─────────────────────────┘
```

Each worker row: **name**, **repo** (never truncated), **status dot**.
Clicking an orchestrator → scopes Fleet Board. Clicking a worker → Session Detail.

### Fleet Board

Horizontal scrollable kanban. Columns: `working`, `pr_open`, `ci_failed`, `review_pending`, `mergeable`, `done`. Cards show: name, repo, cost, CI badge.

### Session Detail

```
┌──────────────────────────────────────────────────────┐
│  worker-1  ·  slievr/Athene  ·  ● working  ·  $0.42  │
├───────────────────────────────┬──────────────────────┤
│                               │  PR #74              │
│  Terminal (Canvas widget)     │  CI: 3/4 passing     │
│                               │  2 review comments   │
│              ◀── drag ────────┤                      │
└───────────────────────────────┴──────────────────────┘
```

`pane_grid` split, draggable. Toggle: `Split` (default) | `Terminal` | `Info`.

---

## Real-time Data Flow

### Event bus (in-process)

```rust
// athene-core/src/events.rs
#[derive(Debug, Clone)]
pub enum Event {
    SessionUpdated(Session),
    SessionSpawned(Session),
    SessionDone(SessionId),
    CiUpdated { pr_id: PrId, status: CIStatus },
    PrOpened { session_id: SessionId, pr: PR },
    ReviewComment { pr_id: PrId, comment: Comment },
    Notification(Notification),
}

// broadcast channel created at engine startup:
// let (tx, _) = tokio::sync::broadcast::channel::<Event>(256);
```

### Native UI subscription (zero HTTP)

The Iced `subscription()` wraps a `broadcast::Receiver<Event>` in a `Subscription::channel`. No serialization, no network — events land in `update()` directly from the engine.

### Remote clients (SSE)

The axum SSE handler calls `tx.subscribe()` to get a receiver, serializes each `Event` to JSON, and streams it as `data: {...}\n\n`. The web dashboard receives the same events over the network.

### WebSocket terminal

For the native UI: the terminal Canvas widget holds a `tokio::sync::mpsc::Sender` that writes directly to the PTY subprocess (no network hop).
For remote clients: the axum WebSocket handler proxies between the browser WebSocket and the same PTY sender.

---

## Terminal Rendering

*(Unchanged from original design.)*

| Layer | Implementation |
|---|---|
| VT emulation | `alacritty_terminal` — ANSI/VT100/xterm, cell grid |
| Input source | Direct PTY channel (native UI) or WebSocket proxy (remote) |
| Rendering | Custom Iced `Canvas` widget (~300 lines, based on `iced_term`) |
| GPU backend | Iced's wgpu |

Known limitation: no ligature support. Acceptable for a supervision dashboard.

---

## State Model

```rust
// athene-app/src/app.rs
struct Model {
    // Engine handle (in-process, not a URL)
    engine: Arc<athene_core::Engine>,

    // Core data (kept in sync via broadcast events)
    orchestrators: Vec<Orchestrator>,
    sessions: HashMap<SessionId, Session>,
    prs: HashMap<SessionId, PR>,
    ci_status: HashMap<PrId, CIStatus>,
    review_threads: HashMap<PrId, Vec<Comment>>,
    notifications: VecDeque<Notification>,  // capped at 50

    // UI state
    sidebar: SidebarState,
    view: View,
    terminals: HashMap<SessionId, TerminalState>,
}
```

`Engine` is an `Arc`-wrapped handle to the running athene-core instance. `update()` calls engine methods directly (e.g. `engine.spawn_orchestrator(...)`) rather than making HTTP requests.

---

## Key Dependencies

| Crate | Purpose |
|---|---|
| `iced` 0.13 | GPU-accelerated GUI (wgpu backend) |
| `alacritty_terminal` 0.24 | VT100/xterm emulation |
| `tokio` 1 | Async runtime |
| `axum` 0.7 | HTTP server (REST + SSE + WebSocket) |
| `rusqlite` | SQLite session persistence |
| `notify-rust` 4 | OS native notifications |
| `serde` / `serde_json` | Event serialization (for SSE to remote clients) |
| `toml` | App config |
| `dirs` 5 | Config directory resolution |
| `portable-pty` | PTY spawning for terminal sessions |

---

## Out of Scope

- Windows support (macOS + Linux only)
- Ligature rendering
- Offline mode
- Multi-user auth (single-user tool)
- The Go engine (PR #74) — close it; its design is the spec for the Rust crates
