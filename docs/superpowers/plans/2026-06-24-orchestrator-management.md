# Orchestrator Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add UUID-based orchestrator identity, display labels, directory-scoped project visibility, discovery toggle, and remove/rename controls to the Athene dashboard.

**Architecture:** Each orchestrator gets a stable UUID (`id` field) and an optional display label (`name` field) in the YAML config. A startup migration assigns UUIDs to existing entries. URLs change from `/orchestrators/<slug>` to `/orchestrators/<uuid>`. Inline settings controls live in a new `OrchestratorSettingsBar` component on the orchestrator fleet page. Session labels reuse the existing `displayName`/`displayNameUserSet` metadata keys.

**Tech Stack:** TypeScript strict, Zod, Next.js 15 App Router, Vitest, Tailwind CSS v4, pnpm workspaces.

## Global Constraints

- No external UI component libraries (no Radix, shadcn, etc.)
- No inline `style=` attributes — Tailwind utility classes only
- Dark theme preserved throughout
- Component files ≤ 400 lines
- `pnpm --filter <pkg> typecheck` must pass after every task
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`
- No co-authored commits

---

## File Map

**Core — `packages/core/src/`:**
- Modify `types.ts` — `OrchestratorScope` → `"all" | string[]`, add `id`/`name` to `OrchestratorEntryConfig`
- Modify `config.ts` — update `MetaScopeSchema`, `OrchestratorEntryConfigSchema`, `assertMetaScopeProjectsExist`
- Modify `orchestrator-scope.ts` — `resolveInScopeProjects` matches by `project.path`; `reconcileMetaScopeIds` returns path array
- Modify `orchestrator-prompt.ts` — scope description uses path list
- Modify `orchestrator-config-writer.ts` — add `ensureOrchestratorUUIDs`, `updateOrchestrator`, `deleteOrchestrator`; update `appendOrchestrator`
- Modify `session-manager.ts` — stamp `orchestratorId` alongside `orchestratorOwner` at spawn

**Web lib — `packages/web/src/lib/`:**
- Modify `project-name.ts` — add `path` field to `ProjectInfo` + `getAllProjects()`
- Modify `orchestrators.ts` — add `id` + `label` to `SidebarOrchestrator`, read from config
- Modify `services.ts` — call `ensureOrchestratorUUIDs` at startup
- Modify `types.ts` — add `orchestratorId` to `DashboardSession`
- Modify `serialize.ts` — map `orchestratorId` from session metadata
- Modify `routes.ts` — `orchestratorDashboardPath`/`orchestratorSessionPath` receive UUID
- Modify `orchestrator-page-data.ts` — look up orchestrator by UUID, filter sessions by `orchestratorId` + fallback slug

**Web API — `packages/web/src/app/api/`:**
- Modify `orchestrators/route.ts` — POST assigns UUID, accepts `label`
- Move `orchestrators/[name]/start/route.ts` → `orchestrators/[id]/start/route.ts` — look up by UUID
- Create `orchestrators/[id]/route.ts` — PATCH (name/scope/discover) + DELETE (kill sessions + remove config)
- Create/modify `sessions/[id]/route.ts` — add PATCH for session label

**Web pages — `packages/web/src/app/`:**
- Move `orchestrators/[name]/page.tsx` → `orchestrators/[id]/page.tsx` — use UUID param

**Web components — `packages/web/src/components/`:**
- Create `OrchestratorSettingsBar.tsx` — inline display-name editor, scope picker, discovery toggle, delete with confirm
- Modify `SidebarOrchestrators.tsx` — links and API calls use `o.id`
- Modify `SessionCard.tsx` — inline label editor on hover

---

### Task 1: Core schema — scope format + orchestrator id/name fields

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/orchestrator-scope.ts`
- Modify: `packages/core/src/orchestrator-prompt.ts`
- Test: `packages/core/src/__tests__/orchestrator-scope.test.ts`
- Test: `packages/core/src/__tests__/config-meta.test.ts`

**Interfaces:**
- Produces: `OrchestratorScope = "all" | string[]` (directory paths); `OrchestratorEntryConfig` gains `id?: string`, `name?: string`; `resolveInScopeProjects` matches on `project.path`

- [ ] **Step 1: Update `OrchestratorScope` and `OrchestratorEntryConfig` in `types.ts`**

Find line 1502 in `packages/core/src/types.ts`:

```typescript
// BEFORE
export type OrchestratorScope = "all" | { projects: string[] };

export interface OrchestratorEntryConfig {
  scope: OrchestratorScope;
  discover: boolean;
  agent?: string;
  rules?: string;
}
```

Replace with:

```typescript
/** "all" = every registered project; string[] = list of project directory paths. */
export type OrchestratorScope = "all" | string[];
/** @deprecated Use OrchestratorScope */
export type MetaScope = OrchestratorScope;

export interface OrchestratorEntryConfig {
  /** Stable UUID — assigned at creation, used in URLs and session metadata. */
  id?: string;
  /** Human-readable display label. Falls back to the YAML key slug if absent. */
  name?: string;
  scope: OrchestratorScope;
  discover: boolean;
  agent?: string;
  rules?: string;
}
/** @deprecated Use OrchestratorEntryConfig */
export type MetaOrchestratorConfig = OrchestratorEntryConfig;
```

- [ ] **Step 2: Update `MetaScopeSchema` and `OrchestratorEntryConfigSchema` in `config.ts`**

Find the `MetaScopeSchema` and `OrchestratorEntryConfigSchema` definitions (around line 360–378):

```typescript
// BEFORE
const MetaScopeSchema = z.union([
  z.literal("all"),
  z.object({ projects: z.array(z.string()).min(1) }),
]);

const OrchestratorEntryConfigSchema = z.object({
  scope: MetaScopeSchema,
  discover: z.boolean().default(false),
  agent: z.string().optional(),
  rules: z.string().optional(),
});
```

Replace with:

```typescript
const MetaScopeSchema = z.union([
  z.literal("all"),
  z.array(z.string()).min(1), // directory paths
]);

const OrchestratorEntryConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  scope: MetaScopeSchema,
  discover: z.boolean().default(false),
  agent: z.string().optional(),
  rules: z.string().optional(),
});
```

- [ ] **Step 3: Update `assertMetaScopeProjectsExist` in `config.ts`**

Find the `assertMetaScopeProjectsExist` function (around line 452). Replace the entire function body — scope is now directory paths, not project IDs, so the project-ID validation no longer applies:

```typescript
export function assertMetaScopeProjectsExist(
  orchestrators: Record<string, { scope?: unknown }> | undefined,
  _knownProjectIds: string[],
): void {
  // Scope now stores directory paths, not project IDs — no registry validation.
  if (!orchestrators) return;
}
```

- [ ] **Step 4: Write failing tests for updated scope resolution in `orchestrator-scope.test.ts`**

Open `packages/core/src/__tests__/orchestrator-scope.test.ts`. Replace the `reconcileMetaScopeIds` tests that use the old `{ projects: [...] }` format. The updated tests use the new `string[]` path format:

```typescript
// Add these at the top after existing imports:
import { resolveInScopeProjects, resolveInScopeProjectIds } from "../orchestrator-scope.js";
import type { OrchestratorConfig } from "../types.js";

// Helper for building a minimal config:
function makeConfig(projects: Record<string, { path: string }>): OrchestratorConfig {
  return {
    projects: Object.fromEntries(
      Object.entries(projects).map(([id, p]) => [id, {
        name: id, path: p.path, workdir: p.path,
        runtime: "tmux", agent: "claude-code",
        tracker: "github", scm: "github",
        notifiers: {}, reactions: {},
      }])
    ),
    defaults: { agent: "claude-code", runtime: "tmux", tracker: "github", scm: "github" },
    orchestrators: {},
    port: 3000,
  } as unknown as OrchestratorConfig;
}

describe("resolveInScopeProjects — directory-path scope", () => {
  it("returns all projects when scope is 'all'", () => {
    const config = makeConfig({ web: { path: "/repos/web" }, api: { path: "/repos/api" } });
    const result = resolveInScopeProjects(config, { scope: "all", discover: false });
    expect(result.map(([id]) => id)).toEqual(["web", "api"]);
  });

  it("filters projects by directory path", () => {
    const config = makeConfig({ web: { path: "/repos/web" }, api: { path: "/repos/api" } });
    const result = resolveInScopeProjects(config, { scope: ["/repos/api"], discover: false });
    expect(result.map(([id]) => id)).toEqual(["api"]);
  });

  it("returns empty list when no project matches the path", () => {
    const config = makeConfig({ web: { path: "/repos/web" } });
    const result = resolveInScopeProjects(config, { scope: ["/repos/other"], discover: false });
    expect(result).toEqual([]);
  });
});
```

Run: `pnpm --filter @made-by-moonlight/athene-core test -- orchestrator-scope`
Expected: FAIL (existing tests use old `{ projects: [...] }` format)

- [ ] **Step 5: Update `orchestrator-scope.ts` to match by `project.path`**

Replace the full file content:

```typescript
import type { OrchestratorEntryConfig, OrchestratorConfig, ProjectConfig } from "./types.js";

export function resolveInScopeProjects(
  config: OrchestratorConfig,
  meta: OrchestratorEntryConfig,
): Array<[string, ProjectConfig]> {
  const entries = Object.entries(config.projects);
  if (meta.scope === "all") {
    return entries;
  }
  const wanted = new Set(meta.scope as string[]);
  return entries.filter(([, project]) => wanted.has(project.path));
}

export function resolveInScopeProjectIds(
  config: OrchestratorConfig,
  meta: OrchestratorEntryConfig,
): string[] {
  return resolveInScopeProjects(config, meta).map(([id]) => id);
}

export function reconcileMetaScopeIds(
  config: OrchestratorConfig,
  meta: OrchestratorEntryConfig,
  baselineProjectIds: string[],
): string[] {
  const base = resolveInScopeProjectIds(config, meta);
  if (meta.scope === "all" || !meta.discover) {
    return base;
  }
  const baseline = new Set(baselineProjectIds);
  const newlyRegistered = Object.keys(config.projects).filter((id) => !baseline.has(id));
  return Array.from(new Set([...base, ...newlyRegistered]));
}
```

- [ ] **Step 6: Update `orchestrator-prompt.ts` scope description**

Find line 53–56 in `packages/core/src/orchestrator-prompt.ts`:

```typescript
// BEFORE
  const scopeDescription =
    orchestrator.scope === "all"
      ? "all registered projects"
      : `projects: ${orchestrator.scope.projects.join(", ")}`;
```

Replace with:

```typescript
  const scopeDescription =
    orchestrator.scope === "all"
      ? "all registered projects"
      : `directories: ${(orchestrator.scope as string[]).join(", ")}`;
```

- [ ] **Step 7: Update `config-meta.test.ts` to match new `assertMetaScopeProjectsExist` behavior**

In `packages/core/src/__tests__/config-meta.test.ts`, find the `assertMetaScopeProjectsExist` tests (around line 54–70) and update them — the function is now a no-op:

```typescript
it("assertMetaScopeProjectsExist is a no-op (scope uses directory paths, not project IDs)", () => {
  // Should not throw regardless of scope content
  expect(() =>
    assertMetaScopeProjectsExist(
      { myorch: { scope: ["/nonexistent/path"] } },
      ["project-a"],
    ),
  ).not.toThrow();
});

it("assertMetaScopeProjectsExist accepts undefined", () => {
  expect(() => assertMetaScopeProjectsExist(undefined, ["project-a"])).not.toThrow();
});
```

Remove any existing tests that assert it throws on unknown project IDs.

- [ ] **Step 8: Run tests and typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- orchestrator-scope
pnpm --filter @made-by-moonlight/athene-core test -- config-meta
pnpm --filter @made-by-moonlight/athene-core typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts \
  packages/core/src/orchestrator-scope.ts packages/core/src/orchestrator-prompt.ts \
  packages/core/src/__tests__/orchestrator-scope.test.ts \
  packages/core/src/__tests__/config-meta.test.ts
git commit -m "feat: update orchestrator scope to directory paths, add id/name fields"
```

---

### Task 2: Config writer additions

**Files:**
- Modify: `packages/core/src/orchestrator-config-writer.ts`
- Modify: `packages/core/src/__tests__/orchestrator-config-writer.test.ts`

**Interfaces:**
- Consumes: `OrchestratorEntryConfig.id` (optional UUID) from Task 1
- Produces: `appendOrchestrator` (updated), `ensureOrchestratorUUIDs(configPath)`, `updateOrchestrator(configPath, id, updates)`, `deleteOrchestrator(configPath, id)`

- [ ] **Step 1: Write failing tests**

Add to `packages/core/src/__tests__/orchestrator-config-writer.test.ts` (after existing `appendOrchestrator` tests):

```typescript
import { parse } from "yaml";
import {
  appendOrchestrator,
  ensureOrchestratorUUIDs,
  updateOrchestrator,
  deleteOrchestrator,
} from "../orchestrator-config-writer.js";

// Extend existing beforeEach/afterEach setup (tmpDir, configPath already set up there)

describe("appendOrchestrator — UUID and label", () => {
  it("assigns a UUID to newly appended orchestrators", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    appendOrchestrator(configPath, { name: "my-orch", scope: "all" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("stores the optional display label as the 'name' field", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    appendOrchestrator(configPath, { name: "my-orch", scope: "all", label: "My Orch" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"].name).toBe("My Orch");
  });
});

describe("ensureOrchestratorUUIDs", () => {
  it("assigns UUIDs to entries missing them and writes back", () => {
    writeFileSync(configPath, `projects: {}\norchestrators:\n  existing:\n    scope: all\n    discover: false\n`, "utf-8");
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["existing"].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("does not overwrite existing UUIDs", () => {
    const existingId = "11111111-1111-1111-1111-111111111111";
    writeFileSync(configPath, `projects: {}\norchestrators:\n  existing:\n    id: "${existingId}"\n    scope: all\n`, "utf-8");
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["existing"].id).toBe(existingId);
  });

  it("migrates legacy { projects: string[] } scope to string[]", () => {
    writeFileSync(configPath, `projects: {}\norchestrators:\n  existing:\n    scope:\n      projects:\n        - /tmp/repo\n`, "utf-8");
    ensureOrchestratorUUIDs(configPath);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(Array.isArray(orchs["existing"].scope)).toBe(true);
    expect(orchs["existing"].scope).toEqual(["/tmp/repo"]);
  });

  it("is a no-op when all entries already have UUIDs", () => {
    const content = `projects: {}\norchestrators:\n  existing:\n    id: "22222222-2222-2222-2222-222222222222"\n    scope: all\n`;
    writeFileSync(configPath, content, "utf-8");
    ensureOrchestratorUUIDs(configPath);
    expect(readFileSync(configPath, "utf-8")).toBe(readFileSync(configPath, "utf-8")); // no change
  });
});

describe("updateOrchestrator", () => {
  const id = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    writeFileSync(configPath, `projects: {}\norchestrators:\n  my-orch:\n    id: "${id}"\n    scope: all\n    discover: false\n`, "utf-8");
  });

  it("updates the display name by UUID", () => {
    updateOrchestrator(configPath, id, { name: "Updated" });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"].name).toBe("Updated");
  });

  it("updates scope by UUID", () => {
    updateOrchestrator(configPath, id, { scope: ["/tmp/repo"] });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"].scope).toEqual(["/tmp/repo"]);
  });

  it("updates discover by UUID", () => {
    updateOrchestrator(configPath, id, { discover: true });
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"].discover).toBe(true);
  });

  it("throws when UUID not found", () => {
    expect(() => updateOrchestrator(configPath, "nonexistent", {})).toThrow("not found");
  });
});

describe("deleteOrchestrator", () => {
  const id = "44444444-4444-4444-4444-444444444444";

  it("removes the entry by UUID", () => {
    writeFileSync(configPath, `projects: {}\norchestrators:\n  my-orch:\n    id: "${id}"\n    scope: all\n`, "utf-8");
    deleteOrchestrator(configPath, id);
    const doc = parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const orchs = (doc.orchestrators as Record<string, Record<string, unknown>>);
    expect(orchs["my-orch"]).toBeUndefined();
  });

  it("throws when UUID not found", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");
    expect(() => deleteOrchestrator(configPath, "nonexistent")).toThrow("not found");
  });
});
```

Run: `pnpm --filter @made-by-moonlight/athene-core test -- orchestrator-config-writer`
Expected: FAIL (new functions not yet implemented)

- [ ] **Step 2: Implement updated config writer**

Replace the full content of `packages/core/src/orchestrator-config-writer.ts`:

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";

export interface OrchestratorWriteInput {
  name: string;
  scope: "all" | string[];
  agent?: string;
  /** Display label — stored as the `name` field in config. */
  label?: string;
}

export interface OrchestratorUpdateInput {
  /** Display label. */
  name?: string;
  scope?: "all" | string[];
  discover?: boolean;
}

function readOrchMap(configPath: string): {
  doc: Record<string, unknown>;
  orchMap: Record<string, Record<string, unknown>>;
  key: "orchestrators" | "metaOrchestrators";
} {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  const key: "orchestrators" | "metaOrchestrators" = doc.orchestrators ? "orchestrators" : "metaOrchestrators";
  const orchMap = ((doc[key] ?? {}) as Record<string, Record<string, unknown>>);
  return { doc, orchMap, key };
}

function writeOrchMap(
  configPath: string,
  doc: Record<string, unknown>,
  orchMap: Record<string, Record<string, unknown>>,
  key: "orchestrators" | "metaOrchestrators",
): void {
  doc[key] = orchMap;
  writeFileSync(configPath, stringify(doc), "utf-8");
}

/**
 * Append a new orchestrator entry. Auto-assigns a stable UUID as `id`.
 * The optional `label` is stored as the `name` field (display label).
 */
export function appendOrchestrator(configPath: string, input: OrchestratorWriteInput): void {
  const { doc, orchMap } = readOrchMap(configPath);
  orchMap[input.name] = {
    id: randomUUID(),
    scope: input.scope,
    discover: true,
    ...(input.label !== undefined ? { name: input.label } : {}),
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.orchestrators = orchMap;
  writeFileSync(configPath, stringify(doc), "utf-8");
}

/**
 * Assign UUIDs to orchestrator entries missing them and migrate legacy
 * `{ projects: string[] }` scope to `string[]`. No-op when all entries
 * already have UUIDs and correct scope format.
 */
export function ensureOrchestratorUUIDs(configPath: string): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  let dirty = false;

  for (const entry of Object.values(orchMap)) {
    if (!entry.id) {
      entry.id = randomUUID();
      dirty = true;
    }
    const scope = entry.scope as unknown;
    if (scope && typeof scope === "object" && !Array.isArray(scope)) {
      const legacy = scope as { projects?: unknown };
      if (Array.isArray(legacy.projects)) {
        entry.scope = legacy.projects as string[];
        dirty = true;
      }
    }
  }

  if (dirty) writeOrchMap(configPath, doc, orchMap, key);
}

/**
 * Update fields of the orchestrator identified by UUID.
 * Throws if no entry with that `id` exists.
 */
export function updateOrchestrator(
  configPath: string,
  id: string,
  updates: OrchestratorUpdateInput,
): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  const entry = Object.values(orchMap).find((v) => v.id === id);
  if (!entry) throw new Error(`Orchestrator with id '${id}' not found`);

  if (updates.name !== undefined) entry.name = updates.name;
  if (updates.scope !== undefined) entry.scope = updates.scope;
  if (updates.discover !== undefined) entry.discover = updates.discover;

  writeOrchMap(configPath, doc, orchMap, key);
}

/**
 * Remove the orchestrator entry identified by UUID.
 * Throws if no entry with that `id` exists.
 */
export function deleteOrchestrator(configPath: string, id: string): void {
  const { doc, orchMap, key } = readOrchMap(configPath);
  const slug = Object.keys(orchMap).find((k) => orchMap[k].id === id);
  if (!slug) throw new Error(`Orchestrator with id '${id}' not found`);

  delete orchMap[slug];
  writeOrchMap(configPath, doc, orchMap, key);
}
```

- [ ] **Step 3: Export new functions from core's public API**

In `packages/core/src/index.ts`, find the line that exports from `orchestrator-config-writer` and add the new exports:

```typescript
export {
  appendOrchestrator,
  ensureOrchestratorUUIDs,
  updateOrchestrator,
  deleteOrchestrator,
  type OrchestratorWriteInput,
  type OrchestratorUpdateInput,
} from "./orchestrator-config-writer.js";
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- orchestrator-config-writer
pnpm --filter @made-by-moonlight/athene-core typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/orchestrator-config-writer.ts \
  packages/core/src/__tests__/orchestrator-config-writer.test.ts \
  packages/core/src/index.ts
git commit -m "feat: add ensureOrchestratorUUIDs, updateOrchestrator, deleteOrchestrator to config writer"
```

---

### Task 3: Stamp orchestratorId at spawn + update DashboardSession

**Files:**
- Modify: `packages/core/src/session-manager.ts`
- Modify: `packages/web/src/lib/types.ts`
- Modify: `packages/web/src/lib/serialize.ts`

**Interfaces:**
- Consumes: `OrchestratorEntryConfig.id` (Task 1); `orchestratorOwner` stamping pattern (session-manager.ts line 1803)
- Produces: sessions stamped with `orchestratorId` metadata key; `DashboardSession.orchestratorId?: string`

- [ ] **Step 1: Stamp `orchestratorId` in `session-manager.ts`**

In `packages/core/src/session-manager.ts`, find the metadata block around line 1796–1814 where `orchestratorOwner` is set. Add `orchestratorId` immediately after the `orchestratorOwner` stamp:

```typescript
// BEFORE (around line 1800–1813):
          orchestratorOwner: (
            spawnConfig.orchestratorOwner ||
            spawnConfig.metaOwner ||
            getEnvString(ENV.ORCHESTRATOR_NAME) ||
            getEnvString(ENV.META_NAME) ||
            "default"
          ),
          ...(getEnvString(ENV.SESSION_ID) ? { parentSessionId: getEnvString(ENV.SESSION_ID) } : {}),
```

Replace with:

```typescript
          orchestratorOwner: (
            spawnConfig.orchestratorOwner ||
            spawnConfig.metaOwner ||
            getEnvString(ENV.ORCHESTRATOR_NAME) ||
            getEnvString(ENV.META_NAME) ||
            "default"
          ),
          // Stamp the stable UUID for the owning orchestrator (when available).
          // Lookup by slug from the resolved orchestratorOwner value.
          ...(() => {
            const ownerSlug =
              spawnConfig.orchestratorOwner ||
              spawnConfig.metaOwner ||
              getEnvString(ENV.ORCHESTRATOR_NAME) ||
              getEnvString(ENV.META_NAME);
            if (!ownerSlug) return {};
            const orchEntry = (config.orchestrators ?? config.metaOrchestrators)?.[ownerSlug];
            return orchEntry?.id ? { orchestratorId: orchEntry.id } : {};
          })(),
          ...(getEnvString(ENV.SESSION_ID) ? { parentSessionId: getEnvString(ENV.SESSION_ID) } : {}),
```

- [ ] **Step 2: Add `orchestratorId` to `DashboardSession` in `packages/web/src/lib/types.ts`**

Find the `DashboardSession` interface. After the `metaOwner` field add:

```typescript
  /** Stable UUID of the owning orchestrator (undefined for sessions not owned by an orchestrator). */
  orchestratorId?: string | null;
```

- [ ] **Step 3: Map `orchestratorId` in `packages/web/src/lib/serialize.ts`**

Find the line that maps `displayName` (line 185):

```typescript
    displayName: session.metadata["displayName"] ?? null,
    displayNameUserSet: session.metadata["displayNameUserSet"] === "true",
```

Add `orchestratorId` immediately after:

```typescript
    displayName: session.metadata["displayName"] ?? null,
    displayNameUserSet: session.metadata["displayNameUserSet"] === "true",
    orchestratorId: session.metadata["orchestratorId"] ?? null,
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-core typecheck
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session-manager.ts \
  packages/web/src/lib/types.ts \
  packages/web/src/lib/serialize.ts
git commit -m "feat: stamp orchestratorId UUID at session spawn, add to DashboardSession"
```

---

### Task 4: Services startup migration + SidebarOrchestrator + ProjectInfo path

**Files:**
- Modify: `packages/web/src/lib/services.ts`
- Modify: `packages/web/src/lib/orchestrators.ts`
- Modify: `packages/web/src/lib/project-name.ts`

**Interfaces:**
- Consumes: `ensureOrchestratorUUIDs` from Task 2
- Produces: `SidebarOrchestrator` gains `id: string` and `label: string | null`; `ProjectInfo` gains `path: string`; startup migration runs before any API handler

- [ ] **Step 1: Call `ensureOrchestratorUUIDs` at startup in `services.ts`**

In `packages/web/src/lib/services.ts`, find the import block and add the import:

```typescript
import { ensureOrchestratorUUIDs } from "@made-by-moonlight/athene-core";
```

Find the `getServices()` function initialization. After `loadConfig()` succeeds and `config.configPath` is available, add the migration call before creating the plugin registry:

```typescript
// After: const config = await loadConfig(...) or equivalent
// Before: createPluginRegistry(...)
ensureOrchestratorUUIDs(config.configPath);
```

The exact location is just before `createPluginRegistry` is called. Search for `createPluginRegistry` in `getServices()` and insert above it:

```typescript
    ensureOrchestratorUUIDs(config.configPath);
    const registry = createPluginRegistry(...);
```

- [ ] **Step 2: Add `id` and `label` to `SidebarOrchestrator` in `orchestrators.ts`**

In `packages/web/src/lib/orchestrators.ts`, update the `SidebarOrchestrator` interface:

```typescript
export interface SidebarOrchestrator {
  /** YAML key slug (never changes). */
  name: string;
  /** Stable UUID from config. */
  id: string;
  /** Display label from config `name` field. Falls back to slug if absent. */
  label: string;
  session: DashboardSession | null;
}
```

Update `listSidebarOrchestrators` — find the section that reads orchestrator names and session data. The `names.map(async (name) ...)` call needs to also pull `id` and `name` (label) from the config:

```typescript
  const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
  const names = Object.keys(orchMap);

  return Promise.all(
    names.map(async (name): Promise<SidebarOrchestrator> => {
      const orchEntry = orchMap[name];
      const id = (orchEntry?.id as string | undefined) ?? name; // fallback: slug if UUID missing
      const label = (orchEntry?.name as string | undefined) ?? name;
      const raw = readMetadataRaw(getMetaSessionsDir(name), name);
      if (!raw) {
        return { name, id, label, session: null };
      }
      // ... rest of existing probe logic ...
      return { name, id, label, session: dash };
    }),
  );
```

(Keep the existing probe logic for `runtimeNotDefinitelyMissing` unchanged — only add `id` and `label` to the return object and the interface.)

- [ ] **Step 3: Add `path` to `ProjectInfo` and `getAllProjects()` in `project-name.ts`**

Update the `ProjectInfo` interface:

```typescript
export interface ProjectInfo {
  id: string;
  name: string;
  /** Absolute path to the project's local repository. */
  path: string;
  sessionPrefix?: string;
  resolveError?: string;
}
```

Update `getAllProjects()` to include `path`:

```typescript
export const getAllProjects = cache((): ProjectInfo[] => {
  try {
    const config = loadProjectDiscoveryConfig();
    return [
      ...Object.entries(config.projects).map(([id, project]) => ({
        id,
        name: project.name ?? id,
        path: project.path,
        sessionPrefix: project.sessionPrefix ?? id,
      })),
      ...Object.entries(config.degradedProjects).map(([id, project]) => ({
        id,
        name: id,
        path: "",
        sessionPrefix: id,
        resolveError: project.resolveError,
      })),
    ];
  } catch {
    return [];
  }
});
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: TypeScript errors from callers of `ProjectInfo` that don't supply `path` — fix any that appear (typically places constructing `ProjectInfo` objects directly in tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/services.ts \
  packages/web/src/lib/orchestrators.ts \
  packages/web/src/lib/project-name.ts
git commit -m "feat: startup UUID migration, add id/label to SidebarOrchestrator, path to ProjectInfo"
```

---

### Task 5: UUID routing — rename [name] → [id], update all links

**Files:**
- Move: `packages/web/src/app/orchestrators/[name]/` → `packages/web/src/app/orchestrators/[id]/`
- Move: `packages/web/src/app/api/orchestrators/[name]/start/route.ts` → `packages/web/src/app/api/orchestrators/[id]/start/route.ts`
- Modify: `packages/web/src/lib/routes.ts`
- Modify: `packages/web/src/lib/orchestrator-page-data.ts`
- Modify: `packages/web/src/app/api/orchestrators/route.ts`
- Modify: `packages/web/src/components/SidebarOrchestrators.tsx`

**Interfaces:**
- Consumes: `SidebarOrchestrator.id` (Task 4); `orchestratorId` in session metadata (Task 3)
- Produces: `/orchestrators/<uuid>` URLs live; sidebar links use UUID; page data looks up by UUID

- [ ] **Step 1: Rename the Next.js route directories**

```bash
mkdir -p packages/web/src/app/orchestrators/\[id\]
cp packages/web/src/app/orchestrators/\[name\]/page.tsx packages/web/src/app/orchestrators/\[id\]/page.tsx
rm -rf packages/web/src/app/orchestrators/\[name\]

mkdir -p packages/web/src/app/api/orchestrators/\[id\]/start
cp packages/web/src/app/api/orchestrators/\[name\]/start/route.ts packages/web/src/app/api/orchestrators/\[id\]/start/route.ts
rm -rf packages/web/src/app/api/orchestrators/\[name\]
```

- [ ] **Step 2: Update `routes.ts` — orchestrator paths take UUID**

In `packages/web/src/lib/routes.ts`, the signatures don't change (they take a `string`) but the JSDoc clarifies the parameter is now a UUID. Also update the internal `[name]` to `[id]` path reference:

```typescript
/** @param id The orchestrator's UUID. */
export function orchestratorDashboardPath(id: string): string {
  return `/orchestrators/${encodeURIComponent(id)}`;
}

/** @param id The orchestrator's UUID. */
export function orchestratorSessionPath(id: string, sessionId: string): string {
  return `/orchestrators/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`;
}

/** @deprecated Use orchestratorDashboardPath */
export function metaDashboardPath(id: string): string {
  return orchestratorDashboardPath(id);
}
```

- [ ] **Step 3: Update `orchestrators/[id]/page.tsx` — use UUID param**

Open `packages/web/src/app/orchestrators/[id]/page.tsx`. Change the params type from `{ name: string }` to `{ id: string }` and extract `id` instead of `name`:

```typescript
export default async function OrchestratorPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const data = await getOrchestratorPageData(id);
  // ...
  const ownSession = data.orchestrators.find((o) => o.id === id)?.session ?? null;
  // ...
  <OrchestratorSpawnForm orchestratorName={id} />
```

Keep `orchestratorName={id}` — this is the UUID now, which gets sent as `orchestratorOwner` to the spawn API. The spawn API already resolves the UUID to a project.

- [ ] **Step 4: Update `orchestrator-page-data.ts` — look up by UUID**

In `packages/web/src/lib/orchestrator-page-data.ts`, update `getOrchestratorPageData` to accept a UUID and resolve by it:

```typescript
export const getOrchestratorPageData = cache(async function getOrchestratorPageData(
  orchId: string,
): Promise<OrchestratorPageData | null> {
  // ...
  try {
    const services = await getServices();
    config = services.config;
    registry = services.registry;

    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    // Find entry by UUID
    const orchEntry = Object.entries(orchMap).find(([, v]) => (v as { id?: string }).id === orchId);
    if (!orchEntry) {
      return null;
    }
    const [orchSlug] = orchEntry;
    // ...

    const coreSessions = allSessions.filter(
      (s) =>
        !isCoordinatorSession(s) &&
        (s.metadata["orchestratorId"] === orchId ||      // new sessions with UUID
          s.metadata["orchestratorOwner"] === orchSlug || // legacy sessions by slug
          s.metadata["metaOwner"] === orchSlug),
    );
    // ...
    // Pass the slug to listSidebarOrchestrators — it still keys by name
    pageData.orchestrators = await listSidebarOrchestrators(config, registry);
```

Also update `pageData.name` to use `orchId` (UUID) so it's consistent with routing.

- [ ] **Step 5: Update `api/orchestrators/[id]/start/route.ts` — look up by UUID**

In `packages/web/src/app/api/orchestrators/[id]/start/route.ts`, update param and lookup:

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;

  try {
    const { config, sessionManager } = await getServices();

    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    const orchEntry = Object.entries(orchMap).find(([, v]) => (v as { id?: string }).id === id);
    if (!orchEntry) {
      return jsonWithCorrelation(
        { error: `Unknown orchestrator "${id}"` },
        { status: 404 },
        correlationId,
      );
    }
    const [name, orch] = orchEntry;

    const systemPrompt = generateOrchestratorPrompt({ config, name });
    const session = await sessionManager.ensureOrchestrator({
      name,
      systemPrompt,
      agent: orch.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 200 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to start orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
```

- [ ] **Step 6: Update `api/orchestrators/route.ts` POST — assign UUID, accept `label`**

In `packages/web/src/app/api/orchestrators/route.ts`, the POST handler calls `appendOrchestrator`. Update it to:
- Accept an optional `label` field in the request body
- Pass it through to `appendOrchestrator`
- Return the new orchestrator's UUID in the response

Find where the request body is validated (look for `name`, `scope`, `agent` extraction), and add:

```typescript
// After existing body validation:
const label = typeof body.label === "string" ? body.label.trim() || undefined : undefined;

// Where appendOrchestrator is called:
appendOrchestrator(config.configPath, { name, scope, agent, label });

// After config reload, find the new entry's UUID:
const freshConfig = await getServices(); // after invalidation
const freshOrchMap = freshConfig.config.orchestrators ?? freshConfig.config.metaOrchestrators ?? {};
const newId = (freshOrchMap[name] as { id?: string })?.id ?? name;

// Include id in response:
return jsonWithCorrelation({ sessionId: session.id, id: newId }, { status: 201 }, correlationId);
```

- [ ] **Step 7: Update `SidebarOrchestrators.tsx` — use `o.id` for links and API calls**

In `packages/web/src/components/SidebarOrchestrators.tsx`, the component's `SidebarOrchestrator` interface is defined locally. Replace it with an import from `@/lib/orchestrators`:

```typescript
import type { SidebarOrchestrator } from "@/lib/orchestrators";
// Remove the local SidebarOrchestrator interface definition
```

Then update all places that use `o.name` for navigation/API calls to use `o.id`:

1. `orchestratorDashboardPath(o.name)` → `orchestratorDashboardPath(o.id)`
2. `orchestratorSessionPath(o.name, ...)` → `orchestratorSessionPath(o.id, ...)`
3. `fetch(\`/api/orchestrators/${encodeURIComponent(o.name)}/start\`)` → `fetch(\`/api/orchestrators/${encodeURIComponent(o.id)}/start\`)`
4. Display label: change `{o.name}` in the rendered orchestrator row text to `{o.label}` (the display label)
5. `key={o.name}` → `key={o.id}` (for React keys)
6. `startingOrch` Set tracks `o.id` now (change all `startingOrch.has(o.name)` → `startingOrch.has(o.id)` etc.)
7. `expandedOrchestrators` Set tracks `o.id`
8. `orchestrators.find((o) => o.session?.id === activeSessionId || ...)` — update `owning.name` → `owning.id` in `setExpandedOrchestrators`

Keep `o.name` only where it's passed to `getOrchestratorSubSessions(allSessions, o.name)` — that function still uses the slug to filter session metadata, which is correct.

- [ ] **Step 8: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Fix any remaining type errors from the rename (e.g., callers of `orchestratorDashboardPath` that now need a UUID — verify each call site passes `o.id`).

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/app/orchestrators/ \
  packages/web/src/app/api/orchestrators/ \
  packages/web/src/lib/routes.ts \
  packages/web/src/lib/orchestrator-page-data.ts \
  packages/web/src/components/SidebarOrchestrators.tsx
git commit -m "feat: UUID-based orchestrator routing, sidebar links use o.id"
```

---

### Task 6: PATCH/DELETE orchestrator API

**Files:**
- Create: `packages/web/src/app/api/orchestrators/[id]/route.ts`

**Interfaces:**
- Consumes: `updateOrchestrator(configPath, id, updates)`, `deleteOrchestrator(configPath, id)` from Task 2; `sessionManager.kill(sessionId)` (existing); `OrchestratorUpdateInput` from Task 2
- Produces: `PATCH /api/orchestrators/:id` (update name/scope/discover); `DELETE /api/orchestrators/:id` (kill sessions + remove config)

- [ ] **Step 1: Create `packages/web/src/app/api/orchestrators/[id]/route.ts`**

```typescript
import { type NextRequest } from "next/server";
import {
  updateOrchestrator,
  deleteOrchestrator,
  type OrchestratorUpdateInput,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** PATCH /api/orchestrators/[id] — Update orchestrator display name, scope, or discovery. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  const updates: OrchestratorUpdateInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return jsonWithCorrelation({ error: "name must be a string" }, { status: 400 }, correlationId);
    }
    updates.name = body.name.trim();
  }
  if (body.scope !== undefined) {
    if (body.scope !== "all" && !Array.isArray(body.scope)) {
      return jsonWithCorrelation(
        { error: "scope must be \"all\" or an array of directory paths" },
        { status: 400 },
        correlationId,
      );
    }
    updates.scope = body.scope as "all" | string[];
  }
  if (body.discover !== undefined) {
    if (typeof body.discover !== "boolean") {
      return jsonWithCorrelation({ error: "discover must be a boolean" }, { status: 400 }, correlationId);
    }
    updates.discover = body.discover;
  }

  try {
    const { config } = await getServices();
    updateOrchestrator(config.configPath, id, updates);
    invalidatePortfolioServicesCache();
    return jsonWithCorrelation({ ok: true }, { status: 200 }, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update orchestrator";
    const status = msg.includes("not found") ? 404 : 500;
    return jsonWithCorrelation({ error: msg }, { status }, correlationId);
  }
}

/** DELETE /api/orchestrators/[id] — Kill all sessions then remove from config. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;

  try {
    const { config, sessionManager } = await getServices();

    // Verify orchestrator exists by UUID
    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    const orchEntry = Object.entries(orchMap).find(([, v]) => (v as { id?: string }).id === id);
    if (!orchEntry) {
      return jsonWithCorrelation({ error: `Orchestrator "${id}" not found` }, { status: 404 }, correlationId);
    }
    const [orchSlug] = orchEntry;

    // Find all worker sessions owned by this orchestrator (by UUID or legacy slug)
    const allSessions = await sessionManager.list();
    const owned = allSessions.filter(
      (s) =>
        s.metadata["orchestratorId"] === id ||
        s.metadata["orchestratorOwner"] === orchSlug ||
        s.metadata["metaOwner"] === orchSlug,
    );

    // Kill all owned sessions concurrently, best-effort, 10s timeout
    const KILL_TIMEOUT_MS = 10_000;
    const killResults = await Promise.allSettled(
      owned.map((s) =>
        Promise.race([
          sessionManager.kill(s.id),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("kill timeout")), KILL_TIMEOUT_MS),
          ),
        ]),
      ),
    );
    const killed = killResults.filter((r) => r.status === "fulfilled").length;

    deleteOrchestrator(config.configPath, id);
    invalidatePortfolioServicesCache();

    return jsonWithCorrelation({ killed }, { status: 200 }, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete orchestrator";
    const status = msg.includes("not found") ? 404 : 500;
    return jsonWithCorrelation({ error: msg }, { status }, correlationId);
  }
}
```

The cache-invalidation function is `invalidatePortfolioServicesCache()` exported from `@/lib/services`. Import and call it after every config write.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/api/orchestrators/\[id\]/route.ts
git commit -m "feat: PATCH/DELETE /api/orchestrators/[id] for update and remove"
```

---

### Task 7: PATCH session label API

**Files:**
- Modify or create: `packages/web/src/app/api/sessions/[id]/route.ts`

**Interfaces:**
- Consumes: `session.metadata["displayName"]`, `session.metadata["displayNameUserSet"]` pattern from `serialize.ts` (Task 3)
- Produces: `PATCH /api/sessions/:id` accepts `{ label: string }`, writes `displayName` + `displayNameUserSet: "true"` to metadata

- [ ] **Step 1: Check if `route.ts` exists at `api/sessions/[id]/`**

```bash
ls packages/web/src/app/api/sessions/\[id\]/route.ts 2>/dev/null || echo "does not exist"
```

If it exists, add the PATCH handler to the existing file. If not, create it.

- [ ] **Step 2: Add PATCH handler**

If the file already exists, append to it. If creating new, use this content:

```typescript
import { type NextRequest } from "next/server";
import { updateMetadata, getProjectSessionsDir } from "@made-by-moonlight/athene-core";
import { getServices } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** PATCH /api/sessions/[id] — Update session display label. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = getCorrelationId(request);
  const { id: sessionId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  if (typeof body.label !== "string") {
    return jsonWithCorrelation({ error: "label must be a string" }, { status: 400 }, correlationId);
  }
  const label = body.label.trim();

  try {
    const { sessionManager } = await getServices();
    const allSessions = await sessionManager.list();
    const session = allSessions.find((s) => s.id === sessionId);
    if (!session) {
      return jsonWithCorrelation({ error: `Session "${sessionId}" not found` }, { status: 404 }, correlationId);
    }

    const sessionsDir = getProjectSessionsDir(session.projectId);
    updateMetadata(sessionsDir, sessionId, {
      displayName: label,
      displayNameUserSet: "true",
    });

    return jsonWithCorrelation({ ok: true }, { status: 200 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to update session label" },
      { status: 500 },
      correlationId,
    );
  }
}
```

`updateMetadata` is exported from `@made-by-moonlight/athene-core` (confirmed at `packages/core/src/index.ts:52`). Its signature is `updateMetadata(sessionsDir: string, sessionId: string, updates: Record<string, string>): void`.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/api/sessions/\[id\]/
git commit -m "feat: PATCH /api/sessions/[id] to set session display label"
```

---

### Task 8: OrchestratorSettingsBar component

**Files:**
- Create: `packages/web/src/components/OrchestratorSettingsBar.tsx`
- Modify: `packages/web/src/app/orchestrators/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/orchestrators/:id` (Task 6); `DELETE /api/orchestrators/:id` (Task 6); `SidebarOrchestrator.id`, `SidebarOrchestrator.label` (Task 4); `ProjectInfo.path` (Task 4); `getAllProjects()` (Task 4)
- Produces: Inline settings bar rendered above spawn form on the orchestrator page

- [ ] **Step 1: Create `OrchestratorSettingsBar.tsx`**

Create `packages/web/src/components/OrchestratorSettingsBar.tsx`:

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ProjectInfo } from "@/lib/project-name";

interface OrchestratorSettingsBarProps {
  /** Orchestrator UUID. */
  orchId: string;
  /** Current display label (falls back to slug if none). */
  currentLabel: string;
  /** Current scope: "all" or array of directory paths. */
  currentScope: "all" | string[];
  /** Current discover setting. */
  currentDiscover: boolean;
  /** All registered projects for the scope picker. */
  projects: ProjectInfo[];
  /** Count of active sessions — shown in delete confirmation. */
  sessionCount: number;
}

export function OrchestratorSettingsBar({
  orchId,
  currentLabel,
  currentScope,
  currentDiscover,
  projects,
  sessionCount,
}: OrchestratorSettingsBarProps) {
  const router = useRouter();

  // --- Display name ---
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(currentLabel);
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const saveName = async () => {
    if (nameValue.trim() === currentLabel) { setEditingName(false); return; }
    setNameSaving(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setNameSaving(false);
    setEditingName(false);
    router.refresh();
  };

  // --- Scope picker ---
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const [scopeValue, setScopeValue] = useState<"all" | string[]>(currentScope);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveScope = async (newScope: "all" | string[]) => {
    setScopeValue(newScope);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: newScope }),
    });
    router.refresh();
  };

  const toggleScopePath = async (path: string) => {
    const current = scopeValue === "all" ? [] : (scopeValue as string[]);
    const next = current.includes(path) ? current.filter((p) => p !== path) : [...current, path];
    await saveScope(next.length === 0 ? "all" : next);
  };

  const scopeLabel =
    scopeValue === "all"
      ? "All directories"
      : `${(scopeValue as string[]).length} director${(scopeValue as string[]).length === 1 ? "y" : "ies"}`;

  // --- Discovery toggle ---
  const [discover, setDiscover] = useState(currentDiscover);
  const [discoverSaving, setDiscoverSaving] = useState(false);

  const toggleDiscover = async () => {
    const next = !discover;
    setDiscover(next);
    setDiscoverSaving(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discover: next }),
    });
    setDiscoverSaving(false);
    router.refresh();
  };

  // --- Delete ---
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/orchestrators/${encodeURIComponent(orchId)}`, { method: "DELETE" });
    router.push("/");
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-2 text-[12px]">
      {/* Display name */}
      {editingName ? (
        <input
          ref={nameInputRef}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveName();
            if (e.key === "Escape") { setNameValue(currentLabel); setEditingName(false); }
          }}
          disabled={nameSaving}
          className="rounded border border-[var(--color-accent)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[12px] text-[var(--color-text-primary)] focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="flex items-center gap-1 font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
          title="Click to rename"
        >
          {nameValue}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 opacity-50" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        </button>
      )}

      <span className="text-[var(--color-text-muted)]">·</span>

      {/* Scope picker */}
      <div ref={scopeRef} className="relative">
        <button
          type="button"
          onClick={() => setScopeOpen((v) => !v)}
          className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          {scopeLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {scopeOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-2 shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-bg-hover)]">
              <input
                type="radio"
                checked={scopeValue === "all"}
                onChange={() => void saveScope("all")}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-[12px] text-[var(--color-text-primary)]">All directories</span>
            </label>
            {projects.filter((p) => !p.resolveError && p.path).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--color-bg-hover)]">
                <input
                  type="checkbox"
                  checked={scopeValue !== "all" && (scopeValue as string[]).includes(p.path)}
                  onChange={() => void toggleScopePath(p.path)}
                  className="accent-[var(--color-accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="truncate text-[10px] text-[var(--color-text-muted)]">{p.path}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <span className="text-[var(--color-text-muted)]">·</span>

      {/* Discovery toggle */}
      <button
        type="button"
        onClick={() => void toggleDiscover()}
        disabled={discoverSaving}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5",
          discover
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)]",
          "hover:text-[var(--color-text-primary)] disabled:opacity-50",
        )}
        title={discover ? "Discovery on — click to disable" : "Discovery off — click to enable"}
      >
        <span className={cn("h-2 w-2 rounded-full", discover ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-muted)]")} aria-hidden="true" />
        Discovery
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Delete */}
      {deleteConfirm ? (
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">
            Kill {sessionCount} session{sessionCount !== 1 ? "s" : ""} and remove?
          </span>
          <button
            type="button"
            onClick={() => setDeleteConfirm(false)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded px-2 py-0.5 text-[var(--color-status-error)] hover:bg-[color-mix(in_srgb,var(--color-status-error)_15%,transparent)] disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Delete"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDeleteConfirm(true)}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)]"
          aria-label="Delete orchestrator"
          title="Delete orchestrator"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire `OrchestratorSettingsBar` into the page**

In `packages/web/src/app/orchestrators/[id]/page.tsx`, the page is a server component. It needs to pass settings to the client component. The orchestrator's config entry (label, scope, discover) needs to be fetched from `getOrchestratorPageData`.

First, update `OrchestratorPageData` in `orchestrator-page-data.ts` to expose the orchestrator config fields:

```typescript
export interface OrchestratorPageData {
  name: string;          // UUID (the id param)
  slug: string;          // YAML key slug
  label: string;         // display label
  scope: "all" | string[];
  discover: boolean;
  sessions: DashboardSession[];
  projects: ProjectInfo[];
  orchestrators: SidebarOrchestrator[];
  attentionZones: DashboardAttentionZoneMode;
  dashboardLoadError?: string;
}
```

Populate these fields in `getOrchestratorPageData`:

```typescript
const [orchSlug, orchConfig] = orchEntry;
pageData.slug = orchSlug;
pageData.label = (orchConfig.name as string | undefined) ?? orchSlug;
pageData.scope = (orchConfig.scope as "all" | string[]) ?? "all";
pageData.discover = (orchConfig.discover as boolean) ?? false;
```

Then in `page.tsx`:

```typescript
import { OrchestratorSettingsBar } from "@/components/OrchestratorSettingsBar";

// Inside the return JSX, add before the spawn form:
<OrchestratorSettingsBar
  orchId={id}
  currentLabel={data.label}
  currentScope={data.scope}
  currentDiscover={data.discover}
  projects={data.projects}
  sessionCount={data.sessions.length}
/>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/OrchestratorSettingsBar.tsx \
  packages/web/src/app/orchestrators/\[id\]/page.tsx \
  packages/web/src/lib/orchestrator-page-data.ts
git commit -m "feat: OrchestratorSettingsBar — inline rename, scope picker, discovery toggle, delete"
```

---

### Task 9: Session label inline editor in SessionCard

**Files:**
- Modify: `packages/web/src/components/SessionCard.tsx`

**Interfaces:**
- Consumes: `PATCH /api/sessions/:id` with `{ label: string }` (Task 7); `DashboardSession.displayName`, `DashboardSession.displayNameUserSet` (existing)
- Produces: Pencil icon on session card hover; inline input on click; saves label on Enter

- [ ] **Step 1: Add label editor state and handler to `SessionCard`**

In `packages/web/src/components/SessionCard.tsx`, add to the component's state (inside the main `SessionCard` function, after existing `useState` calls):

```typescript
const [editingLabel, setEditingLabel] = useState(false);
const [labelValue, setLabelValue] = useState(session.displayName ?? "");
const [labelSaving, setLabelSaving] = useState(false);
const labelInputRef = useRef<HTMLInputElement>(null);

// Add useEffect for auto-focus (import useRef, useEffect if not already imported)
useEffect(() => {
  if (editingLabel) labelInputRef.current?.focus();
}, [editingLabel]);

const saveLabel = async () => {
  if (!labelValue.trim()) { setEditingLabel(false); return; }
  setLabelSaving(true);
  await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: labelValue.trim() }),
  });
  setLabelSaving(false);
  setEditingLabel(false);
  // The page will refresh on next SSE tick; no explicit refresh needed.
};
```

Note: `useRef` and `useEffect` may already be imported at the top of `SessionCard.tsx`. If so, just use them. If not, add them to the existing React import line.

- [ ] **Step 2: Render the label area in the card JSX**

Find where the session title is rendered in `SessionCard`. Add a label section above or near it. Search for `session.displayName` or `getSessionTitle(session)` in the component's JSX.

Add this block **above** the session title line:

```tsx
{/* Session label — editable inline */}
<div className="group/label flex items-center gap-1 min-w-0">
  {editingLabel ? (
    <input
      ref={labelInputRef}
      value={labelValue}
      onChange={(e) => setLabelValue(e.target.value)}
      onBlur={() => void saveLabel()}
      onKeyDown={(e) => {
        if (e.key === "Enter") void saveLabel();
        if (e.key === "Escape") { setLabelValue(session.displayName ?? ""); setEditingLabel(false); }
      }}
      disabled={labelSaving}
      onClick={(e) => e.stopPropagation()}
      placeholder="Add label…"
      className="w-full rounded border border-[var(--color-accent)] bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-primary)] focus:outline-none"
    />
  ) : (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditingLabel(true); }}
      className="flex min-w-0 items-center gap-1"
      title="Add or edit label"
    >
      {session.displayNameUserSet && session.displayName ? (
        <span className="truncate text-[11px] font-medium text-[var(--color-text-primary)]">
          {session.displayName}
        </span>
      ) : null}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={cn(
          "h-2.5 w-2.5 shrink-0 text-[var(--color-text-muted)]",
          session.displayNameUserSet && session.displayName
            ? "opacity-0 group-hover/label:opacity-100"
            : "opacity-0 group-hover/label:opacity-50",
        )}
        aria-hidden="true"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
      </svg>
    </button>
  )}
</div>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/SessionCard.tsx
git commit -m "feat: inline session label editor on kanban card"
```

---

## Notes for Implementer

- **`invalidatePortfolioServicesCache`**: exported from `@/lib/services` — call it after every config write in the API handlers.
- **`updateMetadata`**: exported from `@made-by-moonlight/athene-core` — signature `(sessionsDir: string, sessionId: string, updates: Record<string, string>): void`.
- **`ProjectConfig.path`**: confirmed at `packages/core/src/types.ts:1632` — use `project.path` for scope directory matching.
- **Scope picker "all" radio + checkboxes**: toggling a checkbox when scope was "all" switches to a single-item array. Handled by `toggleScopePath`.
- **Legacy session filter**: `orchestrator-page-data.ts` Task 5 filters by both `orchestratorId` (UUID) and `orchestratorOwner`/`metaOwner` (slug) — keep both for backward compat with pre-UUID sessions.
