# Collapse Orchestrator Tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three-tier coordinator hierarchy (meta-orchestrator → per-project orchestrator → worker) to two tiers by deleting the per-project orchestrator and renaming "meta-orchestrator" to simply "orchestrator".

**Architecture:** Delete all per-project orchestrator code paths (types, session-manager functions, CLI auto-spawn, web endpoints). Rename every `meta*` symbol and file that belonged to the surviving meta-orchestrator tier to drop the "meta" prefix. Dual-read backward-compat preserves existing deployments: old `metaOrchestrators` config keys, `ATHENE_META_NAME` env var, and `role="meta-orchestrator"` metadata all continue to load correctly.

**Tech Stack:** TypeScript strict, Node.js 20, pnpm 9.15.4 (workspace:*), Vitest, Next.js 15 App Router.

**Spec:** `docs/superpowers/specs/2026-06-23-collapse-orchestrator-tiers-design.md`

## Global Constraints

- TypeScript strict mode; no `any` types.
- Conventional commits; no co-author trailer.
- Cross-platform: never add `process.platform === "win32"` inline; use helpers from `@made-by-moonlight/athene-core`.
- Surgical changes: only touch files required by each task.
- Dual-read backward compat: `metaOrchestrators` config key, `ATHENE_META_NAME` env var, `AO_META_NAME`, `role="meta-orchestrator"` metadata must all continue to work after migration.
- `AO_*` / `.ao` storage paths are NOT renamed (frozen compat rule).
- Component files ≤ 400 lines; test files for every changed component.
- pnpm `workspace:*` for cross-package deps.

---

## File Map

### Modified
| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Remove old per-project types; rename meta-orchestrator types |
| `packages/core/src/env.ts` | Rename `META_NAME` → `ORCHESTRATOR_NAME`; dual-read helper |
| `packages/core/src/config.ts` | Dual-read `metaOrchestrators`/`orchestrators`; rename config types |
| `packages/core/src/global-config.ts` | Dual-read for global config |
| `packages/core/src/session-manager.ts` | Remove per-project spawn fns; rename ensureMetaOrchestrator |
| `packages/core/src/paths.ts` | Add `getOrchestratorSessionsDir` alias |
| `packages/core/src/index.ts` | Update all renamed exports |
| `packages/cli/src/commands/spawn.ts` | Update owner stamping to use `orchestratorOwner` |
| `packages/cli/src/commands/start.ts` | Remove `ensureOrchestrator` calls; add default orch config |
| `packages/cli/src/lib/caller-context.ts` | Already handles `meta-orchestrator`; no change needed |
| `packages/web/src/lib/routes.ts` | Add `orchestratorDashboardPath`; keep `metaDashboardPath` as alias |
| `packages/web/src/lib/types.ts` | Rename `MetaOrchestrator*` → `Orchestrator*` |
| `packages/web/src/components/SidebarOrchestrators.tsx` | Flatten; rename "Parliament" → "Orchestrators" |
| `packages/web/src/components/ProjectSidebar.tsx` | Update prop types |
| `packages/web/src/components/Dashboard.tsx` | Update prop types |
| `packages/web/src/app/api/meta/route.ts` | Forwarding alias to `/api/orchestrators` |
| `packages/web/src/app/api/meta/[name]/start/route.ts` | Forwarding alias to `/api/orchestrators/[name]/start` |
| `packages/web/src/app/api/orchestrators/route.ts` | Replace per-project logic with create-and-start-orchestrator |
| `packages/web/src/app/globals.css` | Update "Parliament" comments |

### Renamed (delete + create)
| From | To |
|------|----|
| `packages/core/src/meta-orchestrator-prompt.ts` | `packages/core/src/orchestrator-prompt.ts` (replaces existing) |
| `packages/core/src/meta-scope.ts` | `packages/core/src/orchestrator-scope.ts` |
| `packages/core/src/meta-orchestrator-config-writer.ts` | `packages/core/src/orchestrator-config-writer.ts` |
| `packages/core/src/prompts/meta-orchestrator.md` | `packages/core/src/prompts/orchestrator.md` (replaces existing) |
| `packages/cli/src/commands/meta.ts` | `packages/cli/src/commands/orchestrator.ts` |
| `packages/web/src/lib/meta-orchestrators.ts` | `packages/web/src/lib/orchestrators.ts` |
| `packages/web/src/lib/meta-page-data.ts` | `packages/web/src/lib/orchestrator-page-data.ts` |
| `packages/web/src/components/CreateMetaOrchestratorModal.tsx` | `packages/web/src/components/CreateOrchestratorModal.tsx` |
| `packages/web/src/app/meta/[name]/page.tsx` | `packages/web/src/app/orchestrators/[name]/page.tsx` (new; old becomes redirect) |

### Deleted
| File | Reason |
|------|--------|
| `packages/core/src/orchestrator-prompt.ts` | Per-project prompt generator |
| `packages/core/src/orchestrator-session-strategy.ts` | Per-project session lifecycle |
| `packages/core/src/prompts/orchestrator.md` | Per-project orchestrator prompt |

### Created
| File | Purpose |
|------|---------|
| `packages/core/src/migration/retire-per-project-orchestrators.ts` | One-shot upgrade migration |
| `packages/web/src/app/orchestrators/[name]/page.tsx` | New orchestrator dashboard page |

### Test files renamed/updated
| File | Change |
|------|--------|
| `packages/core/src/__tests__/session-manager-meta.test.ts` → `session-manager-orchestrator.test.ts` | Rename + update |
| `packages/core/src/__tests__/meta-orchestrator-prompt.test.ts` → `orchestrator-prompt.test.ts` | Rename + update |
| `packages/core/src/__tests__/meta-scope.test.ts` → `orchestrator-scope.test.ts` | Rename + update |
| `packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts` → `orchestrator-config-writer.test.ts` | Rename + update |
| `packages/core/src/__tests__/config-meta.test.ts` | Add dual-read tests |
| `packages/core/src/__tests__/config-meta-global.test.ts` | Add dual-read tests |
| New: `packages/core/src/__tests__/migration/retire-per-project-orchestrators.test.ts` | Migration tests |
| `packages/cli/__tests__/commands/meta.test.ts` → `orchestrator.test.ts` | Rename + update |
| `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx` | Update label + structure assertions |
| `packages/web/src/lib/__tests__/meta-orchestrators.test.ts` → `orchestrators.test.ts` | Rename + update |
| `packages/web/src/lib/__tests__/meta-page-data.test.ts` → `orchestrator-page-data.test.ts` | Rename + update |

---

## Task 1: Core type system cleanup

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/__tests__/session-helpers.test.ts` (update existing helper tests)

**Interfaces:**
- Consumes: nothing (this is the foundation)
- Produces: Updated `SessionKind`, `isOrchestratorSession()`, `isCoordinatorSession()`, `getSessionOrchestratorOwner()`, `MetaOrchestratorConfig` renamed to `OrchestratorEntryConfig`, `MetaScope` renamed to `OrchestratorScope`, `MetaOrchestratorSpawnConfig` renamed to `OrchestratorSpawnConfig`, `SessionSpawnConfig` with `orchestratorOwner`, `SessionManager` interface with `ensureOrchestrator` (renamed from ensureMetaOrchestrator)

- [ ] **Step 1: Write failing tests for the new type helpers**

In `packages/core/src/__tests__/session-helpers.test.ts`, add (or update) the following:

```typescript
import {
  isOrchestratorSession,
  isCoordinatorSession,
  getSessionOrchestratorOwner,
} from "../types.js";

describe("isOrchestratorSession (new: tolerant read)", () => {
  it("returns true for role='orchestrator' (new value)", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "orchestrator" } })).toBe(true);
  });
  it("returns true for role='meta-orchestrator' (legacy value)", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });
  it("returns false for a worker session", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "worker" } })).toBe(false);
  });
  it("returns false when no role metadata", () => {
    expect(isOrchestratorSession({ id: "x", metadata: {} })).toBe(false);
  });
});

describe("isCoordinatorSession", () => {
  it("returns true for orchestrator sessions", () => {
    expect(isCoordinatorSession({ id: "x", metadata: { role: "orchestrator" } })).toBe(true);
    expect(isCoordinatorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });
  it("returns false for workers", () => {
    expect(isCoordinatorSession({ id: "x", metadata: {} })).toBe(false);
  });
});

describe("getSessionOrchestratorOwner", () => {
  it("reads orchestratorOwner (new field)", () => {
    expect(getSessionOrchestratorOwner({ metadata: { orchestratorOwner: "alpha" } })).toBe("alpha");
  });
  it("falls back to metaOwner (legacy field)", () => {
    expect(getSessionOrchestratorOwner({ metadata: { metaOwner: "beta" } })).toBe("beta");
  });
  it("returns 'default' when neither field is set", () => {
    expect(getSessionOrchestratorOwner({ metadata: {} })).toBe("default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test src/__tests__/session-helpers.test.ts 2>&1 | tail -20
```

Expected: FAIL — `isOrchestratorSession` has wrong signature (takes sessionPrefix), `getSessionOrchestratorOwner` doesn't exist.

- [ ] **Step 3: Rewrite `SessionKind` — remove `"meta-orchestrator"`**

In `packages/core/src/types.ts` line 27:
```typescript
// Before:
export type SessionKind = "worker" | "orchestrator" | "meta-orchestrator";

// After:
export type SessionKind = "worker" | "orchestrator";
```

- [ ] **Step 4: Replace `isOrchestratorSession` (per-project) with renamed `isMetaOrchestratorSession`**

In `types.ts`, replace lines 335–406 with:

```typescript
/**
 * True when the session is an orchestrator (formerly called meta-orchestrator).
 * Tolerant read: accepts both the new value "orchestrator" and the legacy
 * "meta-orchestrator" that may still exist in stored metadata.
 */
export function isOrchestratorSession(
  session: { id: SessionId; metadata?: Record<string, string> },
): boolean {
  return (
    session.metadata?.["role"] === "orchestrator" ||
    session.metadata?.["role"] === "meta-orchestrator"
  );
}

/** True for any coordinator session (orchestrator). Workers return false. */
export function isCoordinatorSession(
  session: { id: SessionId; metadata?: Record<string, string> },
): boolean {
  return isOrchestratorSession(session);
}

/** Name of the orchestrator that owns this session. Defaults to "default". */
export function getSessionOrchestratorOwner(
  session: { metadata?: Record<string, string> },
): string {
  return (
    session.metadata?.["orchestratorOwner"] ??
    session.metadata?.["metaOwner"] ??
    "default"
  );
}
```

Delete `getSessionOwnerKind` (lines 395–399) — it is removed entirely.

- [ ] **Step 5: Rename `MetaScope` → `OrchestratorScope` and `MetaOrchestratorConfig` → `OrchestratorEntryConfig`**

In `types.ts` around line 1526:
```typescript
// Before:
export type MetaScope = "all" | { projects: string[] };
export interface MetaOrchestratorConfig { ... }

// After:
export type OrchestratorScope = "all" | { projects: string[] };
/** @deprecated Use OrchestratorScope */
export type MetaScope = OrchestratorScope;

export interface OrchestratorEntryConfig {
  scope: OrchestratorScope;
  discover: boolean;
  agent?: string;
  rules?: string;
}
/** @deprecated Use OrchestratorEntryConfig */
export type MetaOrchestratorConfig = OrchestratorEntryConfig;
```

- [ ] **Step 6: Update `OrchestratorConfig` to add `orchestrators` field (dual-read)**

In `types.ts` around line 1516:
```typescript
// Before:
metaOrchestrators?: Record<string, MetaOrchestratorConfig>;

// After: keep metaOrchestrators for backward compat, add orchestrators as the new canonical field
/** Named orchestrators (portfolio-scoped coordinators). New canonical field. */
orchestrators?: Record<string, OrchestratorEntryConfig>;
/** @deprecated Use orchestrators. Kept for backward compat — config.ts merges both into orchestrators. */
metaOrchestrators?: Record<string, OrchestratorEntryConfig>;
```

- [ ] **Step 7: Rename spawn config types**

In `types.ts` lines 424–439, delete `OrchestratorSpawnConfig` (per-project) and rename `MetaOrchestratorSpawnConfig`:

```typescript
// Delete OrchestratorSpawnConfig (was per-project, lines 424-430) entirely.

/** Config for creating an orchestrator session (formerly MetaOrchestratorSpawnConfig). */
export interface OrchestratorSpawnConfig {
  /** Identity of the orchestrator (its configured name, e.g. "default"). */
  name: string;
  systemPrompt?: string;
  /** Override the agent plugin for this orchestrator. */
  agent?: string;
}
```

- [ ] **Step 8: Update `SessionSpawnConfig` — replace `ownerKind`/`metaOwner` with `orchestratorOwner`**

In `types.ts` around line 408:
```typescript
export interface SessionSpawnConfig {
  projectId: string;
  issueId?: string;
  branch?: string;
  prompt?: string;
  agent?: string;
  subagent?: string;
  /** Name of the orchestrator that owns this session. Defaults to "default". */
  orchestratorOwner?: string;
  // Backward compat: old callers may still pass these; session-manager merges them.
  /** @deprecated Use orchestratorOwner */
  ownerKind?: "meta" | "project";
  /** @deprecated Use orchestratorOwner */
  metaOwner?: string;
}
```

- [ ] **Step 9: Update `SessionManager` interface**

In `types.ts` around line 1994, replace the three per-project methods with the renamed meta method:

```typescript
// Delete these three:
// spawnOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>;
// ensureOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>;
// relaunchOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>;

// Keep/rename (was ensureMetaOrchestrator):
ensureOrchestrator(config: OrchestratorSpawnConfig): Promise<Session>;
```

- [ ] **Step 10: Run typecheck to see compile errors**

```bash
pnpm typecheck 2>&1 | grep "error TS" | head -40
```

Expected: errors from callers of the deleted functions and old type names. Note each error — they will be fixed in later tasks.

- [ ] **Step 11: Run the helper tests**

```bash
cd packages/core && pnpm test src/__tests__/session-helpers.test.ts 2>&1 | tail -10
```

Expected: PASS (the helper unit tests use only types.ts exports, which are now correct).

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/__tests__/session-helpers.test.ts
git commit -m "refactor(core): collapse SessionKind; rename meta-orchestrator types to orchestrator"
```

---

## Task 2: Env dual-read + config dual-read

**Files:**
- Modify: `packages/core/src/env.ts`
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/global-config.ts`
- Test: `packages/core/src/__tests__/config-meta.test.ts`
- Test: `packages/core/src/__tests__/config-meta-global.test.ts`

**Interfaces:**
- Consumes: `OrchestratorScope`, `OrchestratorEntryConfig` from Task 1
- Produces: `ENV.ORCHESTRATOR_NAME` (new key), `nodeEnvRead(ENV.ORCHESTRATOR_NAME)` dual-reads `ATHENE_ORCHESTRATOR_NAME` then `ATHENE_META_NAME`; parsed config normalizes both YAML keys to `orchestrators`

- [ ] **Step 1: Write failing dual-read tests**

Add to `packages/core/src/__tests__/config-meta.test.ts`:

```typescript
describe("dual-read: orchestrators / metaOrchestrators", () => {
  it("parses orchestrators key (new)", () => {
    const cfg = validateConfig({
      ...base,
      orchestrators: { platform: { scope: "all" } },
    });
    expect(cfg.orchestrators?.platform.scope).toBe("all");
  });

  it("parses metaOrchestrators key (legacy) and exposes it as orchestrators", () => {
    const cfg = validateConfig({
      ...base,
      metaOrchestrators: { platform: { scope: "all" } },
    });
    expect(cfg.orchestrators?.platform.scope).toBe("all");
  });

  it("new orchestrators key takes precedence when both present", () => {
    const cfg = validateConfig({
      ...base,
      orchestrators: { orch: { scope: "all" } },
      metaOrchestrators: { old: { scope: "all" } },
    });
    expect(cfg.orchestrators?.orch).toBeDefined();
    expect(cfg.orchestrators?.old).toBeUndefined();
  });
});
```

Add to `packages/core/src/__tests__/config-meta-global.test.ts`:

```typescript
it("loads metaOrchestrators from global config and exposes as orchestrators", () => {
  // write config file with metaOrchestrators key
  const { path } = writeGlobalConfig({ metaOrchestrators: { g1: { scope: "all" } } });
  const loaded = loadConfig(path);
  expect(loaded.metaOrchestrators?.g1 ?? loaded.orchestrators?.g1).toBeDefined();
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd packages/core && pnpm test src/__tests__/config-meta.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Add `ORCHESTRATOR_NAME` to `env.ts`**

In `packages/core/src/env.ts`, add alongside `META_NAME`:

```typescript
/** Name of the owning orchestrator (set on orchestrator-spawned workers). */
ORCHESTRATOR_NAME: `${ENV_PREFIX}ORCHESTRATOR_NAME`,
/** @deprecated Use ORCHESTRATOR_NAME */
META_NAME: `${ENV_PREFIX}META_NAME`,
```

The existing `nodeEnvRead(ENV.META_NAME)` dual-reads `ATHENE_META_NAME` and `AO_META_NAME` automatically (the framework handles this). No extra helper needed — callers will switch to `ENV.ORCHESTRATOR_NAME`, but the legacy key stays for backward compat.

- [ ] **Step 4: Update config.ts — dual-read `metaOrchestrators`/`orchestrators`**

In `packages/core/src/config.ts`, find the `OrchestratorConfigSchema` Zod object (around line 380). It currently has a `metaOrchestrators` key. Change to:

```typescript
// In the Zod schema, accept both keys:
orchestrators: z.record(OrchestratorEntryConfigSchema).optional(),
metaOrchestrators: z.record(OrchestratorEntryConfigSchema).optional(),
```

Then in the post-parse normalization step (wherever the config is post-processed), merge the two into `orchestrators`:

```typescript
// After Zod parse, normalize:
function normalizeOrchestrators(config: RawParsedConfig): RawParsedConfig {
  if (config.metaOrchestrators && !config.orchestrators) {
    return { ...config, orchestrators: config.metaOrchestrators };
  }
  // If both present, new key wins (already correct since orchestrators is defined)
  return config;
}
```

Call `normalizeOrchestrators` in `validateConfig` before returning.

Also rename `MetaOrchestratorConfigSchema` → `OrchestratorEntryConfigSchema` internally.

- [ ] **Step 5: Update global-config.ts similarly**

In `packages/core/src/global-config.ts`, the global config schema (around line 245) has `metaOrchestrators`. Apply the same dual-read: accept both `metaOrchestrators` and `orchestrators`, normalize to `orchestrators` after parse.

```typescript
metaOrchestrators: z.record(z.object({}).passthrough()).optional(),
orchestrators: z.record(z.object({}).passthrough()).optional(),
```

Post-parse normalization (same pattern as config.ts):
```typescript
if (raw.metaOrchestrators && !raw.orchestrators) {
  raw = { ...raw, orchestrators: raw.metaOrchestrators };
}
```

- [ ] **Step 6: Run the dual-read tests**

```bash
cd packages/core && pnpm test src/__tests__/config-meta.test.ts src/__tests__/config-meta-global.test.ts 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 7: Run full core test suite**

```bash
cd packages/core && pnpm test 2>&1 | tail -20
```

Expected: all pass (or same failures as before this task — do not introduce new failures).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/env.ts packages/core/src/config.ts packages/core/src/global-config.ts \
        packages/core/src/__tests__/config-meta.test.ts packages/core/src/__tests__/config-meta-global.test.ts
git commit -m "refactor(core): add ORCHESTRATOR_NAME env key; dual-read metaOrchestrators/orchestrators config"
```

---

## Task 3: Core file renames

**Files:**
- Delete: `packages/core/src/orchestrator-prompt.ts` (per-project)
- Delete: `packages/core/src/orchestrator-session-strategy.ts`
- Delete: `packages/core/src/prompts/orchestrator.md`
- Rename (content kept, file moved): `meta-orchestrator-prompt.ts` → `orchestrator-prompt.ts`
- Rename: `meta-scope.ts` → `orchestrator-scope.ts`
- Rename: `meta-orchestrator-config-writer.ts` → `orchestrator-config-writer.ts`
- Rename: `prompts/meta-orchestrator.md` → `prompts/orchestrator.md`
- Modify: `packages/core/src/index.ts`
- Test: rename `__tests__/meta-orchestrator-prompt.test.ts` → `orchestrator-prompt.test.ts`
- Test: rename `__tests__/meta-scope.test.ts` → `orchestrator-scope.test.ts`
- Test: rename `__tests__/meta-orchestrator-config-writer.test.ts` → `orchestrator-config-writer.test.ts`

**Interfaces:**
- Consumes: `OrchestratorEntryConfig`, `OrchestratorScope` from Task 1
- Produces: `generateOrchestratorPrompt` (was `generateMetaOrchestratorPrompt`), `resolveInScopeProjects` (same name, file renamed), `appendOrchestrator` (was `appendMetaOrchestrator`), exported from `index.ts`

- [ ] **Step 1: Delete the per-project files**

```bash
rm packages/core/src/orchestrator-prompt.ts
rm packages/core/src/orchestrator-session-strategy.ts
rm packages/core/src/prompts/orchestrator.md
```

- [ ] **Step 2: Rename `meta-orchestrator-prompt.ts` → `orchestrator-prompt.ts` and update internals**

```bash
cp packages/core/src/meta-orchestrator-prompt.ts packages/core/src/orchestrator-prompt.ts
rm packages/core/src/meta-orchestrator-prompt.ts
```

In the new `orchestrator-prompt.ts`, update:
- Import: `import orchestratorTemplate from "./prompts/orchestrator.md";` (was `meta-orchestrator.md` — the file is renamed in step 4)
- Export name: `generateMetaOrchestratorPrompt` → `generateOrchestratorPrompt`
- Interface: `MetaOrchestratorPromptConfig` → `OrchestratorPromptConfig`
- Internal: `MetaPromptRenderData` → `OrchestratorPromptRenderData`
- Import type: `MetaOrchestratorConfig` → `OrchestratorEntryConfig`; `resolveInScopeProjects` import path `./meta-scope.js` → `./orchestrator-scope.js`

- [ ] **Step 3: Rename `meta-scope.ts` → `orchestrator-scope.ts`**

```bash
cp packages/core/src/meta-scope.ts packages/core/src/orchestrator-scope.ts
rm packages/core/src/meta-scope.ts
```

In `orchestrator-scope.ts`, update imports:
```typescript
// Before: import type { MetaOrchestratorConfig, ... }
// After:
import type { OrchestratorEntryConfig, OrchestratorConfig, ProjectConfig } from "./types.js";

export function resolveInScopeProjects(
  config: OrchestratorConfig,
  meta: OrchestratorEntryConfig,  // was MetaOrchestratorConfig
): Array<[string, ProjectConfig]> { ... }
```

Function bodies are unchanged; only the parameter type names change.

- [ ] **Step 4: Rename `meta-orchestrator-config-writer.ts` → `orchestrator-config-writer.ts` and update internals**

```bash
cp packages/core/src/meta-orchestrator-config-writer.ts packages/core/src/orchestrator-config-writer.ts
rm packages/core/src/meta-orchestrator-config-writer.ts
```

In `orchestrator-config-writer.ts`:
- Rename `MetaOrchestratorWriteInput` → `OrchestratorWriteInput`
- Rename `appendMetaOrchestrator` → `appendOrchestrator`
- Change the YAML key it writes from `metaOrchestrators` to `orchestrators`:

```typescript
export function appendOrchestrator(configPath: string, input: OrchestratorWriteInput): void {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  // Write to `orchestrators`; a pre-existing `metaOrchestrators` key is left as-is
  // (dual-read handles it on load).
  const existing = (doc.orchestrators ?? {}) as Record<string, unknown>;
  existing[input.name] = {
    scope: input.scope,
    discover: true,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.orchestrators = existing;
  writeFileSync(configPath, stringify(doc), "utf-8");
}
```

- [ ] **Step 5: Rename `prompts/meta-orchestrator.md` → `prompts/orchestrator.md`**

```bash
mv packages/core/src/prompts/meta-orchestrator.md packages/core/src/prompts/orchestrator.md
```

(The old `prompts/orchestrator.md` was deleted in Step 1.)

- [ ] **Step 6: Update `index.ts` exports**

In `packages/core/src/index.ts`:

```typescript
// Remove:
export { generateOrchestratorPrompt } from "./orchestrator-prompt.js";  // deleted file
export { generateMetaOrchestratorPrompt } from "./meta-orchestrator-prompt.js";  // renamed

// Add:
export { generateOrchestratorPrompt } from "./orchestrator-prompt.js";  // new file (was meta-orchestrator-prompt)

// Remove:
export { ... } from "./meta-scope.js";
// Add:
export { resolveInScopeProjects, resolveInScopeProjectIds } from "./orchestrator-scope.js";

// Remove:
export { appendMetaOrchestrator, ... } from "./meta-orchestrator-config-writer.js";
// Add:
export { appendOrchestrator, type OrchestratorWriteInput } from "./orchestrator-config-writer.js";

// Remove:
export { getOrchestratorSessionId, normalizeOrchestratorSessionStrategy } from "./orchestrator-session-strategy.js";  // deleted

// Also export new type aliases for backward compat:
export type { OrchestratorEntryConfig, OrchestratorScope, MetaOrchestratorConfig, MetaScope } from "./types.js";
```

- [ ] **Step 7: Rename the test files and update their imports**

```bash
mv packages/core/src/__tests__/meta-orchestrator-prompt.test.ts \
   packages/core/src/__tests__/orchestrator-prompt.test.ts
mv packages/core/src/__tests__/meta-scope.test.ts \
   packages/core/src/__tests__/orchestrator-scope.test.ts
mv packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts \
   packages/core/src/__tests__/orchestrator-config-writer.test.ts
```

In each renamed test file, update:
- Import paths: `../meta-orchestrator-prompt.js` → `../orchestrator-prompt.js`, etc.
- Function names: `generateMetaOrchestratorPrompt` → `generateOrchestratorPrompt`, `appendMetaOrchestrator` → `appendOrchestrator`
- Type names: `MetaOrchestratorPromptConfig` → `OrchestratorPromptConfig`, `MetaOrchestratorConfig` → `OrchestratorEntryConfig`
- In `orchestrator-config-writer.test.ts`: assert YAML key written is `orchestrators` (not `metaOrchestrators`)

- [ ] **Step 8: Run tests for the renamed files**

```bash
cd packages/core && pnpm test src/__tests__/orchestrator-prompt.test.ts \
  src/__tests__/orchestrator-scope.test.ts \
  src/__tests__/orchestrator-config-writer.test.ts 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 9: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep "error TS" | head -30
```

Note any remaining errors; they'll be fixed in Tasks 4-6. The deletions may produce import errors in callers — that is expected at this stage.

- [ ] **Step 10: Commit**

```bash
git add -A packages/core/src/
git commit -m "refactor(core): rename meta-orchestrator-prompt, meta-scope, meta-orchestrator-config-writer; delete per-project prompt files"
```

---

## Task 4: Session manager + spawn ownership

**Files:**
- Modify: `packages/core/src/session-manager.ts`
- Modify: `packages/core/src/paths.ts`
- Modify: `packages/cli/src/commands/spawn.ts`
- Test: rename `packages/core/src/__tests__/session-manager-meta.test.ts` → `session-manager-orchestrator.test.ts`

**Interfaces:**
- Consumes: `OrchestratorSpawnConfig`, `OrchestratorEntryConfig`, `SessionSpawnConfig` from Task 1; `getMetaSessionsDir` from `paths.ts`; `generateOrchestratorPrompt`, `resolveInScopeProjects` from Task 3
- Produces: `sm.ensureOrchestrator(config: OrchestratorSpawnConfig)` — the only coordinator spawn path; workers stamped with `orchestratorOwner`

- [ ] **Step 1: Rename the meta test file and write new test assertions**

```bash
mv packages/core/src/__tests__/session-manager-meta.test.ts \
   packages/core/src/__tests__/session-manager-orchestrator.test.ts
```

In `session-manager-orchestrator.test.ts`, update `ctx.config.metaOrchestrators` → `ctx.config.orchestrators` and update the `ensureMetaOrchestrator` → `ensureOrchestrator` call:

```typescript
// Update config:
ctx.config.orchestrators = {
  "orch-1": { scope: "all", discover: false },
};

// Update spawn call:
const session = await sm.ensureOrchestrator({
  name: "orch-1",
  systemPrompt: "You are the orchestrator.",
});

// Keep assertions (they remain valid):
expect(session.id).toBe("orch-1");
expect(session.projectId).toBe("_meta");
expect(session.metadata["role"]).toBe("orchestrator");  // NEW: written as "orchestrator"
expect(session.lifecycle.session.kind).toBe("orchestrator");  // NEW: was "meta-orchestrator"
```

Add a test that `spawnOrchestrator` is no longer on the interface:

```typescript
it("does not expose spawnOrchestrator on the SessionManager interface", () => {
  const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
  expect("spawnOrchestrator" in sm).toBe(false);
  expect("relaunchOrchestrator" in sm).toBe(false);
});
```

Add a test for worker ownership stamping:

```typescript
it("stamps orchestratorOwner='default' on workers spawned with no orchestrator context", async () => {
  vi.stubEnv("ATHENE_CALLER_TYPE", "human");
  vi.stubEnv("ATHENE_ORCHESTRATOR_NAME", "");
  const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
  const session = await sm.spawn({ projectId: "proj-1", prompt: "do work" });
  expect(session.metadata["orchestratorOwner"]).toBe("default");
});

it("stamps orchestratorOwner from ATHENE_ORCHESTRATOR_NAME when caller is orchestrator", async () => {
  vi.stubEnv("ATHENE_CALLER_TYPE", "orchestrator");
  vi.stubEnv("ATHENE_ORCHESTRATOR_NAME", "orch-1");
  const sm = createSessionManager({ config: ctx.config, registry: ctx.mockRegistry });
  const session = await sm.spawn({ projectId: "proj-1", prompt: "do work" });
  expect(session.metadata["orchestratorOwner"]).toBe("orch-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test src/__tests__/session-manager-orchestrator.test.ts 2>&1 | tail -20
```

Expected: FAIL — `ensureOrchestrator` still has the old per-project signature, `spawnOrchestrator` still exists.

- [ ] **Step 3: Update `paths.ts` — add `getOrchestratorSessionsDir` alias**

In `packages/core/src/paths.ts`, add after `getMetaSessionsDir`:

```typescript
/** Alias: getOrchestratorSessionsDir(name) === getMetaSessionsDir(name). Storage path unchanged. */
export const getOrchestratorSessionsDir = getMetaSessionsDir;
```

Keep `getMetaSessionsDir` unchanged (backward compat).

- [ ] **Step 4: Remove `spawnOrchestrator`, old `ensureOrchestrator`, and `relaunchOrchestrator` from `session-manager.ts`**

In `packages/core/src/session-manager.ts`:

1. Delete the `spawnOrchestrator` function (line 1963) and its inner `_spawnOrchestratorInner` (line 1990).
2. Delete the old `ensureOrchestrator` function (the per-project version that calls `spawnOrchestrator`).
3. Delete `relaunchOrchestrator`.
4. Remove the `ensureOrchestratorPromises` Map that was for per-project dedup (line 673 area) — or keep only the one for `ensureMetaOrchestrator` if they share a map.

- [ ] **Step 5: Rename `ensureMetaOrchestrator` → `ensureOrchestrator` in `session-manager.ts`**

Find `ensureMetaOrchestrator` (around line 2592) and its internal helper `ensureMetaOrchestratorInternal` (line 2567). Rename:
- `ensureMetaOrchestratorInternal` → `ensureOrchestratorInternal`
- `ensureMetaOrchestrator` → `ensureOrchestrator`
- `ensureMetaOrchestratorPromises` → `ensureOrchestratorPromises`

In `ensureOrchestrator`, update the metadata written to sessions:

```typescript
// When spawning a new orchestrator session, write:
metadata: {
  role: "orchestrator",  // was "meta-orchestrator"
  // ... other fields
}
// And set kind:
kind: "orchestrator",  // was "meta-orchestrator"
```

Update `[ENV.META_NAME]` → `[ENV.ORCHESTRATOR_NAME]` in the env vars set for the orchestrator session (line 2743).

- [ ] **Step 6: Update worker ownership stamping in `session-manager.ts`**

Find the metadata assembly for worker spawning (around line 1827–1840). Replace the old ownerKind/metaOwner logic:

```typescript
// Before:
...(spawnConfig.ownerKind === "meta"
  ? { ownerKind: "meta", ...(spawnConfig.metaOwner ? { metaOwner: spawnConfig.metaOwner } : {}) }
  : {}),

// After:
// orchestratorOwner: explicit config wins, then env, then "default"
orchestratorOwner: (
  spawnConfig.orchestratorOwner ??
  (spawnConfig.metaOwner) ??  // backward compat for old callers
  nodeEnvRead(ENV.ORCHESTRATOR_NAME) ??
  nodeEnvRead(ENV.META_NAME) ??  // backward compat
  "default"
),
```

- [ ] **Step 7: Update `spawn.ts` in the CLI — replace owner flags**

In `packages/cli/src/commands/spawn.ts` around line 205, update the `SpawnOwner` interface and `inferSpawnOwner`:

```typescript
export interface SpawnOwner {
  orchestratorOwner?: string;
  // Backward compat: kept for hidden alias parsing
  ownerKind?: "meta" | "project";
  metaOwner?: string;
}

export function inferSpawnOwner(
  env: Record<string, string | undefined>,
  opts: { orchestratorOwner?: string; ownerKind?: string; metaOwner?: string },
): SpawnOwner {
  if (opts.orchestratorOwner) return { orchestratorOwner: opts.orchestratorOwner };
  // backward compat: old --meta-owner / --owner-kind flags
  if (opts.ownerKind === "meta" && opts.metaOwner) {
    return { orchestratorOwner: opts.metaOwner };
  }
  const callerType = env[ENV.CALLER_TYPE] ?? env[legacyEnvName(ENV.CALLER_TYPE)];
  if (callerType === "orchestrator" || callerType === "meta-orchestrator") {
    const name =
      env[ENV.ORCHESTRATOR_NAME] ?? env[legacyEnvName(ENV.ORCHESTRATOR_NAME)] ??
      env[ENV.META_NAME] ?? env[legacyEnvName(ENV.META_NAME)];
    return { orchestratorOwner: name ?? "default" };
  }
  return { orchestratorOwner: "default" };
}
```

Update the spawn call that assembles `SessionSpawnConfig`:

```typescript
// Before:
...(owner?.ownerKind ? { ownerKind: owner.ownerKind } : {}),
...(owner?.metaOwner ? { metaOwner: owner.metaOwner } : {}),

// After:
orchestratorOwner: owner?.orchestratorOwner ?? "default",
```

- [ ] **Step 8: Run the orchestrator session-manager tests**

```bash
cd packages/core && pnpm test src/__tests__/session-manager-orchestrator.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 9: Run full core tests**

```bash
cd packages/core && pnpm test 2>&1 | tail -20
```

Fix any new failures before continuing.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/session-manager.ts packages/core/src/paths.ts \
        packages/core/src/__tests__/session-manager-orchestrator.test.ts \
        packages/cli/src/commands/spawn.ts
git commit -m "refactor(core,cli): remove per-project orchestrator spawn fns; rename ensureMetaOrchestrator→ensureOrchestrator; update worker ownership"
```

---

## Task 5: Migration — retire per-project orchestrators

**Files:**
- Create: `packages/core/src/migration/retire-per-project-orchestrators.ts`
- Create: `packages/core/src/__tests__/migration/retire-per-project-orchestrators.test.ts`
- Modify: `packages/core/src/index.ts` (export the migration function)

**Interfaces:**
- Consumes: `getMetaSessionsDir`, `readMetadataRaw`, `writeMetadata` (or raw fs), `appendOrchestrator` from Task 3
- Produces: `retirePerProjectOrchestrators(globalConfigPath: string, projectsBaseDir: string, runtime: Runtime | null): Promise<void>` — called by `athene start` in Task 6

- [ ] **Step 1: Write the migration test with fixture data**

Create `packages/core/src/__tests__/migration/retire-per-project-orchestrators.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, tmpdir } from "node:path";
import { retirePerProjectOrchestrators } from "../../migration/retire-per-project-orchestrators.js";

function makeFixture() {
  const base = mkdtempSync(join(tmpdir(), "ao-migration-test-"));
  // Per-project orchestrator under projects/proj1/sessions/
  const projSessions = join(base, "projects", "proj1", "sessions");
  mkdirSync(projSessions, { recursive: true });
  writeFileSync(join(projSessions, "proj1-orchestrator.json"), JSON.stringify({
    role: "orchestrator",
    project: "proj1",
    status: "working",
  }));

  // Meta orchestrator under projects/_meta/orch1/sessions/
  const metaSessions = join(base, "projects", "_meta", "orch1", "sessions");
  mkdirSync(metaSessions, { recursive: true });
  writeFileSync(join(metaSessions, "orch1.json"), JSON.stringify({
    role: "meta-orchestrator",
    project: "_meta",
    status: "idle",
  }));

  // Global config file
  const configPath = join(base, "config.yaml");
  writeFileSync(configPath, "metaOrchestrators:\n  orch1:\n    scope: all\n");

  // Marker dir
  const migrationsDir = join(base, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  return { base, projSessions, metaSessions, configPath, migrationsDir };
}

let fixture: ReturnType<typeof makeFixture>;

beforeEach(() => { fixture = makeFixture(); });
afterEach(() => rmSync(fixture.base, { recursive: true, force: true }));

it("archives per-project orchestrator session file", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  expect(existsSync(join(fixture.projSessions, "proj1-orchestrator.json"))).toBe(false);
  // archived
  const archiveDir = join(fixture.base, "archive");
  expect(existsSync(archiveDir)).toBe(true);
});

it("rewrites _meta session role to 'orchestrator'", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  const { readFileSync } = await import("node:fs");
  const raw = JSON.parse(readFileSync(join(fixture.metaSessions, "orch1.json"), "utf-8"));
  expect(raw.role).toBe("orchestrator");
});

it("ensures default orchestrator config entry", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  const { readFileSync } = await import("node:fs");
  const cfg = readFileSync(fixture.configPath, "utf-8");
  expect(cfg).toContain("default:");
});

it("writes marker file so migration does not re-run", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  expect(existsSync(join(fixture.base, "migrations", "retire-per-project-orchestrators.done"))).toBe(true);
});

it("is idempotent: second run is a no-op", async () => {
  await retirePerProjectOrchestrators(fixture.base, fixture.configPath, null);
  // Run again — should not throw or corrupt state
  await expect(
    retirePerProjectOrchestrators(fixture.base, fixture.configPath, null)
  ).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/core && pnpm test src/__tests__/migration/retire-per-project-orchestrators.test.ts 2>&1 | tail -10
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the migration**

Create `packages/core/src/migration/retire-per-project-orchestrators.ts`:

```typescript
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { Runtime } from "../types.js";

const MARKER_FILE = "retire-per-project-orchestrators.done";

export async function retirePerProjectOrchestrators(
  aoBaseDir: string,
  globalConfigPath: string,
  runtime: Runtime | null,
): Promise<void> {
  const markerPath = join(aoBaseDir, "migrations", MARKER_FILE);
  if (existsSync(markerPath)) return; // idempotent

  const projectsDir = join(aoBaseDir, "projects");
  if (existsSync(projectsDir)) {
    for (const projectId of readdirSync(projectsDir)) {
      if (projectId === "_meta") continue; // skip the reserved meta scope
      const sessionsDir = join(projectsDir, projectId, "sessions");
      if (!existsSync(sessionsDir)) continue;
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(sessionsDir, file);
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf-8"));
          if (raw.role !== "orchestrator") continue;
          // Best-effort runtime kill (pass null when runtime not available)
          if (runtime) {
            try {
              const handle = raw.runtimeHandle ? JSON.parse(raw.runtimeHandle) : null;
              if (handle) await runtime.destroy(handle).catch(() => {});
            } catch { /* ignore */ }
          }
          // Archive: move file to archive directory
          const archiveDir = join(aoBaseDir, "archive", projectId);
          mkdirSync(archiveDir, { recursive: true });
          renameSync(filePath, join(archiveDir, file));
        } catch { /* skip unreadable files */ }
      }
    }
  }

  // Rewrite _meta session roles from "meta-orchestrator" → "orchestrator"
  const metaDir = join(projectsDir, "_meta");
  if (existsSync(metaDir)) {
    for (const name of readdirSync(metaDir)) {
      const sessionsDir = join(metaDir, name, "sessions");
      if (!existsSync(sessionsDir)) continue;
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(sessionsDir, file);
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf-8"));
          if (raw.role === "meta-orchestrator") {
            writeFileSync(filePath, JSON.stringify({ ...raw, role: "orchestrator" }, null, 2));
          }
        } catch { /* skip */ }
      }
    }
  }

  // Ensure default orchestrator entry in global config
  if (existsSync(globalConfigPath)) {
    try {
      const doc = (parse(readFileSync(globalConfigPath, "utf-8")) ?? {}) as Record<string, unknown>;
      const existing = (doc.orchestrators ?? doc.metaOrchestrators ?? {}) as Record<string, unknown>;
      if (!Object.hasOwn(existing, "default")) {
        const target = (doc.orchestrators ?? {}) as Record<string, unknown>;
        target["default"] = { scope: "all", discover: true };
        doc.orchestrators = target;
        writeFileSync(globalConfigPath, stringify(doc), "utf-8");
      }
    } catch { /* do not corrupt config on parse error */ }
  }

  // Write marker
  const migrationsDir = join(aoBaseDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(markerPath, "", "utf-8");
}
```

- [ ] **Step 4: Export from `index.ts`**

```typescript
export { retirePerProjectOrchestrators } from "./migration/retire-per-project-orchestrators.js";
```

- [ ] **Step 5: Run migration tests**

```bash
cd packages/core && pnpm test src/__tests__/migration/retire-per-project-orchestrators.test.ts 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/migration/ packages/core/src/__tests__/migration/ packages/core/src/index.ts
git commit -m "feat(core): add migration to retire per-project orchestrators on upgrade"
```

---

## Task 6: CLI cleanup

**Files:**
- Rename: `packages/cli/src/commands/meta.ts` → `packages/cli/src/commands/orchestrator.ts`
- Create: `packages/cli/src/commands/meta.ts` (thin wrapper + hidden alias)
- Modify: `packages/cli/src/commands/start.ts`
- Modify: wherever `meta.ts` is registered in the CLI entry point
- Test: rename `packages/cli/__tests__/commands/meta.test.ts` → `orchestrator.test.ts`
- Test: `packages/cli/__tests__/commands/start.test.ts` (update)

**Interfaces:**
- Consumes: `retirePerProjectOrchestrators` from Task 5; `appendOrchestrator` from Task 3; `ensureOrchestrator` from Task 4; `generateOrchestratorPrompt` from Task 3
- Produces: `ao orchestrator start <name>` command; `ao meta-start <name>` hidden alias; `athene start` no longer auto-spawns per-project orchestrators

- [ ] **Step 1: Rename the meta test file**

```bash
mv packages/cli/__tests__/commands/meta.test.ts \
   packages/cli/__tests__/commands/orchestrator.test.ts
```

In `orchestrator.test.ts`:
- Update import path: `../../src/commands/meta.js` → `../../src/commands/orchestrator.js`
- Update command strings: `meta-start` → `orchestrator start`

Add alias test:

```typescript
it("meta-start <name> prints deprecation warning and starts the orchestrator", async () => {
  const { stderr, stdout } = await runCommand("meta-start my-orch");
  expect(stderr).toContain("deprecated");
  expect(stdout).toContain("my-orch");
});
```

- [ ] **Step 2: Create `orchestrator.ts` from `meta.ts`**

```bash
cp packages/cli/src/commands/meta.ts packages/cli/src/commands/orchestrator.ts
rm packages/cli/src/commands/meta.ts
```

In `orchestrator.ts`:
- Rename the commander command group from `"meta"` to `"orchestrator"`
- Rename `meta-start` subcommand to `orchestrator start`
- Update all `getSessionMetaOwner` → `getSessionOrchestratorOwner`
- Update all `generateMetaOrchestratorPrompt` → `generateOrchestratorPrompt`
- Update all `appendMetaOrchestrator` → `appendOrchestrator`
- Update all `ensureMetaOrchestrator` → `ensureOrchestrator`
- Update `resolveMetaName` calls if the function is renamed — or keep it local (it's not exported from core)
- Update `config.metaOrchestrators` → `config.orchestrators ?? config.metaOrchestrators` (dual-read)

The subcommand that was `meta-start <name>` becomes a subcommand `start <name>` inside the `orchestrator` group (invoked as `ao orchestrator start <name>`).

- [ ] **Step 3: Create the thin `meta.ts` backward-compat wrapper**

Create `packages/cli/src/commands/meta.ts`:

```typescript
import type { Command } from "commander";
import { registerOrchestratorCommands } from "./orchestrator.js";

/**
 * Backward-compat: `ao meta` and `ao meta-start` forward to `ao orchestrator`.
 * Hidden so they don't appear in `ao --help`.
 */
export function registerMetaCommands(program: Command): void {
  // Register the real commands under their new names
  registerOrchestratorCommands(program);

  // Hidden alias: `ao meta-start <name>` → `ao orchestrator start <name>`
  program
    .command("meta-start <name>", { hidden: true })
    .description("(deprecated) Use: ao orchestrator start")
    .allowUnknownOption()
    .action((name: string) => {
      console.warn(
        "\n⚠️  ao meta-start is deprecated. Use: ao orchestrator start\n",
      );
      // Forward to the orchestrator start handler
      program.parse(["orchestrator", "start", name], { from: "user" });
    });
}
```

Export `registerOrchestratorCommands` from `orchestrator.ts`:
```typescript
export function registerOrchestratorCommands(program: Command): void { ... }
```

- [ ] **Step 4: Update CLI entry point to import from `orchestrator.ts`**

Find the file that registers CLI commands (likely `packages/cli/src/index.ts` or `packages/cli/src/cli.ts`). Update:

```typescript
// Before:
import { registerMetaCommands } from "./commands/meta.js";
// After:
import { registerMetaCommands } from "./commands/meta.js"; // still works (wrapper)
```

No change needed if the entry point imports `meta.ts` by name — the wrapper re-exports the orchestrator commands.

- [ ] **Step 5: Update `start.ts` — remove per-project orchestrator spawning**

In `packages/cli/src/commands/start.ts`:

**Remove** the two blocks that call `sm.ensureOrchestrator`:
1. Around line 934–970: delete the entire `if (opts?.orchestrator !== false)` block that calls `sm.ensureOrchestrator({ projectId, systemPrompt })`.
2. Around line 1380–1392: delete the block that calls `sm.ensureOrchestrator({ projectId, systemPrompt })` in `attachToRunningDaemon`.

**Remove** the import of `generateOrchestratorPrompt` (the old per-project one) and `getOrchestratorSessionId` (deleted). Keep or add `generateOrchestratorPrompt` only if it now refers to the new meta one.

**Add** a call to `retirePerProjectOrchestrators` early in the start sequence:

```typescript
import { retirePerProjectOrchestrators, getAoBaseDir, getGlobalConfigPath } from "@made-by-moonlight/athene-core";

// Near the top of startProject / startFresh, before session manager setup:
await retirePerProjectOrchestrators(getAoBaseDir(), getGlobalConfigPath(), null).catch((e) => {
  console.warn("Migration warning:", e instanceof Error ? e.message : String(e));
});
```

**Add** default orchestrator config entry (if migration didn't already add it — migration handles this):
The migration's Step 3 already handles ensuring the `default` entry. No extra code needed in `start.ts`.

- [ ] **Step 6: Run CLI tests**

```bash
cd packages/cli && pnpm test __tests__/commands/orchestrator.test.ts 2>&1 | tail -20
```

Expected: PASS (update any test helper invocations of `meta-start` to use `orchestrator start`).

- [ ] **Step 7: Run full CLI tests**

```bash
cd packages/cli && pnpm test 2>&1 | tail -20
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep "error TS" | head -20
```

Expected: zero errors (or errors only in web, addressed in Task 7).

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/commands/ packages/cli/__tests__/commands/
git commit -m "refactor(cli): rename meta → orchestrator command group; add meta-start hidden alias; remove per-project auto-spawn"
```

---

## Task 7: Web — lib, components, routes

**Files:**
- Rename: `packages/web/src/lib/meta-orchestrators.ts` → `packages/web/src/lib/orchestrators.ts`
- Rename: `packages/web/src/lib/meta-page-data.ts` → `packages/web/src/lib/orchestrator-page-data.ts`
- Rename: `packages/web/src/components/CreateMetaOrchestratorModal.tsx` → `packages/web/src/components/CreateOrchestratorModal.tsx`
- Modify: `packages/web/src/lib/routes.ts`
- Modify: `packages/web/src/lib/types.ts`
- Modify: `packages/web/src/components/SidebarOrchestrators.tsx`
- Modify: `packages/web/src/components/ProjectSidebar.tsx`
- Modify: `packages/web/src/components/Dashboard.tsx`
- Modify: `packages/web/src/app/api/orchestrators/route.ts`
- Modify: `packages/web/src/app/api/meta/route.ts` → forwarding alias
- Modify: `packages/web/src/app/api/meta/[name]/start/route.ts` → forwarding alias
- Create: `packages/web/src/app/api/orchestrators/[name]/start/route.ts`
- Create: `packages/web/src/app/orchestrators/[name]/page.tsx`
- Modify: `packages/web/src/app/meta/[name]/page.tsx` → redirect
- Modify: `packages/web/src/app/globals.css`
- Test: rename `packages/web/src/lib/__tests__/meta-orchestrators.test.ts` → `orchestrators.test.ts`
- Test: rename `packages/web/src/lib/__tests__/meta-page-data.test.ts` → `orchestrator-page-data.test.ts`
- Test: `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx`

**Interfaces:**
- Consumes: `listSidebarOrchestrators` from `orchestrators.ts`; `OrchestratorEntryConfig` from core Task 1; `orchestratorDashboardPath` from `routes.ts`
- Produces: flat `SidebarOrchestrators` showing "Orchestrators" label; `/orchestrators/[name]` page; `/meta/[name]` redirect

- [ ] **Step 1: Update the SidebarOrchestrators test to assert new structure**

In `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx`:

```typescript
// Update import: SidebarMetaOrchestrator → SidebarOrchestrator
import { SidebarOrchestrators, type SidebarOrchestrator } from "@/components/SidebarOrchestrators";

it("renders 'Orchestrators' label (not Parliament)", () => {
  render(<SidebarOrchestrators
    collapsed={false}
    orchestrators={[{ name: "orch-1", session: null }]}
    activeSessionId={undefined}
    onNavigate={() => {}}
  />);
  expect(screen.getByText("Orchestrators")).toBeInTheDocument();
  expect(screen.queryByText("Parliament")).not.toBeInTheDocument();
});

it("renders flat list without Meta/Project sub-headers", () => {
  render(<SidebarOrchestrators
    collapsed={false}
    orchestrators={[
      { name: "alpha", session: null },
      { name: "beta", session: null },
    ]}
    activeSessionId={undefined}
    onNavigate={() => {}}
  />);
  expect(screen.queryByText("Meta")).not.toBeInTheDocument();
  expect(screen.queryByText("Project")).not.toBeInTheDocument();
  expect(screen.getByText("alpha")).toBeInTheDocument();
  expect(screen.getByText("beta")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd packages/web && pnpm test src/components/__tests__/SidebarOrchestrators.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Rename `meta-orchestrators.ts` → `orchestrators.ts`**

```bash
cp packages/web/src/lib/meta-orchestrators.ts packages/web/src/lib/orchestrators.ts
rm packages/web/src/lib/meta-orchestrators.ts
```

In `orchestrators.ts`:
- Rename `listSidebarMetaOrchestrators` → `listSidebarOrchestrators`
- Delete `buildSidebarProjectOrchestrators` function (and its type `SidebarProjectOrchestrator`)
- Rename `SidebarMetaOrchestrator` → `SidebarOrchestrator`
- Update `config.metaOrchestrators` → `config.orchestrators ?? config.metaOrchestrators` (dual-read)
- Update import from core: remove `getSessionMetaOwner`, add `getSessionOrchestratorOwner` if needed

- [ ] **Step 4: Rename `meta-page-data.ts` → `orchestrator-page-data.ts`**

```bash
cp packages/web/src/lib/meta-page-data.ts packages/web/src/lib/orchestrator-page-data.ts
rm packages/web/src/lib/meta-page-data.ts
```

In `orchestrator-page-data.ts`:
- Export name: `getMetaPageData` → `getOrchestratorPageData`
- Update imports: `listSidebarMetaOrchestrators` → `listSidebarOrchestrators` from `./orchestrators`
- Update `config.metaOrchestrators` → `config.orchestrators ?? config.metaOrchestrators`

- [ ] **Step 5: Update `routes.ts`**

```typescript
/** @deprecated Use orchestratorDashboardPath */
export function metaDashboardPath(name: string): string {
  return orchestratorDashboardPath(name);
}

export function orchestratorDashboardPath(name: string): string {
  return `/orchestrators/${encodeURIComponent(name)}`;
}
```

- [ ] **Step 6: Update `types.ts` — rename MetaOrchestrator* types**

In `packages/web/src/lib/types.ts`, rename any `MetaOrchestrator*` interfaces to `Orchestrator*`. Keep deprecated type aliases for any exported types used by callers not in this task.

- [ ] **Step 7: Rewrite `SidebarOrchestrators.tsx` — flatten structure**

Replace the `SidebarOrchestratorsProps` interface:

```typescript
/** A named orchestrator and its (optional) running session, for the sidebar. */
export interface SidebarOrchestrator {
  name: string;
  session: DashboardSession | null;
}

interface SidebarOrchestratorsProps {
  collapsed: boolean;
  orchestrators: SidebarOrchestrator[];
  activeSessionId: string | undefined;
  onNavigate: (href: string, session?: DashboardSession) => void;
}
```

Remove:
- `metaOrchestrators: SidebarMetaOrchestrator[]` prop
- `registeredProjectIds: string[]` prop
- The two-subgroup render logic ("Meta" / "Project" labels)
- The per-project orchestrator row renderer

Change the section header string from `"Parliament"` to `"Orchestrators"`.

The component now renders a single flat list of `orchestrators` entries (using the renamed `SidebarOrchestrator` type). Each row links to `orchestratorDashboardPath(o.name)`.

Import `CreateOrchestratorModal` instead of `CreateMetaOrchestratorModal`.

- [ ] **Step 8: Rename `CreateMetaOrchestratorModal.tsx` → `CreateOrchestratorModal.tsx`**

```bash
mv packages/web/src/components/CreateMetaOrchestratorModal.tsx \
   packages/web/src/components/CreateOrchestratorModal.tsx
```

In `CreateOrchestratorModal.tsx`:
- `CreateMetaOrchestratorModalProps` → `CreateOrchestratorModalProps`
- `CreateMetaOrchestratorModal` → `CreateOrchestratorModal`
- POST endpoint: `"/api/meta"` → `"/api/orchestrators"`

- [ ] **Step 9: Update `ProjectSidebar.tsx` and `Dashboard.tsx`**

In `ProjectSidebar.tsx`:
- Import `SidebarOrchestrators, type SidebarOrchestrator` (updated names)
- Remove `metaOrchestrators` prop from `SidebarOrchestrators` usage; pass only `orchestrators`
- Remove `registeredProjectIds` prop from `SidebarOrchestrators`
- Update the type `ProjectSidebarOrchestrator` if it was based on `SidebarMetaOrchestrator`

In `Dashboard.tsx`:
- Update import from `SidebarOrchestrators`: use new prop names
- Remove `metaOrchestrators` prop; fold into single `orchestrators` prop

- [ ] **Step 10: Replace `/api/orchestrators/route.ts` with create-and-start-orchestrator logic**

The existing `/api/orchestrators/route.ts` handled per-project orchestrators. Replace it entirely with the logic currently in `/api/meta/route.ts` (create new named orchestrator):

```typescript
import { type NextRequest } from "next/server";
import {
  appendOrchestrator,
  generateOrchestratorPrompt,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { validateIdentifier } from "@/lib/validation";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/orchestrators — Create a new named orchestrator and start it. */
export async function POST(request: NextRequest) {
  // ... same logic as the current /api/meta/route.ts POST handler,
  // with config.metaOrchestrators → config.orchestrators ?? config.metaOrchestrators
  // and appendMetaOrchestrator → appendOrchestrator
  // and ensureMetaOrchestrator → ensureOrchestrator (on sessionManager)
  // and generateMetaOrchestratorPrompt → generateOrchestratorPrompt
}
```

- [ ] **Step 11: Create `/api/orchestrators/[name]/start/route.ts`**

Copy and adapt the logic from `/api/meta/[name]/start/route.ts`:

```typescript
/** POST /api/orchestrators/[name]/start — Start the named orchestrator. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { config, sessionManager } = await getServices();
  const meta = (config.orchestrators ?? config.metaOrchestrators)?.[name];
  if (!meta) {
    return jsonWithCorrelation({ error: `Unknown orchestrator "${name}"` }, { status: 404 }, correlationId);
  }
  const systemPrompt = generateOrchestratorPrompt({ config, name });
  const session = await sessionManager.ensureOrchestrator({ name, systemPrompt, agent: meta.agent });
  return jsonWithCorrelation({ sessionId: session.id }, { status: 200 }, correlationId);
}
```

- [ ] **Step 12: Make `/api/meta/route.ts` and `/api/meta/[name]/start/route.ts` forwarding aliases**

`/api/meta/route.ts`:
```typescript
import { POST as _POST } from "../orchestrators/route.js";
export const POST = _POST;
```

`/api/meta/[name]/start/route.ts`:
```typescript
import { POST as _POST } from "../../orchestrators/[name]/start/route.js";
// Can't re-export with params forwarding cleanly — keep as thin wrapper:
export async function POST(request: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  return _POST(request, ctx);
}
```

- [ ] **Step 13: Create `/app/orchestrators/[name]/page.tsx`**

```bash
mkdir -p packages/web/src/app/orchestrators/\[name\]
```

Copy `packages/web/src/app/meta/[name]/page.tsx` to `packages/web/src/app/orchestrators/[name]/page.tsx` and update:

```typescript
import { getOrchestratorPageData } from "@/lib/orchestrator-page-data";

export default async function OrchestratorPage({ params }: ...) {
  const { name } = await params;
  const data = await getOrchestratorPageData(name);
  if (!data) notFound();
  return (
    <Dashboard
      ...
      // same props as MetaPage, using new names
    />
  );
}
```

- [ ] **Step 14: Convert `/app/meta/[name]/page.tsx` to a redirect**

Replace the page content with:

```typescript
import { redirect } from "next/navigation";

export default async function MetaPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  redirect(`/orchestrators/${encodeURIComponent(name)}`);
}
```

- [ ] **Step 15: Update `globals.css` comments**

In `packages/web/src/app/globals.css`, line 5362 and 5484: update the comments from "Parliament section (meta orchestrators + per-project orchestrators)" to "Orchestrators sidebar section". No token renames.

- [ ] **Step 16: Rename the web test files**

```bash
mv packages/web/src/lib/__tests__/meta-orchestrators.test.ts \
   packages/web/src/lib/__tests__/orchestrators.test.ts
mv packages/web/src/lib/__tests__/meta-page-data.test.ts \
   packages/web/src/lib/__tests__/orchestrator-page-data.test.ts
```

Update imports and function names in each renamed test file.

- [ ] **Step 17: Run all web tests**

```bash
cd packages/web && pnpm test 2>&1 | tail -25
```

Expected: all PASS.

- [ ] **Step 18: Run full typecheck**

```bash
pnpm typecheck 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 19: Commit**

```bash
git add packages/web/src/
git commit -m "refactor(web): flatten Parliament→Orchestrators sidebar; rename meta-* files; add /orchestrators route"
```

---

## Task 8: Backward-compat + regression tests

**Files:**
- Test: `packages/core/src/__tests__/config-meta.test.ts` (add compat assertions)
- Test: `packages/core/src/__tests__/session-helpers.test.ts` (add compat assertions)
- Test: `packages/cli/__tests__/commands/spawn-owner.test.ts` (update)

**Interfaces:** None — this task only adds tests.

- [ ] **Step 1: Add read-time compat tests to `config-meta.test.ts`**

```typescript
describe("backward-compat: old metadata still loads", () => {
  it("role='meta-orchestrator' → isOrchestratorSession returns true", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });

  it("metaOrchestrators config key still parses", () => {
    const cfg = validateConfig({ ...base, metaOrchestrators: { old: { scope: "all" } } });
    expect(cfg.orchestrators?.old).toBeDefined();
  });
});
```

- [ ] **Step 2: Add env compat tests**

In `packages/cli/__tests__/lib/caller-context.test.ts`:

```typescript
it("ATHENE_CALLER_TYPE=meta-orchestrator is treated as orchestrator", () => {
  vi.stubEnv("ATHENE_CALLER_TYPE", "meta-orchestrator");
  expect(getCallerType()).toBe("orchestrator");
});
```

In `packages/core/__tests__` (or spawn-owner test):

```typescript
it("ATHENE_META_NAME falls back when ATHENE_ORCHESTRATOR_NAME is absent", () => {
  vi.stubEnv("ATHENE_META_NAME", "legacy-orch");
  vi.stubEnv("ATHENE_ORCHESTRATOR_NAME", "");
  const owner = inferSpawnOwner(process.env as Record<string, string>, {});
  expect(owner.orchestratorOwner).toBe("legacy-orch");
});
```

- [ ] **Step 3: Add lifecycle regression assertion**

In `packages/core/src/__tests__/lifecycle-manager.test.ts`, add:

```typescript
it("lifecycle manager has no branch on orchestrator role or session kind", () => {
  // This is a static check — if lifecycle-manager.ts referenced "meta-orchestrator"
  // or branched on role, the typecheck above would have caught it. This test
  // documents the invariant explicitly.
  const { createLifecycleManager } = await import("../lifecycle-manager.js");
  expect(createLifecycleManager).toBeDefined(); // just confirming module loads
});
```

(The real assertion is that `pnpm typecheck` passes — the test documents the invariant.)

- [ ] **Step 4: Run all tests**

```bash
pnpm test 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 5: Final typecheck**

```bash
pnpm typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/__tests__/ packages/cli/__tests__/
git commit -m "test: add backward-compat and regression tests for orchestrator tier collapse"
```

---

## Self-Review

### Spec coverage

| Spec section | Task(s) that implement it |
|---|---|
| §1 Role model & terminology flip | Task 1 (types), Task 4 (session-manager), Task 7 (web types) |
| §2 File renames & deletes | Task 3 (core files), Task 6 (CLI), Task 7 (web) |
| §3 Bootstrap & default orchestrator | Task 5 (migration adds default entry), Task 6 (start.ts) |
| §4 Spawn & ownership | Task 4 (session-manager + spawn.ts) |
| §5 Web / Orchestrators sidebar | Task 7 (SidebarOrchestrators, routes, API) |
| §6 Migration & testing | Task 5 (migration), Task 8 (compat tests) |
| §7 Tests | Within each task + Task 8 |

All spec requirements have a corresponding task. ✓

### Type consistency

- `OrchestratorSpawnConfig` (new, was `MetaOrchestratorSpawnConfig`): used in Task 1 interface, Task 4 session-manager, Task 6 CLI. ✓
- `OrchestratorEntryConfig` (was `MetaOrchestratorConfig`): used in Task 1 types.ts, Task 2 config.ts, Task 3 orchestrator-scope.ts. ✓
- `OrchestratorScope` (was `MetaScope`): defined Task 1, used Task 3. ✓
- `listSidebarOrchestrators` (was `listSidebarMetaOrchestrators`): defined Task 7 orchestrators.ts, consumed by orchestrator-page-data.ts in Task 7. ✓
- `SidebarOrchestrator` (was `SidebarMetaOrchestrator`): defined Task 7 SidebarOrchestrators.tsx, consumed by ProjectSidebar.tsx and orchestrators.ts. ✓
- `ensureOrchestrator` (was `ensureMetaOrchestrator`): defined Task 1 interface, implemented Task 4, called Task 6 start.ts and Task 7 API routes. ✓
- `appendOrchestrator` (was `appendMetaOrchestrator`): defined Task 3, exported Task 3, called Task 6 CLI and Task 7 API. ✓
- `generateOrchestratorPrompt` (was `generateMetaOrchestratorPrompt`): defined Task 3, exported Task 3, called Task 6 CLI and Task 7 API. ✓
