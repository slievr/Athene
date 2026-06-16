# Meta Orchestrator: Create from UI

**Date:** 2026-06-16  
**Status:** Approved

## Problem

Meta orchestrators must currently be pre-configured in `agent-orchestrator.yaml` before the Parliament sidebar renders them. There is no way to create one from the dashboard — the user must edit YAML, restart, and only then see the entry in the UI.

## Goal

Allow creating a new meta orchestrator entirely from the dashboard, with the entry persisted to the config file and the session started immediately.

---

## UI

### Parliament sidebar header

Add a `+` icon button right-aligned in the Parliament section label row. Visible only when the sidebar is expanded.

### Create modal

Opened by the `+` button. Three fields:

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| Name | text input | yes | — | `[a-zA-Z0-9_-]+`, unique across existing meta orchestrators |
| Scope | radio: "All projects" / "Specific projects" | yes | All projects | Selecting "Specific" reveals a multi-select of configured project names |
| Agent | dropdown of available agents | no | — (uses global default) | Must be a known agent plugin name if provided |

**Submit button:** "Create & Start"

**On submit:**
- Button becomes spinner + disabled
- POST to `/api/meta`
- On success: modal closes, Parliament row appears with the new entry
- On error: inline error message shown inside the modal, form remains open

**Field-level validation** (before submit):
- Name: reject on blur if it contains invalid characters or is already taken (check against current `metaOrchestrators` keys from page props)

---

## API

### `POST /api/meta`

New route. Distinct from the existing `POST /api/meta/[name]/start` (which assumes the entry already exists in config).

**Request body:**
```json
{
  "name": "my-meta",
  "scope": "all",
  "agent": "claude-code"
}
```

Or with specific project scope:
```json
{
  "name": "my-meta",
  "scope": { "projects": ["athene_9fa911cdae", "other_project"] },
  "agent": null
}
```

**Steps:**
1. Validate `name` matches `/^[a-zA-Z0-9_-]+$/`
2. Check name doesn't already exist in `config.metaOrchestrators` → 409 if collision
3. Validate any explicit project IDs exist in `config.projects` → 400 if unknown
4. Read config YAML from disk (path from `LoadedConfig.configPath`), parse with `js-yaml`, merge new entry under `metaOrchestrators`, write back
5. Invalidate `getServices()` config cache so the updated file is picked up
6. Call `generateMetaOrchestratorPrompt` + `sessionManager.ensureMetaOrchestrator`
7. Return `{ sessionId }` with status 201

**Error responses:**

| Condition | Status | Body |
|-----------|--------|------|
| Invalid name | 400 | `{ error: "name must match [a-zA-Z0-9_-]+" }` |
| Name already exists | 409 | `{ error: "A meta orchestrator named '…' already exists" }` |
| Unknown project in scope | 400 | `{ error: "Unknown project ID: '…'" }` |
| Config write or start failure | 500 | `{ error: "…" }` |

---

## Config writing

- Parse existing YAML with `js-yaml` (`load` + `dump`)
- Merge new entry under `metaOrchestrators` key
- Write back to the same file (`LoadedConfig.configPath`)
- **Side effect:** YAML rewrite normalizes formatting and loses hand-written comments. Accepted trade-off.
- If `LoadedConfig` does not yet expose `configPath`, add it as a field during implementation

### New MetaOrchestratorConfig entry written:

```yaml
metaOrchestrators:
  my-meta:
    scope: all          # or { projects: [...] }
    discover: true      # always true for UI-created entries
    agent: claude-code  # omitted if not specified
```

`discover: true` is always set for UI-created entries (new projects automatically fall into scope).

---

## Cache invalidation

`getServices()` caches config in memory. After writing the YAML, the cache must be reset so `ensureMetaOrchestrator` reads the updated `metaOrchestrators`. Implementation: expose a `resetServicesCache()` function from `services.ts` and call it inside the new route after the file write.

---

## Tests

### API route (`POST /api/meta`)
- Returns 400 for invalid name characters
- Returns 409 when name already exists in config
- Returns 400 for unknown project ID in explicit scope
- Happy path: writes config, calls `ensureMetaOrchestrator`, returns 201 with `sessionId`
- Returns 500 when `ensureMetaOrchestrator` throws

### `CreateMetaOrchestratorModal` component
- Name field shows validation error for invalid characters on blur
- Scope toggle "Specific projects" reveals project multi-select
- Submit button is disabled while in-flight (spinner shown)
- Inline error rendered when API returns error
- Modal closes on successful creation

### `SidebarOrchestrators` component (addition to existing tests)
- `+` button renders in Parliament header when sidebar is expanded
- `+` button absent when sidebar is collapsed

---

## Files touched

| File | Change |
|------|--------|
| `packages/web/src/app/api/meta/route.ts` | New: POST /api/meta |
| `packages/web/src/lib/services.ts` | Add `resetServicesCache()` export; add `configPath` to returned object if needed |
| `packages/core/src/types.ts` | Add `configPath: string` to `LoadedConfig` if not present |
| `packages/core/src/config.ts` | Populate `configPath` in `loadConfig()` return value |
| `packages/web/src/components/CreateMetaOrchestratorModal.tsx` | New component |
| `packages/web/src/components/SidebarOrchestrators.tsx` | Add `+` button + modal wiring |
| `packages/web/src/components/__tests__/CreateMetaOrchestratorModal.test.tsx` | New tests |
| `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx` | Extend existing tests |
| `packages/web/src/app/api/meta/__tests__/route.test.ts` | New API tests |
