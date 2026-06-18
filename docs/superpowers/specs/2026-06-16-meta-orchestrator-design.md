# Meta Orchestrator — Design Spec

**Status:** Approved (design), not yet implemented
**Date:** 2026-06-16
**Scope:** New coordinator type that spans many registered projects, dispatching workers directly into target projects.

---

## 1. Summary

A **meta orchestrator** is a coordinator session that spans **many** registered projects. It reads the global project catalog to route incoming work, then dispatches workers **directly** into target projects (direct-to-worker — there is no per-project orchestrator in the loop). Like a normal orchestrator, it is **read-only itself**: it never edits code and never owns a PR. Those non-negotiable rules are simply lifted from single-project scope to portfolio scope.

**Multiple named meta orchestrators** are supported. Each has its own scope (a set of projects) and its own dashboard view scoped to the workers **it** owns.

Meta orchestrators **coexist** with per-project orchestrators. Both can be running; each manages only the workers it owns. The two are kept from stepping on each other by a **collision guard in the shared spawn path** (§7) that protects both symmetrically.

---

## 2. Goals & Non-Goals

### Goals
- A portfolio-scoped coordinator that routes work across projects using a metadata catalog, falling back to read-only **scout** workers when routing is ambiguous.
- Workers dispatched by a meta orchestrator are first-class sessions in their target project, visible to both the meta orchestrator and that project's orchestrator.
- A hard guard against two coordinators duplicating the same issue, and an advisory surface for freeform work.
- A dashboard view per meta orchestrator that reuses the existing kanban board, with a new per-project color identity axis.

### Non-Goals (v1)
- Meta orchestrators do **not** delegate to per-project orchestrators (direct-to-worker was chosen deliberately).
- No cross-project task-dependency graph or ordering.
- No **live auto-discovery** in v1. `discover` is reserved and currently has no effect: scope is resolved from the global registry at `meta-start` (resolve-at-start); re-run `meta-start` to pick up later registrations. (`discover` never scans the filesystem for unregistered repos.)
- Freeform-prompt dedup stays **advisory**; only issue-keyed work is hard-guarded.

---

## 3. Concepts & Terminology

| Term | Meaning |
|------|---------|
| **Meta orchestrator** | A named coordinator spanning a configured scope of projects. Read-only. Identity = its configured name (e.g. `meta-1`, `platform`). |
| **Scope** | The set of projects a meta orchestrator can route into — `'all'` or an explicit `{ projects: [...] }` list. |
| **Scout** | An ordinary worker spawned with a read-only investigation prompt to confirm where ambiguous work belongs. No new primitive — it's just a worker. |
| **Meta worker** | A worker dispatched by a meta orchestrator. Lives in its target project's storage, stamped `ownerKind=meta` + `metaOwner=<name>`. |
| **Owner** | Which coordinator dispatched a session: `meta` (a meta orchestrator) or `project` (a per-project orchestrator / manual spawn). |

---

## 4. Architecture Overview

```
~/.agent-orchestrator/config.yaml (global)
  ├── projects:           { web, api, athene, ... }  (each gains optional `description`)
  └── metaOrchestrators:  { meta-1, platform, ... }

athene meta-start <name>
  └── resolves scope from config → renders meta-orchestrator.md prompt
      → spawns meta orchestrator session under projects/_meta/<name>/sessions/<name>.json
        (SessionKind = "meta-orchestrator", role metadata = "meta-orchestrator")

Meta orchestrator (running agent)
  ├── reads catalog (in-scope projects: name, description, repo, sessionPrefix)
  ├── routes work → `athene spawn <project> ... --owner-kind meta --meta-owner <name>`
  │     ├── ambiguous? → spawn read-only scout(s), confirm, kill scouts, dispatch real worker
  │     └── every spawn passes through the SHARED core collision guard (§7)
  └── meta workers land in projects/<projectId>/sessions/<prefix>-N.json
        stamped ownerKind=meta, metaOwner=<name>  → visible to BOTH coordinators

Web: /meta/<name>  → existing kanban board, aggregated over workers where metaOwner == name,
                     each card carries a per-project color accent.
```

### Data flow additions
- **Config Loader** parses the new `metaOrchestrators` map and per-project `description`.
- **Session Manager** gains: meta-orchestrator spawn (`ensureMetaOrchestrator`), owner-metadata stamping in the worker spawn path, and the pre-spawn collision guard.
- **Lifecycle Manager / supervisor** tracks meta-orchestrator liveness. (No `discover`-driven live prompt-refresh in v1 — see §10; scope is resolved from the global registry at `meta-start`.)
- **Portfolio session service** is the reused aggregation layer for the `/meta/<name>` view, filtered by `metaOwner`.

---

## 5. Config Schema Changes

File: `packages/core/src/config.ts`.

### 5.1 New top-level `metaOrchestrators` map

Added to `OrchestratorConfigSchema` (currently ends at the `reactions` field, line ~380), alongside `projects`:

```ts
const MetaScopeSchema = z.union([
  z.literal("all"),
  z.object({ projects: z.array(z.string()).min(1) }),
]);

const MetaOrchestratorConfigSchema = z.object({
  scope: MetaScopeSchema,
  // Watch the global registry and auto-include newly-registered projects
  // without a restart. With scope:'all' new projects are naturally in scope;
  // with an explicit list, discover:true also adds newly-registered projects.
  discover: z.boolean().default(false),
  // Optional agent plugin override; defaults to the global default agent.
  agent: z.string().optional(),
  // Optional extra instructions appended to the meta orchestrator prompt.
  rules: z.string().optional(),
});

// inside OrchestratorConfigSchema:
metaOrchestrators: z
  .record(
    z.string().regex(/^[a-zA-Z0-9_-]+$/, "meta orchestrator name must match [a-zA-Z0-9_-]+"),
    MetaOrchestratorConfigSchema,
  )
  .optional(),
```

Exported TypeScript types in `types.ts`: `MetaOrchestratorConfig`, `MetaScope`.

### 5.2 Per-project `description`

Added to `ProjectConfigSchema` (line ~247):

```ts
description: z.string().optional(),
```

`description` is the routing hint surfaced in the meta orchestrator's catalog and in the meta prompt.

### 5.3 Validation rules
- `_meta` is a **reserved project ID** (it is the on-disk parent for meta-orchestrator sessions, §6.1). Config load rejects a real project keyed `_meta` with an actionable message.
- For `scope: { projects: [...] }`, validate each listed project ID exists in `config.projects`; collect unknown IDs into a non-fatal `resolveError`-style warning rather than aborting global load (mirrors existing per-project resolution-failure handling), since a meta orchestrator may reference a project registered in another checkout.

### 5.4 Example

```yaml
metaOrchestrators:
  meta-1:
    scope: { projects: [web, api, athene] }
    discover: true
    rules: |
      Prefer `api` for auth/billing. Prefer `web` for UI-facing work.
  platform:
    scope: all
projects:
  web:  { description: "Customer-facing Next.js dashboard. UI, SSR, billing pages.", sessionPrefix: web }
  api:  { description: "Go backend. Auth, billing, REST + webhooks.", sessionPrefix: api }
```

---

## 6. Session Model Changes

File: `packages/core/src/types.ts`.

### 6.1 SessionKind & storage

- `SessionKind` (currently `"worker" | "orchestrator"`) gains `"meta-orchestrator"`:
  ```ts
  export type SessionKind = "worker" | "orchestrator" | "meta-orchestrator";
  ```
- The meta-orchestrator session is stored under a **reserved scope**: `projects/_meta/<name>/sessions/<name>.json`. Its identity (`session.id`) **is** the configured name (e.g. `meta-1`, `platform`); its `projectId` is the reserved sentinel `_meta`.
- It needs **no code worktree** — it routes and reads, and deep reads go through scout workers. Its `workspacePath` may be `null` (or a minimal scratch dir). This deviates from the per-project orchestrator (which gets a worktree); the deviation is justified because a meta orchestrator never operates on a single repo. The spawn flow otherwise mirrors `ensureOrchestrator` (runtime handle, prompt injection, lifecycle record) so supervision/liveness reuse the existing machinery.

New path helpers in `packages/core/src/paths.ts`:
```ts
getMetaSessionsDir(name): string        // ~/.agent-orchestrator/projects/_meta/<name>/sessions
getMetaSessionPath(name): string        // .../projects/_meta/<name>/sessions/<name>.json
```

### 6.2 Owner metadata fields

Two new **metadata keys** (stored in `Session.metadata`, consistent with how `role` is stored — we do not widen the `Session` interface surface):

| Metadata key | Values | Default when absent |
|--------------|--------|---------------------|
| `ownerKind` | `"meta"` \| `"project"` | `"project"` |
| `metaOwner` | `<meta name>` | unset (only set for meta-dispatched workers) |

Meta-orchestrator sessions themselves use `metadata["role"] = "meta-orchestrator"` and `SessionStateRecord.kind = "meta-orchestrator"`.

### 6.3 Helpers (in `types.ts`, next to `isOrchestratorSession`)

```ts
export function isMetaOrchestratorSession(
  session: { id: SessionId; metadata?: Record<string, string> },
): boolean {
  return session.metadata?.["role"] === "meta-orchestrator";
}

// True for any coordinator (orchestrator OR meta orchestrator). Used by the
// kanban/worker filters that must hide coordinators from the worker board.
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

> **Important edge case:** `isOrchestratorSession()` keys off `role === "orchestrator"` and will **not** match `"meta-orchestrator"`. Every existing filter that hides coordinators from the worker board (Dashboard, portfolio listing, status output) must be updated to use `isCoordinatorSession()` so meta-orchestrator sessions do not leak into worker views.

---

## 7. Dispatch Flow & Anti-Collision Guard (CRITICAL)

The meta orchestrator dispatches through the **same** `athene spawn` path (worktree/branch/runtime/metadata all identical), with two additions:

1. **Owner stamping.** The spawn stamps `ownerKind=meta` + `metaOwner=<name>` into session metadata.
2. **Pre-spawn collision check.** A guard runs in the **shared core spawn path** (`_spawnInner` in `session-manager.ts`, before any resource creation) so it protects **both** coordinators symmetrically — a per-project orchestrator is equally blocked from duplicating a meta-owned issue, and vice versa.

### 7.1 Guard contract

New core function (e.g. `packages/core/src/spawn-collision.ts`):

```ts
export interface SpawnCollisionResult {
  hard: Session | null;     // a live session that already owns this issueId
  advisory: Session[];      // live sessions in the target project (for freeform work)
}

export function checkSpawnCollision(
  liveSessions: Session[],   // non-terminal sessions in the target project
  intent: { projectId: string; issueId?: string },
): SpawnCollisionResult;
```

- **Issue-keyed work → HARD REFUSAL.** If any **live (non-terminal)** session in the target project already has that `issueId` (regardless of owner), spawn refuses with a clear message:
  `SPAWN REFUSED: web-2 already owns ENG-42 (owner=project, status=pr_open)`
  `_spawnInner` calls the guard and `throw`s when `hard` is non-null.
- **Freeform `--prompt` work → ADVISORY.** No natural key, so the guard returns `advisory` = the live sessions + their task labels/owners. `_spawnInner` does **not** block; the CLI surfaces the advisory list to the coordinator, and the meta prompt instructs it to check first (via `athene meta-status` / `athene status`).

"Live / non-terminal" is determined by the existing terminal-state predicate (a session is terminal when its canonical state is `done`/`terminated`). The guard receives the already-filtered live set so it has no I/O and is trivially unit-testable.

### 7.2 Scout pattern

When routing is ambiguous, the meta orchestrator spawns one or more **scouts** — ordinary workers given a read-only investigation prompt — into candidate repos, reads their findings, kills them, then dispatches the real worker into the confirmed project. No new primitive or code path; scouts are spawned and killed through existing worker commands.

---

## 8. CLI Surface

File(s): `packages/cli/src/commands/` (new `meta.ts`, plus edits to `spawn.ts`, `status.ts`/`session.ts`).

| Command | Behavior |
|---------|----------|
| `athene meta-start <name>` | Resolve `<name>` from `config.metaOrchestrators`, render the meta prompt with the in-scope catalog, and spawn the meta orchestrator under `_meta/<name>`. Errors clearly if `<name>` is not configured. |
| `athene meta-status [<name>]` | Cross-project fleet for that meta orchestrator (its owned workers, `metaOwner == name`), with collision-relevant peers (other live sessions in those projects) shown **dimmed**. If no name is given and exactly one meta orchestrator exists, default to it. |
| list / stop integration | Surface meta orchestrators in `athene status` and allow kill/cleanup through the existing `session` command surface. Keep it minimal — no speculative new verbs. |

**Internal spawn flags** on `athene spawn` (used by the meta orchestrator; not part of the documented public surface):
- `--owner-kind <meta|project>` (default `project`)
- `--meta-owner <name>`

These stamp the owner metadata. `SessionSpawnConfig` gains optional `ownerKind?: "meta" | "project"` and `metaOwner?: string` fields so the metadata is written in `_spawnInner`.

---

## 9. Meta Orchestrator Prompt

- New template `packages/core/src/prompts/meta-orchestrator.md` — a portfolio-scoped variant of `orchestrator.md`.
- New generator `packages/core/src/meta-orchestrator-prompt.ts`, analogous to `orchestrator-prompt.ts` (same placeholder/optional-section rendering machinery — `{{KEY}}` interpolation, `{{X_SECTION_START}}…{{X_SECTION_END}}` optional blocks, unresolved-placeholder guard).

Rendered with:
- The **catalog** of in-scope projects (name, `description`, repo, `sessionPrefix`).
- The **dashboard URL** for this meta (`/meta/<name>`).
- `scope` + `discover` settings.
- The optional `rules` block (rendered as an optional section, empty → removed).

Content lifts the orchestrator's non-negotiable rules to portfolio scope and documents:
- Catalog-based, metadata-first routing (code-on-demand via scouts).
- The scout pattern (spawn read-only, confirm, kill, dispatch).
- Ownership tagging (`ownerKind` / `metaOwner`) and that workers are visible to both coordinators.
- The anti-collision guard (hard for issues, advisory for freeform) and the instruction to check existing sessions before freeform spawns.

---

## 10. Launch & Lifecycle / Supervision

- `athene meta-start <name>` spawns the meta orchestrator under `_meta/<name>` with the rendered prompt and resolved scope. It does **not** suppress per-project orchestrators — they coexist.
- A **meta-aware supervision path** tracks the meta orchestrator's liveness using the existing lifecycle/runtime probe machinery (reuse, don't duplicate).
- `discover` semantics — **v1: resolve-at-start, no live discovery.** The in-scope project set is resolved from the **global registry** when `athene meta-start` runs (`scope: 'all'` → every project registered at launch; explicit list → those projects, resolved against the current registry). A **running** meta orchestrator does **not** auto-join projects registered afterwards — re-run `meta-start` to refresh. The `discover` flag is reserved for a future live-discovery feature and currently has **no effect**; the prompt and `athene meta-status` both say so plainly rather than implying live behavior.

### Invariants the core changes must preserve

These guard the subtle state machine in `lifecycle-manager.ts` / `session-manager.ts`:

1. **`sm.list()` never writes `terminated`.** It persists `detecting` (reason `runtime_lost`) on dead runtimes; terminal decisions remain solely with the lifecycle manager's probe pipeline (#1735). Owner stamping and the collision guard add **no** terminal writes.
2. **`deriveLegacyStatus()` mapping is the single source of legacy status.** No new canonical state/reason is introduced by this feature, so the mapping is untouched. Meta-orchestrator sessions reuse the existing canonical states.
3. **Coordinator sessions are excluded from worker enumeration.** Wherever `isOrchestratorSession()` gates worker views/counts, switch to `isCoordinatorSession()` so meta orchestrators are excluded identically. No worker count or kanban column logic changes otherwise.
4. **Spawn resource ordering is unchanged.** The collision guard runs **before** any worktree/runtime creation (early in `_spawnInner`), so a refusal leaves no orphaned resources.
5. **Default ownership is `project`.** Any session without `ownerKind` reads as `project`, so existing sessions and all current behavior are unaffected.

---

## 11. Web Dashboard

### 11.1 Route
- New route `packages/web/src/app/meta/[name]/page.tsx` rendering the **existing** `Dashboard` kanban board (same status-based columns / attention zones — working, needs input, in review, mergeable, done). **Do not** switch to project lanes.
- Sessions are aggregated across the workers the meta orchestrator owns via the **existing portfolio session service**, filtered to `getSessionMetaOwner(session) === name`. The route mirrors `projects/[projectId]/page.tsx` (a thin server component delegating to a `getMetaPageData(name)` loader analogous to `getDashboardPageData`).
- Coordinator sessions are excluded via `isCoordinatorSession()` (consistent with project pages).

### 11.2 Per-project color identity axis

- Cards get a **project-color accent**: a left-edge rail + a project dot + the project name. Status colors and status-driven column placement are **UNCHANGED** — project color is a **separate identity axis**, never conflated with status color, and never the sole signal (always paired with the project name/dot, per the "never color alone" rule).
- The **sidebar** gets the same treatment: each project's abbreviation chip + name gain a small project-color dot, so cross-project scanning works everywhere.

### 11.3 Color tokens & helper

- Add tokens `--project-color-1` … `--project-color-8` (plus companion `--project-tint-1` … `--project-tint-8`) to `globals.css`, defined in **every** theme block: `:root` (light default), `.dark`, `.ocean`, and the light block. Tokens follow the existing convention: defined under `:root`/theme blocks (not `@theme`, to avoid Tailwind utility-namespace collisions — consistent with how `--color-status-*` and `--blue/--orange/...` are declared).
- The palette deliberately uses hues **outside** the six reserved semantic status hues (blue/orange/amber/red/green/neutral) to avoid meaning collision — e.g. **violet, cyan, pink, lime, sky, rose, indigo, gold**. Each is retuned per theme for contrast (brighter on dark, deeper on light).
- New helper `packages/web/src/lib/project-color.ts`:
  ```ts
  // Maps a project's REGISTRATION INDEX (order added to the global config) to a
  // palette slot 1..8, cycling after 8.
  export function getProjectColor(projectId: string, registeredProjectIds: string[]): {
    slot: number;            // 1..8
    colorVar: string;        // e.g. "var(--project-color-3)"
    tintVar: string;         // e.g. "var(--project-tint-3)"
  };
  ```
  Registration index = the project's position in the ordered list of registered project IDs (insertion order of `config.projects`, which is a JS object preserving insertion order). `slot = (index % 8) + 1`. An unknown `projectId` (not in the list) falls back to slot 1 deterministically.
- Consumers (`SessionCard.tsx`, `ProjectSidebar.tsx`) apply the color via Tailwind arbitrary-value classes referencing the CSS var (e.g. `border-l-[color:var(--project-color-3)]`) — **no inline `style=` attributes** (C-02). The component receives the resolved `colorVar`/`tintVar` and the project name/dot.

### 11.5 Sidebar ORCHESTRATORS section

A dedicated **ORCHESTRATORS** section is added to the dashboard sidebar (`packages/web/src/components/ProjectSidebar.tsx`), rendered **above** the existing PROJECTS list. Chosen layout: **flat list**.

**Layout (expanded sidebar):**
- A section label `Orchestrators` (mirroring the existing `project-sidebar__nav-label` treatment of `Projects`).
- **Meta orchestrators on top**, each row marked with a diamond glyph (`◆`) preceding its name.
- A **divider**, then the **per-project orchestrators** below, each row prefixed with its **project-color dot** (`●`) resolved via `getProjectColor(projectId, registeredProjectIds)` (§11.3) — the same palette used for cards and project rows.
- **Right-aligned on each row:** the orchestrator's **activity-state dot** (working / idle / needs-input), reusing the **existing** session status/activity dot system — i.e. compute `getAttentionLevel(session)` and render with the existing `sidebar-session-dot` / `data-level` styling (the same mechanism `SessionDot` uses today). **Do not invent a new dot.**

**Navigation:**
- Click a **meta orchestrator** row → navigate to its `/meta/<name>` dashboard (where its session is also reachable). Use a new route helper `metaDashboardPath(name)` → `/meta/<name>` in `packages/web/src/lib/routes.ts`.
- Click a **per-project orchestrator** row → open that orchestrator session (`projectSessionPath(projectId, orchestratorId)`, the existing helper).

**Not shown:** scope relationships (which meta manages which projects) are **not** rendered in the sidebar — they live on the meta dashboard.

**Collapsed sidebar variant:** render the orchestrators as a compact cluster at the top of the collapsed rail, consistent with how projects collapse today:
- Meta orchestrators as a `◆` glyph link (title = `<name>`), navigating to `/meta/<name>`.
- Per-project orchestrators as a small project-color dot link (title = `<project name> orchestrator`), navigating to the orchestrator session.
- Each carries its activity-state via the existing `data-level` attribute for consistent coloring.

**Component extraction (C-04 compliance):** `ProjectSidebar.tsx` is already ~1260 lines (pre-existing, well over the 400-line cap). Adding this section inline would worsen that, so the ORCHESTRATORS section ships as a **new extracted component** `packages/web/src/components/SidebarOrchestrators.tsx` (handling both expanded and collapsed variants), imported and rendered by `ProjectSidebar`. The new component stays < 400 lines and gets its own test file. This is the "refactor/extract if ProjectSidebar would exceed it" path.

**Data flow:** `ProjectSidebar` gains two new props — the existing per-project `orchestrators?: ProjectSidebarOrchestrator[]` (already present: `{ id, projectId }`) is reused for project orchestrators, and a new `metaOrchestrators?: SidebarMetaOrchestrator[]` where:
```ts
export interface SidebarMetaOrchestrator {
  name: string;
  /** The meta orchestrator session (under projectId "_meta"), if running — used to derive the activity dot. Null when not started. */
  session: DashboardSession | null;
}
```
The per-project orchestrator's session (for its activity dot) is looked up from the raw `sessions` prop by id (the same `sessions?.find((s) => s.id === orchestratorLink.id)` pattern already used in `ProjectSidebar`). Meta orchestrator sessions live under `_meta` and are not in the project-scoped `sessions` list, so they are passed explicitly via `SidebarMetaOrchestrator.session`. The server-side wiring that feeds the sidebar (the `/api/sessions` `orchestrators` field today) is extended to also surface configured meta orchestrators and their sessions; the sidebar itself stays presentational.

### 11.6 Constraints honored
- No new UI libraries (C-01); no inline styles (C-02); component files < 400 lines — new `SidebarOrchestrators.tsx` and `SessionCard`/helper changes stay under it (C-04); dark theme preserved (C-05); App Router only (C-06); no animation libs (C-07); SSE 5s interval unchanged (C-14); test files for new components/helpers (C-12).

---

## 12. Testing Strategy

| Area | Tests |
|------|-------|
| Config | `metaOrchestrators` parses (both `scope` shapes); `discover` defaults to `false`; per-project `description` parses; `_meta` reserved-ID rejection; an explicit `scope.projects` entry not present in `config.projects` is **rejected** at load (fail loud). |
| Types/helpers | `isMetaOrchestratorSession`, `isCoordinatorSession`, `getSessionOwnerKind` (default `project`), `getSessionMetaOwner`. |
| Collision guard | `checkSpawnCollision`: hard refusal when a live session owns the issue (any owner); no hard when the only matching session is terminal; advisory list returned for freeform; empty result when no live peers. Plus a `_spawnInner` test that it throws before resource creation. |
| Meta prompt | Generator renders the catalog, dashboard URL, scope/discover; optional `rules` section is included when present and removed when absent; unresolved-placeholder guard fires. |
| Paths | `getMetaSessionsDir` / `getMetaSessionPath` produce the `_meta/<name>/sessions/<name>.json` layout. |
| Web helper | `getProjectColor`: index→slot mapping, cycling after 8, deterministic fallback for unknown project. |
| Web components | `SessionCard` renders the project rail/dot/name with the resolved color var (no inline style); `ProjectSidebar` renders the project dot. New components/helpers ship with test files (C-12). |
| Lifecycle / scope | `resolveInScopeProjectIds` (pure) resolves scope from the current registry (resolve-at-start; `discover` has no live effect — an out-of-list project registered later is not pulled in). Meta orchestrator sessions are excluded from project-scoped worker enumeration. |
| Sidebar orchestrators (§11.5) | `SidebarOrchestrators` renders meta rows with the `◆` glyph + name, per-project orchestrator rows with a project-color dot + name, and a right-aligned activity-state dot driven by `getAttentionLevel(session)` / `data-level` (no new dot). Meta row links to `/meta/<name>` via `metaDashboardPath`; project orchestrator row links to its session. Collapsed variant renders the compact glyph/dot cluster. No inline styles. |

Testing follows the repo defaults: Vitest + @testing-library/react, tests in `__tests__/`, TypeScript strict (no `any`), cross-platform helpers (`isWindows()` etc.) for any path/process code.

---

## 13. Affected Files (inventory)

**Core (`packages/core/src/`)** — foundational, build first:
- `types.ts` — `SessionKind` += `"meta-orchestrator"`; `MetaOrchestratorConfig`/`MetaScope`; `SessionSpawnConfig` += `ownerKind?`/`metaOwner?`; helpers `isMetaOrchestratorSession`/`isCoordinatorSession`/`getSessionOwnerKind`/`getSessionMetaOwner`.
- `config.ts` — `MetaOrchestratorConfigSchema`, `metaOrchestrators` on `OrchestratorConfigSchema`, `description` on `ProjectConfigSchema`, `_meta` reservation + scope validation.
- `paths.ts` — `getMetaSessionsDir` / `getMetaSessionPath`.
- `spawn-collision.ts` (new) — `checkSpawnCollision`.
- `session-manager.ts` — owner stamping in `_spawnInner`; collision guard call; `ensureMetaOrchestrator` (mirrors `ensureOrchestrator`).
- `meta-orchestrator-prompt.ts` (new) + `prompts/meta-orchestrator.md` (new).
- `lifecycle-manager.ts` — coordinator-aware enumeration (use `isCoordinatorSession`); meta liveness (reuse existing supervision). No `discover` reconcile in v1.
- `index.ts` — export new public symbols.

**CLI (`packages/cli/src/commands/`)**:
- `meta.ts` (new) — `meta-start`, `meta-status`.
- `spawn.ts` — `--owner-kind` / `--meta-owner` flags + advisory print.
- `status.ts` / `session.ts` — surface meta orchestrators in status; kill/cleanup integration.
- CLI entry point — register the new command.

**Web (`packages/web/src/`)**:
- `app/meta/[name]/page.tsx` (new) + `lib/meta-page-data.ts` (new loader).
- `app/globals.css` — `--project-color-1..8` + `--project-tint-1..8` in `:root`/`.dark`/`.ocean`/light.
- `lib/project-color.ts` (new) + test.
- `lib/routes.ts` — `metaDashboardPath(name)` helper.
- `components/SessionCard.tsx` — project rail/dot/name.
- `components/SidebarOrchestrators.tsx` (new) + test — the ORCHESTRATORS section (§11.5), expanded + collapsed.
- `components/ProjectSidebar.tsx` — project dot on rows; render `SidebarOrchestrators` above PROJECTS; new `metaOrchestrators` prop.

---

## 14. Spec Self-Review

- **Placeholder scan:** no TBD/TODO/"handle later" — every section names concrete files, schema, and helper signatures.
- **Internal consistency:** `ownerKind`/`metaOwner` are metadata keys throughout (§6.2, §7, §8, §11.1); `SessionKind` value `"meta-orchestrator"` and `role` metadata value `"meta-orchestrator"` are used consistently; the `isOrchestratorSession` non-match edge case is called out and resolved with `isCoordinatorSession` (§6.3, invariant 3); `getProjectColor` signature is consistent between §11.3, §11.5, and §13; the sidebar reuses `getAttentionLevel`/`SessionDot` styling rather than introducing a new dot (§11.5).
- **Scope:** matches the approved design; no speculative commands, no project-lane redesign, no filesystem discovery, no per-project-orchestrator delegation. Freeform dedup is advisory only. The ORCHESTRATORS sidebar section (§11.5) is the flat-list layout as approved; scope relationships are intentionally omitted from the sidebar.
- **Ambiguity resolved:** storage sentinel `_meta` reservation, "live/non-terminal" definition for the guard, registration-index definition for color, the no-worktree deviation for the meta session, and the C-04 extraction of `SidebarOrchestrators` (since `ProjectSidebar` already exceeds 400 lines) are each made explicit.
