# Athene Native App — Feature Reference

The native app (`athene/`) is a Rust/Iced desktop application that mirrors the TypeScript web dashboard while running fully offline without a browser. This document describes what each feature does and how the pieces fit together.

---

## UI Features

### Kanban Fleet Board

The fleet board shows all active sessions as cards in status columns. Sessions move through columns automatically as the GitHub watcher updates their status.

| Column | When a session appears here |
|---|---|
| Working | Freshly spawned; agent is writing code |
| PR Open | Agent created a PR; CI is running |
| CI Failed | One or more CI checks failed |
| Review | Reviewer left CHANGES_REQUESTED comments |
| Mergeable | All checks green, no pending review requests |
| Done | PR was merged; session cleaned up |
| Terminated | tmux session exited unexpectedly |

**Attention banner** — if any sessions are in CI Failed or Review state, a red bar appears above the columns showing a count: e.g. _"2 CI failures · 1 awaiting review"_. This gives you an at-a-glance view without scanning every column.

**Filter bar** — type in the search box to filter cards by session name or repository. The count updates live: _"2/7"_ means two of seven sessions match. Press ✕ to clear.

### Sidebar

The sidebar lists all orchestrators and their workers. Each entry shows a status dot (colour-matched to the kanban column) and the repo short-name.

**Notification bell** — the bell icon in the header shows a count badge when there are unread notifications. Clicking it opens a dropdown panel listing events such as CI failures, new review comments, PRs ready to merge, and completed sessions. Each notification navigates to the relevant session when clicked. "Clear all" dismisses the full list.

**PRs button** — next to the bell, shows a count of open PRs. Clicking navigates to the PR list view.

### PR List View

A table of every open pull request across all sessions, sorted by PR number (newest first). Columns:

| Column | Content |
|---|---|
| # | PR number, links to session detail on click |
| Title | PR title from GitHub |
| Session | Name of the worker session that created the PR |
| CI | Badge showing passing/total checks; red if any are failing |

Clicking any row navigates to the session detail view for that PR's session.

### Session Detail

Tapping a session card opens the detail view. Three panel tabs at the top:

- **Terminal** — live VT100 terminal showing the agent's output. Input is forwarded to the tmux session.
- **Info** — PR title, number, URL, body (truncated), CI status, and review comments.
- **Inspector** — raw session metadata: session ID, repo, status string, agent type, orchestrator, cost, PR number, PID, workspace path, and started-at timestamp. Useful for debugging.

The info panel and terminal can be shown side-by-side via the **Split** toggle.

---

## GitHub Watcher

The GitHub watcher is the engine that keeps the kanban board up to date without any manual intervention. It has three layers.

### 1. PATH Wrapper Hooks (PR Detection)

When a session is spawned, Athene installs two shell wrapper scripts:

```
~/.config/athene/bin/gh
~/.config/athene/bin/git
```

These are prepended to `PATH` in every tmux session Athene creates. When the agent runs `gh pr create`, the wrapper:

1. Runs the real `gh` binary and captures its output.
2. Extracts the PR URL with a regex (`https://…/pull/NNN`).
3. Writes the PR number and URL to a per-session JSON metadata file at `~/.config/athene/sessions/{session_id}.json`.

Similarly, the `git` wrapper records the branch name when the agent creates a new branch (`git checkout -b` or `git switch -c`).

Athene polls these metadata files every **5 seconds**. When it finds a `agentReportedPrNumber` that wasn't there before, it updates the session's `pr_number` in the store, transitions its status to `PrOpen`, and starts GitHub enrichment for that session.

> **Requirement:** `jq` must be available in the agent's PATH for the metadata write to succeed. If `jq` is absent the `gh` wrapper falls back to Node.js; the `git` wrapper silently skips the branch record.

### 2. Enrichment Poller (30-second cycle)

For every session that has a `pr_number`, Athene polls GitHub every **30 seconds** and:

1. **Fetches PR state** — merged, open, or closed; mergeable flag.
2. **Fetches CI checks** — uses the PR's head commit SHA (from step 1, no extra round-trip) to get all check runs.
3. **Fetches review threads** — PR reviews and inline comments.

From this data it derives the session's new status:

```
merged?           → Done
ci.failing > 0    → CiFailed
changes_requested → ReviewPending
all green         → Mergeable
otherwise         → PrOpen
```

Terminal states (`Done`, `Terminated`) are never overwritten — a merged PR whose tmux session died remains `Done`, not `Terminated`.

The poller also maintains a per-session **enrichment cache** that tracks:
- `prev_failing` — how many checks were failing last cycle (detects new failures).
- `seen_comment_ids` — which review comment IDs have already been dispatched (prevents re-sending the same comment twice).
- `ci_reaction_sent` / `review_reaction_sent` — whether a reaction has already been sent for the current failure/review set, so the agent isn't spammed.

### 3. Reaction Dispatcher (send-to-agent)

When the enrichment poller detects a new condition that requires agent action, it injects a formatted message directly into the agent's tmux terminal using `tmux send-keys -l` (literal mode) followed by Enter. The agent receives this as if the user had typed it.

**CI failure reaction** — fired when checks transition from passing (or unknown) to failing:

```
[Athene] CI is failing on your PR (1/3 checks). Please fix the following:
  - test-unit

Run the failing checks locally, fix the issues, and push your changes.
```

**Review comment reaction** — fired when new CHANGES_REQUESTED comments arrive that haven't been sent before:

```
[Athene] Your PR has 2 new review comments. Please address them:

[src/auth.rs:42] reviewer: Rename this variable to be more descriptive.

[general] bot: Please add tests for the error path.

Address each comment, push your changes, and respond to the reviewer.
```

Both reactions reset their "sent" flag once the underlying condition resolves (CI passes / no more CHANGES_REQUESTED), so a future regression fires again.

### 4. Auto-Cleanup on Merge

When the enrichment poller sees `pr_status.merged == true` for a session that isn't already `Done`:

1. Emits a `WorkerDone` notification: _"PR merged — {session name}"_.
2. Calls `Engine::cleanup_session` which kills the tmux session (best-effort) and sets the session status to `Done` in the store.
3. Removes the session from the enrichment cache.
4. Skips all further GitHub API calls for that session this cycle.

The session card moves to the Done column. The workspace (git worktree) is **not** removed automatically — that is left to the user or a future cleanup pass.

---

## Configuration

Add to `~/.config/athene/config.toml`:

```toml
# GitHub personal access token.
# Required for the GitHub watcher to function.
# Falls back to the GITHUB_TOKEN environment variable if absent.
github_token = "ghp_..."
```

**Required token scopes:**
- `repo` — for private repositories
- `public_repo` — for public repositories only

Without a token the GitHub watcher is disabled and sessions stay in `Working` status indefinitely.

---

## Session Lifecycle (end-to-end)

```
Spawn session
    │
    ├── tmux created with ATHENE_SESSION + ATHENE_DATA_DIR env vars
    ├── PATH prepended with ~/.config/athene/bin/
    │
    │   [agent works...]
    │
    ├── agent runs `gh pr create`
    │       └── gh wrapper writes pr_number to metadata JSON
    │
    ├── metadata poller (5s) detects pr_number
    │       └── session → PrOpen
    │
    ├── enrichment poller (30s) polls GitHub
    │       ├── CI failing  → session → CiFailed
    │       │                  └── send CI reaction to agent terminal
    │       ├── Review      → session → ReviewPending
    │       │                  └── send review reaction to agent terminal
    │       └── All green   → session → Mergeable
    │
    ├── PR merged on GitHub
    │       ├── enrichment poller detects merged
    │       ├── notification: "PR merged — {name}"
    │       ├── tmux session killed
    │       └── session → Done
    │
Done
```
