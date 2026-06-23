# Collapse Orchestrator Tiers

**Date:** 2026-06-23  
**Status:** Approved

## Problem

Athene currently has three coordinator roles:

| Tier | Role string | Storage | Purpose |
|------|-------------|---------|---------|
| Meta-orchestrator | `"meta-orchestrator"` | `projects/_meta/<name>/sessions/` | Cross-project, scoped coordinator |
| Per-project orchestrator | `"orchestrator"` | `projects/<id>/sessions/<id>-orchestrator.json` | Single-project spawner |
| Worker | `"worker"` | `projects/<id>/sessions/<id>.json` | Executes tasks |

The per-project orchestrator tier has been superseded by the meta-orchestrator, which can scope to any subset of projects and spawn workers directly. Having both tiers creates confusion, dead spawn paths, and a two-subgroup "Parliament" UI that no longer reflects reality.

## Goal

Collapse to two tiers by deleting the per-project orchestrator tier and renaming the surviving `meta-orchestrator` concept to simply `orchestrator`. The renamed orchestrator is the only coordinator; every worker is attributed to one.

---

## Section 1 — Role model & type changes

### `SessionKind` (packages/core/src/types.ts:27)

```
Before: "worker" | "orchestrator" | "meta-orchestrator"
After:  "worker" | "orchestrator"
```

The value `"orchestrator"` in `SessionKind` now refers exclusively to what was previously `"meta-orchestrator"`. The old per-project orchestrator kind is removed.

### Session metadata helpers

| Current name | New name | File |
|---|---|---|
| `isMetaOrchestratorSession()` | `isOrchestratorSession()` | `types.ts` |
| `isOrchestratorSession()` (old per-project check, line 335) | **deleted** | `types.ts` |
| `isCoordinatorSession()` (line 383, delegates to both) | simplified: delegates only to new `isOrchestratorSession()` | `types.ts` |
| `getSessionOwnerKind()` + `ownerKind` field (line 395) | **deleted** | `types.ts` |
| `getSessionMetaOwner()` + `metaOwner` field (line 402) | `getSessionOrchestratorOwner()` + `orchestratorOwner` field | `types.ts` |

The resulting `isOrchestratorSession()` function checks `role === "meta-orchestrator"` **or** `role === "orchestrator"` (the new value written after migration) — tolerant read for both legacy strings.

`isWorkerSession()` (new helper): returns true for sessions that are not orchestrators.

### Spawn metadata fields (`SpawnMetadata`, types.ts)

```
Before: ownerKind?: "meta" | "project"
        metaOwner?: string
After:  orchestratorOwner?: string   // replaces both
```

Workers spawned from a human shell (no orchestrator context) are stamped `orchestratorOwner: "default"`. Workers spawned by a running orchestrator are stamped `orchestratorOwner: <name>`.

### `OrchestratorSpawnConfig` / `MetaOrchestratorSpawnConfig` (types.ts)

`OrchestratorSpawnConfig` is **deleted** (it was the per-project spawn config). `MetaOrchestratorSpawnConfig` is **renamed** to `OrchestratorSpawnConfig` — no change to its shape.

### `SessionManager` public interface (types.ts)

```
Before: spawnOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>   // per-project
        ensureOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>   // per-project reuse
        relaunchOrchestrator(config: OrchestratorSpawnConfig): Promise<Session> // per-project relaunch
        ensureMetaOrchestrator(config: MetaOrchestratorSpawnConfig): Promise<Session> // meta
After:  ensureOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>   // renamed from ensureMetaOrchestrator
```

`spawnOrchestrator()`, the old `ensureOrchestrator()` (per-project), and `relaunchOrchestrator()` are all deleted. `ensureMetaOrchestrator()` is renamed to `ensureOrchestrator()` and its `MetaOrchestratorSpawnConfig` parameter type is renamed to `OrchestratorSpawnConfig`.

---

## Section 2 — File renames & deletes

### Core package (packages/core/src/)

| Action | From | To |
|--------|------|----|
| Rename | `meta-orchestrator-prompt.ts` | `orchestrator-prompt.ts` |
| Rename | `meta-scope.ts` | `orchestrator-scope.ts` |
| Rename | `meta-orchestrator-config-writer.ts` | `orchestrator-config-writer.ts` |
| Delete | existing `orchestrator-prompt.ts` | — (per-project prompt generator; imports `prompts/orchestrator.md`) |
| Delete | `orchestrator-session-strategy.ts` | — (per-project orchestrator lifecycle logic) |
| Delete | `prompts/orchestrator.md` | — (per-project orchestrator prompt) |
| Rename | `prompts/meta-orchestrator.md` | `prompts/orchestrator.md` |

The current `orchestrator-prompt.ts` is the per-project prompt generator (it imports `prompts/orchestrator.md`); it is deleted. `meta-orchestrator-prompt.ts` (the portfolio-scoped prompt generator, imports `prompts/meta-orchestrator.md`) is renamed to `orchestrator-prompt.ts` and updated to import from the renamed `prompts/orchestrator.md`.

### Env vars (packages/core/src/env.ts)

| Key | Old canonical name | New canonical name | Backward compat |
|-----|-------------------|-------------------|-----------------|
| Caller type value | `"meta-orchestrator"` | `"orchestrator"` | Read both strings; write new |
| Orchestrator name | `ATHENE_META_NAME` (→ `AO_META_NAME`) | `ATHENE_ORCHESTRATOR_NAME` (→ `AO_ORCHESTRATOR_NAME`) | Dual-read: check `ATHENE_ORCHESTRATOR_NAME` first, fall back to `ATHENE_META_NAME` |

The `ENV.META_NAME` key in `env.ts` is renamed to `ENV.ORCHESTRATOR_NAME`. A dual-read helper reads both canonical and legacy names.

### Config schema (packages/core/src/config.ts)

| Key | Old | New | Backward compat |
|-----|-----|-----|-----------------|
| Top-level config key | `metaOrchestrators` | `orchestrators` | Parse both; prefer `orchestrators`; merge (new takes precedence) |
| Config type | `MetaOrchestratorConfigSchema` → exported as | `OrchestratorEntrySchema` | internal rename |

Zod schema change: accept both `metaOrchestrators` and `orchestrators` at load time; normalize to `orchestrators` on the parsed object. Write only `orchestrators` to new config files.

### Global config (packages/core/src/global-config.ts)

`metaOrchestrators` field renamed to `orchestrators` in the Zod schema — dual-read from disk (accept either key, prefer `orchestrators`). The `GlobalConfig` type exported from `core/src/index.ts` updates accordingly.

### Web lib (packages/web/src/lib/)

| Action | From | To |
|--------|------|----|
| Rename | `meta-orchestrators.ts` | `orchestrators.ts` |
| Update callers | `meta-page-data.ts`, `dashboard-page-data.ts` | import from `orchestrators.ts`; update helper call sites |

Inside the renamed `orchestrators.ts`:
- `listSidebarMetaOrchestrators → listSidebarOrchestrators`
- `buildSidebarProjectOrchestrators()` is deleted
- Exported types `SidebarMetaOrchestrator` and `SidebarProjectOrchestrator` are collapsed to a single `SidebarOrchestrator` type

### CLI (packages/cli/src/commands/meta.ts → orchestrator.ts)

| Before | After | Notes |
|--------|-------|-------|
| `ao meta-start <name>` | `ao orchestrator start <name>` | New canonical invocation |
| `ao meta [subcommands]` | `ao orchestrator [subcommands]` | Renamed command group |

The old `meta-start` invocation is kept as a **hidden alias** that prints a deprecation warning and forwards to `orchestrator start`. The `meta.ts` file is renamed to `orchestrator.ts`; the old `meta.ts` becomes a thin wrapper that imports from `orchestrator.ts` and registers the hidden alias.

### Storage paths

The `_meta` storage prefix (`projects/_meta/<name>/`) is **not renamed**. Existing sessions stay on disk where they are. The session-manager reads from `_meta` for orchestrator sessions (no path migration needed). Write paths for new orchestrator sessions continue to use `_meta` to preserve backward compat with existing deployments.

---

## Section 3 — Bootstrap & default orchestrator

### `athene start` (packages/cli/src/commands/start.ts)

1. **Stops spawning per-project orchestrators.** `start.ts` currently calls `sm.ensureOrchestrator()` (the per-project variant) at two points (lines 941 and 1382). Both calls are removed. There is no existing auto-spawn of meta-orchestrators at start time — those are launched explicitly via `meta-start`; that behavior is unchanged (the command is renamed, not removed).
2. **Ensures default orchestrator entry in global config:**

   ```yaml
   orchestrators:
     default:
       scope: all
       discover: true
   ```

   This is idempotent: if a `default` entry already exists (under `orchestrators` or `metaOrchestrators`), do not overwrite it.

3. **Does not start the default orchestrator session.** The entry is config-only until the user explicitly runs `ao orchestrator start default` or clicks Start in the dashboard.

### `athene start <project>`

Unchanged in behavior: registers/resolves the project. The default orchestrator's `scope: all` covers it automatically.

---

## Section 4 — Spawn & ownership

### Spawn contexts

Three paths produce orchestrator-owned workers:

| Context | `ATHENE_CALLER_TYPE` | `ATHENE_ORCHESTRATOR_NAME` | Worker stamped |
|---------|---------------------|--------------------------|----------------|
| Running orchestrator session | `"orchestrator"` | `<name>` | `orchestratorOwner: "<name>"` |
| Human shell, no orchestrator | not set / `"human"` | not set | `orchestratorOwner: "default"` |
| `ao spawn <project> --prompt ...` from orchestrator | `"orchestrator"` | `<name>` | `orchestratorOwner: "<name>"` |

The `"project"` ownerKind path is removed. When no orchestrator context is detected, attribute to `"default"`.

### `orchestrator-scope.ts` (renamed from `meta-scope.ts`)

Logic unchanged. Rename all exports: `MetaScope → OrchestratorScope`, `resolveMetaScope → resolveOrchestratorScope`, etc.

### Deleted: `spawnOrchestrator()` in session-manager

`spawnOrchestrator()` (the per-project path at session-manager.ts:1963) is deleted along with `_spawnOrchestratorInner`. All callers are updated to either call `ensureOrchestrator()` or be removed.

---

## Section 5 — Web

### `SidebarOrchestrators.tsx` (packages/web/src/components/SidebarOrchestrators.tsx)

- Section label: `"Parliament"` → `"Orchestrators"`
- Remove two-subgroup structure ("Meta" / "Project" sub-headers). Render a single flat list of orchestrator entries.
- Update prop types to use `SidebarOrchestrator` (from the renamed `orchestrators.ts`), replacing `SidebarMetaOrchestrator` and `SidebarProjectOrchestrator`.
- The helper functions `listSidebarMetaOrchestrators` and `buildSidebarProjectOrchestrators` live in `packages/web/src/lib/meta-orchestrators.ts` (not this file) — see the Web lib rename above.

### `CreateMetaOrchestratorModal.tsx` → `CreateOrchestratorModal.tsx`

File rename; internal interface/function names updated accordingly:
- `CreateMetaOrchestratorModalProps → CreateOrchestratorModalProps`
- `CreateMetaOrchestratorModal → CreateOrchestratorModal`

### CSS (packages/web/src/app/globals.css)

Update comment blocks at line 5362 ("Parliament section") and 5484 ("Sub-group labels") to reference the new terminology. No token renames (tokens are display-detail, not semantic).

### Routes

| Old route | New route | Old route disposition |
|-----------|-----------|----------------------|
| `/meta/[name]` | `/orchestrators/[name]` | Keep `app/meta/[name]` as a redirect to `/orchestrators/[name]` |
| `POST /api/meta` | `POST /api/orchestrators` | Keep `/api/meta` as a forwarding alias |
| `POST /api/meta/[name]/start` | `POST /api/orchestrators/[name]/start` | Keep old route as forwarding alias |

The `app/meta` directory remains and serves redirects only. The new `app/orchestrators/[name]` directory contains the actual page.

### API types (packages/web/src/lib/types.ts)

Any `MetaOrchestrator*` interface names are renamed to `Orchestrator*`.

---

## Section 6 — Migration (auto-retire on upgrade)

Runs once, idempotently, during `athene start`. Implemented in a new migration file at `packages/core/src/migration/retire-per-project-orchestrators.ts`.

### Step 1 — Retire per-project orchestrators

Scan `projects/*/sessions/` (all non-`_meta` project dirs) for session files with `role="orchestrator"`. For each found:
1. Attempt graceful kill via the runtime plugin (best-effort; log and continue on failure).
2. Archive the metadata file (move to the archive directory, same as normal session cleanup).

### Step 2 — Rewrite `_meta` session roles

Scan `projects/_meta/*/sessions/` for session files with `role="meta-orchestrator"`. Rewrite the `role` field to `"orchestrator"`. The read path already tolerates both values, so this is a one-time normalization.

### Step 3 — Ensure default orchestrator config

If neither `orchestrators.default` nor `metaOrchestrators.default` exists in global config, add `orchestrators: { default: { scope: "all", discover: true } }` to global config via the config writer.

### Migration guard

Write a marker file at `~/.agent-orchestrator/migrations/retire-per-project-orchestrators.done` after successful completion. On subsequent `athene start` calls, if this file exists, skip the migration. Use an empty file (existence is the signal; no content needed).

---

## Section 7 — Tests

### Core

| Test file | What changes |
|-----------|-------------|
| `__tests__/session-manager-meta.test.ts` → `session-manager-orchestrator.test.ts` | Rename file; update all `meta` references; add assertion that `spawnOrchestrator()` is gone from the interface; assert `spawn()` from project context stamps `orchestratorOwner: "default"` |
| `__tests__/meta-orchestrator-prompt.test.ts` → `orchestrator-prompt.test.ts` | Rename; update references |
| `__tests__/meta-scope.test.ts` → `orchestrator-scope.test.ts` | Rename; update references |
| `__tests__/meta-orchestrator-config-writer.test.ts` → `orchestrator-config-writer.test.ts` | Rename; update references |
| `__tests__/config-meta.test.ts` | Update to use `orchestrators` key; add dual-read test (load old `metaOrchestrators` key, confirm parses to same result as `orchestrators`) |
| `__tests__/config-meta-global.test.ts` | Same — dual-read tests for global config |
| New: `__tests__/migration/retire-per-project-orchestrators.test.ts` | Fixture with one `role="orchestrator"` under `projects/proj/sessions/` + one `role="meta-orchestrator"` under `projects/_meta/` → after migration: project orchestrator archived, `_meta` role rewritten to `"orchestrator"`, `default` orchestrator entry ensured in config |

### Read-time compat tests (must pass)

- Old `role="meta-orchestrator"` in session metadata → `isOrchestratorSession()` returns true.
- Old `metaOrchestrators:` config key → parses correctly; merged into `orchestrators`.
- Old `ATHENE_META_NAME` env var → `getOrchestratorName()` returns the value.
- Old `ATHENE_CALLER_TYPE=meta-orchestrator` → treated as `"orchestrator"`.

### CLI

| Test file | What changes |
|-----------|-------------|
| `__tests__/commands/meta.test.ts` → `orchestrator.test.ts` | Rename; update command strings |
| Add alias test | `ao meta-start foo` triggers deprecation warning and starts orchestrator `foo` |

### Web

| Test file | What changes |
|-----------|-------------|
| `__tests__/SidebarOrchestrators.test.tsx` | Expect `"Orchestrators"` label (not `"Parliament"`); expect flat list (no "Meta"/"Project" sub-headers); update type names to `SidebarOrchestrator` |
| New: `__tests__/lib/orchestrators.test.ts` (renamed from `meta-orchestrators.test.ts` if it exists) | `listSidebarOrchestrators` returns flat list; `buildSidebarProjectOrchestrators` no longer exported |
| Route redirect test | `GET /meta/foo` → redirects to `/orchestrators/foo` |

### Lifecycle / state machine

No changes to `deriveLegacyStatus`, canonical states, or lifecycle manager. Add a regression assertion: no branch in `lifecycle-manager.ts` or `lifecycle-state.ts` references `role` or orchestrator kind (confirming the state machine is untouched).

---

## Constraints honored

- TypeScript strict; no `any`. All renamed types carry `as const` where required.
- Conventional commits; no co-author trailer.
- Cross-platform: no `process.platform` inline checks in new/changed code.
- Surgical changes: only files that touch per-project orchestrator, meta-orchestrator naming, or migration are modified.
- Dual-read backward compat: `metaOrchestrators` config key, `ATHENE_META_NAME` env var, `role="meta-orchestrator"` metadata, and `AO_META_NAME` all continue to work post-migration.
- Component files ≤ 400 lines.
- Test files for all changed/new components.
- `AO_*` / `.ao` paths are not renamed (frozen compat rule).
