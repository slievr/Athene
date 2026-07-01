# Ambient Mode — Design Spec

**Date:** 2026-07-01
**Status:** Approved

## Problem

Athene sessions run long, unattended tasks that should continue even when the MacBook lid is closed. macOS sleeps the system on lid-close by default, killing tmux sessions.

## Solution

An ambient mode toggle that holds a `caffeinate -si` subprocess while active, preventing system and idle sleep. The UI signals the active state with an orange text glow in the sidebar footer and an orange border ring around the window.

## Scope

macOS only. The feature is gated by the platform (`#[cfg(target_os = "macos")]` where necessary). No-op on other platforms.

## State

No config persistence. Ambient mode always starts **off** on launch.

`App` gains one field:

```rust
pub caffeinate: Option<tokio::process::Child>
```

`is_some()` == ambient mode active. The child is killed when dropped, so app exit automatically cleans up the subprocess.

## Messages

```rust
ToggleAmbientMode,   // user clicked the label
AmbientStopped,      // caffeinate exited unexpectedly (e.g. killed externally)
```

### ToggleAmbientMode handler

- If `caffeinate.is_some()` → kill and take the child, set field to `None`.
- If `caffeinate.is_none()` → spawn `caffeinate -si` via `tokio::process::Command`, store the `Child`.

### AmbientStopped handler

- Set `caffeinate` to `None` so the UI reflects reality.

## Sleep Prevention

```
caffeinate -s   prevent system sleep (required for closed-lid / clamshell)
caffeinate -i   prevent idle sleep
```

Combined: `caffeinate -si`. Ships with every macOS installation. No new dependencies.

## Subscription

A subscription watches the caffeinate child for unexpected exit and fires `AmbientStopped`:

```rust
// Pseudocode — uses async_stream like the existing engine/poll subscriptions
Subscription::run_with_id("caffeinate-watch", async_stream::stream! {
    if let Some(child) = /* &mut state.caffeinate */ {
        let _ = child.wait().await;
        yield Message::AmbientStopped;
    }
})
```

The subscription is only active when `caffeinate.is_some()`. When the handle is `None` the subscription produces nothing (empty stream or absent from the batch).

## UI

### Sidebar footer — "Ambient" label

The existing `theme_footer` in `sidebar.rs` gains an "Ambient" row above the Theme row.

**Inactive state:** plain text, `text_muted` color, no shadow, clickable.

**Active state:** orange text (`Color::from_rgb(1.0, 0.55, 0.0)`), wrapped in a container with:

```rust
container::Style {
    shadow: Shadow {
        color:       Color { r: 1.0, g: 0.55, b: 0.0, a: 0.6 },
        offset:      Vector::ZERO,
        blur_radius: 8.0,
    },
    ..Default::default()
}
```

The container has no background of its own — the shadow creates a halo glow around the text. The whole element is a `button` with no chrome (no border, no background) that fires `ToggleAmbientMode` on press.

### Window border ring

In `App::iced_view`, the outermost container's style closure is made conditional:

```rust
let ambient = state.caffeinate.is_some();
container::Style {
    background: Some(Background::Color(bg)),
    border: if ambient {
        Border { color: Color::from_rgb(1.0, 0.55, 0.0), width: 3.0, radius: 0.0.into() }
    } else {
        Border::default()
    },
    ..Default::default()
}
```

3px inset orange border frames all content. No layout shift at normal window sizes.

## Files Changed

| File | Change |
|------|--------|
| `crates/athene-app/src/app.rs` | Add `caffeinate` field, two message variants, handlers, subscription branch |
| `crates/athene-app/src/components/sidebar.rs` | Add ambient row to `theme_footer` |

No changes to `athene-core` (no config persistence).

## Non-Goals

- Persistence across restarts (always starts off)
- Windows / Linux support (not applicable)
- Display-awake enforcement (only system + idle sleep are prevented)
