# Fleet Kanban — Design Spec

**Date:** 2026-06-24
**Status:** Approved

## Problem

Each project and orchestrator has its own kanban board today. Navigating across them is painful enough that users avoid per-project views entirely. There is no way to see all active workers across the fleet in one place, nor to understand which orchestrator session is responsible for which block of work.

## Goal

A single global `/fleet` kanban board that shows every worker session across all projects, grouped by the orchestrator session that spawned it, with lifecycle status as the column axis and a per-orchestrator filter.

---

## Data Model

### New field: `parentSessionId`

Add `parentSessionId?: string` to the `Session` interface in `packages/core/src/types.ts`.

- Stamped at spawn time with the orchestrator session's ID.
- Add a helper `getSessionParentId(session: Session): string | null` alongside the existing `getSessionOrchestratorOwner()`.
- Both fields are kept: `orchestratorOwner` (name, for display and cross-session grouping) and `parentSessionId` (session ID, for precise per-run attribution).
- Sessions predating this field fall back to grouping by `orchestratorOwner` name.

### Stamping

The `parentSessionId` is written when `athene spawn` creates a worker session. The spawning orchestrator's session ID is available from the current session context at that point.

---

## Routing

| Route | Before | After |
|-------|--------|-------|
| `/` | Redirects to first project board | Unchanged |
| `/fleet` | Does not exist | **New** — global fleet kanban |
| `/project/[id]` | Project kanban board | Settings page (no kanban) |

The `/fleet` route is purely additive. The root path and per-project routes are not removed.

---

## Sidebar

Order (top to bottom):

1. **Fleet** — nav item linking to `/fleet` (top, above the divider)
2. **Orchestrators** — filter list (clickable, syncs with fleet board filter chips)
3. Divider
4. **Projects** — links to `/project/[id]` settings pages, with a ⚙ glyph to signal settings

Clicking an orchestrator in the sidebar filters the fleet board to that orchestrator's sessions. The filter state is shared between the sidebar list and the top filter chips.

---

## Fleet Kanban (`/fleet`)

### Columns

Same five attention levels as the current simple mode:

`working → action → pending → merge → done`

Column structure and attention-level mapping are unchanged.

### Orchestrator groups

Within each column, worker cards are grouped by `parentSessionId` (one orchestrator session = one group = one block of work). Each group has a header:

```
● fleet-meta · 2h ago
[worker card]
[worker card]
```

- Colored dot — unique color per orchestrator session, assigned by hashing `parentSessionId` into a fixed 10-color palette.
- Orchestrator name — from `orchestratorOwner`.
- Start time — relative timestamp of the orchestrator session.
- When the same orchestrator name has multiple sessions active, each gets its own group with distinct color + start time to differentiate.

Orchestrator sessions themselves do **not** appear as kanban cards — they are group headers only.

### Worker cards

Cards reuse the existing `SessionCard` component. The orchestrator color is passed as the `projectAccent` slot (same mechanism as per-project color today, repurposed for per-orchestrator color). This gives each card a colored left border matching its group header dot.

Card content: worker session ID / branch name, project chip, status badge, relative age.

Clicking a card navigates to the existing session detail view (terminal, PR info, logs) — no change to that flow.

### Filter bar

A row of pill chips at the top of the board, one per orchestrator **name** (collapsed across sessions):

```
[All]  [● fleet-meta · 2h ago]  [● fleet-meta · 14m ago]  [● api-orch · 5m ago]
```

- "All" is the default.
- Selecting an orchestrator chip shows only that orchestrator's groups across all columns.
- Chips and sidebar orchestrator list are kept in sync.

### Session count

A live count (`N workers`) displayed in the top bar, updated when the filter changes.

---

## Per-project Settings Page (`/project/[id]`)

The kanban board is removed. The page shows:

- Project name and config summary (tracker, SCM, notifier settings) — read-only, sourced from `agent-orchestrator.yaml`.
- A small active-session count badge on the sidebar project entry for at-a-glance awareness.

No interactive editing of config in this iteration — display only.

---

## Color System

A fixed palette of 10 orchestrator colors, distinct from the existing project color slots:

| Slot | Color |
|------|-------|
| 0 | Violet `#7c3aed` |
| 1 | Cyan `#0891b2` |
| 2 | Rose `#e11d48` |
| 3 | Amber `#d97706` |
| 4 | Emerald `#059669` |
| 5 | Sky `#0284c7` |
| 6 | Fuchsia `#a21caf` |
| 7 | Orange `#c2410c` |
| 8 | Teal `#0f766e` |
| 9 | Indigo `#4338ca` |

Color assigned by: `hash(parentSessionId) % 10`. Defined as CSS custom properties in `globals.css` alongside the existing project color tokens.

---

## Data Flow

```
useSessionEvents() [no project filter]
  → all sessions across all projects
  → filter out orchestrator sessions (isOrchestratorSession())
  → group by parentSessionId (fallback: orchestratorOwner)
  → group by attentionLevel (column)
  → render FleetBoard
        → FleetColumn (per attention level)
              → OrchestratorGroup (per parentSessionId)
                    → SessionCard (per worker)
```

SSE interval and `useSessionEvents` hook are unchanged (5s, no project filter needed since sidebar already uses unscoped sessions).

---

## Components

| Component | Location | Notes |
|-----------|----------|-------|
| `FleetBoard` | `packages/web/src/components/FleetBoard.tsx` | Top-level board, filter state |
| `FleetColumn` | `packages/web/src/components/FleetColumn.tsx` | One per attention level |
| `OrchestratorGroup` | `packages/web/src/components/OrchestratorGroup.tsx` | Group header + card list |
| `FleetFilterBar` | `packages/web/src/components/FleetFilterBar.tsx` | Filter chips row |
| `/fleet` page | `packages/web/src/app/fleet/page.tsx` | Route entry point |

`SessionCard` is reused as-is. `ProjectSidebar` is updated to add the Fleet nav entry and reorder sections. The `/project/[id]` page is updated to remove the kanban and show settings.

---

## Constraints Preserved

- C-01: No new UI component libraries
- C-02: No inline styles in new/modified code
- C-04: Component files max 400 lines
- C-05: Dark theme preserved
- C-06: Next.js App Router only
- C-12: Test files for all new components
- C-14: SSE 5s interval unchanged
