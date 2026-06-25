# Orchestrator Management — Design Spec

**Date:** 2026-06-24
**Branch:** fix/shared-layout

## Overview

Four new management capabilities for orchestrators in the Athene dashboard:

1. **Remove orchestrator** — kill all sessions underneath and delete from config
2. **Rename (display label)** — editable display name separate from stable UUID identity; individual worker sessions also get user-defined labels
3. **Scope** — choose which directories the orchestrator can see (list of paths, or "all")
4. **Discovery toggle** — enable/disable repo discovery per orchestrator

---

## Data Model

### Orchestrator config additions

Two new fields added to `OrchestratorEntryConfigSchema` in `packages/core/src/config.ts`:

```typescript
id: z.string().optional()    // UUID — stable identity, used in URLs + session metadata
name: z.string().optional()  // display label — optional, editable, defaults to YAML key
```

Example YAML after migration:

```yaml
orchestrators:
  Pcluster_CI:               # creation-time slug — never changes
    id: "550e8400-e29b-41d4-a716-446655440000"
    name: "Pcluster CI"
    scope: all
    discover: true
```

The YAML key is the creation-time slug and never changes. `id` is the stable UUID used everywhere else. `name` is the human-readable display label.

### Scope format change

`MetaScopeSchema` changes from `"all" | { projects: string[] }` to `"all" | string[]` where strings are absolute directory paths:

```typescript
const MetaScopeSchema = z.union([
  z.literal("all"),
  z.array(z.string()).min(1),  // absolute directory paths
]);
```

Existing `{ projects: [...] }` entries are migrated to directory path arrays during the startup normalization pass.

### Session metadata additions

Two new fields on sessions:

| Field | Type | Purpose |
|-------|------|---------|
| `orchestratorId` | `string \| undefined` | UUID of the owning orchestrator (stamped at spawn) |
| `sessionLabel` | `string \| undefined` | User-defined display name for individual sessions |

`orchestratorOwner` (name slug) is kept as-is for backward compatibility. Session filtering checks `orchestratorId` first, falls back to `orchestratorOwner` for sessions created before this change.

---

## Migration

### Startup migration (`ensureOrchestratorUUIDs`)

Called once from `getServices()` initialization. Idempotent:

1. Read config from disk
2. For each orchestrator entry missing `id`: assign `crypto.randomUUID()`
3. For each entry with `scope: { projects: [...] }`: convert to directory path array by looking up each project ID in the registered project set
4. Write back only if anything changed

No bulk backfill of session metadata needed — existing sessions without `orchestratorId` are handled by the fallback filter described above.

### Routing cutover

`app/orchestrators/[name]` → `app/orchestrators/[id]`. Hard cutover: old slug-based URLs 404. Since these are internal dashboard links regenerated from the in-memory config (which always has UUIDs after the startup migration), clients that refresh immediately get the correct UUID URLs. No redirects.

---

## API Layer

### New endpoints

**`PATCH /api/orchestrators/[id]`**
- Body: `{ name?: string, scope?: "all" | string[], discover?: boolean }`
- Finds config entry by UUID, calls `updateOrchestrator(configPath, id, updates)`, invalidates services cache
- Returns updated orchestrator

**`DELETE /api/orchestrators/[id]`**
- Finds all sessions where `orchestratorId === id` (+ legacy fallback on `orchestratorOwner` slug)
- Kills them concurrently with 10s best-effort timeout
- Removes entry from config via `deleteOrchestrator(configPath, id)`, invalidates cache
- Returns `{ killed: number }`

**`PATCH /api/sessions/[id]`**
- Body: `{ label: string }`
- Writes `sessionLabel` to session metadata via `updateMetadata()`
- Returns updated session

### Updated endpoints

**`POST /api/orchestrators/[name]/start`** → **`/api/orchestrators/[id]/start`**

Param changes from name slug to UUID. Route file moves from `[name]/start/route.ts` to `[id]/start/route.ts`.

### New config-writer functions

In `packages/core/src/orchestrator-config-writer.ts`:

| Function | Purpose |
|----------|---------|
| `ensureOrchestratorUUIDs(configPath)` | Assign UUIDs + migrate scope format on startup |
| `updateOrchestrator(configPath, id, updates)` | Scan by UUID, merge updates, write back |
| `deleteOrchestrator(configPath, id)` | Scan by UUID, remove entry, write back |

`appendOrchestrator()` updated to auto-assign `crypto.randomUUID()` and accept `name` (display label) as an optional input field.

---

## UI

### `OrchestratorSettingsBar` (new component)

Sits above the spawn form bar, always visible on orchestrator pages (`app/orchestrators/[id]/page.tsx`).

```
[Pcluster CI ✏]  ·  [All directories ▾]  ·  [Discovery ◉]  ·  [🗑]
```

**Display name:** clicking swaps to an `<input>`. Enter/blur fires `PATCH name`. Escape cancels. Falls back to the YAML slug if no label is set.

**Scope pill:** shows "All directories" or "N directories". Click opens a small inline popover with an "All directories" option + checkboxes for each known project directory (sourced from `getAllProjects()`, showing project name + path). Stores the directory paths (absolute). Changes save immediately on selection — no separate Save button. No free-text path entry — only registered projects are selectable.

**Discovery toggle:** `<button>` acting as a toggle switch. Fires `PATCH discover` immediately on click.

**Delete:** trash icon, far right. Click reveals an inline confirmation strip within the same bar: "Kill N sessions and remove? [Cancel] [Delete]". No browser `confirm()`.

### Session label in `SessionCard`

- If `sessionLabel` is set, show it as a small line above the session ID
- On hover, a pencil icon appears; click swaps the label area to an `<input>`. Enter saves (`PATCH label`), Escape cancels
- If no label set, only the pencil appears on hover — no empty space

### Routing updates

| File | Change |
|------|--------|
| `app/orchestrators/[name]/page.tsx` | Rename dir to `[id]`, read UUID param |
| `app/api/orchestrators/[name]/start/route.ts` | Rename dir to `[id]`, lookup by UUID |
| `lib/routes.ts` — `orchestratorSessionPath` | Accept UUID instead of name |
| `SidebarOrchestrators.tsx` | Links use `o.id` (UUID) |
| `CreateOrchestratorModal.tsx` | After create, redirect to `/orchestrators/<uuid>` |

---

## Constraints respected

- No external UI component libraries (C-01)
- No inline styles (C-02)
- Dark theme preserved (C-05)
- Component files ≤ 400 lines (C-04)
- No Redux/Zustand — React hooks only

---

## Out of scope

- Renaming the YAML key (slug) — display label covers the rename use case
- Retroactive backfill of `orchestratorId` on existing sessions — fallback filter handles them
