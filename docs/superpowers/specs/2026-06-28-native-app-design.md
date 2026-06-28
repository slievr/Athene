# Athene Native App — Design Spec

**Date:** 2026-06-28  
**Status:** Approved  
**Scope:** Native desktop client for Athene (macOS + Linux), replacing the Next.js web dashboard as the primary UI.

---

## Overview

A standalone Rust binary that connects to the Athene Go backend as a pure client. GPU-accelerated, no Electron, no bundled browser engine. Built with Iced (wgpu-backed Rust GUI framework). Terminal emulation via `alacritty_terminal`. Real-time updates via SSE and WebSocket from the Go backend.

---

## Architecture

The native app is a pure client — it speaks the same HTTP/SSE/WebSocket APIs the web dashboard uses today. The Go backend requires no changes beyond exposing a richer multiplexed SSE event stream (see Data Flow section).

```
athene-app (Rust binary)
  │
  ├── iced::Application
  │     ├── Model          (all app state)
  │     ├── Message        (all events)
  │     ├── view()         (renders Element tree each frame)
  │     └── update()       (single mutation point)
  │
  └── tokio async runtime
        ├── SSE subscriber      ──SSE──▶  Go backend
        ├── HTTP client         ──REST─▶  Go backend
        └── WebSocket clients   ──WS───▶  Go backend (one per open terminal)
```

**First launch:** the app prompts for server URL (e.g. `http://localhost:8080`) and persists it to `~/.config/athene/config.toml`.

**Crate location:** new top-level package `packages/app/` (or standalone repo). No dependency on existing TypeScript packages.

---

## UI Layout

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

### Sidebar — Navigation Spine

The sidebar is the primary navigation surface. Orchestrators are top-level items; workers are nested beneath their orchestrator. Users create orchestrators frequently as they take on new work.

```
┌─────────────────────────┐
│  ⬡ Athene    [+ Spawn]  │
├─────────────────────────┤
│  ▼ fix-auth-flow        │  ← orchestrator
│    ├ worker-1  /Athene  │  ● working
│    ├ worker-2  /API     │  ● pr_open
│    └ worker-3  /Backend │  ◐ ci_failed
│                         │
│  ▼ add-dark-mode        │  ← orchestrator
│    └ worker-4  /Athene  │  ● working
│                         │
│  ▶ refactor-billing     │  ← orchestrator (collapsed)
│                         │
│  ─────────────────────  │
│  Standalone             │
│    worker-5  /Athene    │  ● working
└─────────────────────────┘
```

Each worker row shows: **session name**, **repo** (`/Athene`, `/API`, etc.), and a **status dot**. Repo is never truncated — it is the primary way a user knows what code is being changed. Orchestrators collapse/expand independently. The `[+ Spawn]` button opens a new orchestrator creation form.

- Clicking an **orchestrator** → scopes the Fleet Board to its workers
- Clicking a **worker** → opens Session Detail

### Fleet Board (default / orchestrator selected)

Horizontal scrollable kanban. One column per lifecycle status: `working`, `pr_open`, `ci_failed`, `review_pending`, `mergeable`, `done`. Each card shows: session name, repo, agent type, cost, elapsed time, CI badge.

```
┌──────────────────────────────────────────────────────┐
│  fix-auth-flow  ·  3 workers  ·  2 repos             │
├─────────────┬─────────────┬─────────────┬────────────┤
│  working    │  pr_open    │  ci_failed  │  done      │
│  ─────────  │  ─────────  │  ─────────  │  ───────── │
│  worker-1   │  worker-2   │  worker-3   │            │
│  /Athene    │  /API       │  /Athene    │            │
└─────────────┴─────────────┴─────────────┴────────────┘
```

When no orchestrator is selected (top-level view), all workers across all orchestrators are shown.

### Session Detail (worker selected)

```
┌──────────────────────────────────────────────────────┐
│  worker-1  ·  slievr/Athene  ·  ● working  ·  $0.42  │
├───────────────────────────────┬──────────────────────┤
│                               │  PR #74              │
│  Terminal                     │  CI: 3/4 passing     │
│  (Canvas widget)              │  2 review comments   │
│                               │                      │
│                               │  Activity timeline   │
│                               │                      │
│              ◀────── drag ────┤                      │
└───────────────────────────────┴──────────────────────┘
```

- **Repo always visible** in the session header — context is never lost when deep in the terminal
- `pane_grid` widget for the terminal/info split — user can drag to resize
- Info panel toggleable: `Split` (default) | `Terminal` (full-width) | `Info` (full-width)
- Both panes scroll independently

---

## Real-time Data Flow

The Go backend exposes a **single multiplexed SSE stream** with typed event envelopes. The Rust SSE subscription demuxes by event type and routes to the correct model field.

### Event types

```
{ type: "session_updated",  payload: Session      }
{ type: "ci_update",        payload: CIStatus     }
{ type: "pr_event",         payload: PREvent      }
{ type: "review_comment",   payload: Comment      }
{ type: "notification",     payload: Notification }
{ type: "worker_spawned",   payload: Session      }
{ type: "worker_done",      payload: SessionId    }
```

### Routing

```
SSE subscription
  ├── SessionUpdated   → Model.sessions.update(session)
  ├── CIUpdate         → Model.ci_status[pr_id] = status
  ├── PREvent          → Model.prs[session_id] = pr
  ├── ReviewComment    → Model.review_threads[pr_id].push(comment)
  ├── Notification     → Model.notifications.push(n) + OS native alert
  ├── WorkerSpawned    → Model.sessions.insert + sidebar re-renders
  └── WorkerDone       → Model.sessions.update + badge on card

WebSocket (one per open terminal)
  └── bytes → TerminalOutput(SessionId, Vec<u8>) → Term.process(bytes)

Keyboard input
  └── TerminalInput(SessionId, Vec<u8>) → WebSocket.send(bytes)
```

**OS notifications** — `notify-rust` crate. Triggers: CI failure, stuck agent, PR needs attention, merge conflict. Uses macOS `NSUserNotification` and Linux `libnotify` natively.

**Reconnection** — the SSE subscription reconnects automatically on drop. WebSocket subscriptions reconnect on session detail view re-entry.

---

## Terminal Rendering

### Stack

| Layer | Implementation |
|---|---|
| VT emulation | `alacritty_terminal` — parses ANSI/VT100/xterm, maintains cell grid |
| Input source | WebSocket byte stream (not a local PTY) |
| Rendering | Custom Iced `Canvas` widget (~300 lines, based on `iced_term`) |
| GPU backend | Iced's wgpu (same as Alacritty's cross-platform renderer) |

### How it works

1. WebSocket subscription emits `TerminalOutput(SessionId, Vec<u8>)`
2. `update()` calls `term.process(bytes)` on the session's `alacritty_terminal::Term`
3. Canvas widget reads the updated cell grid each frame
4. Contiguous same-color background cells are batched into single rect draws
5. Text rendered per-cell with `Shaping::Advanced` (handles wide chars, complex scripts)

### Features

- Full 256-color + truecolor palette
- Scrollback buffer
- Text selection
- Mouse support (SGR + normal modes)
- Configurable monospace font
- Wide character support

### Known limitation

Ligatures are not supported — Iced's canvas text rendering does not implement them. This is acceptable for a tmux supervision dashboard.

### Terminal lifecycle

Terminals are created lazily when a session detail view opens and kept alive while the session remains active. One `TerminalState` (wrapping `Term` + WebSocket sender) per active worker session.

---

## State Model

```rust
struct Model {
    // Connection
    server_url: String,
    connection: ConnectionState,       // Connected | Reconnecting | Disconnected

    // Core data
    orchestrators: Vec<Orchestrator>,
    sessions: HashMap<SessionId, Session>,
    prs: HashMap<SessionId, PR>,
    ci_status: HashMap<PRId, CIStatus>,
    review_threads: HashMap<PRId, Vec<Comment>>,
    notifications: VecDeque<Notification>,  // capped at 50

    // UI state
    sidebar: SidebarState,             // expanded/collapsed per orchestrator, selected session
    view: View,
    terminals: HashMap<SessionId, TerminalState>,  // lazily populated
}

enum View {
    FleetBoard { scope: Option<OrchestratorId> },
    SessionDetail { session_id: SessionId, panel: DetailPanel },
}

enum DetailPanel {
    Split,      // terminal + info panel (default)
    Terminal,   // terminal full-width
    Info,       // info panel full-width
}
```

`TerminalState` wraps `alacritty_terminal::Term` plus the WebSocket sender handle. `SidebarState` tracks which orchestrators are expanded and which session is selected. All app state lives in `Model` — no shared mutable state, no external stores. `update()` is the single mutation point.

---

## Key Dependencies

| Crate | Purpose |
|---|---|
| `iced` | GUI framework (wgpu-backed) |
| `alacritty_terminal` | VT100/xterm emulation |
| `tokio` | Async runtime |
| `reqwest` | HTTP client (REST + SSE) |
| `tokio-tungstenite` | WebSocket client |
| `notify-rust` | OS native notifications |
| `serde` / `serde_json` | SSE event deserialization |
| `toml` | Config file (server URL, font, theme) |

---

## Out of Scope

- Web dashboard — continues to exist and is served by the Go backend unchanged
- Agent spawning / orchestrator management (beyond the `[+ Spawn]` button invoking the existing API)
- Windows support (macOS + Linux only)
- Ligature rendering
- Offline mode
