# Ambient Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable ambient mode that prevents macOS system sleep (including closed-lid / clamshell) via a `caffeinate -si` subprocess, with an orange border ring and orange glow on the "Ambient" sidebar label when active.

**Architecture:** `App` gains a `caffeinate_pid: Option<u32>` field. `ToggleAmbientMode` spawns/kills the subprocess and returns a `Task::future` that watches for unexpected exits and fires `AmbientStopped`. The UI reads `caffeinate_pid.is_some()` to drive both the window border and the sidebar label style.

**Tech Stack:** Rust, Iced 0.13, tokio::process, libc (already in workspace deps), macOS `caffeinate` binary.

## Global Constraints

- macOS-only spawn/kill logic: gate with `#[cfg(target_os = "macos")]` / `#[cfg(unix)]` as shown in each step.
- `libc` is already a workspace dependency — do not add it to `athene-app/Cargo.toml`.
- No config persistence: ambient mode always starts off on launch.
- Follow existing Iced patterns: no `style=` attribute, all colours via `ColorScheme` or inline `Color` literals.
- Run `cargo build -p athene-app` (not `cargo build` root) to verify compilation — the root workspace may have other crates.

---

## File Map

| File | What changes |
|------|-------------|
| `crates/athene-app/src/app.rs` | `caffeinate_pid` field, two message variants, two handlers, border ring in `iced_view`, test helper fix, two new tests |
| `crates/athene-app/src/components/sidebar.rs` | "Ambient" row in `theme_footer` |

---

### Task 1: State field, messages, handlers, and tests

**Files:**
- Modify: `crates/athene-app/src/app.rs`

**Interfaces:**
- Produces: `App::caffeinate_pid: Option<u32>` — read by Task 2 and Task 3 to drive visual state
- Produces: `Message::ToggleAmbientMode` — emitted by sidebar button in Task 3
- Produces: `Message::AmbientStopped` — fired by Task::future when caffeinate exits

---

- [ ] **Step 1: Add `caffeinate_pid` to the `App` struct**

In `crates/athene-app/src/app.rs`, add the field at the end of the `App` struct (after `drag`):

```rust
pub drag:            Option<DragTarget>,
pub caffeinate_pid:  Option<u32>,
```

- [ ] **Step 2: Initialise the field in `App::new`**

In `App::new`, add `caffeinate_pid: None` to the `Self { ... }` literal (after `drag: None`):

```rust
let app = Self {
    // ... existing fields ...
    drag:           None,
    caffeinate_pid: None,
};
```

- [ ] **Step 3: Add the two new message variants**

In the `Message` enum, add after `Noop`:

```rust
ToggleAmbientMode,
AmbientStopped,
```

- [ ] **Step 4: Write failing tests**

In the `#[cfg(test)] mod tests` block at the bottom of `app.rs`, first fix the `base()` helper — it is missing four fields that exist on `App`. Replace the entire `base()` function with:

```rust
fn base(engine: Arc<Engine>) -> App {
    App {
        engine,
        config:             AppConfig::default(),
        scheme:             from_variant(ThemeVariant::Dark),
        active_variant:     ThemeVariant::Dark,
        orchestrator_root:  std::path::PathBuf::from("/tmp"),
        orchestrator_agent: athene_core::config::AgentConfig::default(),
        orchestrators:      vec![],
        sessions:       HashMap::new(),
        prs:            HashMap::new(),
        ci_status:      HashMap::new(),
        review_threads: HashMap::new(),
        notifications:  VecDeque::new(),
        sidebar:        SidebarState::default(),
        view:           View::FleetBoard { scope: None },
        terminals:      HashMap::new(),
        spawn_modal:    None,
        terminal_cols:  140,
        terminal_rows:  50,
        window_width:   1200.0,
        sidebar_width:  220.0,
        info_width:     300.0,
        drag:           None,
        caffeinate_pid: None,
    }
}
```

Then add two new tests:

```rust
#[test]
fn ambient_stopped_clears_pid() {
    let e = test_engine();
    let mut m = base(e);
    m.caffeinate_pid = Some(12345);
    let (next, _) = m.update(Message::AmbientStopped);
    assert!(next.caffeinate_pid.is_none());
}

#[test]
fn toggle_ambient_when_active_clears_pid() {
    let e = test_engine();
    let mut m = base(e);
    // Use a PID that almost certainly doesn't exist — SIGTERM to a dead PID is harmless.
    m.caffeinate_pid = Some(99999);
    let (next, _) = m.update(Message::ToggleAmbientMode);
    assert!(next.caffeinate_pid.is_none());
}
```

- [ ] **Step 5: Run tests to confirm they fail**

```bash
cargo test -p athene-app -- ambient 2>&1 | tail -20
```

Expected: compile error ("variant `ToggleAmbientMode` not handled") or test panics — both are correct failures.

- [ ] **Step 6: Add handlers to `App::apply`**

Inside the `match message { ... }` in `apply()`, add before the final `Message::Noop` arm:

```rust
Message::ToggleAmbientMode => {
    if let Some(pid) = state.caffeinate_pid.take() {
        // Kill the running caffeinate process.
        #[cfg(unix)]
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM); }
        let _ = pid; // suppress unused warning on non-unix
        Task::none()
    } else {
        // Spawn caffeinate -s (system sleep) -i (idle sleep) on macOS.
        #[cfg(target_os = "macos")]
        {
            match tokio::process::Command::new("caffeinate")
                .args(["-s", "-i"])
                .spawn()
            {
                Ok(mut child) => {
                    state.caffeinate_pid = child.id();
                    Task::future(async move {
                        let _ = child.wait().await;
                        Message::AmbientStopped
                    })
                }
                Err(e) => {
                    tracing::error!("failed to spawn caffeinate: {e}");
                    Task::none()
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        Task::none()
    }
}

Message::AmbientStopped => {
    state.caffeinate_pid = None;
    Task::none()
}
```

- [ ] **Step 7: Add `libc` import**

At the top of `app.rs`, the crate already uses `use std::...`. Add `libc` after the existing imports (it needs no `use` line — call it as `libc::kill` etc. which works once `libc` is in `Cargo.toml`. Check `athene-app/Cargo.toml` — if `libc` is not listed, add it):

```toml
# crates/athene-app/Cargo.toml — only add if missing
libc = { workspace = true }
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cargo test -p athene-app -- ambient 2>&1 | tail -20
```

Expected:
```
test tests::ambient_stopped_clears_pid ... ok
test tests::toggle_ambient_when_active_clears_pid ... ok
```

- [ ] **Step 9: Run the full test suite to check for regressions**

```bash
cargo test -p athene-app 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add crates/athene-app/src/app.rs crates/athene-app/Cargo.toml
git commit -m "feat: add ambient mode state, messages, and caffeinate subprocess"
```

---

### Task 2: Orange border ring in `iced_view`

**Files:**
- Modify: `crates/athene-app/src/app.rs`

**Interfaces:**
- Consumes: `App::caffeinate_pid: Option<u32>` from Task 1

---

- [ ] **Step 1: Make the outermost container border conditional**

In `App::iced_view`, find the `let base: Element<Message> = container(...)` block. The `.style()` closure currently returns:

```rust
container::Style {
    background: Some(Background::Color(bg)),
    ..Default::default()
}
```

Replace the entire `let base` block with:

```rust
let ambient = state.caffeinate_pid.is_some();
let base: Element<Message> = container(
    row![
        sidebar(state),
        App::drag_handle(DragTarget::Sidebar, state.scheme.border),
        main,
    ].height(Length::Fill),
)
.width(Length::Fill)
.height(Length::Fill)
.style(move |_theme| container::Style {
    background: Some(Background::Color(bg)),
    border: if ambient {
        iced::Border {
            color: iced::Color::from_rgb(1.0, 0.55, 0.0),
            width: 3.0,
            radius: 0.0.into(),
        }
    } else {
        iced::Border::default()
    },
    ..Default::default()
})
.into();
```

- [ ] **Step 2: Verify it compiles**

```bash
cargo build -p athene-app 2>&1 | tail -20
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/athene-app/src/app.rs
git commit -m "feat: add orange border ring to window when ambient mode is active"
```

---

### Task 3: "Ambient" toggle in sidebar footer

**Files:**
- Modify: `crates/athene-app/src/components/sidebar.rs`

**Interfaces:**
- Consumes: `App::caffeinate_pid: Option<u32>` from Task 1 (via `app.caffeinate_pid.is_some()`)
- Consumes: `Message::ToggleAmbientMode` from Task 1

---

- [ ] **Step 1: Add the ambient row to `theme_footer`**

In `sidebar.rs`, find `fn theme_footer<'a>(app: &'a App, s: &'a ColorScheme) -> Element<'a, Message>`.

At the very top of the function body, before `let mut col_items: Vec<Element<'a, Message>> = Vec::new();`, add:

```rust
let is_ambient = app.caffeinate_pid.is_some();
let orange = iced::Color::from_rgb(1.0, 0.55, 0.0);
```

Then, after `let mut col_items: Vec<...> = Vec::new();` and before the `if app.sidebar.show_theme_popout` block, add the ambient row:

```rust
let ambient_row: Element<Message> = button(
    container(
        text("Ambient")
            .size(11)
            .color(if is_ambient { orange } else { s.text_muted }),
    )
    .style(move |_theme| container::Style {
        shadow: iced::Shadow {
            color: iced::Color { r: 1.0, g: 0.55, b: 0.0, a: if is_ambient { 0.6 } else { 0.0 } },
            offset: iced::Vector::ZERO,
            blur_radius: if is_ambient { 8.0 } else { 0.0 },
        },
        ..Default::default()
    }),
)
.on_press(Message::ToggleAmbientMode)
.style(|_theme, _status| button::Style {
    background: None,
    border: Border::default(),
    text_color: s.text_muted,
    ..Default::default()
})
.padding([4, 0])
.width(Length::Fill)
.into();

col_items.push(ambient_row);
```

This pushes the ambient row as the first item in `col_items`, so it appears above the theme picker rows and the theme trigger line.

- [ ] **Step 2: Verify it compiles**

```bash
cargo build -p athene-app 2>&1 | tail -20
```

Expected: `Finished` with no errors.

If you get `use of undeclared type iced::Shadow` or `iced::Vector`, add these to the existing `use iced::{ ... }` import at the top of `sidebar.rs`:

```rust
use iced::{
    // existing imports ...
    Shadow, Vector,
};
```

- [ ] **Step 3: Smoke-test manually**

Run the app:

```bash
cargo run -p athene-app 2>&1
```

- Verify "Ambient" appears in the sidebar footer above "Theme".
- Click "Ambient": text turns orange with a glow, window border turns orange.
- Click again: both revert to default.
- Close and re-open: ambient mode is off (does not persist).

- [ ] **Step 4: Commit**

```bash
git add crates/athene-app/src/components/sidebar.rs
git commit -m "feat: add ambient mode toggle to sidebar footer with orange glow"
```
