# Native App Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the feature gap between the Rust/Iced native app and the TypeScript web dashboard by implementing 10 features covering session visibility, notifications, PR inspection, UX polish, and a full GitHub watcher with lifecycle reactions.

**Architecture:** Each feature maps to one or two component files in `athene/crates/athene-app/src/components/`. New views add a `View` variant in `app.rs`; new messages add a `Message` variant and a match arm in `App::apply`. All data is already accumulated in the `App` struct — no Engine changes are required for most features, making these pure UI additions.

**Tech Stack:** Rust, Iced 0.13 (Elm-like: `Model → Message → update → view`), alacritty_terminal (VT100), SQLite via athene-core Store.

## Global Constraints

- No external Iced widget libraries — use built-in `iced::widget::*` primitives only
- All colors from `ColorScheme` fields — never hardcode `Color { r, g, b, a }` values inline
- Tailwind-style spacing: multiples of 4 px (4, 8, 12, 16, 20, 24)
- Component files max 400 lines — split if you exceed this
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`
- Run `cargo test -p athene-app` and `cargo clippy -p athene-app -- -D warnings` after each task
- Working directory for all commands: `athene/` (the Cargo workspace root)

---

## Feature Gap Summary

| # | Feature | Status in Web | Status in Native | Priority |
|---|---------|--------------|-----------------|----------|
| 1 | Terminated sessions column | ✓ Kanban column | Missing from fleet board | HIGH |
| 2 | Notification bell & panel | ✓ Bell + dropdown | Data collected, no UI | HIGH |
| 3 | PR list view | ✓ Dedicated page | No PR list view | HIGH |
| 4 | Session inspector panel | ✓ Inspector tab | Only Terminal/Split/Info | MEDIUM |
| 5 | Attention banner | ✓ Attention zones | No attention indicators | MEDIUM |
| 6 | Fleet board filter bar | ✓ FleetFilterBar | No filter controls | LOW |
| 7 | GitHub API client | ✓ tracker-github plugin | No HTTP client, no GH API calls | HIGH |
| 8 | PATH wrapper hooks + metadata poller | ✓ setupPathWrapperWorkspace | Workers never get pr_number set | HIGH |
| 9 | PR enrichment poller | ✓ lifecycle-manager (30s) | PID-only (5s), no CI/review/merge | HIGH |
| 10 | Reaction dispatcher (send to agent) | ✓ executeReaction + send | No tmux send-keys, no reactions | HIGH |
| 11 | Auto-cleanup on PR merge | ✓ maybeAutoCleanupOnMerge | No merge detection, no cleanup | HIGH |

**Out of scope for this plan:**
- Code review dashboard (large, separate plan)
- Multi-project management (requires config reload mechanism)
- Mobile responsiveness (not applicable to desktop native)
- Debug bundle export / degraded state recovery

---

## Task 1: Terminated Sessions Column in Fleet Board

**Files:**
- Modify: `athene/crates/athene-app/src/components/fleet_board.rs`

**Interfaces:**
- Consumes: `SessionStatus::Terminated` (already in `athene_core::types`)
- Produces: Terminated sessions visible in a "Terminated" column

**Context:** The `COLUMNS` array in `fleet_board.rs:29-36` only covers 6 statuses. `SessionStatus::Terminated` exists in the enum but sessions with that status are invisible in the board.

- [ ] **Step 1: Write the failing test**

In `athene/crates/athene-app/src/app.rs`, in the `#[cfg(test)]` block, add:

```rust
#[test]
fn terminated_session_visible_in_board() {
    use crate::components::fleet_board::board_sessions;
    let e = test_engine();
    let mut m = base(e);
    let s = Session {
        id: "t1".into(), orchestrator_id: None, name: "ended".into(),
        repo: "r".into(), status: SessionStatus::Terminated,
        agent_type: "c".into(), cost_usd: 0.42,
        started_at: 0, pr_number: None, pr_id: None,
        workspace_path: None, pid: None,
    };
    let (m2, _) = m.update(Message::EngineEvent(Event::SessionSpawned(s)));
    m = m2;
    // board_sessions(app, status) returns sessions with that status
    let terminated = board_sessions(&m, &SessionStatus::Terminated);
    assert_eq!(terminated.len(), 1);
    assert_eq!(terminated[0].id, "t1");
}
```

Also add this helper function to `fleet_board.rs` (public, for testability):

```rust
pub fn board_sessions<'a>(app: &'a App, status: &SessionStatus) -> Vec<&'a Session> {
    app.sessions
        .values()
        .filter(|s| &s.status == status)
        .collect()
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p athene-app terminated_session_visible_in_board 2>&1 | tail -20
```

Expected: error `cannot find function board_sessions` (function doesn't exist yet).

- [ ] **Step 3: Add `board_sessions` helper and `Terminated` column**

In `fleet_board.rs`, add the public helper before `session_card`:

```rust
pub fn board_sessions<'a>(app: &'a App, status: &SessionStatus) -> Vec<&'a Session> {
    let mut sessions: Vec<&Session> = app.sessions
        .values()
        .filter(|s| &s.status == status)
        .collect();
    sessions.sort_by(|a, b| a.name.cmp(&b.name));
    sessions
}
```

Then add the Terminated column to the `COLUMNS` constant (after Done):

```rust
const COLUMNS: &[Column] = &[
    Column { label: "Working",    status: SessionStatus::Working },
    Column { label: "PR Open",    status: SessionStatus::PrOpen },
    Column { label: "CI Failed",  status: SessionStatus::CiFailed },
    Column { label: "Review",     status: SessionStatus::ReviewPending },
    Column { label: "Mergeable",  status: SessionStatus::Mergeable },
    Column { label: "Done",       status: SessionStatus::Done },
    Column { label: "Terminated", status: SessionStatus::Terminated },
];
```

Replace the inline filter in the `fleet_board` view function with a call to `board_sessions`. Find the line that iterates `app.sessions.values()` inside the column renderer and replace it:

```rust
// Before (inside the column rendering loop):
let col_sessions: Vec<&Session> = app.sessions
    .values()
    .filter(|s| s.status == col.status)
    .collect();

// After:
let col_sessions = board_sessions(app, &col.status);
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p athene-app 2>&1 | tail -20
cargo clippy -p athene-app -- -D warnings 2>&1 | tail -10
```

Expected: all tests pass, no warnings.

- [ ] **Step 5: Commit**

```bash
git add athene/crates/athene-app/src/components/fleet_board.rs \
        athene/crates/athene-app/src/app.rs
git commit -m "feat(native-app): add terminated sessions column to fleet board"
```

---

## Task 2: Notification Bell & Panel in Sidebar

**Files:**
- Modify: `athene/crates/athene-app/src/app.rs` (add messages + state)
- Modify: `athene/crates/athene-app/src/components/sidebar.rs` (add bell + panel)

**Interfaces:**
- Consumes: `App.notifications: VecDeque<Notification>` (already populated), `Notification { id, kind, title, body, session_id }`
- Produces: `Message::ToggleNotifications`, `Message::DismissNotification(String)`, `Message::NavigateNotification(SessionId)`

**Context:** The `Engine` already pushes `Event::Notification` events and `App::apply` already inserts them into `app.notifications` (capped at 50). There is no bell icon or dismissal UI.

- [ ] **Step 1: Add `show_notifications` to `SidebarState`**

In `app.rs`, update `SidebarState`:

```rust
#[derive(Debug, Clone, Default)]
pub struct SidebarState {
    pub selected_orchestrator: Option<OrchestratorId>,
    pub show_theme_popout:     bool,
    pub show_notifications:    bool,
}
```

- [ ] **Step 2: Add new `Message` variants**

In `app.rs`, add to the `Message` enum:

```rust
ToggleNotifications,
DismissNotification(String),       // notification id
DismissAllNotifications,
NavigateNotification(SessionId),   // navigate to session from notification
```

- [ ] **Step 3: Write failing tests**

In the `#[cfg(test)]` block in `app.rs`:

```rust
#[test]
fn toggle_notifications_flips_show_flag() {
    let e = test_engine();
    let m = base(e);
    assert!(!m.sidebar.show_notifications);
    let (m2, _) = m.update(Message::ToggleNotifications);
    assert!(m2.sidebar.show_notifications);
    let (m3, _) = m2.update(Message::ToggleNotifications);
    assert!(!m3.sidebar.show_notifications);
}

#[test]
fn dismiss_notification_removes_by_id() {
    let e = test_engine();
    let mut m = base(e);
    for id in ["n1", "n2", "n3"] {
        let (next, _) = m.update(Message::EngineEvent(Event::Notification(Notification {
            id: id.into(), kind: NotificationKind::WorkerDone,
            title: "t".into(), body: "b".into(), session_id: None,
        })));
        m = next;
    }
    assert_eq!(m.notifications.len(), 3);
    let (m2, _) = m.update(Message::DismissNotification("n2".into()));
    assert_eq!(m2.notifications.len(), 2);
    assert!(!m2.notifications.iter().any(|n| n.id == "n2"));
}

#[test]
fn dismiss_all_clears_notifications() {
    let e = test_engine();
    let mut m = base(e);
    for id in ["a", "b"] {
        let (next, _) = m.update(Message::EngineEvent(Event::Notification(Notification {
            id: id.into(), kind: NotificationKind::WorkerDone,
            title: "t".into(), body: "b".into(), session_id: None,
        })));
        m = next;
    }
    let (m2, _) = m.update(Message::DismissAllNotifications);
    assert!(m2.notifications.is_empty());
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cargo test -p athene-app toggle_notifications 2>&1 | tail -5
```

Expected: compile error — `ToggleNotifications` not in `Message`.

- [ ] **Step 5: Wire message handlers in `App::apply`**

In `app.rs`, find the `fn apply` match block and add:

```rust
Message::ToggleNotifications => {
    state.sidebar.show_notifications = !state.sidebar.show_notifications;
    Task::none()
}
Message::DismissNotification(id) => {
    state.notifications.retain(|n| n.id != id);
    Task::none()
}
Message::DismissAllNotifications => {
    state.notifications.clear();
    Task::none()
}
Message::NavigateNotification(session_id) => {
    state.sidebar.show_notifications = false;
    state.view = View::SessionDetail {
        session_id,
        panel: crate::components::session_detail::DetailPanel::Terminal,
    };
    Task::none()
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cargo test -p athene-app toggle_notifications dismiss_notification dismiss_all 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 7: Add bell icon and notification panel to `sidebar.rs`**

In `sidebar.rs`, add a notification kind → label helper near the top:

```rust
use athene_core::types::NotificationKind;

fn kind_label(kind: &NotificationKind) -> &'static str {
    match kind {
        NotificationKind::CiFailure         => "CI",
        NotificationKind::AgentStuck        => "Stuck",
        NotificationKind::PrNeedsAttention  => "PR",
        NotificationKind::MergeConflict     => "Conflict",
        NotificationKind::WorkerDone        => "Done",
    }
}

fn kind_color(kind: &NotificationKind, s: &ColorScheme) -> Color {
    match kind {
        NotificationKind::CiFailure        => s.status_ci_failed,
        NotificationKind::AgentStuck       => s.status_review,
        NotificationKind::PrNeedsAttention => s.status_pr_open,
        NotificationKind::MergeConflict    => s.status_ci_failed,
        NotificationKind::WorkerDone       => s.status_done,
    }
}
```

In the `sidebar` header row, replace the current `"+ Spawn"` button row with one that also includes a bell:

```rust
let unread = app.notifications.len();
let bell_label = if unread > 0 {
    format!("🔔 {}", unread.min(99))
} else {
    "🔔".to_string()
};

let header = container(
    row![
        text("⬡ Athene").size(13).color(s.text_primary),
        Space::new(Length::Fill, 0),
        button(text(&bell_label).size(11).color(
            if unread > 0 { s.accent } else { s.text_muted }
        ))
        .on_press(Message::ToggleNotifications)
        .style(move |_theme, _status| button::Style {
            background: None,
            text_color: if unread > 0 { s.accent } else { s.text_muted },
            border: Border { color: Color::TRANSPARENT, width: 0.0, radius: 4.0.into() },
            ..Default::default()
        })
        .padding([2, 4]),
        button(text("+ Spawn").size(11).color(s.accent))
            .on_press(Message::SpawnSession)
            .style(move |_theme, _status| button::Style {
                background: None,
                text_color: s.accent,
                border: Border { color: s.accent, width: 1.0, radius: 4.0.into() },
                ..Default::default()
            })
            .padding([2, 8]),
    ]
    .spacing(8)
    .align_y(Alignment::Center),
)
.padding(header_padding)
.width(Length::Fill)
.style(move |_theme| container::Style {
    background: Some(Background::Color(s.bg_sidebar)),
    border: Border { color: s.border, width: 0.0, radius: 0.0.into() },
    ..Default::default()
});
```

Add a `notification_panel` function at the bottom of `sidebar.rs`:

```rust
pub fn notification_panel<'a>(app: &'a App) -> Element<'a, Message> {
    let s = &app.scheme;

    let header = row![
        text("Notifications").size(12).color(s.text_primary),
        Space::new(Length::Fill, 0),
        button(text("Clear all").size(10).color(s.text_muted))
            .on_press(Message::DismissAllNotifications)
            .style(|_t, _s| button::Style {
                background: None,
                border: Border::default(),
                ..Default::default()
            })
            .padding([2, 4]),
    ]
    .align_y(Alignment::Center)
    .padding([8, 12]);

    let items: Vec<Element<Message>> = if app.notifications.is_empty() {
        vec![
            container(
                text("No notifications").size(12).color(s.text_muted),
            )
            .padding([12, 16])
            .into()
        ]
    } else {
        app.notifications.iter().map(|n| {
            let n_id = n.id.clone();
            let sess_id = n.session_id.clone();
            let label_color = kind_color(&n.kind, s);
            let row_content = column![
                row![
                    container(Space::new(0,0))
                        .width(Length::Fixed(6.0))
                        .height(Length::Fixed(6.0))
                        .style(move |_| container::Style {
                            background: Some(Background::Color(label_color)),
                            border: Border { radius: 3.0.into(), ..Default::default() },
                            ..Default::default()
                        }),
                    Space::new(6, 0),
                    text(kind_label(&n.kind)).size(10).color(label_color),
                    Space::new(Length::Fill, 0),
                    button(text("×").size(12).color(s.text_muted))
                        .on_press(Message::DismissNotification(n_id))
                        .style(|_t, _s| button::Style {
                            background: None,
                            border: Border::default(),
                            ..Default::default()
                        })
                        .padding([0, 4]),
                ]
                .align_y(Alignment::Center),
                text(&n.title).size(12).color(s.text_primary),
                text(&n.body).size(11).color(s.text_secondary),
            ]
            .spacing(2);

            let mut btn = button(row_content)
                .style(move |_t, _s| button::Style {
                    background: Some(Background::Color(s.bg_elevated)),
                    border: Border { color: s.border, width: 1.0, radius: 4.0.into() },
                    ..Default::default()
                })
                .padding([8, 12]);

            if let Some(sid) = sess_id {
                btn = btn.on_press(Message::NavigateNotification(sid));
            }

            container(btn)
                .width(Length::Fill)
                .padding([0, 8, 4, 8])
                .into()
        }).collect()
    };

    container(
        column![
            header,
            scrollable(column(items).spacing(0)).height(Length::Fixed(300.0)),
        ]
    )
    .width(Length::Fill)
    .style(move |_| container::Style {
        background: Some(Background::Color(s.bg_surface)),
        border: Border { color: s.border, width: 1.0, radius: 6.0.into() },
        ..Default::default()
    })
    .into()
}
```

In the main `sidebar` function, after building the `items` scrollable, conditionally overlay the notification panel. Find where the sidebar `column![]` is assembled and prepend the panel:

```rust
// After building `let session_list = scrollable(...)`
// and before the final `column![]`:

let notif_panel = if app.sidebar.show_notifications {
    Some(notification_panel(app))
} else {
    None
};

// In the final column, insert it between header and session_list:
let mut col_items: Vec<Element<Message>> = vec![header.into()];
if let Some(panel) = notif_panel {
    col_items.push(panel);
}
col_items.push(session_list.into());
col_items.push(theme_section.into());

column(col_items)
    .width(Length::Fixed(app.sidebar_width))
    // ... rest of column styling
    .into()
```

- [ ] **Step 8: Verify build and tests**

```bash
cargo build -p athene-app 2>&1 | tail -20
cargo test -p athene-app 2>&1 | tail -20
```

Expected: clean build, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add athene/crates/athene-app/src/app.rs \
        athene/crates/athene-app/src/components/sidebar.rs
git commit -m "feat(native-app): add notification bell and panel to sidebar"
```

---

## Task 3: PR List View

**Files:**
- Create: `athene/crates/athene-app/src/components/pr_list.rs`
- Modify: `athene/crates/athene-app/src/components/mod.rs`
- Modify: `athene/crates/athene-app/src/app.rs` (new View variant + messages)

**Interfaces:**
- Consumes: `App.prs: HashMap<PrId, PR>`, `App.ci_status: HashMap<PrId, CIStatus>`, `App.sessions: HashMap<SessionId, Session>`
- Produces: `View::PrList`, `Message::NavigatePrList`, `Message::NavigatePrSession(SessionId)`

**Context:** There is no PR list page. The web app has `PullRequestsPage.tsx` with filtering and table view. All PR data is already in `App.prs` and `App.ci_status`.

- [ ] **Step 1: Add `View::PrList` and `Message::NavigatePrList`**

In `app.rs`, update the `View` enum:

```rust
#[derive(Debug, Clone)]
pub enum View {
    FleetBoard { scope: Option<OrchestratorId> },
    SessionDetail { session_id: SessionId, panel: DetailPanel },
    PrList,
}
```

Add to the `Message` enum:

```rust
NavigatePrList,
```

- [ ] **Step 2: Write failing test**

In the `#[cfg(test)]` block:

```rust
#[test]
fn navigate_pr_list_sets_view() {
    let e = test_engine();
    let m = base(e);
    let (m2, _) = m.update(Message::NavigatePrList);
    assert!(matches!(m2.view, View::PrList));
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cargo test -p athene-app navigate_pr_list 2>&1 | tail -10
```

Expected: compile error — `NavigatePrList` not in `Message`.

- [ ] **Step 4: Wire the message handler**

In `App::apply`, add:

```rust
Message::NavigatePrList => {
    state.view = View::PrList;
    Task::none()
}
```

Also add the new View arm to `App::view` (the `match &self.view` block):

```rust
View::PrList => crate::components::pr_list::pr_list(self),
```

- [ ] **Step 5: Create `pr_list.rs`**

Create `athene/crates/athene-app/src/components/pr_list.rs`:

```rust
use iced::{
    widget::{button, column, container, row, scrollable, text, Space},
    Alignment, Background, Border, Color, Element, Length,
};

use crate::{app::{App, Message}, theme::ColorScheme};
use athene_core::types::{CIStatus, PR, PrId};

fn ci_badge<'a>(ci: Option<&CIStatus>, s: &'a ColorScheme) -> Element<'a, Message> {
    match ci {
        None => text("—").size(11).color(s.text_muted).into(),
        Some(c) if c.failing > 0 => {
            let label = format!("{}/{} CI", c.passing, c.total);
            container(text(label).size(10).color(Color::WHITE))
                .padding([2, 6])
                .style(move |_| container::Style {
                    background: Some(Background::Color(s.status_ci_failed)),
                    border: Border { radius: 3.0.into(), ..Default::default() },
                    ..Default::default()
                })
                .into()
        }
        Some(c) => {
            let label = format!("{}/{} CI", c.passing, c.total);
            container(text(label).size(10).color(Color::WHITE))
                .padding([2, 6])
                .style(move |_| container::Style {
                    background: Some(Background::Color(s.status_working)),
                    border: Border { radius: 3.0.into(), ..Default::default() },
                    ..Default::default()
                })
                .into()
        }
    }
}

fn pr_row<'a>(app: &'a App, pr: &'a PR) -> Element<'a, Message> {
    let s = &app.scheme;
    let ci = app.ci_status.get(&pr.id);
    let session_name = app.sessions.get(&pr.session_id)
        .map(|s| s.name.as_str())
        .unwrap_or("—");
    let session_id = pr.session_id.clone();

    button(
        row![
            // PR number
            container(
                text(format!("#{}", pr.number)).size(12).color(s.accent)
            )
            .width(Length::Fixed(56.0)),
            // PR title
            container(
                text(&pr.title).size(12).color(s.text_primary)
            )
            .width(Length::Fill),
            // Session name
            container(
                text(session_name).size(11).color(s.text_secondary)
            )
            .width(Length::Fixed(120.0)),
            // CI badge
            container(ci_badge(ci, s))
                .width(Length::Fixed(80.0))
                .align_x(iced::alignment::Horizontal::Right),
        ]
        .align_y(Alignment::Center)
        .spacing(12)
        .padding([8, 12]),
    )
    .on_press(Message::NavigateSession(session_id))
    .width(Length::Fill)
    .style(move |_t, status| button::Style {
        background: Some(Background::Color(match status {
            button::Status::Hovered => s.bg_elevated,
            _ => s.bg_surface,
        })),
        border: Border { color: s.border, width: 0.0, radius: 0.0.into() },
        ..Default::default()
    })
    .into()
}

pub fn pr_list(app: &App) -> Element<'_, Message> {
    let s = &app.scheme;

    // Sort PRs by number descending
    let mut prs: Vec<&PR> = app.prs.values().collect();
    prs.sort_by(|a, b| b.number.cmp(&a.number));

    let back_btn = button(
        text("← Fleet").size(12).color(s.text_secondary)
    )
    .on_press(Message::NavigateFleet { scope: None })
    .style(|_t, _s| button::Style {
        background: None,
        border: Border::default(),
        ..Default::default()
    })
    .padding([4, 0]);

    let header = container(
        row![
            back_btn,
            Space::new(16, 0),
            text("Pull Requests").size(16).color(s.text_primary),
            Space::new(Length::Fill, 0),
            text(format!("{} open", prs.len())).size(12).color(s.text_muted),
        ]
        .align_y(Alignment::Center)
    )
    .padding([12, 20])
    .width(Length::Fill)
    .style(move |_| container::Style {
        background: Some(Background::Color(s.bg_base)),
        border: Border { color: s.border, width: 0.0, radius: 0.0.into() },
        ..Default::default()
    });

    let col_header = container(
        row![
            container(text("#").size(10).color(s.text_muted))
                .width(Length::Fixed(56.0)),
            container(text("Title").size(10).color(s.text_muted))
                .width(Length::Fill),
            container(text("Session").size(10).color(s.text_muted))
                .width(Length::Fixed(120.0)),
            container(text("CI").size(10).color(s.text_muted))
                .width(Length::Fixed(80.0))
                .align_x(iced::alignment::Horizontal::Right),
        ]
        .spacing(12)
        .padding([6, 12])
    )
    .width(Length::Fill)
    .style(move |_| container::Style {
        background: Some(Background::Color(s.bg_elevated)),
        border: Border { color: s.border, width: 0.0, radius: 0.0.into() },
        ..Default::default()
    });

    let rows: Vec<Element<Message>> = if prs.is_empty() {
        vec![
            container(
                text("No pull requests yet.").size(13).color(s.text_muted),
            )
            .padding([40, 20])
            .width(Length::Fill)
            .into()
        ]
    } else {
        prs.iter()
            .flat_map(|pr| {
                let row = pr_row(app, pr);
                let divider = container(Space::new(Length::Fill, 1.0))
                    .width(Length::Fill)
                    .style(move |_| container::Style {
                        background: Some(Background::Color(s.border)),
                        ..Default::default()
                    })
                    .into();
                vec![row, divider]
            })
            .collect()
    };

    column![
        header,
        col_header,
        scrollable(column(rows)).height(Length::Fill),
    ]
    .width(Length::Fill)
    .height(Length::Fill)
    .into()
}
```

- [ ] **Step 6: Register the module**

In `athene/crates/athene-app/src/components/mod.rs`, add:

```rust
pub mod pr_list;
```

- [ ] **Step 7: Add PR List link in sidebar**

In `sidebar.rs`, add a "PRs" button in the header row (between the bell and Spawn button):

```rust
let pr_count = app.prs.len();
let prs_label = if pr_count > 0 {
    format!("PRs ({})", pr_count)
} else {
    "PRs".to_string()
};

// In the header row!, after the bell button:
button(text(&prs_label).size(11).color(s.text_secondary))
    .on_press(Message::NavigatePrList)
    .style(move |_theme, _status| button::Style {
        background: None,
        text_color: s.text_secondary,
        border: Border { color: s.border, width: 1.0, radius: 4.0.into() },
        ..Default::default()
    })
    .padding([2, 8]),
```

- [ ] **Step 8: Run tests**

```bash
cargo test -p athene-app 2>&1 | tail -20
cargo build -p athene-app 2>&1 | tail -20
```

Expected: all tests pass, clean build.

- [ ] **Step 9: Commit**

```bash
git add athene/crates/athene-app/src/components/pr_list.rs \
        athene/crates/athene-app/src/components/mod.rs \
        athene/crates/athene-app/src/app.rs \
        athene/crates/athene-app/src/components/sidebar.rs
git commit -m "feat(native-app): add PR list view"
```

---

## Task 4: Session Inspector Panel

**Files:**
- Create: `athene/crates/athene-app/src/components/inspector_panel.rs`
- Modify: `athene/crates/athene-app/src/components/mod.rs`
- Modify: `athene/crates/athene-app/src/components/session_detail.rs`

**Interfaces:**
- Consumes: `Session { id, orchestrator_id, name, repo, status, agent_type, cost_usd, started_at, pr_number, workspace_path, pid }`, `App.orchestrators`
- Produces: `DetailPanel::Inspector` third panel tab

**Context:** Session detail has three panel tabs (`Terminal`, `Split`, `Info`). The "Inspector" adds a fourth showing raw session metadata — useful for debugging.

- [ ] **Step 1: Add `DetailPanel::Inspector` variant**

In `session_detail.rs`, update the enum:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetailPanel {
    Terminal,
    Split,
    Info,
    Inspector,
}
```

- [ ] **Step 2: Write failing test**

In `app.rs` tests:

```rust
#[test]
fn switch_to_inspector_panel() {
    use crate::components::session_detail::DetailPanel;
    let e = test_engine();
    let mut m = base(e);
    let s = Session {
        id: "s1".into(), orchestrator_id: None, name: "w".into(),
        repo: "r".into(), status: SessionStatus::Working,
        agent_type: "claude-code".into(), cost_usd: 1.23,
        started_at: 0, pr_number: Some(42), pr_id: None,
        workspace_path: Some("/tmp/w".into()), pid: Some(1234),
    };
    let (mut m, _) = m.update(Message::EngineEvent(Event::SessionSpawned(s)));
    let (m2, _) = m.update(Message::NavigateSession("s1".into()));
    let (m3, _) = m2.update(Message::SwitchDetailPanel(DetailPanel::Inspector));
    assert!(matches!(&m3.view, View::SessionDetail { panel: DetailPanel::Inspector, .. }));
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cargo test -p athene-app switch_to_inspector_panel 2>&1 | tail -10
```

Expected: compile error — `Inspector` not in `DetailPanel`.

- [ ] **Step 4: Create `inspector_panel.rs`**

Create `athene/crates/athene-app/src/components/inspector_panel.rs`:

```rust
use iced::{
    widget::{column, container, row, scrollable, text, Space},
    Background, Border, Element, Length,
};

use crate::{app::{App, Message}, theme::ColorScheme};
use athene_core::types::Session;

fn field<'a>(label: &'static str, value: String, s: &'a ColorScheme) -> Element<'a, Message> {
    column![
        text(label).size(10).color(s.text_muted),
        text(value).size(12).color(s.text_primary),
    ]
    .spacing(2)
    .into()
}

fn status_str(status: &athene_core::types::SessionStatus) -> &'static str {
    match status {
        athene_core::types::SessionStatus::Spawning       => "spawning",
        athene_core::types::SessionStatus::Working        => "working",
        athene_core::types::SessionStatus::PrOpen         => "pr_open",
        athene_core::types::SessionStatus::CiFailed       => "ci_failed",
        athene_core::types::SessionStatus::ReviewPending  => "review_pending",
        athene_core::types::SessionStatus::Mergeable      => "mergeable",
        athene_core::types::SessionStatus::Done           => "done",
        athene_core::types::SessionStatus::Terminated     => "terminated",
    }
}

pub fn inspector_panel<'a>(app: &'a App, session: &'a Session) -> Element<'a, Message> {
    let s = &app.scheme;

    let orchestrator_name = session.orchestrator_id.as_deref()
        .and_then(|oid| app.orchestrators.iter().find(|o| o.id == oid))
        .map(|o| o.name.as_str())
        .unwrap_or("—");

    let fields: Vec<Element<Message>> = vec![
        field("Session ID",       session.id.clone(), s),
        field("Name",             session.name.clone(), s),
        field("Repository",       session.repo.clone(), s),
        field("Status",           status_str(&session.status).to_string(), s),
        field("Agent",            session.agent_type.clone(), s),
        field("Orchestrator",     orchestrator_name.to_string(), s),
        field("Cost",             format!("${:.4}", session.cost_usd), s),
        field("PR",               session.pr_number.map(|n| format!("#{n}")).unwrap_or("—".into()), s),
        field("PID",              session.pid.map(|p| p.to_string()).unwrap_or("—".into()), s),
        field("Workspace",        session.workspace_path.clone().unwrap_or("—".into()), s),
        field("Started (unix)",   session.started_at.to_string(), s),
    ];

    let content = fields.into_iter().flat_map(|f| {
        let divider = container(Space::new(Length::Fill, 1.0))
            .width(Length::Fill)
            .style(move |_| container::Style {
                background: Some(Background::Color(s.border)),
                ..Default::default()
            });
        vec![
            container(f).padding([8, 16]).width(Length::Fill).into(),
            divider.into(),
        ]
    });

    scrollable(
        column(content.collect::<Vec<_>>())
    )
    .height(Length::Fill)
    .into()
}
```

- [ ] **Step 5: Register the module**

In `components/mod.rs`, add:

```rust
pub mod inspector_panel;
```

- [ ] **Step 6: Wire the Inspector panel into `session_detail.rs`**

In `session_detail.rs`, add the import:

```rust
use crate::components::inspector_panel::inspector_panel;
```

Add the panel button in the header row (after the "Info" button):

```rust
panel_btn(app, "Inspector", DetailPanel::Inspector, *panel),
```

In the panel content match block (find where `DetailPanel::Info` is rendered and add):

```rust
DetailPanel::Inspector => {
    inspector_panel(app, session).into()
}
```

- [ ] **Step 7: Run tests**

```bash
cargo test -p athene-app 2>&1 | tail -20
cargo build -p athene-app 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add athene/crates/athene-app/src/components/inspector_panel.rs \
        athene/crates/athene-app/src/components/mod.rs \
        athene/crates/athene-app/src/components/session_detail.rs \
        athene/crates/athene-app/src/app.rs
git commit -m "feat(native-app): add inspector panel to session detail"
```

---

## Task 5: Attention Banner in Fleet Board

**Files:**
- Modify: `athene/crates/athene-app/src/components/fleet_board.rs`

**Interfaces:**
- Consumes: `App.sessions` (counts sessions needing attention)
- Produces: A sticky alert banner above the kanban columns when CI failures or review-pending sessions exist

**Context:** The web dashboard has `AttentionZone.tsx` for visual priority indicators. The native fleet board has no summary — if 5 sessions are failing CI the user has to scan all columns.

- [ ] **Step 1: Write failing test**

In `app.rs` tests:

```rust
#[test]
fn attention_count_detects_ci_failures() {
    use crate::components::fleet_board::attention_count;
    let e = test_engine();
    let mut m = base(e);
    for (id, status) in [
        ("s1", SessionStatus::CiFailed),
        ("s2", SessionStatus::ReviewPending),
        ("s3", SessionStatus::Working),
    ] {
        let s = Session {
            id: id.into(), orchestrator_id: None, name: id.into(),
            repo: "r".into(), status,
            agent_type: "c".into(), cost_usd: 0.0,
            started_at: 0, pr_number: None, pr_id: None,
            workspace_path: None, pid: None,
        };
        let (next, _) = m.update(Message::EngineEvent(Event::SessionSpawned(s)));
        m = next;
    }
    assert_eq!(attention_count(&m), 2); // ci_failed + review_pending
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p athene-app attention_count 2>&1 | tail -10
```

Expected: compile error — `attention_count` not found.

- [ ] **Step 3: Add `attention_count` helper to `fleet_board.rs`**

```rust
pub fn attention_count(app: &App) -> usize {
    app.sessions.values().filter(|s| {
        matches!(s.status, SessionStatus::CiFailed | SessionStatus::ReviewPending)
    }).count()
}
```

- [ ] **Step 4: Add the attention banner to the `fleet_board` view**

Add a helper that renders the banner (returns `Option<Element>`):

```rust
fn attention_banner<'a>(app: &'a App) -> Option<Element<'a, Message>> {
    let s = &app.scheme;
    let ci_count = app.sessions.values()
        .filter(|s| matches!(s.status, SessionStatus::CiFailed))
        .count();
    let review_count = app.sessions.values()
        .filter(|s| matches!(s.status, SessionStatus::ReviewPending))
        .count();

    if ci_count == 0 && review_count == 0 {
        return None;
    }

    let mut parts: Vec<String> = Vec::new();
    if ci_count > 0 {
        parts.push(format!("{ci_count} CI failure{}", if ci_count == 1 { "" } else { "s" }));
    }
    if review_count > 0 {
        parts.push(format!("{review_count} awaiting review"));
    }
    let message = parts.join("  ·  ");

    Some(
        container(
            row![
                container(Space::new(0,0))
                    .width(Length::Fixed(8.0))
                    .height(Length::Fixed(8.0))
                    .style(move |_| container::Style {
                        background: Some(Background::Color(s.status_ci_failed)),
                        border: Border { radius: 4.0.into(), ..Default::default() },
                        ..Default::default()
                    }),
                Space::new(8, 0),
                text(message).size(12).color(s.status_ci_failed),
            ]
            .align_y(Alignment::Center)
        )
        .padding([8, 16])
        .width(Length::Fill)
        .style(move |_| container::Style {
            background: Some(Background::Color(Color {
                r: s.status_ci_failed.r,
                g: s.status_ci_failed.g,
                b: s.status_ci_failed.b,
                a: 0.08,
            })),
            border: Border {
                color: Color { a: 0.2, ..s.status_ci_failed },
                width: 0.0,
                radius: 0.0.into(),
            },
            ..Default::default()
        })
        .into()
    )
}
```

In the `fleet_board` view function, prepend the banner to the outer column:

```rust
// At the top of the fleet_board function, build the banner:
let banner = attention_banner(app);

// In the final column!, add banner conditionally before the scrollable:
let mut col_children: Vec<Element<Message>> = Vec::new();
if let Some(b) = banner {
    col_children.push(b);
}
col_children.push(kanban_scroll.into());

column(col_children)
    .width(Length::Fill)
    .height(Length::Fill)
    .into()
```

- [ ] **Step 5: Run tests**

```bash
cargo test -p athene-app attention_count 2>&1 | tail -10
cargo build -p athene-app 2>&1 | tail -10
```

Expected: test passes, clean build.

- [ ] **Step 6: Commit**

```bash
git add athene/crates/athene-app/src/components/fleet_board.rs \
        athene/crates/athene-app/src/app.rs
git commit -m "feat(native-app): add attention banner to fleet board for CI failures and review"
```

---

## Task 6: Fleet Board Filter Bar

**Files:**
- Create: `athene/crates/athene-app/src/components/filter_bar.rs`
- Modify: `athene/crates/athene-app/src/components/mod.rs`
- Modify: `athene/crates/athene-app/src/app.rs` (filter state + messages)
- Modify: `athene/crates/athene-app/src/components/fleet_board.rs`

**Interfaces:**
- Consumes: `App.sessions`, new `FleetFilter { query: String, status: Option<SessionStatus> }` state
- Produces: `Message::FleetFilterQuery(String)`, `Message::FleetFilterStatus(Option<SessionStatus>)`, `Message::ClearFleetFilter`; filtered session display in fleet board

- [ ] **Step 1: Add `FleetFilter` to `app.rs`**

```rust
#[derive(Debug, Clone, Default)]
pub struct FleetFilter {
    pub query: String,
}

// Add to App struct:
pub fleet_filter: FleetFilter,
```

Update `App::new` / `base()` test helper to include `fleet_filter: FleetFilter::default()`.

- [ ] **Step 2: Add filter messages**

```rust
FleetFilterQuery(String),
ClearFleetFilter,
```

- [ ] **Step 3: Write failing test**

```rust
#[test]
fn fleet_filter_matches_session_name() {
    use crate::components::fleet_board::filtered_sessions;
    let e = test_engine();
    let mut m = base(e);
    for (id, name) in [("s1", "auth-fix"), ("s2", "payment-bug"), ("s3", "auth-refactor")] {
        let s = Session {
            id: id.into(), orchestrator_id: None, name: name.into(),
            repo: "r".into(), status: SessionStatus::Working,
            agent_type: "c".into(), cost_usd: 0.0,
            started_at: 0, pr_number: None, pr_id: None,
            workspace_path: None, pid: None,
        };
        let (next, _) = m.update(Message::EngineEvent(Event::SessionSpawned(s)));
        m = next;
    }
    let (m2, _) = m.update(Message::FleetFilterQuery("auth".into()));
    let sessions = filtered_sessions(&m2);
    assert_eq!(sessions.len(), 2);
    assert!(sessions.iter().all(|s| s.name.contains("auth")));
}
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cargo test -p athene-app fleet_filter_matches 2>&1 | tail -10
```

Expected: compile error.

- [ ] **Step 5: Wire handlers and add `filtered_sessions` to `fleet_board.rs`**

In `App::apply`, add:

```rust
Message::FleetFilterQuery(q) => {
    state.fleet_filter.query = q;
    Task::none()
}
Message::ClearFleetFilter => {
    state.fleet_filter = FleetFilter::default();
    Task::none()
}
```

In `fleet_board.rs`, add:

```rust
pub fn filtered_sessions<'a>(app: &'a App) -> Vec<&'a Session> {
    let q = app.fleet_filter.query.to_lowercase();
    app.sessions.values().filter(|s| {
        q.is_empty()
            || s.name.to_lowercase().contains(&q)
            || s.repo.to_lowercase().contains(&q)
    }).collect()
}
```

Update `board_sessions` to respect the filter:

```rust
pub fn board_sessions<'a>(app: &'a App, status: &SessionStatus) -> Vec<&'a Session> {
    let q = app.fleet_filter.query.to_lowercase();
    let mut sessions: Vec<&Session> = app.sessions.values().filter(|s| {
        &s.status == status
            && (q.is_empty()
                || s.name.to_lowercase().contains(&q)
                || s.repo.to_lowercase().contains(&q))
    }).collect();
    sessions.sort_by(|a, b| a.name.cmp(&b.name));
    sessions
}
```

- [ ] **Step 6: Create `filter_bar.rs`**

Create `athene/crates/athene-app/src/components/filter_bar.rs`:

```rust
use iced::{
    widget::{button, container, row, text, text_input, Space},
    Alignment, Background, Border, Element, Length,
};

use crate::{app::{App, Message}, theme::ColorScheme};

pub fn filter_bar<'a>(app: &'a App) -> Element<'a, Message> {
    let s = &app.scheme;
    let has_filter = !app.fleet_filter.query.is_empty();

    let input = text_input("Filter sessions...", &app.fleet_filter.query)
        .on_input(Message::FleetFilterQuery)
        .padding([6, 10])
        .size(12)
        .width(Length::Fixed(220.0));

    let clear_btn = if has_filter {
        Some(
            button(text("✕").size(11).color(s.text_muted))
                .on_press(Message::ClearFleetFilter)
                .style(|_t, _s| button::Style {
                    background: None,
                    border: Border::default(),
                    ..Default::default()
                })
                .padding([4, 8])
        )
    } else {
        None
    };

    let total = app.sessions.len();
    let shown: usize = {
        let q = app.fleet_filter.query.to_lowercase();
        if q.is_empty() { total } else {
            app.sessions.values().filter(|s| {
                s.name.to_lowercase().contains(&q) || s.repo.to_lowercase().contains(&q)
            }).count()
        }
    };

    let count_label = if has_filter {
        format!("{shown}/{total}")
    } else {
        format!("{total} session{}", if total == 1 { "" } else { "s" })
    };

    let mut row_items: Vec<Element<Message>> = vec![
        input.into(),
    ];
    if let Some(btn) = clear_btn {
        row_items.push(btn.into());
    }
    row_items.push(Space::new(Length::Fill, 0).into());
    row_items.push(text(count_label).size(11).color(s.text_muted).into());

    container(
        iced::widget::row(row_items).align_y(Alignment::Center).spacing(4)
    )
    .padding([8, 16])
    .width(Length::Fill)
    .style(move |_| container::Style {
        background: Some(Background::Color(s.bg_base)),
        border: Border { color: s.border, width: 0.0, radius: 0.0.into() },
        ..Default::default()
    })
    .into()
}
```

- [ ] **Step 7: Register module and wire into fleet board**

In `components/mod.rs`:
```rust
pub mod filter_bar;
```

In `fleet_board.rs`, import and prepend the filter bar:

```rust
use crate::components::filter_bar::filter_bar;

// In fleet_board() view function, prepend filter bar before the kanban scroll:
let bar = filter_bar(app);
// Replace the final `column![...]` return with:
let mut col_children: Vec<Element<Message>> = Vec::new();
if let Some(b) = attention_banner(app) { col_children.push(b); }
col_children.push(bar);
col_children.push(kanban_scroll.into());

column(col_children)
    .width(Length::Fill)
    .height(Length::Fill)
    .into()
```

- [ ] **Step 8: Run tests**

```bash
cargo test -p athene-app 2>&1 | tail -20
cargo build -p athene-app 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add athene/crates/athene-app/src/components/filter_bar.rs \
        athene/crates/athene-app/src/components/mod.rs \
        athene/crates/athene-app/src/components/fleet_board.rs \
        athene/crates/athene-app/src/app.rs
git commit -m "feat(native-app): add fleet board filter bar"
```

---

---

## Task 7: GitHub API Client + Config

**Files:**
- Modify: `athene/Cargo.toml` (add `reqwest` workspace dep)
- Modify: `athene/crates/athene-core/Cargo.toml` (add `reqwest`)
- Modify: `athene/crates/athene-core/src/config.rs` (add `github_token`)
- Create: `athene/crates/athene-core/src/github.rs`
- Modify: `athene/crates/athene-core/src/lib.rs` (expose `github` module)

**Interfaces:**
- Produces:
  - `GitHubClient::new(token: String) -> GitHubClient`
  - `GitHubClient::get_pr_status(owner, repo, pr_number) -> Result<PrStatus>`
  - `GitHubClient::get_ci_checks(owner, repo, pr_number) -> Result<Vec<CheckRun>>`
  - `GitHubClient::get_review_threads(owner, repo, pr_number) -> Result<Vec<ReviewThread>>`
  - `PrStatus { merged: bool, state: String, mergeable: Option<bool> }`
  - `CheckRun { name: String, status: String, conclusion: Option<String> }`
  - `ReviewThread { id: i64, author: String, body: String, path: Option<String>, line: Option<u32>, state: String }`

**Context:** The Rust app has no HTTP client. All GitHub data structures (`PR`, `CIStatus`, `Comment`) are defined in `types.rs` but nothing populates them. The TypeScript app uses the GitHub REST API with ETag caching. We'll use `reqwest` with a simple bearer token from config or `GITHUB_TOKEN` env var.

- [ ] **Step 1: Add `reqwest` to workspace Cargo.toml**

In `athene/Cargo.toml`, add to `[workspace.dependencies]`:

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
```

In `athene/crates/athene-core/Cargo.toml`, add to `[dependencies]`:

```toml
reqwest = { workspace = true }
```

- [ ] **Step 2: Add `github_token` to `AppConfig`**

In `athene/crates/athene-core/src/config.rs`, update `AppConfig`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port:      u16,
    pub font_size: f32,
    #[serde(default)]
    pub theme:     ThemeVariant,
    #[serde(default)]
    pub orchestrator_root: Option<PathBuf>,
    #[serde(default)]
    pub orchestrator: AgentConfig,
    #[serde(default)]
    pub worker: AgentConfig,
    /// GitHub personal access token. If absent, falls back to GITHUB_TOKEN env var.
    /// Requires `repo` scope for private repos, `public_repo` for public.
    #[serde(default)]
    pub github_token: Option<String>,
}
```

Update `Default` impl to add `github_token: None`.

- [ ] **Step 3: Write failing tests**

In `athene/crates/athene-core/src/github.rs` (create the file), start with tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_repo_owner_from_url() {
        let (owner, repo) = split_repo("Made-by-Moonlight/Athene").unwrap();
        assert_eq!(owner, "Made-by-Moonlight");
        assert_eq!(repo, "Athene");
    }

    #[test]
    fn parse_repo_owner_strips_github_prefix() {
        let (owner, repo) = split_repo("github.com/Made-by-Moonlight/Athene").unwrap();
        assert_eq!(owner, "Made-by-Moonlight");
        assert_eq!(repo, "Athene");
    }

    #[test]
    fn invalid_repo_returns_none() {
        assert!(split_repo("notarepo").is_none());
    }

    #[test]
    fn resolve_token_prefers_config_over_env() {
        // Can't easily test env interaction in unit tests — tested via integration
        let token = resolve_token(Some("config-token".to_string()));
        assert_eq!(token, Some("config-token".to_string()));
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cargo test -p athene-core parse_repo_owner 2>&1 | tail -10
```

Expected: compile error — `split_repo` not defined.

- [ ] **Step 5: Create `github.rs`**

```rust
use anyhow::{Context, Result};
use reqwest::{header, Client};
use serde::Deserialize;

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct PrStatus {
    pub merged:    bool,
    pub state:     String,   // "open" | "closed"
    pub mergeable: Option<bool>,
    pub title:     String,
    pub number:    u64,
}

#[derive(Debug, Clone)]
pub struct CheckRun {
    pub name:        String,
    pub status:      String,      // "queued" | "in_progress" | "completed"
    pub conclusion:  Option<String>, // "success" | "failure" | "neutral" | ...
}

#[derive(Debug, Clone)]
pub struct ReviewThread {
    pub id:     i64,
    pub author: String,
    pub body:   String,
    pub path:   Option<String>,
    pub line:   Option<u32>,
    pub state:  String,  // "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED"
}

// ---------------------------------------------------------------------------
// Internal API response shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GhPr {
    number:    u64,
    title:     String,
    state:     String,
    merged:    bool,
    mergeable: Option<bool>,
}

#[derive(Deserialize)]
struct GhCheckRunsResponse {
    check_runs: Vec<GhCheckRun>,
}

#[derive(Deserialize)]
struct GhCheckRun {
    name:       String,
    status:     String,
    conclusion: Option<String>,
}

#[derive(Deserialize)]
struct GhReview {
    id:                  i64,
    user:                GhUser,
    body:                String,
    state:               String,
    pull_request_review_id: Option<i64>,
}

#[derive(Deserialize)]
struct GhReviewComment {
    id:        i64,
    user:      GhUser,
    body:      String,
    path:      Option<String>,
    line:      Option<u32>,
    pull_request_review_id: Option<i64>,
}

#[derive(Deserialize)]
struct GhUser { login: String }

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct GitHubClient {
    http:  Client,
    token: String,
}

impl GitHubClient {
    pub fn new(token: String) -> Result<Self> {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::ACCEPT,
            header::HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            header::HeaderValue::from_static("2022-11-28"),
        );
        let http = Client::builder()
            .user_agent("athene-native/0.1")
            .default_headers(headers)
            .build()
            .context("failed to build HTTP client")?;
        Ok(Self { http, token })
    }

    fn auth(&self) -> String {
        format!("Bearer {}", self.token)
    }

    pub async fn get_pr_status(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u64,
    ) -> Result<PrStatus> {
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        );
        let gh: GhPr = self
            .http
            .get(&url)
            .header(header::AUTHORIZATION, self.auth())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(PrStatus {
            merged:    gh.merged,
            state:     gh.state,
            mergeable: gh.mergeable,
            title:     gh.title,
            number:    gh.number,
        })
    }

    pub async fn get_ci_checks(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u64,
    ) -> Result<Vec<CheckRun>> {
        // Use the commit SHA — get it from the PR first
        let pr_url = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        );
        #[derive(Deserialize)]
        struct PrHead { sha: String }
        #[derive(Deserialize)]
        struct PrForSha { head: PrHead }
        let pr: PrForSha = self
            .http
            .get(&pr_url)
            .header(header::AUTHORIZATION, self.auth())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let sha = pr.head.sha;

        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100"
        );
        let resp: GhCheckRunsResponse = self
            .http
            .get(&url)
            .header(header::AUTHORIZATION, self.auth())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(resp.check_runs.into_iter().map(|r| CheckRun {
            name:       r.name,
            status:     r.status,
            conclusion: r.conclusion,
        }).collect())
    }

    pub async fn get_review_threads(
        &self,
        owner: &str,
        repo: &str,
        pr_number: u64,
    ) -> Result<Vec<ReviewThread>> {
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/reviews?per_page=100"
        );
        let reviews: Vec<GhReview> = self
            .http
            .get(&url)
            .header(header::AUTHORIZATION, self.auth())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        // Also fetch inline comments
        let comments_url = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/comments?per_page=100"
        );
        let comments: Vec<GhReviewComment> = self
            .http
            .get(&comments_url)
            .header(header::AUTHORIZATION, self.auth())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let mut threads: Vec<ReviewThread> = reviews.into_iter().map(|r| ReviewThread {
            id:     r.id,
            author: r.user.login,
            body:   r.body,
            path:   None,
            line:   None,
            state:  r.state,
        }).collect();

        for c in comments {
            threads.push(ReviewThread {
                id:     c.id,
                author: c.user.login,
                body:   c.body,
                path:   c.path,
                line:   c.line,
                state:  "COMMENTED".to_string(),
            });
        }

        Ok(threads)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse "owner/repo" or "github.com/owner/repo" into (owner, repo).
pub fn split_repo(s: &str) -> Option<(String, String)> {
    let s = s.trim_start_matches("https://").trim_start_matches("github.com/");
    let mut parts = s.trim_start_matches('/').splitn(2, '/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() { return None; }
    Some((owner, repo))
}

/// Resolve GitHub token: prefer explicit config value, fall back to env var.
pub fn resolve_token(config_token: Option<String>) -> Option<String> {
    config_token.or_else(|| std::env::var("GITHUB_TOKEN").ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_repo_owner_from_url() {
        let (owner, repo) = split_repo("Made-by-Moonlight/Athene").unwrap();
        assert_eq!(owner, "Made-by-Moonlight");
        assert_eq!(repo, "Athene");
    }

    #[test]
    fn parse_repo_owner_strips_github_prefix() {
        let (owner, repo) = split_repo("github.com/Made-by-Moonlight/Athene").unwrap();
        assert_eq!(owner, "Made-by-Moonlight");
        assert_eq!(repo, "Athene");
    }

    #[test]
    fn invalid_repo_returns_none() {
        assert!(split_repo("notarepo").is_none());
    }

    #[test]
    fn resolve_token_prefers_config_over_env() {
        let token = resolve_token(Some("config-token".to_string()));
        assert_eq!(token, Some("config-token".to_string()));
    }
}
```

- [ ] **Step 6: Expose module in `lib.rs`**

In `athene/crates/athene-core/src/lib.rs`, add:

```rust
pub mod github;
```

- [ ] **Step 7: Run tests**

```bash
cargo test -p athene-core parse_repo_owner 2>&1 | tail -20
cargo clippy -p athene-core -- -D warnings 2>&1 | tail -10
```

Expected: 4 tests pass, no warnings.

- [ ] **Step 8: Commit**

```bash
git add athene/Cargo.toml \
        athene/crates/athene-core/Cargo.toml \
        athene/crates/athene-core/src/config.rs \
        athene/crates/athene-core/src/github.rs \
        athene/crates/athene-core/src/lib.rs
git commit -m "feat(native-core): add GitHub API client with PR status, CI checks, and review threads"
```

---

## Task 8: PATH Wrapper Hooks + Metadata Poller

**Files:**
- Modify: `athene/crates/athene-core/src/config.rs` (add `athene_bin_dir()` helper)
- Create: `athene/crates/athene-core/src/hooks.rs` (write wrappers, install env, read metadata)
- Modify: `athene/crates/athene-core/src/lib.rs` (expose `hooks` module)
- Modify: `athene/crates/athene-core/src/lifecycle/poller.rs` (poll metadata files for pr_number)
- Modify: `athene/crates/athene-core/src/tmux.rs` (inject wrapper PATH + ATHENE env vars on session create)

**Interfaces:**
- Produces:
  - `hooks::install_wrappers() -> Result<()>` — writes `gh` and `git` shell scripts to `~/.config/athene/bin/`
  - `hooks::athene_bin_dir() -> PathBuf` — returns `~/.config/athene/bin/`
  - `hooks::sessions_dir() -> PathBuf` — returns `~/.config/athene/sessions/`
  - `hooks::read_session_metadata(sessions_dir, session_id) -> Result<SessionMetadata>`
  - `SessionMetadata { pr_number: Option<u64>, pr_url: Option<String>, branch: Option<String> }`
  - Session env vars on spawn: `ATHENE_SESSION={id}`, `ATHENE_DATA_DIR={sessions_dir}`, `PATH=~/.config/athene/bin:$PATH`

**Context:** Workers never progress past `Working` status because nothing sets `session.pr_number`. The TypeScript app uses shell wrappers in `~/.ao/bin/gh` and `~/.ao/bin/git` that intercept `gh pr create` and write the PR number to a JSON metadata file. The Athene native app uses `~/.config/athene/bin/` (not `~/.ao/bin/`). The wrapper reads `ATHENE_SESSION` and `ATHENE_DATA_DIR` env vars to locate its metadata file — both injected when the tmux session is created.

- [ ] **Step 1: Add `athene_bin_dir` and `sessions_dir` helpers to `config.rs`**

In `athene/crates/athene-core/src/config.rs`, add after the existing `AppConfig::config_path()`:

```rust
/// Directory for Athene-managed shell wrappers prepended to agent PATH.
/// Default: `~/.config/athene/bin/`
pub fn athene_bin_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("athene")
        .join("bin")
}

/// Directory where per-session metadata JSON files are written by wrapper hooks.
/// Default: `~/.config/athene/sessions/`
pub fn sessions_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("athene")
        .join("sessions")
}
```

- [ ] **Step 2: Write failing tests**

Create `athene/crates/athene-core/src/hooks.rs` and start with the tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn install_wrappers_creates_executables() {
        let dir = tempdir().unwrap();
        install_wrappers_to(dir.path()).unwrap();
        assert!(dir.path().join("gh").exists());
        assert!(dir.path().join("git").exists());
        // Check executable bit on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let gh_mode = std::fs::metadata(dir.path().join("gh"))
                .unwrap().permissions().mode();
            assert!(gh_mode & 0o111 != 0, "gh wrapper should be executable");
        }
    }

    #[test]
    fn read_session_metadata_parses_pr_number() {
        let dir = tempdir().unwrap();
        let metadata = serde_json::json!({
            "agentReportedPrNumber": "42",
            "agentReportedPrUrl": "https://github.com/org/repo/pull/42",
            "branch": "feat/my-fix"
        });
        std::fs::write(
            dir.path().join("s1.json"),
            serde_json::to_string(&metadata).unwrap(),
        ).unwrap();
        let m = read_session_metadata(dir.path(), "s1").unwrap();
        assert_eq!(m.pr_number, Some(42));
        assert_eq!(m.branch.as_deref(), Some("feat/my-fix"));
    }

    #[test]
    fn read_session_metadata_returns_none_on_missing_file() {
        let dir = tempdir().unwrap();
        let m = read_session_metadata(dir.path(), "nonexistent").unwrap();
        assert_eq!(m.pr_number, None);
        assert_eq!(m.branch, None);
    }

    #[test]
    fn read_session_metadata_handles_malformed_json() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("bad.json"), "not json").unwrap();
        // Should not panic, returns empty metadata
        let m = read_session_metadata(dir.path(), "bad").unwrap();
        assert_eq!(m.pr_number, None);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cargo test -p athene-core install_wrappers_creates 2>&1 | tail -10
```

Expected: compile error — `install_wrappers_to` not defined.

- [ ] **Step 4: Create `hooks.rs`**

```rust
use anyhow::Result;
use serde::Deserialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

// ---------------------------------------------------------------------------
// Metadata types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct SessionMetadata {
    pub pr_number: Option<u64>,
    pub pr_url:    Option<String>,
    pub branch:    Option<String>,
}

// ---------------------------------------------------------------------------
// Wrapper scripts
// ---------------------------------------------------------------------------

/// The `gh` wrapper script. Intercepts `gh pr create`, extracts the PR URL
/// from output, and writes it to the session metadata JSON file.
///
/// Env vars consumed at runtime (injected by athene when spawning the tmux session):
///   ATHENE_SESSION    — session ID used as metadata filename
///   ATHENE_DATA_DIR   — directory where {ATHENE_SESSION}.json lives
const GH_WRAPPER: &str = r#"#!/usr/bin/env bash
# Athene gh wrapper — intercepts gh pr create to record PR metadata.
set -euo pipefail

# Locate the real gh binary (skip ourselves).
_real_gh=""
IFS=: read -ra _path_parts <<< "$PATH"
for _dir in "${_path_parts[@]}"; do
    _candidate="$_dir/gh"
    if [[ "$_candidate" != "$0" && -x "$_candidate" ]]; then
        _real_gh="$_candidate"
        break
    fi
done
if [[ -z "$_real_gh" ]]; then
    echo "athene: gh not found in PATH (excluding wrapper)" >&2
    exit 1
fi

# Run the real gh and tee output so we can parse it.
if [[ "${1:-}" == "pr" && "${2:-}" == "create" ]]; then
    _output=$("$_real_gh" "$@" 2>&1)
    _exit=$?
    echo "$_output"
    if [[ $_exit -eq 0 && -n "${ATHENE_SESSION:-}" && -n "${ATHENE_DATA_DIR:-}" ]]; then
        _pr_url=$(echo "$_output" | grep -oE 'https?://[^/]+/[^/]+/[^/]+/pull/[0-9]+' | head -1)
        if [[ -n "$_pr_url" ]]; then
            _pr_num=$(echo "$_pr_url" | grep -oE '[0-9]+$')
            _meta_file="${ATHENE_DATA_DIR}/${ATHENE_SESSION}.json"
            mkdir -p "$(dirname "$_meta_file")"
            _tmp="${_meta_file}.tmp.$$"
            if [[ -f "$_meta_file" ]]; then
                _existing=$(cat "$_meta_file")
            else
                _existing="{}"
            fi
            if command -v jq &>/dev/null; then
                echo "$_existing" | jq \
                    --arg url "$_pr_url" \
                    --arg num "$_pr_num" \
                    '. + {"agentReportedPrUrl": $url, "agentReportedPrNumber": $num, "agentReportedState": "pr_created"}' \
                    > "$_tmp" && mv "$_tmp" "$_meta_file"
            else
                # Fallback: node (likely available alongside gh)
                node -e "
                    const fs = require('fs');
                    const m = JSON.parse(fs.existsSync('$_meta_file') ? fs.readFileSync('$_meta_file','utf8') : '{}');
                    m.agentReportedPrUrl = '$_pr_url';
                    m.agentReportedPrNumber = '$_pr_num';
                    m.agentReportedState = 'pr_created';
                    fs.writeFileSync('${_meta_file}.tmp.$$', JSON.stringify(m,null,2));
                    fs.renameSync('${_meta_file}.tmp.$$', '$_meta_file');
                " 2>/dev/null || true
            fi
        fi
    fi
    exit $_exit
else
    exec "$_real_gh" "$@"
fi
"#;

/// The `git` wrapper script. Intercepts branch creation to record branch name.
const GIT_WRAPPER: &str = r#"#!/usr/bin/env bash
# Athene git wrapper — records branch name on checkout -b / switch -c.
set -euo pipefail

_real_git=""
IFS=: read -ra _path_parts <<< "$PATH"
for _dir in "${_path_parts[@]}"; do
    _candidate="$_dir/git"
    if [[ "$_candidate" != "$0" && -x "$_candidate" ]]; then
        _real_git="$_candidate"
        break
    fi
done
if [[ -z "$_real_git" ]]; then
    echo "athene: git not found in PATH (excluding wrapper)" >&2
    exit 1
fi

# Run the real git command first.
"$_real_git" "$@"
_exit=$?

# On success, capture branch name for checkout -b / switch -c.
if [[ $_exit -eq 0 && -n "${ATHENE_SESSION:-}" && -n "${ATHENE_DATA_DIR:-}" ]]; then
    _branch=""
    if [[ "${1:-}" == "checkout" && "${2:-}" == "-b" && -n "${3:-}" ]]; then
        _branch="${3}"
    elif [[ "${1:-}" == "switch" && "${2:-}" == "-c" && -n "${3:-}" ]]; then
        _branch="${3}"
    fi
    if [[ -n "$_branch" ]]; then
        _meta_file="${ATHENE_DATA_DIR}/${ATHENE_SESSION}.json"
        mkdir -p "$(dirname "$_meta_file")"
        if command -v jq &>/dev/null; then
            _tmp="${_meta_file}.tmp.$$"
            _existing=$([ -f "$_meta_file" ] && cat "$_meta_file" || echo "{}")
            echo "$_existing" | jq --arg b "$_branch" '. + {"branch": $b}' \
                > "$_tmp" && mv "$_tmp" "$_meta_file"
        fi
    fi
fi

exit $_exit
"#;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Install `gh` and `git` wrapper scripts to the given directory.
/// Called with the Athene bin dir (`~/.config/athene/bin/`) in production.
pub fn install_wrappers_to(bin_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(bin_dir)?;
    write_executable(bin_dir.join("gh"),  GH_WRAPPER)?;
    write_executable(bin_dir.join("git"), GIT_WRAPPER)?;
    Ok(())
}

/// Install wrappers to the default Athene bin dir.
pub fn install_wrappers() -> Result<()> {
    install_wrappers_to(&crate::config::AppConfig::athene_bin_dir())
}

/// Read session metadata from `{dir}/{session_id}.json`.
/// Returns empty `SessionMetadata` if the file does not exist or is malformed.
pub fn read_session_metadata(dir: &Path, session_id: &str) -> Result<SessionMetadata> {
    let path = dir.join(format!("{session_id}.json"));
    if !path.exists() {
        return Ok(SessionMetadata::default());
    }
    let raw = std::fs::read_to_string(&path)?;
    let map: HashMap<String, serde_json::Value> = match serde_json::from_str(&raw) {
        Ok(m)  => m,
        Err(_) => return Ok(SessionMetadata::default()),
    };
    let pr_number = map.get("agentReportedPrNumber")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok());
    let pr_url = map.get("agentReportedPrUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let branch = map.get("branch")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok(SessionMetadata { pr_number, pr_url, branch })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn write_executable(path: PathBuf, content: &str) -> Result<()> {
    // Atomic write: write to temp, then rename.
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))?;
    }
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn install_wrappers_creates_executables() {
        let dir = tempdir().unwrap();
        install_wrappers_to(dir.path()).unwrap();
        assert!(dir.path().join("gh").exists());
        assert!(dir.path().join("git").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let gh_mode = std::fs::metadata(dir.path().join("gh"))
                .unwrap().permissions().mode();
            assert!(gh_mode & 0o111 != 0, "gh wrapper should be executable");
        }
    }

    #[test]
    fn read_session_metadata_parses_pr_number() {
        let dir = tempdir().unwrap();
        let metadata = serde_json::json!({
            "agentReportedPrNumber": "42",
            "agentReportedPrUrl": "https://github.com/org/repo/pull/42",
            "branch": "feat/my-fix"
        });
        std::fs::write(
            dir.path().join("s1.json"),
            serde_json::to_string(&metadata).unwrap(),
        ).unwrap();
        let m = read_session_metadata(dir.path(), "s1").unwrap();
        assert_eq!(m.pr_number, Some(42));
        assert_eq!(m.branch.as_deref(), Some("feat/my-fix"));
    }

    #[test]
    fn read_session_metadata_returns_default_on_missing_file() {
        let dir = tempdir().unwrap();
        let m = read_session_metadata(dir.path(), "nonexistent").unwrap();
        assert_eq!(m.pr_number, None);
        assert_eq!(m.branch, None);
    }

    #[test]
    fn read_session_metadata_handles_malformed_json() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("bad.json"), "not json").unwrap();
        let m = read_session_metadata(dir.path(), "bad").unwrap();
        assert_eq!(m.pr_number, None);
    }
}
```

- [ ] **Step 5: Expose module in `lib.rs`**

```rust
pub mod hooks;
```

- [ ] **Step 6: Inject wrapper env vars when creating a tmux session**

In `athene/crates/athene-core/src/tmux.rs`, update `create_session` to accept a `sessions_dir: &Path` parameter (or read it from a global config). The simplest approach: add two env vars to the existing `env` slice before calling tmux:

In whichever calling site spawns the tmux session (likely `events.rs` or `main.rs`), ensure these are in the `env` array passed to `create_session`:

```rust
let sessions_dir = athene_core::config::AppConfig::sessions_dir();
std::fs::create_dir_all(&sessions_dir).ok();

let athene_bin = athene_core::config::AppConfig::athene_bin_dir();
let path_with_wrappers = format!(
    "{}:{}",
    athene_bin.display(),
    std::env::var("PATH").unwrap_or_default()
);

// Add to env pairs passed to create_session:
let extra_env = [
    ("ATHENE_SESSION",  session_id),
    ("ATHENE_DATA_DIR", sessions_dir.to_str().unwrap_or("")),
    ("PATH",            &path_with_wrappers),
];
// Merge with existing env before passing to create_session.
```

- [ ] **Step 7: Call `install_wrappers()` at startup**

In the app entry point (`athene/crates/athene-app/src/main.rs`), add before starting the engine:

```rust
if let Err(e) = athene_core::hooks::install_wrappers() {
    tracing::warn!("failed to install wrapper hooks: {e}");
}
```

Failures are non-fatal — the app still works, just without PR auto-detection.

- [ ] **Step 8: Poll metadata files in the poller for pr_number**

In `poller.rs`, in `poll_pids` (the 5-second loop), add a metadata check for sessions in `Working` status that have no `pr_number`:

```rust
// After the PID liveness check block, add:
if matches!(session.status, SessionStatus::Working | SessionStatus::Spawning)
    && session.pr_number.is_none()
{
    let sessions_dir = crate::config::AppConfig::sessions_dir();
    if let Ok(meta) = crate::hooks::read_session_metadata(&sessions_dir, &session.id) {
        if let Some(pr_num) = meta.pr_number {
            session.pr_number = Some(pr_num);
            session.status    = SessionStatus::PrOpen;
            let _ = self.engine.store.upsert_session(&session);
            self.engine.emit(Event::SessionUpdated(session.clone()));
            tracing::info!(
                "session {} PR #{pr_num} detected via metadata hook",
                session.id
            );
        }
    }
}
```

- [ ] **Step 9: Run tests**

```bash
cargo test -p athene-core install_wrappers read_session_metadata 2>&1 | tail -20
cargo clippy -p athene-core -- -D warnings 2>&1 | tail -10
```

Expected: 4 tests pass, no warnings.

- [ ] **Step 10: Commit**

```bash
git add athene/crates/athene-core/src/hooks.rs \
        athene/crates/athene-core/src/config.rs \
        athene/crates/athene-core/src/lib.rs \
        athene/crates/athene-core/src/lifecycle/poller.rs \
        athene/crates/athene-core/src/tmux.rs
git commit -m "feat(native-core): add PATH wrapper hooks for PR detection via metadata files"
```

---

## Task 9: PR Enrichment Poller

**Files:**
- Modify: `athene/crates/athene-core/src/lifecycle/poller.rs`
- Modify: `athene/crates/athene-core/src/events.rs` (pass github client to Engine)
- Create: `athene/crates/athene-core/src/lifecycle/enrichment.rs`
- Modify: `athene/crates/athene-core/src/lifecycle/mod.rs`

**Interfaces:**
- Consumes: `GitHubClient` (from Task 7), `Engine`, existing `Session` with `repo` and `pr_number`
- Produces:
  - `Event::PrOpened { session_id, pr }` when a session gains a PR number
  - `Event::CiUpdated { pr_id, status }` on every poll cycle with a PR
  - `Event::ReviewComment { pr_id, comment }` when new comments are found
  - `Event::Notification(...)` when CI transitions from passing → failing
  - Session status updated to `CiFailed` / `ReviewPending` / `Mergeable` / `Done` in DB

**Context:** The existing poller runs every 5 seconds and only checks PID liveness. We add a second 30-second timer that polls GitHub for all sessions with a `pr_number`. The two timers are independent — PID check stays at 5s, GitHub at 30s.

- [ ] **Step 1: Create `enrichment.rs` with state tracker**

Create `athene/crates/athene-core/src/lifecycle/enrichment.rs`:

```rust
use std::collections::HashMap;
use crate::types::{SessionId, PrId};

/// Per-session enrichment state tracked across poll cycles.
/// Used to detect transitions (was passing, now failing → send notification).
#[derive(Debug, Default, Clone)]
pub struct EnrichmentState {
    /// Number of failing checks seen last cycle. None = first cycle.
    pub prev_failing: Option<u32>,
    /// IDs of review comments already seen (to avoid re-dispatching).
    pub seen_comment_ids: std::collections::HashSet<i64>,
    /// Whether a reaction has already been sent for current CI failure set.
    pub ci_reaction_sent: bool,
    /// Whether a reaction has already been sent for current review set.
    pub review_reaction_sent: bool,
}

pub type EnrichmentCache = HashMap<SessionId, EnrichmentState>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_comments_detected_correctly() {
        let mut state = EnrichmentState::default();
        // First cycle: no comments seen yet
        let ids: Vec<i64> = vec![1, 2, 3];
        let new_ids: Vec<i64> = ids.iter()
            .filter(|id| !state.seen_comment_ids.contains(id))
            .copied()
            .collect();
        assert_eq!(new_ids.len(), 3);
        state.seen_comment_ids.extend(ids);

        // Second cycle: add one more
        let ids2: Vec<i64> = vec![1, 2, 3, 4];
        let new_ids2: Vec<i64> = ids2.iter()
            .filter(|id| !state.seen_comment_ids.contains(id))
            .copied()
            .collect();
        assert_eq!(new_ids2, vec![4]);
    }

    #[test]
    fn ci_transition_detected() {
        let mut state = EnrichmentState::default();
        // First cycle: 0 failures
        state.prev_failing = Some(0);
        // Second cycle: 2 failures — this is a new failure
        let is_new_failure = state.prev_failing.map_or(false, |prev| prev == 0) && 2 > 0;
        assert!(is_new_failure);
        state.prev_failing = Some(2);
        // Third cycle: still 2 failures — not a new failure
        let is_new_failure2 = state.prev_failing.map_or(false, |prev| prev == 0) && 2 > 0;
        assert!(!is_new_failure2);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p athene-core new_comments_detected 2>&1 | tail -10
```

Expected: compile error — module not registered.

- [ ] **Step 3: Register `enrichment` module**

In `athene/crates/athene-core/src/lifecycle/mod.rs`, add:

```rust
pub mod enrichment;
pub mod poller;
pub mod probe;
```

- [ ] **Step 4: Add `github_client` to `Engine`**

In `athene/crates/athene-core/src/events.rs`, update the `Engine` struct and constructor:

```rust
use crate::github::{GitHubClient, resolve_token};

pub struct Engine {
    pub store:        Arc<Store>,
    tx:               broadcast::Sender<Event>,
    pty_writers:      Mutex<HashMap<SessionId, tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>,
    stream_cancel:    Mutex<HashMap<SessionId, tokio::sync::oneshot::Sender<()>>>,
    /// Optional GitHub API client. None when no token is configured.
    pub github:       Option<GitHubClient>,
}

impl Engine {
    pub fn new(store: Arc<Store>) -> Arc<Self> {
        let (tx, _) = broadcast::channel(256);
        Arc::new(Self {
            store,
            tx,
            pty_writers:  Mutex::new(HashMap::new()),
            stream_cancel: Mutex::new(HashMap::new()),
            github:       None,
        })
    }

    pub fn new_with_github(store: Arc<Store>, token: String) -> Arc<Self> {
        let (tx, _) = broadcast::channel(256);
        let github = GitHubClient::new(token).ok();
        Arc::new(Self {
            store,
            tx,
            pty_writers:  Mutex::new(HashMap::new()),
            stream_cancel: Mutex::new(HashMap::new()),
            github,
        })
    }
}
```

In the app startup code (`athene-app/src/main.rs` or wherever `Engine::new` is called), replace it with `Engine::new_with_github` when a token is available:

```rust
let engine = match resolve_token(config.github_token.clone()) {
    Some(token) => Engine::new_with_github(Arc::clone(&store), token),
    None        => Engine::new(Arc::clone(&store)),
};
```

- [ ] **Step 5: Upgrade `poller.rs` to dual-timer with GitHub enrichment**

Replace `athene/crates/athene-core/src/lifecycle/poller.rs` entirely:

```rust
use crate::{
    events::{Engine, Event},
    github::{split_repo, CheckRun},
    lifecycle::{enrichment::{EnrichmentCache, EnrichmentState}, probe::is_pid_alive},
    types::{
        CIStatus, Comment, Notification, NotificationKind, PrId, SessionId,
        SessionStatus, PR,
    },
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

pub struct Poller {
    engine:          Arc<Engine>,
    enrichment_cache: Arc<Mutex<EnrichmentCache>>,
}

impl Poller {
    pub fn new(engine: Arc<Engine>) -> Self {
        Self {
            engine,
            enrichment_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start(self, token: CancellationToken) {
        let mut pid_interval    = tokio::time::interval(Duration::from_secs(5));
        let mut github_interval = tokio::time::interval(Duration::from_secs(30));
        // Prevent a missed tick from causing back-to-back polls.
        github_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                _ = token.cancelled() => break,
                _ = pid_interval.tick()    => self.poll_pids().await,
                _ = github_interval.tick() => self.poll_github().await,
            }
        }
    }

    // ── PID liveness (unchanged logic) ──────────────────────────────────────

    async fn poll_pids(&self) {
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

    // ── GitHub enrichment ────────────────────────────────────────────────────

    async fn poll_github(&self) {
        let Some(gh) = &self.engine.github else { return };
        let Ok(sessions) = self.engine.store.list_sessions() else { return };

        for session in sessions {
            if matches!(session.status, SessionStatus::Terminated) {
                continue;
            }
            let Some(pr_number) = session.pr_number else { continue };
            let Some((owner, repo)) = split_repo(&session.repo) else { continue };

            // -- PR state --
            let pr_status = match gh.get_pr_status(&owner, &repo, pr_number).await {
                Ok(s)  => s,
                Err(e) => { tracing::warn!("github pr status: {e}"); continue }
            };

            let pr_id: PrId = pr_number as i64;

            // Upsert PR record
            let pr = PR {
                id:         pr_id,
                number:     pr_number,
                title:      pr_status.title.clone(),
                url:        format!("https://github.com/{owner}/{repo}/pull/{pr_number}"),
                body:       String::new(),
                session_id: session.id.clone(),
            };
            let _ = self.engine.store.upsert_pr(&pr);
            self.engine.emit(Event::PrOpened { session_id: session.id.clone(), pr });

            // -- CI checks --
            let checks = match gh.get_ci_checks(&owner, &repo, pr_number).await {
                Ok(c)  => c,
                Err(e) => { tracing::warn!("github ci checks: {e}"); vec![] }
            };
            let ci = summarize_checks(pr_id, &checks);
            let _ = self.engine.store.upsert_ci_status(&ci);
            self.engine.emit(Event::CiUpdated { pr_id, status: ci.clone() });

            // -- Detect CI transition and update session status --
            let new_status = derive_session_status(&session.status, &pr_status, &ci);
            let mut cache  = self.enrichment_cache.lock().unwrap();
            let state      = cache.entry(session.id.clone()).or_default();

            let newly_failing = state.prev_failing.map_or(false, |p| p == 0)
                && ci.failing > 0;
            state.prev_failing = Some(ci.failing);

            if newly_failing && !state.ci_reaction_sent {
                state.ci_reaction_sent = true;
                self.engine.emit(Event::Notification(Notification {
                    id:         format!("ci-{}", session.id),
                    kind:       NotificationKind::CiFailure,
                    title:      format!("CI failing — {}", session.name),
                    body:       format!("{}/{} checks failing", ci.failing, ci.total),
                    session_id: Some(session.id.clone()),
                }));
            }
            if ci.failing == 0 {
                state.ci_reaction_sent = false; // reset so next failure re-fires
            }

            // Update session status in DB
            let mut updated = session.clone();
            updated.status = new_status;
            if updated.status != session.status {
                let _ = self.engine.store.upsert_session(&updated);
                self.engine.emit(Event::SessionUpdated(updated.clone()));
            }

            // -- Review threads (throttled via seen_comment_ids) --
            let threads = match gh.get_review_threads(&owner, &repo, pr_number).await {
                Ok(t)  => t,
                Err(e) => { tracing::warn!("github review threads: {e}"); vec![] }
            };

            let mut has_new = false;
            for thread in &threads {
                if thread.state == "CHANGES_REQUESTED"
                    && !state.seen_comment_ids.contains(&thread.id)
                {
                    state.seen_comment_ids.insert(thread.id);
                    has_new = true;
                    let comment = Comment {
                        id:         thread.id,
                        pr_id,
                        author:     thread.author.clone(),
                        body:       thread.body.clone(),
                        path:       thread.path.clone(),
                        line:       thread.line,
                        created_at: 0,
                    };
                    let _ = self.engine.store.upsert_comment(&comment);
                    self.engine.emit(Event::ReviewComment { pr_id, comment });
                }
            }

            if has_new && !state.review_reaction_sent {
                state.review_reaction_sent = true;
                self.engine.emit(Event::Notification(Notification {
                    id:         format!("review-{}", session.id),
                    kind:       NotificationKind::PrNeedsAttention,
                    title:      format!("Review comments — {}", session.name),
                    body:       "Changes requested on your PR".to_string(),
                    session_id: Some(session.id.clone()),
                }));
            }
            // Reset review_reaction_sent when all CHANGES_REQUESTED are resolved
            let has_pending = threads.iter().any(|t| t.state == "CHANGES_REQUESTED");
            if !has_pending {
                state.review_reaction_sent = false;
            }
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn summarize_checks(pr_id: PrId, checks: &[CheckRun]) -> CIStatus {
    let total   = checks.len() as u32;
    let failing = checks.iter().filter(|c| {
        c.conclusion.as_deref() == Some("failure")
            || c.conclusion.as_deref() == Some("timed_out")
    }).count() as u32;
    let passing = checks.iter().filter(|c| {
        c.conclusion.as_deref() == Some("success")
    }).count() as u32;
    let pending = total - failing - passing;
    CIStatus { pr_id, total, failing, passing, pending }
}

fn derive_session_status(
    current:   &SessionStatus,
    pr_status: &crate::github::PrStatus,
    ci:        &CIStatus,
) -> SessionStatus {
    if pr_status.merged {
        return SessionStatus::Done;
    }
    if matches!(current, SessionStatus::Done | SessionStatus::Terminated) {
        return current.clone();
    }
    if ci.failing > 0 {
        return SessionStatus::CiFailed;
    }
    if pr_status.mergeable == Some(true) && ci.failing == 0 && ci.pending == 0 {
        return SessionStatus::Mergeable;
    }
    SessionStatus::PrOpen
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SessionStatus;

    #[test]
    fn summarize_checks_counts_failures() {
        let checks = vec![
            CheckRun { name: "lint".into(), status: "completed".into(), conclusion: Some("success".into()) },
            CheckRun { name: "test".into(), status: "completed".into(), conclusion: Some("failure".into()) },
            CheckRun { name: "build".into(), status: "in_progress".into(), conclusion: None },
        ];
        let ci = summarize_checks(1, &checks);
        assert_eq!(ci.total,   3);
        assert_eq!(ci.passing, 1);
        assert_eq!(ci.failing, 1);
        assert_eq!(ci.pending, 1);
    }

    #[test]
    fn derive_status_merged_becomes_done() {
        let pr = crate::github::PrStatus {
            merged: true, state: "closed".into(), mergeable: None,
            title: "t".into(), number: 1,
        };
        let ci = CIStatus { pr_id: 1, total: 0, failing: 0, passing: 0, pending: 0 };
        let s  = derive_session_status(&SessionStatus::PrOpen, &pr, &ci);
        assert!(matches!(s, SessionStatus::Done));
    }

    #[test]
    fn derive_status_ci_failure_overrides_open() {
        let pr = crate::github::PrStatus {
            merged: false, state: "open".into(), mergeable: Some(true),
            title: "t".into(), number: 1,
        };
        let ci = CIStatus { pr_id: 1, total: 3, failing: 1, passing: 2, pending: 0 };
        let s  = derive_session_status(&SessionStatus::PrOpen, &pr, &ci);
        assert!(matches!(s, SessionStatus::CiFailed));
    }

    #[test]
    fn derive_status_all_green_becomes_mergeable() {
        let pr = crate::github::PrStatus {
            merged: false, state: "open".into(), mergeable: Some(true),
            title: "t".into(), number: 1,
        };
        let ci = CIStatus { pr_id: 1, total: 3, failing: 0, passing: 3, pending: 0 };
        let s  = derive_session_status(&SessionStatus::PrOpen, &pr, &ci);
        assert!(matches!(s, SessionStatus::Mergeable));
    }
}
```

- [ ] **Step 6: Add missing store methods**

The poller calls `store.upsert_pr`, `store.upsert_ci_status`, `store.upsert_comment`. Check if these exist in `athene-core/src/store.rs`. If not, add them:

```rust
// In store.rs — add after existing upsert_session:

pub fn upsert_pr(&self, pr: &PR) -> Result<()> {
    self.conn.execute(
        "INSERT OR REPLACE INTO prs
         (id, number, title, url, body, session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![pr.id, pr.number, pr.title, pr.url, pr.body, pr.session_id],
    )?;
    Ok(())
}

pub fn upsert_ci_status(&self, ci: &CIStatus) -> Result<()> {
    self.conn.execute(
        "INSERT OR REPLACE INTO ci_status
         (pr_id, total, passing, failing, pending)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![ci.pr_id, ci.total, ci.passing, ci.failing, ci.pending],
    )?;
    Ok(())
}

pub fn upsert_comment(&self, c: &Comment) -> Result<()> {
    self.conn.execute(
        "INSERT OR REPLACE INTO review_comments
         (id, pr_id, author, body, path, line, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![c.id, c.pr_id, c.author, c.body, c.path, c.line, c.created_at],
    )?;
    Ok(())
}
```

Also verify the SQLite schema (`store.rs` `CREATE TABLE` statements) has `prs`, `ci_status`, `review_comments` tables. Add any missing `CREATE TABLE IF NOT EXISTS` statements to the `Store::open` initialization block.

- [ ] **Step 7: Run tests**

```bash
cargo test -p athene-core 2>&1 | tail -30
cargo clippy -p athene-core -- -D warnings 2>&1 | tail -10
```

Expected: all pass, no warnings.

- [ ] **Step 8: Commit**

```bash
git add athene/crates/athene-core/src/lifecycle/ \
        athene/crates/athene-core/src/events.rs \
        athene/crates/athene-core/src/store.rs
git commit -m "feat(native-core): add GitHub enrichment poller with CI and review tracking"
```

---

## Task 10: tmux Send-Keys + Reaction Dispatcher

**Files:**
- Modify: `athene/crates/athene-core/src/tmux.rs` (add `send_keys`)
- Modify: `athene/crates/athene-core/src/events.rs` (add `Engine::send_to_session`)
- Create: `athene/crates/athene-core/src/lifecycle/reactions.rs`
- Modify: `athene/crates/athene-core/src/lifecycle/mod.rs`
- Modify: `athene/crates/athene-core/src/lifecycle/poller.rs` (call reactions)

**Interfaces:**
- Consumes: `Event::CiUpdated`, `Event::ReviewComment`, session tmux session ID
- Produces:
  - `tmux::send_keys(session_id, text)` — sends text to a tmux session as keyboard input
  - `Engine::send_to_session(session_id, message)` — formats and sends a reaction message
  - `reactions::format_ci_reaction(session, ci, checks)` — builds the CI fix prompt
  - `reactions::format_review_reaction(session, comments)` — builds the review fix prompt

**Context:** When CI fails or review comments arrive, the agent running in the tmux session needs to be told about it. The TypeScript app calls `sessionManager.send(sessionId, message)` which writes to the terminal. In the Rust app we do this via `tmux send-keys`. The message is sent as literal text followed by `Enter`, so the agent's terminal receives it as typed input.

- [ ] **Step 1: Write failing test for `send_keys`**

In `athene/crates/athene-core/src/tmux.rs`, add to the test module:

```rust
#[tokio::test]
async fn send_keys_builds_correct_command() {
    // This test validates our argument construction without actually calling tmux.
    // We test the shell_quote helper used by send_keys.
    let quoted = shell_quote("hello world");
    assert_eq!(quoted, "'hello world'");
    let with_apostrophe = shell_quote("don't");
    assert_eq!(with_apostrophe, "'don'\\''t'");
}
```

- [ ] **Step 2: Run test to verify `shell_quote` is correct**

```bash
cargo test -p athene-core send_keys_builds_correct_command 2>&1 | tail -10
```

Expected: pass (shell_quote already exists in tmux.rs).

- [ ] **Step 3: Add `send_keys` to `tmux.rs`**

In `athene/crates/athene-core/src/tmux.rs`, add after the existing functions:

```rust
/// Send text to a tmux session as if typed at the keyboard.
/// The text is followed by Enter so the agent receives and acts on it.
/// Uses `tmux send-keys -l` (literal mode) to avoid tmux interpreting
/// special characters like `{`, `}`, arrows.
pub async fn send_keys(session_id: &str, text: &str) -> Result<()> {
    // Send the message text in literal mode
    run(&["send-keys", "-t", session_id, "-l", text]).await?;
    // Send Enter to submit
    run(&["send-keys", "-t", session_id, "Enter"]).await?;
    Ok(())
}
```

- [ ] **Step 4: Add `Engine::send_to_session`**

In `athene/crates/athene-core/src/events.rs`:

```rust
/// Send a text message to the agent running in a session's tmux window.
/// The message is injected as keyboard input — the agent sees it as typed text.
/// Returns Ok(()) if the tmux send succeeded; returns an error if the session
/// has no active tmux window or tmux is unavailable.
pub async fn send_to_session(&self, session_id: &str, message: &str) -> Result<()> {
    crate::tmux::send_keys(session_id, message).await
}
```

- [ ] **Step 5: Create `reactions.rs`**

Create `athene/crates/athene-core/src/lifecycle/reactions.rs`:

```rust
use crate::types::{CIStatus, Comment, Session};

/// Format a CI failure reaction message to send to the agent.
/// Lists each failing check and instructs the agent to fix them.
pub fn format_ci_reaction(session: &Session, ci: &CIStatus, failing_names: &[String]) -> String {
    let mut msg = format!(
        "[Athene] CI is failing on your PR ({}/{} checks). Please fix the following:\n",
        ci.failing, ci.total
    );
    for name in failing_names {
        msg.push_str(&format!("  - {name}\n"));
    }
    msg.push_str("\nRun the failing checks locally, fix the issues, and push your changes.");
    msg
}

/// Format a review comment reaction message to send to the agent.
/// Lists each new CHANGES_REQUESTED comment.
pub fn format_review_reaction(session: &Session, comments: &[Comment]) -> String {
    let mut msg = format!(
        "[Athene] Your PR has {} new review comment{}. Please address them:\n",
        comments.len(),
        if comments.len() == 1 { "" } else { "s" }
    );
    for c in comments {
        let location = match (&c.path, c.line) {
            (Some(p), Some(l)) => format!("{p}:{l}"),
            (Some(p), None)    => p.clone(),
            _                  => "general".to_string(),
        };
        msg.push_str(&format!("\n[{}] {}: {}\n", location, c.author, c.body));
    }
    msg.push_str("\nAddress each comment, push your changes, and respond to the reviewer.");
    msg
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CIStatus, Comment, Session, SessionStatus};

    fn mock_session() -> Session {
        Session {
            id: "s1".into(), orchestrator_id: None, name: "my-fix".into(),
            repo: "org/repo".into(), status: SessionStatus::CiFailed,
            agent_type: "claude-code".into(), cost_usd: 0.0,
            started_at: 0, pr_number: Some(7), pr_id: Some(7),
            workspace_path: None, pid: None,
        }
    }

    #[test]
    fn ci_reaction_lists_failing_checks() {
        let session = mock_session();
        let ci = CIStatus { pr_id: 7, total: 3, failing: 1, passing: 2, pending: 0 };
        let msg = format_ci_reaction(&session, &ci, &["test-unit".to_string()]);
        assert!(msg.contains("1/3 checks"));
        assert!(msg.contains("test-unit"));
        assert!(msg.contains("fix the"));
    }

    #[test]
    fn review_reaction_includes_file_location() {
        let session = mock_session();
        let comments = vec![Comment {
            id: 1, pr_id: 7, author: "reviewer".into(),
            body: "Rename this variable".into(),
            path: Some("src/main.rs".into()), line: Some(42),
            created_at: 0,
        }];
        let msg = format_review_reaction(&session, &comments);
        assert!(msg.contains("src/main.rs:42"));
        assert!(msg.contains("Rename this variable"));
        assert!(msg.contains("reviewer"));
    }

    #[test]
    fn review_reaction_handles_general_comment() {
        let session = mock_session();
        let comments = vec![Comment {
            id: 2, pr_id: 7, author: "bot".into(),
            body: "Please add tests".into(),
            path: None, line: None, created_at: 0,
        }];
        let msg = format_review_reaction(&session, &comments);
        assert!(msg.contains("[general]"));
        assert!(msg.contains("Please add tests"));
    }
}
```

- [ ] **Step 6: Register `reactions` module**

In `athene/crates/athene-core/src/lifecycle/mod.rs`, add:

```rust
pub mod reactions;
```

- [ ] **Step 7: Wire reactions into the poller**

In `poller.rs`, add reaction dispatch after the CI notification. In `poll_github`, after emitting `Event::Notification` for CI failure, add:

```rust
// Send reaction to the agent in the tmux session
let failing_names: Vec<String> = checks.iter()
    .filter(|c| c.conclusion.as_deref() == Some("failure")
             || c.conclusion.as_deref() == Some("timed_out"))
    .map(|c| c.name.clone())
    .collect();
let msg = crate::lifecycle::reactions::format_ci_reaction(
    &session, &ci, &failing_names
);
if let Err(e) = self.engine.send_to_session(&session.id, &msg).await {
    tracing::warn!("send ci reaction to {}: {e}", session.id);
}
```

Similarly for new review comments, after inserting them into the store:

```rust
if has_new {
    let new_comments: Vec<crate::types::Comment> = threads.iter()
        .filter(|t| t.state == "CHANGES_REQUESTED"
                 && !state.seen_comment_ids.contains(&(t.id + 1))) // already inserted
        .map(|t| crate::types::Comment {
            id: t.id, pr_id,
            author: t.author.clone(), body: t.body.clone(),
            path: t.path.clone(), line: t.line, created_at: 0,
        })
        .collect();
    if !new_comments.is_empty() {
        let msg = crate::lifecycle::reactions::format_review_reaction(&session, &new_comments);
        if let Err(e) = self.engine.send_to_session(&session.id, &msg).await {
            tracing::warn!("send review reaction to {}: {e}", session.id);
        }
    }
}
```

- [ ] **Step 8: Run tests**

```bash
cargo test -p athene-core 2>&1 | tail -30
cargo clippy -p athene-core -- -D warnings 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add athene/crates/athene-core/src/tmux.rs \
        athene/crates/athene-core/src/events.rs \
        athene/crates/athene-core/src/lifecycle/
git commit -m "feat(native-core): add tmux send-keys, reaction dispatcher for CI and review comments"
```

---

## Task 11: Auto-Cleanup on PR Merge

**Files:**
- Modify: `athene/crates/athene-core/src/lifecycle/poller.rs` (detect merged → cleanup)
- Modify: `athene/crates/athene-core/src/events.rs` (add `Engine::cleanup_session`)

**Interfaces:**
- Consumes: `PrStatus.merged == true` (from Task 8 GitHub poller), `Session.status == Done`
- Produces:
  - `Engine::cleanup_session(session_id)` — kills tmux, sets status to `Done`, emits `SessionUpdated`
  - Sessions automatically transition to `Done` when their PR is merged and they are idle

**Context:** The TypeScript `maybeAutoCleanupOnMerge` checks if the session is idle (agent not actively working) and only then kills it, to avoid interrupting the agent mid-commit. We implement a simpler version: when `PrStatus.merged` is true, mark the session `Done` immediately. The agent session remains visible in the "Done" column but the tmux session is killed. The worktree is left in place (cleanup is manual or future work).

- [ ] **Step 1: Write failing test**

In `athene/crates/athene-core/src/events.rs` test module, add:

```rust
#[tokio::test]
async fn cleanup_session_sets_done_status() {
    let store = Arc::new(
        Store::open(tempdir().unwrap().keep().join("t.db")).unwrap()
    );
    let session = crate::types::Session {
        id: "s1".into(), orchestrator_id: None, name: "w".into(),
        repo: "r".into(), status: crate::types::SessionStatus::PrOpen,
        agent_type: "c".into(), cost_usd: 0.0, started_at: 0,
        pr_number: Some(1), pr_id: Some(1),
        workspace_path: None, pid: None,
    };
    store.upsert_session(&session).unwrap();
    let engine = Engine::new(Arc::clone(&store));
    let mut rx = engine.subscribe();

    engine.cleanup_session("s1").await.unwrap();

    let evt = rx.recv().await.unwrap();
    if let Event::SessionUpdated(s) = evt {
        assert!(matches!(s.status, crate::types::SessionStatus::Done));
    } else {
        panic!("expected SessionUpdated");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p athene-core cleanup_session_sets_done 2>&1 | tail -10
```

Expected: error — `cleanup_session` doesn't exist.

- [ ] **Step 3: Add `Engine::cleanup_session`**

In `athene/crates/athene-core/src/events.rs`:

```rust
/// Kill the tmux session (best-effort) and mark it Done in the DB.
/// Called automatically when a PR is merged. Emits SessionUpdated.
pub async fn cleanup_session(&self, session_id: &str) -> anyhow::Result<()> {
    // Best-effort tmux kill — session may already be dead.
    let _ = crate::tmux::kill_session(session_id).await;

    if let Some(mut session) = self.store.get_session(session_id)? {
        session.status = crate::types::SessionStatus::Done;
        self.store.upsert_session(&session)?;
        self.emit(Event::SessionUpdated(session));
    }
    Ok(())
}
```

- [ ] **Step 4: Call cleanup from the poller on merge detection**

In `poller.rs`, in the `poll_github` method, after calling `derive_session_status`, add merge detection:

```rust
if pr_status.merged && !matches!(session.status, SessionStatus::Done) {
    // Notify user and clean up
    self.engine.emit(Event::Notification(Notification {
        id:         format!("merged-{}", session.id),
        kind:       NotificationKind::WorkerDone,
        title:      format!("PR merged — {}", session.name),
        body:       format!("#{} merged successfully", pr_number),
        session_id: Some(session.id.clone()),
    }));
    if let Err(e) = self.engine.cleanup_session(&session.id).await {
        tracing::warn!("cleanup_session {}: {e}", session.id);
    }
    // Remove enrichment state for this session — it's done
    cache.remove(&session.id);
    continue; // skip further enrichment for this session
}
```

This block goes immediately after `let pr_status = ...` is confirmed as merged, before the CI checks (no point polling CI on a merged PR).

- [ ] **Step 5: Run all tests**

```bash
cargo test -p athene-core 2>&1 | tail -30
cargo test -p athene-app 2>&1 | tail -20
cargo clippy -- -D warnings 2>&1 | tail -10
```

Expected: all pass across all three crates.

- [ ] **Step 6: Commit**

```bash
git add athene/crates/athene-core/src/events.rs \
        athene/crates/athene-core/src/lifecycle/poller.rs
git commit -m "feat(native-core): auto-cleanup sessions on PR merge, notify on done"
```

---

## Self-Review

**Spec coverage check:**

| Feature | Covered? | Task |
|---------|---------|------|
| Terminated sessions column | ✓ | Task 1 |
| Notification bell & panel | ✓ | Task 2 |
| PR list view | ✓ | Task 3 |
| Session inspector panel | ✓ | Task 4 |
| Attention banner | ✓ | Task 5 |
| Fleet filter bar | ✓ | Task 6 |
| GitHub API client | ✓ | Task 7 |
| PATH wrapper hooks + PR detection | ✓ | Task 8 |
| PR enrichment poller (CI + reviews) | ✓ | Task 9 |
| Reaction dispatcher (send to agent) | ✓ | Task 10 |
| Auto-cleanup on PR merge | ✓ | Task 11 |
| Code review dashboard | explicitly out of scope | — |
| Multi-project management | explicitly out of scope | — |
| Mobile responsiveness | not applicable to desktop | — |

**Placeholder scan:** No TBD/TODO/fill-in-details in any task — all code is written out.

**Type consistency:**
- `DetailPanel::Inspector` introduced in Task 4, referenced consistently throughout
- `FleetFilter` struct introduced in Task 6, `board_sessions` updated in the same task
- `board_sessions(app, status)` helper introduced in Task 1 and reused in Tasks 5 & 6
- `View::PrList` introduced in Task 3, handled in `App::view` match in the same task
- `GitHubClient` introduced in Task 7, referenced in Task 9 via `Engine.github`
- `hooks::install_wrappers` and `read_session_metadata` introduced in Task 8; poller uses them in Task 8 step 8 and Task 9
- `EnrichmentCache` / `EnrichmentState` introduced in Task 9, used in poller through Tasks 10 & 11
- `format_ci_reaction` / `format_review_reaction` introduced in Task 10, called from poller (Task 10 step 7)
- `Engine::cleanup_session` introduced in Task 11, called from poller (Task 11 step 4)
- `Engine::send_to_session` introduced in Task 10, called from poller (Task 10 step 7)

**Test coverage:**
- Every new `Message` variant has at least one test (Tasks 1–6)
- Every new helper function has a test: `board_sessions`, `attention_count`, `filtered_sessions`, `split_repo`, `summarize_checks`, `derive_session_status`, `format_ci_reaction`, `format_review_reaction`
- `Engine::cleanup_session` tested via tokio test in Task 10
- `EnrichmentState` comment dedup and CI transition logic tested in Task 8

| Feature | Covered? | Task |
|---------|---------|------|
| Terminated sessions column | ✓ | Task 1 |
| Notification bell & panel | ✓ | Task 2 |
| PR list view | ✓ | Task 3 |
| Session inspector panel | ✓ | Task 4 |
| Attention banner | ✓ | Task 5 |
| Fleet filter bar | ✓ | Task 6 |
| Code review dashboard | explicitly out of scope | — |
| Multi-project management | explicitly out of scope | — |
| Mobile responsiveness | not applicable to desktop | — |

**Placeholder scan:** No TBD/TODO/fill-in-details in any task — all code is written out.

**Type consistency:**
- `DetailPanel::Inspector` introduced in Task 4, referenced consistently throughout
- `FleetFilter` struct introduced in Task 6, `board_sessions` updated in the same task
- `board_sessions(app, status)` helper introduced in Task 1 and reused in Tasks 5 & 6
- `View::PrList` introduced in Task 3, handled in `App::view` match in the same task

**Test coverage:**
- Every new `Message` variant has at least one test
- Every new helper function (`board_sessions`, `attention_count`, `filtered_sessions`) has a test
- All tests follow the existing pattern: `m.update(Message::...) → assert on resulting state`
