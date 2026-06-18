# Meta Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portfolio-scoped "meta orchestrator" coordinator that routes work across many projects and dispatches workers directly into them, with a per-meta dashboard view and a symmetric anti-collision guard.

**Architecture:** Foundational core changes first (types → config → paths → collision guard → session-manager spawn → meta prompt → meta-orchestrator spawn → lifecycle/supervision), then the CLI surface, then the web dashboard (color tokens → helper → card/sidebar → route). Each layer builds on the one below. Meta workers live in their target project's storage stamped with owner metadata; the collision guard lives in the shared core spawn path so it protects both coordinator types symmetrically.

**Tech Stack:** TypeScript (strict, no `any`), Zod, Vitest, Next.js 15 App Router + React 19, Tailwind v4 CSS custom properties. Conventional commits, no co-author. Cross-platform: use `isWindows()` / core path helpers, never `process.platform`.

**Reference spec:** `docs/superpowers/specs/2026-06-16-meta-orchestrator-design.md`

> **Superseded note (ath-rev-23):** This plan is a historical record of the original task breakdown. The `discover` "live reconcile" portion of **Task 8** was **not shipped**. v1 decision: `discover` is *resolve-at-start* with honest messaging — scope is resolved from the global registry at `meta-start`, there is no live auto-discovery, and the `reconcileMetaScope`/`reconcileMetaScopeIds` helper was removed (not just left unwired). See the spec (§Non-Goals, §10) for the authoritative behavior. The rest of Task 8 (coordinator-aware worker enumeration) did ship.

**Note on commits:** this repo has GPG signing configured but no local secret key in this environment. If `git commit` fails with a gpg signing error, append `--no-gpg-sign` to the commit command.

---

## Phase 1 — Core foundations

### Task 1: SessionKind + owner/coordinator helpers

**Files:**
- Modify: `packages/core/src/types.ts` (SessionKind ~line 27; helpers near `isOrchestratorSession` ~line 335; `SessionSpawnConfig` ~line 372)
- Test: `packages/core/src/__tests__/session-helpers.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/session-helpers.test.ts
import { describe, it, expect } from "vitest";
import {
  isMetaOrchestratorSession,
  isCoordinatorSession,
  getSessionOwnerKind,
  getSessionMetaOwner,
} from "../types.js";

const s = (metadata: Record<string, string>) => ({ id: "x-1", metadata });

describe("meta session helpers", () => {
  it("detects a meta orchestrator session", () => {
    expect(isMetaOrchestratorSession(s({ role: "meta-orchestrator" }))).toBe(true);
    expect(isMetaOrchestratorSession(s({ role: "orchestrator" }))).toBe(false);
    expect(isMetaOrchestratorSession(s({}))).toBe(false);
  });

  it("treats both orchestrator and meta orchestrator as coordinators", () => {
    expect(isCoordinatorSession(s({ role: "meta-orchestrator" }))).toBe(true);
    expect(isCoordinatorSession(s({ role: "orchestrator" }))).toBe(true);
    expect(isCoordinatorSession(s({ role: "worker" }))).toBe(false);
  });

  it("defaults ownerKind to project and reads meta owner", () => {
    expect(getSessionOwnerKind(s({}))).toBe("project");
    expect(getSessionOwnerKind(s({ ownerKind: "meta" }))).toBe("meta");
    expect(getSessionMetaOwner(s({ metaOwner: "meta-1" }))).toBe("meta-1");
    expect(getSessionMetaOwner(s({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-helpers`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

In `types.ts`, change SessionKind:
```ts
export type SessionKind = "worker" | "orchestrator" | "meta-orchestrator";
```
Add `ownerKind?` / `metaOwner?` to `SessionSpawnConfig`:
```ts
export interface SessionSpawnConfig {
  projectId: string;
  issueId?: string;
  branch?: string;
  prompt?: string;
  agent?: string;
  subagent?: string;
  /** Coordinator that dispatched this session. Defaults to "project". */
  ownerKind?: "meta" | "project";
  /** Name of the dispatching meta orchestrator (set only when ownerKind === "meta"). */
  metaOwner?: string;
}
```
Add helpers immediately after `isOrchestratorSession`:
```ts
export function isMetaOrchestratorSession(
  session: { id: SessionId; metadata?: Record<string, string> },
): boolean {
  return session.metadata?.["role"] === "meta-orchestrator";
}

export function isCoordinatorSession(
  session: { id: SessionId; metadata?: Record<string, string> },
  sessionPrefix?: string,
  allSessionPrefixes?: string[],
): boolean {
  return (
    isMetaOrchestratorSession(session) ||
    isOrchestratorSession(session, sessionPrefix, allSessionPrefixes)
  );
}

export function getSessionOwnerKind(
  session: { metadata?: Record<string, string> },
): "meta" | "project" {
  return session.metadata?.["ownerKind"] === "meta" ? "meta" : "project";
}

export function getSessionMetaOwner(
  session: { metadata?: Record<string, string> },
): string | null {
  return session.metadata?.["metaOwner"] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/__tests__/session-helpers.test.ts
git commit -m "feat(core): add meta-orchestrator SessionKind and owner/coordinator helpers"
```

---

### Task 2: Config schema — metaOrchestrators + project description

**Files:**
- Modify: `packages/core/src/config.ts` (`ProjectConfigSchema` ~line 247; `OrchestratorConfigSchema` ~line 357)
- Modify: `packages/core/src/types.ts` (export `MetaOrchestratorConfig`, `MetaScope`)
- Test: `packages/core/src/__tests__/config-meta.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/config-meta.test.ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "../config.js"; // see Step 3 note if the parse export differs

const base = {
  projects: {
    web: { path: "/tmp/web", description: "UI app", sessionPrefix: "web" },
    api: { path: "/tmp/api", description: "backend", sessionPrefix: "api" },
  },
};

describe("metaOrchestrators config", () => {
  it("parses scope:all and defaults discover to false", () => {
    const cfg = parseConfig({ ...base, metaOrchestrators: { platform: { scope: "all" } } });
    expect(cfg.metaOrchestrators?.platform.scope).toBe("all");
    expect(cfg.metaOrchestrators?.platform.discover).toBe(false);
  });

  it("parses an explicit project-list scope with discover + rules", () => {
    const cfg = parseConfig({
      ...base,
      metaOrchestrators: {
        "meta-1": { scope: { projects: ["web", "api"] }, discover: true, rules: "prefer api" },
      },
    });
    const m = cfg.metaOrchestrators?.["meta-1"];
    expect(m?.scope).toEqual({ projects: ["web", "api"] });
    expect(m?.discover).toBe(true);
    expect(m?.rules).toBe("prefer api");
  });

  it("keeps per-project description", () => {
    const cfg = parseConfig(base);
    expect(cfg.projects.web.description).toBe("UI app");
  });

  it("rejects a project literally named _meta", () => {
    expect(() => parseConfig({ projects: { _meta: { path: "/tmp/x" } } })).toThrow(/_meta/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- config-meta`
Expected: FAIL — `metaOrchestrators` undefined / `_meta` not rejected. (If `parseConfig` is not an existing export, first grep `packages/core/src/config.ts` for the synchronous parse helper used by other config tests and use that name — adjust the import in Step 1 accordingly.)

- [ ] **Step 3: Implement**

In `config.ts`, add `description` to `ProjectConfigSchema`:
```ts
  description: z.string().optional(),
```
Above `OrchestratorConfigSchema`, add:
```ts
const MetaScopeSchema = z.union([
  z.literal("all"),
  z.object({ projects: z.array(z.string()).min(1) }),
]);

const MetaOrchestratorConfigSchema = z.object({
  scope: MetaScopeSchema,
  discover: z.boolean().default(false),
  agent: z.string().optional(),
  rules: z.string().optional(),
});
```
Inside `OrchestratorConfigSchema`, after `reactions`:
```ts
  metaOrchestrators: z
    .record(
      z.string().regex(/^[a-zA-Z0-9_-]+$/, "meta orchestrator name must match [a-zA-Z0-9_-]+"),
      MetaOrchestratorConfigSchema,
    )
    .optional(),
```
Add `_meta` reservation. In the place that validates project IDs (the `.superRefine` on `OrchestratorConfigSchema`, or a post-parse loop — match the existing pattern), reject a project keyed `_meta`:
```ts
if (Object.prototype.hasOwnProperty.call(value.projects, "_meta")) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["projects", "_meta"],
    message: "'_meta' is a reserved project ID used for meta orchestrator storage; rename this project.",
  });
}
```
In `types.ts`, export the inferred types (place near other config types):
```ts
export type MetaScope = "all" | { projects: string[] };
export interface MetaOrchestratorConfig {
  scope: MetaScope;
  discover: boolean;
  agent?: string;
  rules?: string;
}
```
Add `metaOrchestrators?: Record<string, MetaOrchestratorConfig>` and `description?: string` to the corresponding `OrchestratorConfig` / `ProjectConfig` TS interfaces in `types.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- config-meta`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @made-by-moonlight/athene-core typecheck
git add packages/core/src/config.ts packages/core/src/types.ts packages/core/src/__tests__/config-meta.test.ts
git commit -m "feat(core): add metaOrchestrators config and per-project description"
```

---

### Task 3: Meta session path helpers

**Files:**
- Modify: `packages/core/src/paths.ts`
- Test: `packages/core/src/__tests__/paths-meta.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/paths-meta.test.ts
import { describe, it, expect } from "vitest";
import { getMetaSessionsDir, getMetaSessionPath } from "../paths.js";

describe("meta session paths", () => {
  it("places meta sessions under projects/_meta/<name>/sessions", () => {
    expect(getMetaSessionsDir("meta-1").replace(/\\/g, "/")).toMatch(
      /projects\/_meta\/meta-1\/sessions$/,
    );
    expect(getMetaSessionPath("meta-1").replace(/\\/g, "/")).toMatch(
      /projects\/_meta\/meta-1\/sessions\/meta-1\.json$/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- paths-meta`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

In `paths.ts`, mirror the existing `getProjectSessionsDir`/`getSessionPath` helpers (reuse the same base-dir resolution they use — do NOT hardcode `~`):
```ts
export function getMetaSessionsDir(name: string): string {
  // Reuse the existing project sessions layout with the reserved "_meta" projectId.
  return getProjectSessionsDir("_meta", name) /* see note */;
}
```
> Note: match the real `paths.ts` signatures. If `getProjectSessionsDir(projectId)` does not take a sub-segment, build the path with `path.join(getProjectsDir(), "_meta", name, "sessions")` using the same root resolver the other helpers call. Then:
```ts
export function getMetaSessionPath(name: string): string {
  return join(getMetaSessionsDir(name), `${name}.json`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- paths-meta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/paths.ts packages/core/src/__tests__/paths-meta.test.ts
git commit -m "feat(core): add meta orchestrator session path helpers"
```

---

### Task 4: Spawn collision guard (pure function)

**Files:**
- Create: `packages/core/src/spawn-collision.ts`
- Test: `packages/core/src/__tests__/spawn-collision.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/spawn-collision.test.ts
import { describe, it, expect } from "vitest";
import { checkSpawnCollision } from "../spawn-collision.js";
import type { Session } from "../types.js";

const session = (over: Partial<Session>): Session =>
  ({ id: "web-2", projectId: "web", issueId: null, metadata: {}, ...over }) as Session;

describe("checkSpawnCollision", () => {
  it("hard-refuses when a live session already owns the issue (any owner)", () => {
    const live = [session({ id: "web-2", issueId: "ENG-42", metadata: { ownerKind: "project" } })];
    const r = checkSpawnCollision(live, { projectId: "web", issueId: "ENG-42" });
    expect(r.hard?.id).toBe("web-2");
  });

  it("does not hard-refuse when issues differ", () => {
    const live = [session({ issueId: "ENG-1" })];
    expect(checkSpawnCollision(live, { projectId: "web", issueId: "ENG-42" }).hard).toBeNull();
  });

  it("returns advisory peers for freeform work (no issueId)", () => {
    const live = [session({ id: "web-3" }), session({ id: "web-4" })];
    const r = checkSpawnCollision(live, { projectId: "web" });
    expect(r.hard).toBeNull();
    expect(r.advisory.map((s) => s.id)).toEqual(["web-3", "web-4"]);
  });

  it("returns empty when there are no live peers", () => {
    const r = checkSpawnCollision([], { projectId: "web", issueId: "ENG-42" });
    expect(r.hard).toBeNull();
    expect(r.advisory).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- spawn-collision`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/spawn-collision.ts
import type { Session } from "./types.js";

export interface SpawnCollisionResult {
  /** A live session that already owns the requested issueId, if any. */
  hard: Session | null;
  /** Live sessions in the target project (surfaced as advisory for freeform work). */
  advisory: Session[];
}

export interface SpawnCollisionIntent {
  projectId: string;
  issueId?: string;
}

/**
 * Pure collision check. Callers pass the already-filtered set of LIVE
 * (non-terminal) sessions in the target project, so this function does no I/O.
 *
 * - Issue-keyed work: hard collision if any live session owns the same issue.
 * - Freeform work: never hard; advisory = all live peers.
 */
export function checkSpawnCollision(
  liveSessions: Session[],
  intent: SpawnCollisionIntent,
): SpawnCollisionResult {
  const peers = liveSessions.filter((s) => s.projectId === intent.projectId);
  const hard = intent.issueId
    ? (peers.find((s) => s.issueId === intent.issueId) ?? null)
    : null;
  return { hard, advisory: peers };
}

/** Human-readable refusal line, e.g. "web-2 already owns ENG-42 (owner=project, status=pr_open)". */
export function formatHardRefusal(existing: Session): string {
  const owner = existing.metadata?.["ownerKind"] === "meta" ? "meta" : "project";
  return `SPAWN REFUSED: ${existing.id} already owns ${existing.issueId} (owner=${owner}, status=${existing.status})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- spawn-collision`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/spawn-collision.ts packages/core/src/__tests__/spawn-collision.test.ts
git commit -m "feat(core): add pure spawn-collision guard"
```

---

### Task 5: Wire collision guard + owner stamping into the spawn path

**Files:**
- Modify: `packages/core/src/session-manager.ts` (`_spawnInner` ~line 1265; worker metadata write site ~line 1272+)
- Test: `packages/core/src/__tests__/session-manager-spawn-guard.test.ts` (create — follow the mocking pattern already used by existing session-manager tests in this dir)

**Invariants preserved:** guard runs before any worktree/runtime creation (no orphaned resources on refusal); no terminal-state writes added; default ownerKind = "project".

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/session-manager-spawn-guard.test.ts
import { describe, it, expect, vi } from "vitest";
// Construct a SessionManager with mocked plugins/registry mirroring the existing
// session-manager tests. Seed list() to return one LIVE session owning "ENG-42".
// Assert spawn({ projectId, issueId: "ENG-42" }) rejects with /SPAWN REFUSED/.
// Assert no runtime.create / workspace.create was called (resource ordering).
// (Use the harness/fixtures already present in this __tests__ directory.)
it.todo("hard-refuses duplicate issue and creates no resources");
it.todo("stamps ownerKind=meta and metaOwner on the spawned session metadata");
```
> Replace the `it.todo`s with concrete tests using the existing session-manager test fixtures in this directory (they already build a SessionManager with mock runtime/workspace/agent plugins). The two behaviors to assert: (a) duplicate-issue spawn rejects with `/SPAWN REFUSED/` and the mock `runtime.create` is never called; (b) `spawn({ ..., ownerKind: "meta", metaOwner: "meta-1" })` persists `ownerKind`/`metaOwner` into the session metadata.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-manager-spawn-guard`
Expected: FAIL — guard not wired, metadata not stamped.

- [ ] **Step 3: Implement**

Near the top of `_spawnInner`, after the `project` lookup and before agent/runtime resolution and resource creation:
```ts
// Anti-collision guard (protects both coordinator types symmetrically).
const liveInProject = (await list()).filter(
  (s) => s.projectId === spawnConfig.projectId && !isTerminalSession(s),
);
const collision = checkSpawnCollision(liveInProject, {
  projectId: spawnConfig.projectId,
  issueId: spawnConfig.issueId,
});
if (collision.hard) {
  throw new Error(formatHardRefusal(collision.hard));
}
```
> Use the existing terminal-state predicate in this module (grep for `isTerminalSession` / the canonical terminal check) rather than introducing a new one. `list()` is the in-module session enumerator. The advisory list is intentionally not acted on here — it is surfaced by the CLI (Task 10).

At the worker session metadata write site (where `role: "worker"` and other metadata are persisted), add owner stamping:
```ts
...(spawnConfig.ownerKind === "meta"
  ? { ownerKind: "meta", ...(spawnConfig.metaOwner ? { metaOwner: spawnConfig.metaOwner } : {}) }
  : {}),
```
Add imports at the top of the file:
```ts
import { checkSpawnCollision, formatHardRefusal } from "./spawn-collision.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-manager-spawn-guard`
Expected: PASS.

- [ ] **Step 5: Full core test + commit**

```bash
pnpm --filter @made-by-moonlight/athene-core test
git add packages/core/src/session-manager.ts packages/core/src/__tests__/session-manager-spawn-guard.test.ts
git commit -m "feat(core): enforce spawn collision guard and stamp owner metadata"
```

---

### Task 6: Meta orchestrator prompt template + generator

**Files:**
- Create: `packages/core/src/prompts/meta-orchestrator.md`
- Create: `packages/core/src/meta-orchestrator-prompt.ts`
- Test: `packages/core/src/__tests__/meta-orchestrator-prompt.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/meta-orchestrator-prompt.test.ts
import { describe, it, expect } from "vitest";
import { generateMetaOrchestratorPrompt } from "../meta-orchestrator-prompt.js";

const cfg = {
  port: 3000,
  metaOrchestrators: { "meta-1": { scope: { projects: ["web"] }, discover: true, rules: "prefer api" } },
  projects: { web: { name: "Web", repo: "org/web", path: "/x", defaultBranch: "main", sessionPrefix: "web", description: "UI app" } },
} as unknown as Parameters<typeof generateMetaOrchestratorPrompt>[0]["config"];

describe("generateMetaOrchestratorPrompt", () => {
  it("renders the catalog, dashboard URL, scope and rules", () => {
    const p = generateMetaOrchestratorPrompt({ config: cfg, name: "meta-1" });
    expect(p).toContain("web");
    expect(p).toContain("UI app");
    expect(p).toContain("/meta/meta-1");
    expect(p).toContain("prefer api");
  });

  it("omits the rules section when no rules are configured", () => {
    const noRules = { ...cfg, metaOrchestrators: { "meta-1": { scope: "all", discover: false } } } as typeof cfg;
    const p = generateMetaOrchestratorPrompt({ config: noRules, name: "meta-1" });
    expect(p).not.toContain("prefer api");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- meta-orchestrator-prompt`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `prompts/meta-orchestrator.md` — a portfolio variant of `orchestrator.md`. Use `{{KEY}}` placeholders and the optional-section markers (`{{RULES_SECTION_START}}…{{RULES_SECTION_END}}`). Content covers: read-only/no-PR rules lifted to portfolio scope; catalog-based metadata-first routing; the scout pattern (spawn read-only, confirm, kill, dispatch real worker); owner tagging (`ownerKind`/`metaOwner`) and dual visibility; the anti-collision guard (hard for issues, advisory for freeform — check existing sessions first). Include placeholders: `{{metaName}}`, `{{dashboardUrl}}`, `{{scopeDescription}}`, `{{discoverDescription}}`, `{{projectCatalog}}`, and the rules optional section.

Create `meta-orchestrator-prompt.ts` modeled on `orchestrator-prompt.ts` (reuse the same `renderTemplate` / optional-section approach — copy the small helpers or factor shared ones; do not over-abstract):
```ts
import metaTemplate from "./prompts/meta-orchestrator.md";
import type { OrchestratorConfig } from "./types.js";

export interface MetaOrchestratorPromptConfig {
  config: OrchestratorConfig;
  name: string;
}

export function generateMetaOrchestratorPrompt(opts: MetaOrchestratorPromptConfig): string {
  const meta = opts.config.metaOrchestrators?.[opts.name];
  if (!meta) throw new Error(`Unknown meta orchestrator: ${opts.name}`);

  const inScope = resolveInScopeProjects(opts.config, meta); // 'all' → all projects; list → those IDs
  const projectCatalog = inScope
    .map(([id, p]) => `- ${id} (${p.repo ?? "no repo"}, prefix ${p.sessionPrefix ?? id}): ${p.description ?? "no description"}`)
    .join("\n");

  const data = {
    metaName: opts.name,
    dashboardUrl: `http://localhost:${opts.config.port ?? 3000}/meta/${opts.name}`,
    scopeDescription: meta.scope === "all" ? "all registered projects" : `projects: ${meta.scope.projects.join(", ")}`,
    discoverDescription: meta.discover ? "enabled (new projects auto-included)" : "disabled",
    projectCatalog,
    rulesSection: meta.rules?.trim() ?? "",
  };
  // Render with the same optional-section + {{KEY}} machinery as orchestrator-prompt.ts.
  return renderMetaTemplate(metaTemplate, data);
}
```
> Implement `resolveInScopeProjects(config, meta)` (a small local helper that returns `[id, ProjectConfig][]`) and `renderMetaTemplate` (the placeholder/optional-section renderer copied/shared from `orchestrator-prompt.ts`). Ensure `.md` import works — `orchestrator.md` already imports the same way, so the build is configured for it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- meta-orchestrator-prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/prompts/meta-orchestrator.md packages/core/src/meta-orchestrator-prompt.ts packages/core/src/__tests__/meta-orchestrator-prompt.test.ts
git commit -m "feat(core): add meta orchestrator prompt template and generator"
```

---

### Task 7: `ensureMetaOrchestrator` in the session manager

**Files:**
- Modify: `packages/core/src/session-manager.ts` (add `ensureMetaOrchestrator`, mirror `ensureOrchestrator`/`spawnOrchestrator` ~lines 1673–2270; export in the returned object ~line 3710)
- Modify: `packages/core/src/index.ts` (export new public symbols)
- Test: `packages/core/src/__tests__/session-manager-meta.test.ts` (create)

**Invariants preserved:** reuses the orchestrator spawn flow (runtime handle, prompt injection, lifecycle record); stores under `getMetaSessionPath(name)`; sets `role: "meta-orchestrator"` and `kind: "meta-orchestrator"`; `workspacePath` may be null (no worktree) — document this deviation inline.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/session-manager-meta.test.ts
// Using the existing session-manager test harness:
// - ensureMetaOrchestrator({ name: "meta-1", systemPrompt }) creates a session
//   with id "meta-1", projectId "_meta", metadata.role === "meta-orchestrator".
// - The persisted path is getMetaSessionPath("meta-1").
// - It does not call workspace.create (no worktree).
it.todo("spawns a meta orchestrator under _meta with role meta-orchestrator and no worktree");
```
> Implement against the existing harness (same mocks as other session-manager tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-manager-meta`
Expected: FAIL — `ensureMetaOrchestrator` not defined.

- [ ] **Step 3: Implement**

Add `MetaOrchestratorSpawnConfig` to `types.ts`:
```ts
export interface MetaOrchestratorSpawnConfig {
  name: string;
  systemPrompt?: string;
  agent?: string;
}
```
In `session-manager.ts`, add `ensureMetaOrchestrator(config: MetaOrchestratorSpawnConfig)` mirroring `ensureOrchestrator`, but: `projectId = "_meta"`, `session.id = config.name`, persisted to `getMetaSessionPath(config.name)`, metadata `{ role: "meta-orchestrator" }`, `SessionStateRecord.kind = "meta-orchestrator"`, and skip workspace/worktree creation (set `workspacePath = null`). Reuse the runtime-create + prompt-injection portion of the orchestrator flow. Export `ensureMetaOrchestrator` from the returned manager object. Re-export `MetaOrchestratorSpawnConfig`, `checkSpawnCollision`, `isCoordinatorSession`, `isMetaOrchestratorSession`, `getSessionMetaOwner`, `getSessionOwnerKind`, `generateMetaOrchestratorPrompt`, `getMetaSessionPath`, `getMetaSessionsDir` from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- session-manager-meta && pnpm --filter @made-by-moonlight/athene-core typecheck`
Expected: PASS + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session-manager.ts packages/core/src/types.ts packages/core/src/index.ts packages/core/src/__tests__/session-manager-meta.test.ts
git commit -m "feat(core): add ensureMetaOrchestrator spawn flow"
```

---

### Task 8: Lifecycle — coordinator-aware enumeration + discover reconcile

> **Superseded (ath-rev-23):** the **discover reconcile** half of this task was dropped. v1 ships `discover` as *resolve-at-start* (resolved from the global registry at `meta-start`; re-run `meta-start` to refresh) with no live auto-discovery, and `reconcileMetaScope`/`reconcileMetaScopeIds` and its supervision-tick wiring were removed. Ignore the `discover reconcile` test todo and the `reconcileMetaScope` helper in Step 3 below. Only the **coordinator-aware worker enumeration** (`isCoordinatorSession`) part of this task is live.

**Files:**
- Modify: `packages/core/src/lifecycle-manager.ts` (worker-enumeration filters; supervision tick)
- Modify: `packages/core/src/portfolio-session-service.ts` (coordinator filter, if it filters orchestrators)
- Test: `packages/core/src/__tests__/lifecycle-meta.test.ts` (create)

**Invariants preserved:** `sm.list()` still persists `detecting` not `terminated`; `deriveLegacyStatus()` unchanged; reconcile only updates in-memory catalog, never writes terminal state.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/lifecycle-meta.test.ts
// - A meta-orchestrator session (role: "meta-orchestrator") is excluded from the
//   worker enumeration used for kanban/counts (assert it is filtered by isCoordinatorSession).
// - discover reconcile: given a meta with scope {projects:[web]} discover:true and a
//   global config that now also has "api", re-resolving scope includes "api".
it.todo("excludes meta orchestrator sessions from worker enumeration");
it.todo("discover reconcile adds a newly-registered project to in-scope set");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- lifecycle-meta`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace `isOrchestratorSession(...)` with `isCoordinatorSession(...)` everywhere a worker view/count must exclude coordinators (grep `lifecycle-manager.ts` and `portfolio-session-service.ts`). Add a `reconcileMetaScope(config, meta)` helper (can live in `meta-orchestrator-prompt.ts` next to `resolveInScopeProjects`, or a small `meta-scope.ts`) that re-resolves in-scope project IDs from a freshly-read config; for `scope:'all'` returns all IDs, for an explicit list unions newly-registered IDs when `discover`. Call it on the supervision tick for any running meta orchestrator (reuse the existing polling loop — do not add a second loop).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @made-by-moonlight/athene-core test -- lifecycle-meta`
Expected: PASS.

- [ ] **Step 5: Full core suite + commit**

```bash
pnpm --filter @made-by-moonlight/athene-core test && pnpm --filter @made-by-moonlight/athene-core typecheck
git add packages/core/src
git commit -m "feat(core): coordinator-aware enumeration and meta scope reconcile"
```

---

## Phase 2 — CLI

### Task 9: Spawn flags `--owner-kind` / `--meta-owner`

**Files:**
- Modify: `packages/cli/src/commands/spawn.ts`
- Test: `packages/cli/src/commands/__tests__/spawn-owner-flags.test.ts` (create — follow existing CLI command test pattern)

- [ ] **Step 1: Write the failing test**

```ts
// Assert the spawn command parses --owner-kind meta --meta-owner meta-1 and
// passes { ownerKind: "meta", metaOwner: "meta-1" } into sm.spawn(...).
it.todo("forwards --owner-kind/--meta-owner into the spawn config");
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-cli test -- spawn-owner-flags` → FAIL.

- [ ] **Step 3: Implement**

Add `.option("--owner-kind <kind>", "internal: meta|project")` and `.option("--meta-owner <name>", "internal: dispatching meta orchestrator")` to the spawn command. Validate `ownerKind ∈ {meta, project}`; require `metaOwner` when `ownerKind === "meta"`. Pass both into the `SessionSpawnConfig`. After spawn of freeform (`--prompt`) work, print the advisory peer list (call `sm.list()`, filter live peers in the project, print ids + task labels + owners) so the coordinator sees existing work.

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-cli test -- spawn-owner-flags` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/spawn.ts packages/cli/src/commands/__tests__/spawn-owner-flags.test.ts
git commit -m "feat(cli): add internal owner-stamping flags to spawn"
```

---

### Task 10: `athene meta-start` / `athene meta-status`

**Files:**
- Create: `packages/cli/src/commands/meta.ts`
- Modify: CLI entry point (register the command — grep for where `registerStartCommand`/equivalent is wired)
- Modify: `packages/cli/src/commands/status.ts` (surface meta orchestrators)
- Test: `packages/cli/src/commands/__tests__/meta.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// - meta-start <name>: errors when name not in config.metaOrchestrators.
// - meta-start <name>: calls generateMetaOrchestratorPrompt + sm.ensureMetaOrchestrator({ name, systemPrompt }).
// - meta-status with one configured meta defaults to it; filters sessions to metaOwner === name;
//   includes dimmed peers (other live sessions in scope).
it.todo("meta-start errors on unknown name");
it.todo("meta-start spawns the meta orchestrator with the rendered prompt");
it.todo("meta-status defaults to the sole meta and filters owned workers");
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-cli test -- meta` → FAIL.

- [ ] **Step 3: Implement**

`meta.ts` exports `registerMetaCommands(program)` adding:
- `meta-start <name>`: load config, error if `!config.metaOrchestrators?.[name]`, render prompt via `generateMetaOrchestratorPrompt`, call `sm.ensureMetaOrchestrator({ name, systemPrompt, agent: meta.agent })`.
- `meta-status [name]`: resolve name (default to sole meta), aggregate via portfolio service, filter owned workers (`getSessionMetaOwner(s) === name`), print fleet; print collision-relevant peers dimmed. Cross-platform safe (no shell-outs needed; reuse existing status formatting helpers).

Register in the CLI entry point alongside other commands. In `status.ts`, list configured meta orchestrators (name, scope, running?) in a small section, reusing existing rendering.

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-cli test -- meta && pnpm --filter @made-by-moonlight/athene-cli typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): add meta-start and meta-status commands"
```

---

## Phase 3 — Web dashboard

### Task 11: Project color tokens in globals.css

**Files:**
- Modify: `packages/web/src/app/globals.css` (`:root` ~line 28, `.dark` ~line 181, `.ocean` ~line 359, and the light block)

- [ ] **Step 1: Add tokens (no test — CSS tokens; verified by the helper test in Task 12 and component tests)**

In each theme block, add 8 project colors + 8 tints, using hues OUTSIDE the reserved status hues (violet, cyan, pink, lime, sky, rose, indigo, gold), retuned per theme. Example for `.dark`:
```css
  /* Project identity palette — distinct from semantic status hues */
  --project-color-1: #a78bfa; /* violet */
  --project-color-2: #22d3ee; /* cyan */
  --project-color-3: #f472b6; /* pink */
  --project-color-4: #a3e635; /* lime */
  --project-color-5: #38bdf8; /* sky */
  --project-color-6: #fb7185; /* rose */
  --project-color-7: #818cf8; /* indigo */
  --project-color-8: #fbbf24; /* gold */
  --project-tint-1: color-mix(in srgb, var(--project-color-1) 14%, transparent);
  /* ...tint-2..8 analogously... */
```
Tune `:root` (light default), `.ocean`, and the light block with deeper/contrast-appropriate values. Keep them out of `@theme` (consistent with `--color-status-*`).

- [ ] **Step 2: Verify the dark theme still renders** — Run: `pnpm --filter @made-by-moonlight/athene-web build` (or `dev`) and confirm no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/globals.css
git commit -m "feat(web): add per-project color palette tokens"
```

---

### Task 12: `getProjectColor` helper

**Files:**
- Create: `packages/web/src/lib/project-color.ts`
- Test: `packages/web/src/lib/__tests__/project-color.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/__tests__/project-color.test.ts
import { describe, it, expect } from "vitest";
import { getProjectColor } from "../project-color";

const ids = ["web", "api", "athene"];

describe("getProjectColor", () => {
  it("maps registration index to a 1-based slot", () => {
    expect(getProjectColor("web", ids).slot).toBe(1);
    expect(getProjectColor("api", ids).slot).toBe(2);
    expect(getProjectColor("web", ids).colorVar).toBe("var(--project-color-1)");
    expect(getProjectColor("api", ids).tintVar).toBe("var(--project-tint-2)");
  });

  it("cycles after 8", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `p${i}`);
    expect(getProjectColor("p8", nine).slot).toBe(1); // index 8 → slot 1
  });

  it("falls back to slot 1 for an unknown project", () => {
    expect(getProjectColor("nope", ids).slot).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- project-color` → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/project-color.ts
export interface ProjectColor {
  slot: number; // 1..8
  colorVar: string;
  tintVar: string;
}

export function getProjectColor(
  projectId: string,
  registeredProjectIds: string[],
): ProjectColor {
  const index = registeredProjectIds.indexOf(projectId);
  const slot = ((index < 0 ? 0 : index) % 8) + 1;
  return {
    slot,
    colorVar: `var(--project-color-${slot})`,
    tintVar: `var(--project-tint-${slot})`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- project-color` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/project-color.ts packages/web/src/lib/__tests__/project-color.test.ts
git commit -m "feat(web): add getProjectColor palette helper"
```

---

### Task 13: Project-color accent on SessionCard

**Files:**
- Modify: `packages/web/src/components/SessionCard.tsx`
- Test: `packages/web/src/components/__tests__/SessionCard.test.tsx` (extend existing or create)

- [ ] **Step 1: Write the failing test**

```tsx
// Render SessionCard with a project rail/dot/name and assert:
// - the left rail uses the project color VAR via a Tailwind arbitrary-value class
//   (e.g. className contains "border-l-[color:var(--project-color-2)]")
// - the project name text is rendered (never color-only).
// - NO inline style attribute is present (query the card root; expect no `style`).
it.todo("renders a project color rail + name without inline styles");
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- SessionCard` → FAIL.

- [ ] **Step 3: Implement**

Accept the resolved `colorVar`/`tintVar` + `projectName` (compute via `getProjectColor` in the parent that already knows the registered project list). Add a left-edge rail (`border-l-4 border-l-[color:var(...)]` via a class built from the slot, e.g. `border-l-[color:var(--project-color-${slot})]`), a small project dot, and the project name. Status color and column placement are untouched. No inline `style=` (C-02). Keep the file < 400 lines.

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- SessionCard` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/SessionCard.tsx packages/web/src/components/__tests__/SessionCard.test.tsx
git commit -m "feat(web): add project-color accent to session cards"
```

---

### Task 14: Project dot in the sidebar

**Files:**
- Modify: `packages/web/src/components/ProjectSidebar.tsx`
- Test: `packages/web/src/components/__tests__/ProjectSidebar.test.tsx` (extend existing or create)

- [ ] **Step 1: Write the failing test**

```tsx
// Render ProjectSidebar with two projects; assert each row shows a project-color
// dot (class references var(--project-color-N)) alongside the abbreviation chip + name.
// Assert no inline style attribute.
it.todo("renders a project-color dot per project without inline styles");
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- ProjectSidebar` → FAIL.

- [ ] **Step 3: Implement**

For each project row, compute `getProjectColor(projectId, registeredProjectIds)` and render a small dot using a Tailwind arbitrary-value background class referencing the slot var, paired with the existing abbreviation chip + name. No inline styles.

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- ProjectSidebar` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ProjectSidebar.tsx packages/web/src/components/__tests__/ProjectSidebar.test.tsx
git commit -m "feat(web): add project-color dot to sidebar rows"
```

---

### Task 15: `/meta/[name]` route + page data loader

**Files:**
- Create: `packages/web/src/lib/meta-page-data.ts`
- Create: `packages/web/src/app/meta/[name]/page.tsx`
- Test: `packages/web/src/lib/__tests__/meta-page-data.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// getMetaPageData("meta-1") aggregates portfolio sessions, filters to
// getSessionMetaOwner(s) === "meta-1", excludes coordinators via isCoordinatorSession,
// and returns { sessions, projects, registeredProjectIds, name }.
it.todo("returns only sessions owned by the named meta orchestrator");
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- meta-page-data` → FAIL.

- [ ] **Step 3: Implement**

`meta-page-data.ts`: `getMetaPageData(name)` — load config, resolve the meta + in-scope projects, list portfolio sessions, filter to `getSessionMetaOwner(s) === name` and `!isCoordinatorSession(s)`, return the shape `Dashboard` needs plus `registeredProjectIds` (ordered) for color resolution.

`app/meta/[name]/page.tsx` (mirror `projects/[projectId]/page.tsx`):
```tsx
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getMetaPageData } from "@/lib/meta-page-data";

export const dynamic = "force-dynamic";

export default async function MetaPage(props: { params: Promise<{ name: string }> }) {
  const { name } = await props.params;
  const data = await getMetaPageData(name);
  if (!data) notFound();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-canvas)]">
      <Dashboard
        initialSessions={data.sessions}
        projectId={`_meta:${name}`}
        projectName={`${name} (meta)`}
        projects={data.projects}
        orchestrators={[]}
        attentionZones={data.attentionZones}
      />
    </div>
  );
}
```
> Confirm `Dashboard`'s props against the current component (the project page passes `initialSessions/projectId/projectName/projects/orchestrators/attentionZones`). Thread `registeredProjectIds` through to the cards (Task 13) so each card resolves its project color; if `Dashboard` does not yet pass a project list to `SessionCard`, add that pass-through here.

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- meta-page-data && pnpm --filter @made-by-moonlight/athene-web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/meta-page-data.ts packages/web/src/app/meta packages/web/src/lib/__tests__/meta-page-data.test.ts
git commit -m "feat(web): add /meta/[name] dashboard route"
```

---

### Task 16: `metaDashboardPath` route helper

**Files:**
- Modify: `packages/web/src/lib/routes.ts`
- Test: `packages/web/src/lib/__tests__/routes.test.ts` (extend existing or create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { metaDashboardPath } from "../routes";

describe("metaDashboardPath", () => {
  it("builds /meta/<name> and encodes the name", () => {
    expect(metaDashboardPath("meta-1")).toBe("/meta/meta-1");
    expect(metaDashboardPath("a b")).toBe("/meta/a%20b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- routes` → FAIL (helper not exported).

- [ ] **Step 3: Implement**

In `packages/web/src/lib/routes.ts`, add alongside `projectDashboardPath` / `projectSessionPath`:
```ts
export function metaDashboardPath(name: string): string {
  return `/meta/${encodeURIComponent(name)}`;
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- routes` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/routes.ts packages/web/src/lib/__tests__/routes.test.ts
git commit -m "feat(web): add metaDashboardPath route helper"
```

---

### Task 17: Sidebar ORCHESTRATORS section (extracted `SidebarOrchestrators` component)

**Files:**
- Create: `packages/web/src/components/SidebarOrchestrators.tsx`
- Modify: `packages/web/src/components/ProjectSidebar.tsx` (add `metaOrchestrators` prop; render `SidebarOrchestrators` above the PROJECTS list, in both expanded and collapsed branches)
- Test: `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx` (create)

**Why a new component (C-04):** `ProjectSidebar.tsx` is already ~1260 lines (pre-existing, well over the 400-line cap). The ORCHESTRATORS section is extracted into its own file so the new code stays under 400 lines and is independently testable; `ProjectSidebar` only gains a prop and two render sites.

**Layout (§11.5):** meta orchestrators on top (each prefixed with `◆`), a divider, then per-project orchestrators (each prefixed with a project-color dot via `getProjectColor`). Right-aligned activity-state dot reuses `getAttentionLevel(session)` + the existing `sidebar-session-dot` / `data-level` styling — **no new dot component**. Meta row → `metaDashboardPath(name)`; project orchestrator row → `projectSessionPath(projectId, id)`. Collapsed variant renders a compact glyph/dot cluster.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarOrchestrators } from "../SidebarOrchestrators";
import type { DashboardSession } from "@/lib/types";

const metaSession = { id: "meta-1", projectId: "_meta", status: "working", activity: "active" } as unknown as DashboardSession;
const orchSession = { id: "web-orchestrator", projectId: "web", status: "working", activity: "active" } as unknown as DashboardSession;

describe("SidebarOrchestrators", () => {
  it("renders meta rows with a diamond glyph and project orchestrators with a color dot", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web" }]}
        sessions={[orchSession]}
        registeredProjectIds={["web", "api"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    // Meta glyph + name + link to /meta/meta-1
    expect(screen.getByText("meta-1")).toBeInTheDocument();
    expect(container.querySelector('a[href="/meta/meta-1"]')).toBeTruthy();
    expect(screen.getByText("◆")).toBeInTheDocument();
    // Project orchestrator: color dot class references the palette var for slot 1 (web = index 0)
    expect(container.querySelector('[class*="var(--project-color-1)"]')).toBeTruthy();
    // Activity dot reuses the existing system (data-level present), no inline style
    expect(container.querySelector("[data-level]")).toBeTruthy();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("renders the collapsed glyph/dot cluster", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web" }]}
        sessions={[orchSession]}
        registeredProjectIds={["web"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('a[href="/meta/meta-1"]')).toBeTruthy();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- SidebarOrchestrators` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `SidebarOrchestrators.tsx`:
```tsx
"use client";

import { getProjectColor } from "@/lib/project-color";
import { getAttentionLevel, type DashboardSession } from "@/lib/types";
import { cn } from "@/lib/cn";
import { metaDashboardPath, projectSessionPath } from "@/lib/routes";

export interface SidebarMetaOrchestrator {
  name: string;
  session: DashboardSession | null;
}

export interface SidebarProjectOrchestrator {
  id: string;
  projectId: string;
}

interface SidebarOrchestratorsProps {
  collapsed: boolean;
  metaOrchestrators: SidebarMetaOrchestrator[];
  orchestrators: SidebarProjectOrchestrator[];
  sessions: DashboardSession[] | null;
  registeredProjectIds: string[];
  activeSessionId: string | undefined;
  onNavigate: (href: string, session?: DashboardSession) => void;
}

// Reuse the existing dot styling: same classes + data-level as ProjectSidebar's SessionDot.
function ActivityDot({ session }: { session: DashboardSession | null }) {
  if (!session) return null;
  const level = getAttentionLevel(session);
  return (
    <div
      className={cn("sidebar-session-dot shrink-0 rounded-full", level === "working" && "sidebar-session-dot--glow")}
      data-level={level}
    />
  );
}

// Project-color dot — class built per slot so the palette var is statically present
// for Tailwind/CSS (no inline style). Map slot 1..8 to a fixed class.
const PROJECT_DOT_CLASS: Record<number, string> = {
  1: "bg-[var(--project-color-1)]",
  2: "bg-[var(--project-color-2)]",
  3: "bg-[var(--project-color-3)]",
  4: "bg-[var(--project-color-4)]",
  5: "bg-[var(--project-color-5)]",
  6: "bg-[var(--project-color-6)]",
  7: "bg-[var(--project-color-7)]",
  8: "bg-[var(--project-color-8)]",
};

export function SidebarOrchestrators({
  collapsed,
  metaOrchestrators,
  orchestrators,
  sessions,
  registeredProjectIds,
  activeSessionId,
  onNavigate,
}: SidebarOrchestratorsProps) {
  if (metaOrchestrators.length === 0 && orchestrators.length === 0) return null;

  const findSession = (id: string) => sessions?.find((s) => s.id === id) ?? null;

  if (collapsed) {
    return (
      <div className="project-sidebar__orch-collapsed flex flex-col items-center gap-1">
        {metaOrchestrators.map((m) => (
          <a
            key={m.name}
            href={metaDashboardPath(m.name)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
              e.preventDefault();
              onNavigate(metaDashboardPath(m.name), m.session ?? undefined);
            }}
            className="project-sidebar__orch-glyph"
            data-level={m.session ? getAttentionLevel(m.session) : undefined}
            title={m.name}
            aria-label={`Open ${m.name} meta dashboard`}
          >
            ◆
          </a>
        ))}
        {orchestrators.map((o) => {
          const { slot } = getProjectColor(o.projectId, registeredProjectIds);
          const href = projectSessionPath(o.projectId, o.id);
          return (
            <a
              key={o.id}
              href={href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                e.preventDefault();
                onNavigate(href, findSession(o.id) ?? undefined);
              }}
              className={cn("project-sidebar__orch-collapsed-dot rounded-full", PROJECT_DOT_CLASS[slot])}
              title={`${o.projectId} orchestrator`}
              aria-label={`Open ${o.projectId} orchestrator`}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="project-sidebar__orchestrators">
      <div className="project-sidebar__nav-label"><span>Orchestrators</span></div>
      {metaOrchestrators.map((m) => {
        const href = metaDashboardPath(m.name);
        return (
          <a
            key={m.name}
            href={href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
              e.preventDefault();
              onNavigate(href, m.session ?? undefined);
            }}
            className={cn("project-sidebar__orch-row", activeSessionId === m.name && "project-sidebar__orch-row--active")}
            aria-label={`Open ${m.name} meta dashboard`}
          >
            <span className="project-sidebar__orch-glyph" aria-hidden="true">◆</span>
            <span className="project-sidebar__orch-name flex-1 min-w-0">{m.name}</span>
            <ActivityDot session={m.session} />
          </a>
        );
      })}
      {metaOrchestrators.length > 0 && orchestrators.length > 0 ? (
        <div className="project-sidebar__orch-divider" aria-hidden="true" />
      ) : null}
      {orchestrators.map((o) => {
        const { slot } = getProjectColor(o.projectId, registeredProjectIds);
        const session = findSession(o.id);
        const href = projectSessionPath(o.projectId, o.id);
        return (
          <a
            key={o.id}
            href={href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
              e.preventDefault();
              onNavigate(href, session ?? undefined);
            }}
            className={cn("project-sidebar__orch-row", activeSessionId === o.id && "project-sidebar__orch-row--active")}
            aria-label={`Open ${o.projectId} orchestrator`}
          >
            <span className={cn("project-sidebar__orch-dot rounded-full shrink-0", PROJECT_DOT_CLASS[slot])} aria-hidden="true" />
            <span className="project-sidebar__orch-name flex-1 min-w-0">{o.projectId}</span>
            <ActivityDot session={session} />
          </a>
        );
      })}
    </div>
  );
}
```
> Add the small CSS classes used above (`project-sidebar__orchestrators`, `__orch-row`, `__orch-glyph`, `__orch-name`, `__orch-dot`, `__orch-divider`, collapsed variants) to the existing sidebar styles in `globals.css`, matching the look of the neighbouring `project-sidebar__*` rules. Keep `SidebarOrchestrators.tsx` under 400 lines (it is).

In `ProjectSidebar.tsx`:
1. Add `metaOrchestrators?: SidebarMetaOrchestrator[]` to `ProjectSidebarProps` (import the type from `SidebarOrchestrators`).
2. In the **expanded** branch, render `<SidebarOrchestrators collapsed={false} ... />` immediately above the `Projects` `project-sidebar__nav-label`, passing `orchestrators={orchestrators ?? []}`, `metaOrchestrators={props.metaOrchestrators ?? []}`, `sessions`, `registeredProjectIds={allProjectIdsInOrder}`, `activeSessionId`, and `onNavigate={navigate}`.
3. In the **collapsed** branch, render `<SidebarOrchestrators collapsed ... />` at the top of the rail (below the expand button).
4. `registeredProjectIds` is the ordered list of project IDs (use `visibleProjects.map((p) => p.id)` — already ordered by registration).

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @made-by-moonlight/athene-web test -- SidebarOrchestrators && pnpm --filter @made-by-moonlight/athene-web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/SidebarOrchestrators.tsx packages/web/src/components/ProjectSidebar.tsx packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx packages/web/src/app/globals.css
git commit -m "feat(web): add ORCHESTRATORS sidebar section"
```

> **Data wiring note (follow-up within this task or a thin server change):** the sidebar's `metaOrchestrators` prop must be supplied upstream. Extend whatever feeds `ProjectSidebar` today (the `/api/sessions` response `orchestrators` field / the layout that renders the sidebar) to also list configured meta orchestrators from `config.metaOrchestrators` paired with their `_meta` session (if running). This is presentational data only — no lifecycle change.

---

## Phase 4 — Verification

### Task 18: Full build, typecheck, lint, tests

- [ ] **Step 1: Run the full suite**

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @made-by-moonlight/athene-web test
```
Expected: all green. Fix any failures before claiming completion (per verification-before-completion).

- [ ] **Step 2: Manual smoke (optional, documented)**

Add a `metaOrchestrators` block to a test global config, run `athene meta-start <name>`, confirm the session appears under `_meta/<name>`, dispatch a worker into a project and confirm it is stamped `ownerKind=meta`/`metaOwner` and visible at `/meta/<name>` with a project-color accent. Confirm the ORCHESTRATORS sidebar section lists the meta (◆) above per-project orchestrators (color dot) with right-aligned activity dots, in both expanded and collapsed sidebar states. Confirm a duplicate issue-keyed spawn is refused.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "chore: meta orchestrator verification fixes"
```

---

## Self-Review (against the spec)

- **Spec coverage:** config (Task 2), session model/kind/helpers (Task 1, 7), storage paths (Task 3), collision guard (Task 4–5), owner stamping (Task 1, 5, 9), meta prompt (Task 6), meta spawn (Task 7), lifecycle/discover (Task 8), CLI surface (Task 9–10), color tokens/helper/card/sidebar-dot (Task 11–14), meta route + route helper (Task 15–16), ORCHESTRATORS sidebar section §11.5 (Task 17), verification (Task 18). All §5–§12 sections map to a task.
- **Placeholder scan:** the few `it.todo` markers are deliberate handoffs where the concrete test must bind to the existing session-manager/CLI/web test harnesses (whose fixtures can't be reproduced blind); each is accompanied by an explicit description of the exact behavior to assert. All schema, helper signatures, and component wiring show real code.
- **Type consistency:** `ownerKind`/`metaOwner` (metadata keys + `SessionSpawnConfig` fields), `getProjectColor(projectId, registeredProjectIds)`, `checkSpawnCollision(liveSessions, intent)`, `ensureMetaOrchestrator({ name, systemPrompt, agent })`, `generateMetaOrchestratorPrompt({ config, name })`, `metaDashboardPath(name)`, and the `SidebarMetaOrchestrator { name, session }` shape are used identically across tasks and match the spec inventory (§13).
- **Invariants:** the lifecycle/session-manager invariants (no `terminated` writes from `list()`/reconcile, `deriveLegacyStatus` untouched, guard-before-resource-creation, default ownerKind=project, coordinator exclusion via `isCoordinatorSession`) are restated on Tasks 5, 7, 8.
- **C-04 (file size):** the new sidebar section is extracted into `SidebarOrchestrators.tsx` (Task 17) rather than inlined, because `ProjectSidebar.tsx` already exceeds 400 lines; the extracted file stays under the cap and ships with its own test.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with checkpoints (superpowers:executing-plans).

**Per the brief, do NOT begin execution until the user has reviewed this spec and plan.**
