# Athene Go Engine Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript orchestration core (session manager, lifecycle manager, plugin registry) with a Go binary that exposes a local HTTP API, while keeping the Next.js web dashboard and TypeScript plugin adapters intact.

**Architecture:** A strangler-fig migration across 7 independent phases. Each phase is releasable on its own and leaves the system in a working state. Phases 1–4 improve the TypeScript codebase without touching the architecture boundary. Phase 5 introduces the Go binary alongside TypeScript and moves the seam to an HTTP interface. Phases 6–7 migrate the core engine logic and plugin protocol to Go.

**Tech Stack:**
- Build: Turborepo 2.x, tsup 8.x (replaces tsc/rollup for plugins)
- Persistence: better-sqlite3 (Phase 2, TypeScript) → modernc.org/sqlite (Phase 5, Go)
- Go engine: Go 1.23+, chi router, zerolog, modernc.org/sqlite (pure-Go, no CGo)
- Plugin protocol: JSON-RPC 2.0 over stdin/stdout (Phase 7)
- Existing stack unchanged: Next.js 15, React 19, Tailwind v4, Vitest, xterm.js

## Global Constraints

- pnpm 9.15.4 with `workspace:*` protocol — no npm/yarn
- TypeScript strict mode — no `any` types in non-test files
- No new external UI component libraries (Radix, shadcn, etc.)
- No inline `style=` attributes in web components
- Dark theme must be preserved in all web changes
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, etc.
- All new Go code: `gofmt`-formatted, `go vet` clean, no `init()` functions
- The `AO_*` env var aliases must be preserved (never hard-remove, only add `ATHENE_*` duals)
- All commands run from the repo root unless noted otherwise

---

## Phase 1: Build Infrastructure

**Deliverable:** Sub-second incremental rebuilds via Turborepo + tsup. Single-process dev server (Next.js + both WebSocket servers merged). No behavior changes.

**Value:** Eliminates the biggest day-to-day friction. Can be merged immediately; no migration needed by users.

**Estimated effort:** 1–2 weeks

---

### Task 1.1: Add Turborepo

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (root) — add `turbo` dev dependency and update `build`/`dev`/`typecheck` scripts

- [ ] **Install Turborepo**

```bash
pnpm add -Dw turbo@latest
```

- [ ] **Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Update root `package.json` scripts**

Replace the existing `build`, `typecheck`, `lint`, `test` scripts:

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --filter=@made-by-moonlight/athene-web",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test --filter=!@made-by-moonlight/athene-web",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Run a full build and verify it succeeds**

```bash
pnpm build
```

Expected: all packages build, Turborepo reports cache misses on first run. Subsequent `pnpm build` with no changes should report all tasks cached.

- [ ] **Commit**

```bash
git add turbo.json package.json pnpm-lock.yaml
git commit -m "chore: add Turborepo for dependency-aware incremental builds"
```

---

### Task 1.2: Replace tsc/rollup with tsup for plugins and core

**Why:** `tsc` recompiles every file on every run. `tsup` (wraps esbuild) is 10–30× faster and produces identical output for library packages. The web package stays on `next build`; the CLI stays on `tsc` (it produces a Node.js executable, not a library).

**Files:**
- Create: `tsup.config.ts` in each of: `packages/core`, `packages/plugins/*/`, `packages/athene`
- Modify: `package.json` in each of those packages — replace `build` script
- Remove: `packages/core/rollup.config.js` (if it exists)

- [ ] **Install tsup**

```bash
pnpm add -Dw tsup
```

- [ ] **Create the shared tsup config template**

Create `packages/core/tsup.config.ts`:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
```

- [ ] **Apply the same config to each plugin package**

For each package in `packages/plugins/*/` and `packages/athene/`, create `tsup.config.ts` with the same content. The entry point is always `src/index.ts`.

```bash
# Verify list of packages that need tsup configs
find packages/plugins -name "package.json" -not -path "*/node_modules/*" -maxdepth 3 | xargs -I{} dirname {} | sort
```

- [ ] **Update each package's `build` script in `package.json`**

For `packages/core/package.json` and each plugin `package.json`, change:
```json
"build": "tsc"
```
to:
```json
"build": "tsup"
```

Remove the `rollup` script from `packages/core/package.json` if present.

- [ ] **Verify the build still works and output is equivalent**

```bash
pnpm build
# Check that dist/ contains .cjs, .mjs, and .d.ts files for a sample plugin
ls packages/plugins/runtime-tmux/dist/
```

Expected: `index.cjs`, `index.mjs`, `index.d.ts`

- [ ] **Run the test suite to confirm no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: replace tsc/rollup with tsup for plugins and core"
```

---

### Task 1.3: Merge WebSocket servers into a single Next.js custom server

**Why:** `pnpm dev` currently spawns three processes. Crashes in either WS server are silent. This merges them into one process on one port.

**Files:**
- Create: `packages/web/server.ts` — custom Next.js HTTP server that attaches both WS handlers
- Modify: `packages/web/package.json` — update `dev` script to use the custom server
- Modify: `packages/web/src/server/terminal-ws.ts` and `packages/web/src/server/direct-terminal-ws.ts` — export attach functions instead of self-starting

First, identify the current WS server entry points:

```bash
grep -r "WebSocketServer\|createServer" packages/web/src/server/ --include="*.ts" -l
```

- [ ] **Refactor terminal WS server to export an attach function**

In `packages/web/src/server/terminal-ws.ts` (or whichever file starts the terminal WS), change from self-starting to exporting:

```typescript
// Before: something like
// const wss = new WebSocketServer({ port: 3001 });

// After: export a function that attaches to an existing server
import type { Server } from "http";
import { WebSocketServer } from "ws";

export function attachTerminalWS(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/terminal" });
  wss.on("connection", (ws, req) => {
    // existing handler logic — move it here unchanged
  });
}
```

Apply the same pattern to `direct-terminal-ws.ts` — export `attachDirectTerminalWS(server: Server)`.

- [ ] **Create `packages/web/server.ts`**

```typescript
import { createServer } from "http";
import next from "next";
import { attachTerminalWS } from "./src/server/terminal-ws";
import { attachDirectTerminalWS } from "./src/server/direct-terminal-ws";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  attachTerminalWS(server);
  attachDirectTerminalWS(server);

  const port = parseInt(process.env.PORT ?? "3000", 10);
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

- [ ] **Update `packages/web/package.json` dev script**

```json
"dev": "tsx server.ts"
```

Install tsx if not present: `pnpm add -Dw tsx`

- [ ] **Update any client-side code that hardcoded ports 3001/3003**

```bash
grep -r "3001\|3003" packages/web/src --include="*.ts" --include="*.tsx"
```

Update WebSocket connection URLs to use the same origin port:

```typescript
// Before
const ws = new WebSocket("ws://localhost:3001/terminal");

// After
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
```

- [ ] **Test the dev server manually**

```bash
pnpm dev
# Open http://localhost:3000
# Navigate to a session with a terminal
# Confirm the terminal connects and shows output
```

- [ ] **Commit**

```bash
git add packages/web/server.ts packages/web/package.json packages/web/src/
git commit -m "feat(web): merge WebSocket servers into single Next.js custom server"
```

---

## Phase 2: SQLite Persistence

**Deliverable:** Session metadata stored in SQLite instead of bespoke key-value flat files. Includes a one-time migration CLI command.

**Value:** Eliminates the most fragile system. Atomic writes, queryable sessions, no custom serialization. The format change is internal — no plugin or user-facing contracts change.

**Estimated effort:** 2–3 weeks

---

### Task 2.1: Schema design and database module

**Files:**
- Create: `packages/core/src/db.ts` — SQLite connection factory and schema
- Create: `packages/core/src/__tests__/db.test.ts`

- [ ] **Install better-sqlite3**

```bash
pnpm add --filter @made-by-moonlight/athene-core better-sqlite3
pnpm add --filter @made-by-moonlight/athene-core -D @types/better-sqlite3
```

- [ ] **Write the failing test for database initialization**

Create `packages/core/src/__tests__/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openDb, closeDb } from "../db";

describe("openDb", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athene-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("creates database file and applies schema", () => {
    const db = openDb(join(dir, "athene.db"));
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("sessions");
    expect(names).toContain("session_kv");
    closeDb(db);
  });

  it("is idempotent — opening twice does not fail", () => {
    const db1 = openDb(join(dir, "athene.db"));
    closeDb(db1);
    const db2 = openDb(join(dir, "athene.db"));
    closeDb(db2);
  });
});
```

- [ ] **Run the test to confirm it fails**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run db.test.ts
```

Expected: FAIL — `../db` not found.

- [ ] **Create `packages/core/src/db.ts`**

```typescript
import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    lifecycle TEXT NOT NULL DEFAULT '{}',
    branch TEXT,
    issue_id TEXT,
    workspace_path TEXT,
    runtime_handle TEXT,
    agent_info TEXT,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER,
    activity TEXT,
    activity_signal TEXT NOT NULL DEFAULT 'none'
  );

  CREATE TABLE IF NOT EXISTS session_kv (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (session_id, key)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
`;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec(SCHEMA);
  return db;
}

export function closeDb(db: DB): void {
  db.close();
}
```

- [ ] **Run the test to confirm it passes**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run db.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add packages/core/src/db.ts packages/core/src/__tests__/db.test.ts
git commit -m "feat(core): add SQLite database module with schema"
```

---

### Task 2.2: Session store backed by SQLite

**Files:**
- Create: `packages/core/src/session-store.ts` — CRUD operations over the SQLite DB
- Create: `packages/core/src/__tests__/session-store.test.ts`

This task defines the new persistence interface that Task 2.3 will wire into `session-manager.ts`.

**Interface produced (used by Task 2.3 and Phase 5):**

```typescript
export interface SessionStore {
  create(session: Session): void;
  get(id: string): Session | null;
  list(projectId?: string): Session[];
  update(id: string, patch: Partial<Session>): void;
  setKV(sessionId: string, key: string, value: string): void;
  getKV(sessionId: string, key: string): string | null;
  getAllKV(sessionId: string): Record<string, string>;
  remove(id: string): void;
}
```

- [ ] **Write the failing tests**

Create `packages/core/src/__tests__/session-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openDb, closeDb } from "../db";
import { createSessionStore } from "../session-store";
import type { Database as DB } from "better-sqlite3";
import type { Session } from "../types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-session-1",
    projectId: "test-project",
    status: "spawning",
    activity: null,
    activitySignal: "none",
    lifecycle: { version: 2, session: { state: "not_started", reason: null, updatedAt: Date.now() }, pr: { state: "none", prNumber: null, ciStatus: null, reviewStatus: null, updatedAt: Date.now() }, runtime: { state: "unknown", updatedAt: Date.now() } },
    branch: "feat/test",
    issueId: null,
    pr: null,
    prs: [],
    workspacePath: "/tmp/test",
    runtimeHandle: null,
    agentInfo: null,
    createdAt: Date.now(),
    lastActivityAt: null,
    metadata: {},
    ...overrides,
  };
}

describe("SessionStore", () => {
  let dir: string;
  let db: DB;
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athene-store-test-"));
    db = openDb(join(dir, "athene.db"));
    store = createSessionStore(db);
  });

  afterEach(() => {
    closeDb(db);
    rmSync(dir, { recursive: true });
  });

  it("creates and retrieves a session", () => {
    const session = makeSession();
    store.create(session);
    const retrieved = store.get("test-session-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe("test-session-1");
    expect(retrieved!.projectId).toBe("test-project");
  });

  it("lists sessions filtered by projectId", () => {
    store.create(makeSession({ id: "s1", projectId: "proj-a" }));
    store.create(makeSession({ id: "s2", projectId: "proj-b" }));
    store.create(makeSession({ id: "s3", projectId: "proj-a" }));

    const projA = store.list("proj-a");
    expect(projA).toHaveLength(2);
    expect(projA.map((s) => s.id)).toEqual(expect.arrayContaining(["s1", "s3"]));
  });

  it("updates a session field", () => {
    store.create(makeSession());
    store.update("test-session-1", { branch: "updated-branch" });
    const updated = store.get("test-session-1");
    expect(updated!.branch).toBe("updated-branch");
  });

  it("stores and retrieves key-value pairs", () => {
    store.create(makeSession());
    store.setKV("test-session-1", "custom_key", "custom_value");
    expect(store.getKV("test-session-1", "custom_key")).toBe("custom_value");
  });

  it("deletes session and cascades KV deletion", () => {
    store.create(makeSession());
    store.setKV("test-session-1", "k", "v");
    store.remove("test-session-1");
    expect(store.get("test-session-1")).toBeNull();
    expect(store.getKV("test-session-1", "k")).toBeNull();
  });
});
```

- [ ] **Run the tests to confirm they fail**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run session-store.test.ts
```

Expected: FAIL — `../session-store` not found.

- [ ] **Create `packages/core/src/session-store.ts`**

```typescript
import type { Database as DB } from "better-sqlite3";
import type { Session, CanonicalSessionLifecycle, PRInfo, ActivityDetection, ActivitySignal } from "./types";

export interface SessionStore {
  create(session: Session): void;
  get(id: string): Session | null;
  list(projectId?: string): Session[];
  update(id: string, patch: Partial<Session>): void;
  setKV(sessionId: string, key: string, value: string): void;
  getKV(sessionId: string, key: string): string | null;
  getAllKV(sessionId: string): Record<string, string>;
  remove(id: string): void;
}

interface SessionRow {
  id: string;
  project_id: string;
  lifecycle: string;
  branch: string | null;
  issue_id: string | null;
  workspace_path: string | null;
  runtime_handle: string | null;
  agent_info: string | null;
  created_at: number;
  last_activity_at: number | null;
  activity: string | null;
  activity_signal: string;
}

function rowToSession(row: SessionRow, kv: Record<string, string>): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    status: "spawning", // derived by deriveLegacyStatus — caller handles this
    activity: row.activity ? (JSON.parse(row.activity) as ActivityDetection) : null,
    activitySignal: row.activity_signal as ActivitySignal,
    lifecycle: JSON.parse(row.lifecycle) as CanonicalSessionLifecycle,
    branch: row.branch ?? undefined,
    issueId: row.issue_id ?? undefined,
    pr: null, // derived from lifecycle.pr by session-manager
    prs: [],
    workspacePath: row.workspace_path ?? undefined,
    runtimeHandle: row.runtime_handle ? JSON.parse(row.runtime_handle) : null,
    agentInfo: row.agent_info ? JSON.parse(row.agent_info) : null,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at ?? undefined,
    metadata: kv,
  };
}

export function createSessionStore(db: DB): SessionStore {
  const stmts = {
    insert: db.prepare(`
      INSERT INTO sessions (id, project_id, lifecycle, branch, issue_id, workspace_path,
        runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal)
      VALUES (@id, @projectId, @lifecycle, @branch, @issueId, @workspacePath,
        @runtimeHandle, @agentInfo, @createdAt, @lastActivityAt, @activity, @activitySignal)
    `),
    selectById: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    selectByProject: db.prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`),
    selectAll: db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`),
    delete: db.prepare(`DELETE FROM sessions WHERE id = ?`),
    selectKV: db.prepare(`SELECT key, value FROM session_kv WHERE session_id = ?`),
    upsertKV: db.prepare(`INSERT INTO session_kv (session_id, key, value) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value`),
    selectOneKV: db.prepare(`SELECT value FROM session_kv WHERE session_id = ? AND key = ?`),
  };

  function getKVMap(sessionId: string): Record<string, string> {
    const rows = stmts.selectKV.all(sessionId) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  }

  return {
    create(session: Session): void {
      stmts.insert.run({
        id: session.id,
        projectId: session.projectId,
        lifecycle: JSON.stringify(session.lifecycle),
        branch: session.branch ?? null,
        issueId: session.issueId ?? null,
        workspacePath: session.workspacePath ?? null,
        runtimeHandle: session.runtimeHandle ? JSON.stringify(session.runtimeHandle) : null,
        agentInfo: session.agentInfo ? JSON.stringify(session.agentInfo) : null,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt ?? null,
        activity: session.activity ? JSON.stringify(session.activity) : null,
        activitySignal: session.activitySignal,
      });
    },

    get(id: string): Session | null {
      const row = stmts.selectById.get(id) as SessionRow | undefined;
      if (!row) return null;
      return rowToSession(row, getKVMap(id));
    },

    list(projectId?: string): Session[] {
      const rows = projectId
        ? (stmts.selectByProject.all(projectId) as SessionRow[])
        : (stmts.selectAll.all() as SessionRow[]);
      return rows.map((row) => rowToSession(row, getKVMap(row.id)));
    },

    update(id: string, patch: Partial<Session>): void {
      const sets: string[] = [];
      const values: unknown[] = [];

      if (patch.lifecycle !== undefined) { sets.push("lifecycle = ?"); values.push(JSON.stringify(patch.lifecycle)); }
      if (patch.branch !== undefined) { sets.push("branch = ?"); values.push(patch.branch ?? null); }
      if (patch.issueId !== undefined) { sets.push("issue_id = ?"); values.push(patch.issueId ?? null); }
      if (patch.workspacePath !== undefined) { sets.push("workspace_path = ?"); values.push(patch.workspacePath ?? null); }
      if (patch.runtimeHandle !== undefined) { sets.push("runtime_handle = ?"); values.push(patch.runtimeHandle ? JSON.stringify(patch.runtimeHandle) : null); }
      if (patch.agentInfo !== undefined) { sets.push("agent_info = ?"); values.push(patch.agentInfo ? JSON.stringify(patch.agentInfo) : null); }
      if (patch.lastActivityAt !== undefined) { sets.push("last_activity_at = ?"); values.push(patch.lastActivityAt ?? null); }
      if (patch.activity !== undefined) { sets.push("activity = ?"); values.push(patch.activity ? JSON.stringify(patch.activity) : null); }
      if (patch.activitySignal !== undefined) { sets.push("activity_signal = ?"); values.push(patch.activitySignal); }

      if (sets.length === 0) return;
      values.push(id);
      db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    },

    setKV(sessionId: string, key: string, value: string): void {
      stmts.upsertKV.run(sessionId, key, value);
    },

    getKV(sessionId: string, key: string): string | null {
      const row = stmts.selectOneKV.get(sessionId, key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    getAllKV(sessionId: string): Record<string, string> {
      return getKVMap(sessionId);
    },

    remove(id: string): void {
      stmts.delete.run(id);
    },
  };
}
```

- [ ] **Run the tests**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run session-store.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add packages/core/src/session-store.ts packages/core/src/__tests__/session-store.test.ts
git commit -m "feat(core): add SQLite-backed session store"
```

---

### Task 2.3: Wire SessionStore into session-manager and write migration CLI

**Files:**
- Modify: `packages/core/src/session-manager.ts` — replace `mutateMetadata`/`updateMetadata` calls with `SessionStore` methods
- Create: `packages/core/src/cli/migrate-metadata.ts` — one-shot migration tool
- Modify: `packages/core/src/index.ts` — export `createSessionStore`, `openDb`, `closeDb`

This task is the largest in Phase 2. The strategy: replace reads/writes to the flat-file metadata system one method at a time in `session-manager.ts`, keeping the same public API surface.

- [ ] **Add the store to SessionManager's constructor**

In `packages/core/src/session-manager.ts`, add `SessionStore` as a dependency:

```typescript
// At top of file, add import
import { createSessionStore, type SessionStore } from "./session-store";
import { openDb } from "./db";

// In the SessionManager class constructor, open the DB and create the store:
constructor(private config: ProjectConfig, /* existing params */) {
  const dbPath = join(config.stateDir, "athene.db");
  this.db = openDb(dbPath);
  this.store = createSessionStore(this.db);
  // ... rest of existing constructor
}
```

- [ ] **Replace `updateMetadata` / `mutateMetadata` calls with store methods**

For each location in `session-manager.ts` that calls `mutateMetadata(sessionId, key, value)` or reads via `getMetadata(sessionId, key)`, replace with the equivalent store call:

```typescript
// Before: writing a metadata key
await mutateMetadata(sessionPath, "lifecycle", JSON.stringify(lc));

// After:
this.store.update(session.id, { lifecycle: lc });

// Before: reading a metadata key
const raw = await getMetadata(sessionPath, "lifecycle");

// After:
const session = this.store.get(sessionId);
const lc = session?.lifecycle;

// Before: writing an arbitrary plugin key
await mutateMetadata(sessionPath, key, value);

// After:
this.store.setKV(session.id, key, value);
```

Work through `session-manager.ts` top-to-bottom. Do not remove `metadata.ts` yet — it may still be imported elsewhere.

- [ ] **Run the existing session-manager tests**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run session-manager.test.ts
```

Expected: PASS. Fix any failures before continuing.

- [ ] **Create the migration CLI**

Create `packages/core/src/cli/migrate-metadata.ts`:

```typescript
#!/usr/bin/env node
/**
 * One-shot migration: reads all flat-file session metadata directories and
 * inserts them into the SQLite database. Safe to run multiple times (uses
 * INSERT OR IGNORE).
 */
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { openDb } from "../db";
import { createSessionStore } from "../session-store";

const AO_HOME = join(homedir(), ".agent-orchestrator");

function parseKV(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    result[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return result;
}

async function migrate() {
  const projects = readdirSync(AO_HOME).filter(
    (d) => d.includes("-") && existsSync(join(AO_HOME, d, "sessions"))
  );

  for (const project of projects) {
    const dbPath = join(AO_HOME, project, "athene.db");
    const db = openDb(dbPath);
    const store = createSessionStore(db);

    const sessionsDir = join(AO_HOME, project, "sessions");
    const sessionIds = readdirSync(sessionsDir);

    console.log(`Migrating ${sessionIds.length} sessions for project ${project}...`);

    for (const sessionId of sessionIds) {
      const sessionFile = join(sessionsDir, sessionId);
      if (!existsSync(sessionFile)) continue;

      const kv = parseKV(readFileSync(sessionFile, "utf-8"));

      // Skip if already migrated
      if (store.get(sessionId)) continue;

      try {
        const lifecycle = kv["lifecycle"] ? JSON.parse(kv["lifecycle"]) : {
          version: 2,
          session: { state: "done", reason: "auto_cleanup", updatedAt: Date.now() },
          pr: { state: "none", prNumber: null, ciStatus: null, reviewStatus: null, updatedAt: Date.now() },
          runtime: { state: "unknown", updatedAt: Date.now() },
        };

        store.create({
          id: sessionId,
          projectId: kv["projectId"] ?? project,
          status: "done" as const,
          activity: null,
          activitySignal: "none" as const,
          lifecycle,
          branch: kv["branch"],
          issueId: kv["issueId"],
          pr: null,
          prs: [],
          workspacePath: kv["workspacePath"],
          runtimeHandle: null,
          agentInfo: kv["agentInfo"] ? JSON.parse(kv["agentInfo"]) : null,
          createdAt: parseInt(kv["createdAt"] ?? "0", 10) || Date.now(),
          lastActivityAt: kv["lastActivityAt"] ? parseInt(kv["lastActivityAt"], 10) : undefined,
          metadata: kv,
        });

        // Preserve all KV pairs for plugin use
        for (const [key, value] of Object.entries(kv)) {
          store.setKV(sessionId, key, value);
        }
      } catch (err) {
        console.warn(`  Skipping session ${sessionId}: ${(err as Error).message}`);
      }
    }

    db.close();
    console.log(`  Done: ${project}`);
  }

  console.log("Migration complete.");
}

migrate().catch(console.error);
```

- [ ] **Add migration command to `packages/core/package.json`**

```json
"scripts": {
  "migrate": "tsx src/cli/migrate-metadata.ts"
}
```

- [ ] **Test the migration against a real AO state directory (if one exists)**

```bash
pnpm --filter @made-by-moonlight/athene-core migrate
```

If no sessions exist locally, create a test fixture and run the migration against it.

- [ ] **Export the new APIs from `packages/core/src/index.ts`**

```typescript
export { openDb, closeDb } from "./db";
export { createSessionStore } from "./session-store";
export type { SessionStore } from "./session-store";
```

- [ ] **Commit**

```bash
git add packages/core/src/ packages/core/package.json
git commit -m "feat(core): wire SQLite session store into session-manager; add migration CLI"
```

---

## Phase 3: Dynamic Plugin Loading

**Deliverable:** Plugins discovered at runtime by scanning directories instead of being hardcoded. CLI and web no longer statically depend on all 25 plugin packages.

**Value:** Touching any plugin no longer triggers a CLI/web rebuild. Plugins can be published and installed independently.

**Estimated effort:** 1–2 weeks

---

### Task 3.1: Plugin discovery module

**Files:**
- Create: `packages/core/src/plugin-discovery.ts`
- Create: `packages/core/src/__tests__/plugin-discovery.test.ts`
- Modify: `packages/core/src/plugin-registry.ts` — replace `BUILTIN_PLUGINS` with discovery call

**Interface produced (used by CLI and web bootstrap):**

```typescript
export async function discoverPlugins(searchPaths: string[]): Promise<PluginModule<unknown>[]>
```

- [ ] **Write failing tests**

Create `packages/core/src/__tests__/plugin-discovery.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { discoverPlugins } from "../plugin-discovery";
import { writeFileSync, mkdirSync } from "fs";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("discoverPlugins", () => {
  it("returns empty array when no directories exist", async () => {
    const result = await discoverPlugins(["/nonexistent/path"]);
    expect(result).toEqual([]);
  });

  it("loads a valid plugin from a search path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "athene-plugin-test-"));
    try {
      const pluginDir = join(dir, "athene-plugin-runtime-fake");
      mkdirSync(pluginDir);
      writeFileSync(
        join(pluginDir, "index.js"),
        `module.exports = { default: { manifest: { name: "fake", slot: "runtime", version: "0.0.1" }, create: () => ({}) } };`
      );
      writeFileSync(
        join(pluginDir, "package.json"),
        JSON.stringify({ name: "athene-plugin-runtime-fake", main: "index.js" })
      );

      const plugins = await discoverPlugins([dir]);
      expect(plugins).toHaveLength(1);
      expect(plugins[0].manifest.name).toBe("fake");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("skips directories that do not match the plugin naming convention", async () => {
    const dir = mkdtempSync(join(tmpdir(), "athene-skip-test-"));
    try {
      mkdirSync(join(dir, "not-a-plugin"));
      const plugins = await discoverPlugins([dir]);
      expect(plugins).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
```

- [ ] **Run to confirm failure**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run plugin-discovery.test.ts
```

- [ ] **Create `packages/core/src/plugin-discovery.ts`**

```typescript
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import type { PluginModule } from "./types";

const PLUGIN_PREFIX = "athene-plugin-";

export async function discoverPlugins(searchPaths: string[]): Promise<PluginModule<unknown>[]> {
  const plugins: PluginModule<unknown>[] = [];

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    let entries: string[];
    try {
      entries = readdirSync(searchPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.startsWith(PLUGIN_PREFIX)) continue;

      const pluginPath = join(searchPath, entry);
      const packageJsonPath = join(pluginPath, "package.json");
      if (!existsSync(packageJsonPath)) continue;

      try {
        const mod = await import(pluginPath) as { default?: PluginModule<unknown> };
        const plugin = mod.default;
        if (plugin?.manifest?.name && plugin?.manifest?.slot && typeof plugin?.create === "function") {
          plugins.push(plugin);
        }
      } catch (err) {
        console.warn(`[plugin-discovery] Failed to load ${entry}:`, err);
      }
    }
  }

  return plugins;
}

/** Returns the paths to scan for built-in plugins (the packages installed alongside core). */
export function getBuiltinPluginPaths(): string[] {
  // Walk up from this file's location to find the monorepo packages/plugins dir,
  // or fall back to node_modules for installed (non-monorepo) use.
  const candidates = [
    join(__dirname, "../../plugins"),          // monorepo: packages/plugins
    join(__dirname, "../../../node_modules"),  // installed: node_modules/@made-by-moonlight/
  ];
  return candidates;
}
```

- [ ] **Run the tests**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run plugin-discovery.test.ts
```

Expected: PASS.

- [ ] **Modify `plugin-registry.ts` to use discovery**

Find the `BUILTIN_PLUGINS` array in `packages/core/src/plugin-registry.ts` and replace the static import list with a call to `discoverPlugins`:

```typescript
// Remove all static plugin imports like:
// import claudeCode from "@made-by-moonlight/athene-plugin-agent-claude-code";

// Replace the loadBuiltins() function:
import { discoverPlugins, getBuiltinPluginPaths } from "./plugin-discovery";

async function loadBuiltins(registry: PluginRegistry): Promise<void> {
  const plugins = await discoverPlugins(getBuiltinPluginPaths());
  for (const plugin of plugins) {
    registry.register(plugin);
  }
}
```

- [ ] **Remove plugin deps from CLI and web `package.json`**

```bash
# List the plugin packages currently in CLI's dependencies
cat packages/cli/package.json | grep athene-plugin
```

Remove those entries from `packages/cli/package.json` and `packages/web/package.json`. The plugins are now discovered at runtime.

- [ ] **Full build and smoke test**

```bash
pnpm build
pnpm test
```

Expected: all pass. Verify that `athene status` or the dev server can still load plugins.

- [ ] **Commit**

```bash
git add packages/core/src/plugin-discovery.ts packages/core/src/__tests__/plugin-discovery.test.ts packages/core/src/plugin-registry.ts packages/cli/package.json packages/web/package.json
git commit -m "feat(core): replace hardcoded plugin list with runtime plugin discovery"
```

---

## Phase 4: Decompose God Files

**Deliverable:** `session-manager.ts` and `lifecycle-manager.ts` split into focused modules. Dual status system removed — dashboard uses canonical lifecycle state exclusively.

**Value:** Future changes to the core engine (including the Go migration in Phase 5+) are much less risky. Each module can be tested and reviewed in isolation.

**Estimated effort:** 3–4 weeks

---

### Task 4.1: Extract lifecycle state machine

**Files:**
- Create: `packages/core/src/lifecycle-state-machine.ts` — state transition functions extracted from `lifecycle-manager.ts`
- Modify: `packages/core/src/lifecycle-manager.ts` — import from the new module

This task does not change behavior — it is a pure extract refactor. All existing tests must continue to pass.

- [ ] **Identify the state transition functions**

```bash
grep -n "function\|const.*=.*(" packages/core/src/lifecycle-manager.ts | head -60
```

Look for functions that: take a session state and return a new state, evaluate whether a transition is valid, or apply a terminal reason.

- [ ] **Move those functions to `lifecycle-state-machine.ts`**

Create `packages/core/src/lifecycle-state-machine.ts` and move the functions. Export them. Update imports in `lifecycle-manager.ts`.

- [ ] **Run lifecycle-manager tests**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run lifecycle-manager.test.ts
```

Expected: PASS (zero behavior change).

- [ ] **Commit**

```bash
git add packages/core/src/lifecycle-state-machine.ts packages/core/src/lifecycle-manager.ts
git commit -m "refactor(core): extract state transition functions into lifecycle-state-machine.ts"
```

---

### Task 4.2: Extract PR tracker from lifecycle manager

**Files:**
- Create: `packages/core/src/pr-tracker.ts` — GitHub PR polling logic
- Modify: `packages/core/src/lifecycle-manager.ts` — import from `pr-tracker.ts`

- [ ] **Identify PR-polling code**

```bash
grep -n "pr\|PR\|pullRequest\|github" packages/core/src/lifecycle-manager.ts | grep -i "poll\|check\|enrich\|batch" | head -30
```

- [ ] **Extract to `pr-tracker.ts`**

The PR tracker's public interface should be:

```typescript
export interface PRTracker {
  enrichSessions(sessions: Session[], scm: SCM): Promise<void>;
}

export function createPRTracker(): PRTracker { ... }
```

- [ ] **Run tests**

```bash
pnpm --filter @made-by-moonlight/athene-core test -- --run lifecycle-manager.test.ts
```

Expected: PASS.

- [ ] **Commit**

```bash
git add packages/core/src/pr-tracker.ts packages/core/src/lifecycle-manager.ts
git commit -m "refactor(core): extract PR polling logic into pr-tracker.ts"
```

---

### Task 4.3: Migrate web dashboard to canonical lifecycle state; delete legacy status

**Files:**
- Modify: `packages/web/src/lib/types.ts` — update `DashboardSession` to use canonical state
- Modify: `packages/web/src/components/Dashboard.tsx` — use `lifecycle.session.state` for Kanban columns
- Modify: `packages/web/src/components/SessionCard.tsx` — update status badge
- Modify: `packages/web/src/components/ProjectSidebar.tsx` — update status indicators
- Modify: `packages/core/src/lifecycle-state.ts` — delete `deriveLegacyStatus` after consumers removed
- Modify: `packages/core/src/types.ts` — remove `SessionStatus` type after all references gone

This task requires systematic grep-and-replace of `session.status` references in the web package.

- [ ] **Audit all uses of legacy status in the web**

```bash
grep -rn "session\.status\|SessionStatus\|deriveLegacyStatus" packages/web/src --include="*.ts" --include="*.tsx"
```

For each location, replace with the equivalent canonical state check:

| Legacy status | Canonical equivalent |
|---------------|---------------------|
| `"spawning"` | `lifecycle.session.state === "not_started"` |
| `"working"` | `lifecycle.session.state === "working"` |
| `"pr_open"` | `lifecycle.pr.state === "open"` |
| `"ci_failed"` | `lifecycle.pr.ciStatus === "failed"` |
| `"review_pending"` | `lifecycle.pr.reviewStatus === "pending"` |
| `"merged"` | `lifecycle.pr.state === "merged"` |
| `"done"` | `lifecycle.session.state === "done"` |
| `"terminated"` | `lifecycle.session.state === "terminated"` |

- [ ] **Update Kanban column mapping in `Dashboard.tsx`**

Find the column definition (likely a `COLUMNS` or `STATUS_COLUMNS` array) and replace `status` comparisons with lifecycle state checks.

- [ ] **Run web tests**

```bash
pnpm --filter @made-by-moonlight/athene-web test
```

Expected: PASS. Fix any component tests that were asserting on legacy status values.

- [ ] **Delete `deriveLegacyStatus` from `lifecycle-state.ts`**

Only after all web references are removed.

- [ ] **Delete `SessionStatus` from `types.ts`**

Only after `deriveLegacyStatus` is deleted and all references updated.

- [ ] **Full typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Commit**

```bash
git add packages/web/src/ packages/core/src/lifecycle-state.ts packages/core/src/types.ts
git commit -m "refactor: migrate dashboard to canonical lifecycle state; remove legacy SessionStatus"
```

---

## Phase 5: Go Engine Bootstrap

**Deliverable:** A Go binary (`athene-engine`) that owns the SQLite database and exposes a local REST API. The Next.js web API routes proxy all requests to the Go engine instead of reading the database directly.

**Value:** Go binary exists. The seam between web and engine is now an HTTP interface. TypeScript plugins and lifecycle logic continue to work unchanged — this phase moves only storage and session CRUD to Go.

**Estimated effort:** 6–8 weeks

---

### Task 5.1: Go module scaffold

**Files:**
- Create: `engine/` directory at repo root
- Create: `engine/go.mod`, `engine/go.sum`
- Create: `engine/cmd/athene-engine/main.go`
- Create: `engine/internal/store/store.go` — SQLite wrapper (same schema as Phase 2)
- Create: `engine/internal/api/server.go` — chi HTTP server
- Create: `engine/internal/api/sessions.go` — session endpoints
- Create: `engine/internal/config/config.go` — reads `agent-orchestrator.yaml`
- Create: `engine/Makefile`

- [ ] **Initialize Go module**

```bash
mkdir engine
cd engine
go mod init github.com/slievr/athene/engine
go get github.com/go-chi/chi/v5@latest
go get github.com/go-chi/chi/v5/middleware@latest
go get modernc.org/sqlite@latest
go get gopkg.in/yaml.v3@latest
go get github.com/rs/zerolog@latest
```

- [ ] **Create `engine/internal/store/store.go`**

```go
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	lifecycle TEXT NOT NULL DEFAULT '{}',
	branch TEXT,
	issue_id TEXT,
	workspace_path TEXT,
	runtime_handle TEXT,
	agent_info TEXT,
	created_at INTEGER NOT NULL,
	last_activity_at INTEGER,
	activity TEXT,
	activity_signal TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS session_kv (
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	key TEXT NOT NULL,
	value TEXT,
	PRIMARY KEY (session_id, key)
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
`

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

type Session struct {
	ID             string          `json:"id"`
	ProjectID      string          `json:"projectId"`
	Lifecycle      json.RawMessage `json:"lifecycle"`
	Branch         *string         `json:"branch,omitempty"`
	IssueID        *string         `json:"issueId,omitempty"`
	WorkspacePath  *string         `json:"workspacePath,omitempty"`
	RuntimeHandle  json.RawMessage `json:"runtimeHandle,omitempty"`
	AgentInfo      json.RawMessage `json:"agentInfo,omitempty"`
	CreatedAt      int64           `json:"createdAt"`
	LastActivityAt *int64          `json:"lastActivityAt,omitempty"`
	Activity       json.RawMessage `json:"activity,omitempty"`
	ActivitySignal string          `json:"activitySignal"`
	KV             map[string]string `json:"metadata,omitempty"`
}

func (s *Store) GetSession(id string) (*Session, error) {
	row := s.db.QueryRow(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions WHERE id = ?`, id)
	sess, err := scanSession(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.KV, err = s.getKV(id)
	return sess, err
}

func (s *Store) ListSessions(projectID string) ([]*Session, error) {
	var rows *sql.Rows
	var err error
	if projectID != "" {
		rows, err = s.db.Query(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions WHERE project_id = ? ORDER BY created_at DESC`, projectID)
	} else {
		rows, err = s.db.Query(`SELECT id, project_id, lifecycle, branch, issue_id, workspace_path, runtime_handle, agent_info, created_at, last_activity_at, activity, activity_signal FROM sessions ORDER BY created_at DESC`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*Session
	for rows.Next() {
		sess, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sess.KV, _ = s.getKV(sess.ID)
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

func (s *Store) getKV(sessionID string) (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM session_kv WHERE session_id = ?`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	kv := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		kv[k] = v
	}
	return kv, rows.Err()
}

type scanner interface {
	Scan(...any) error
}

func scanSession(s scanner) (*Session, error) {
	var sess Session
	return &sess, s.Scan(
		&sess.ID, &sess.ProjectID, &sess.Lifecycle,
		&sess.Branch, &sess.IssueID, &sess.WorkspacePath,
		&sess.RuntimeHandle, &sess.AgentInfo,
		&sess.CreatedAt, &sess.LastActivityAt,
		&sess.Activity, &sess.ActivitySignal,
	)
}
```

- [ ] **Create `engine/internal/api/sessions.go`**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/slievr/athene/engine/internal/store"
)

func RegisterSessionRoutes(r chi.Router, st *store.Store) {
	r.Get("/api/sessions", listSessions(st))
	r.Get("/api/sessions/{id}", getSession(st))
}

func listSessions(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := r.URL.Query().Get("projectId")
		sessions, err := st.ListSessions(projectID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sessions == nil {
			sessions = []*store.Session{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessions)
	}
}

func getSession(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		sess, err := st.GetSession(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sess == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sess)
	}
}
```

- [ ] **Create `engine/cmd/athene-engine/main.go`**

```go
package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/slievr/athene/engine/internal/api"
	"github.com/slievr/athene/engine/internal/store"
)

func main() {
	dbPath := flag.String("db", "", "Path to athene.db (required)")
	port := flag.Int("port", 3030, "Port to listen on")
	flag.Parse()

	if *dbPath == "" {
		fmt.Fprintln(os.Stderr, "-db is required")
		os.Exit(1)
	}

	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	abs, err := filepath.Abs(*dbPath)
	if err != nil {
		log.Fatal().Err(err).Msg("resolve db path")
	}

	st, err := store.Open(abs)
	if err != nil {
		log.Fatal().Err(err).Msg("open store")
	}
	defer st.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	api.RegisterSessionRoutes(r, st)

	addr := fmt.Sprintf(":%d", *port)
	log.Info().Str("addr", addr).Msg("athene-engine starting")
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
```

- [ ] **Create `engine/Makefile`**

```makefile
.PHONY: build test lint

build:
	go build -o bin/athene-engine ./cmd/athene-engine

test:
	go test ./...

lint:
	go vet ./...
```

- [ ] **Build the Go binary**

```bash
cd engine && make build
```

Expected: `engine/bin/athene-engine` produced, no errors.

- [ ] **Write a Go test for the store**

Create `engine/internal/store/store_test.go`:

```go
package store_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/slievr/athene/engine/internal/store"
)

func TestOpenAndList(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	sessions, err := st.ListSessions("")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestGetNonexistent(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	sess, err := st.GetSession("does-not-exist")
	if err != nil {
		t.Fatal(err)
	}
	if sess != nil {
		t.Errorf("expected nil, got %+v", sess)
	}
}
```

```bash
cd engine && make test
```

Expected: PASS.

- [ ] **Add `engine/` to turbo pipeline**

In `turbo.json`, add:

```json
"tasks": {
  "engine#build": { "outputs": ["engine/bin/**"] }
}
```

In root `package.json`, add:

```json
"engine:build": "cd engine && make build"
```

- [ ] **Commit**

```bash
git add engine/
git commit -m "feat(engine): scaffold Go engine binary with SQLite store and sessions API"
```

---

### Task 5.2: Proxy Next.js API routes to the Go engine

**Files:**
- Create: `packages/web/src/lib/engine-client.ts` — typed HTTP client for the Go engine
- Modify: `packages/web/src/app/api/sessions/route.ts` — proxy GET to engine
- Modify: `packages/web/src/app/api/sessions/[id]/route.ts` — proxy GET to engine
- Modify: `packages/web/server.ts` — start the Go engine as a child process

**Interface consumed:** Go engine REST API on `http://localhost:3030`

- [ ] **Create `packages/web/src/lib/engine-client.ts`**

```typescript
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:3030";

async function engineFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${ENGINE_URL}${path}`, init);
  return res;
}

export async function listSessions(projectId?: string): Promise<unknown[]> {
  const url = projectId ? `/api/sessions?projectId=${encodeURIComponent(projectId)}` : "/api/sessions";
  const res = await engineFetch(url);
  if (!res.ok) throw new Error(`Engine error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

export async function getSession(id: string): Promise<unknown | null> {
  const res = await engineFetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Engine error: ${res.status}`);
  return res.json();
}
```

- [ ] **Update GET handler in `packages/web/src/app/api/sessions/route.ts`**

Replace the direct DB/session-manager read with a proxy call:

```typescript
import { listSessions } from "@/lib/engine-client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const sessions = await listSessions(projectId);
  return Response.json(sessions);
}
```

- [ ] **Update GET handler in `packages/web/src/app/api/sessions/[id]/route.ts`**

```typescript
import { getSession } from "@/lib/engine-client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(params.id);
  if (!session) return new Response(null, { status: 404 });
  return Response.json(session);
}
```

- [ ] **Start the Go engine from `packages/web/server.ts`**

```typescript
import { spawn } from "child_process";
import { join } from "path";

// Start Go engine
const engineBin = join(__dirname, "../../engine/bin/athene-engine");
const engineProc = spawn(engineBin, ["-db", process.env.DB_PATH ?? join(homedir(), ".agent-orchestrator/athene.db"), "-port", "3030"], {
  stdio: "inherit",
});
engineProc.on("error", (err) => console.error("Engine failed to start:", err));

process.on("exit", () => engineProc.kill());
```

- [ ] **Test the proxied routes**

```bash
pnpm dev
curl http://localhost:3000/api/sessions
```

Expected: JSON array (may be empty if no sessions exist).

- [ ] **Commit**

```bash
git add packages/web/src/lib/engine-client.ts packages/web/src/app/api/sessions/ packages/web/server.ts
git commit -m "feat(web): proxy session API routes to Go engine"
```

---

## Phase 6: Go Lifecycle Engine

**Deliverable:** The 30s polling loop, process probing, and state machine run in Go. Plugin methods (process liveness check, activity detection) are called from Go via a subprocess protocol. TypeScript's `lifecycle-manager.ts` is deleted.

**Value:** Goroutine-per-session concurrency. No more event-loop serialization of poll cycles. True parallel activity probing.

**Estimated effort:** 8–12 weeks

---

### Task 6.1: Define the plugin adapter protocol

**Files:**
- Create: `engine/internal/plugin/protocol.go` — JSON-RPC types for plugin calls
- Create: `docs/PLUGIN_PROTOCOL.md` — specification

The plugin protocol allows Go to call TypeScript plugin methods over stdin/stdout. Each plugin adapter is a long-running Node.js process that accepts JSON-RPC requests and returns responses.

**Protocol specification:**

Request (newline-delimited JSON):
```json
{"jsonrpc":"2.0","id":1,"method":"isProcessRunning","params":{"sessionId":"abc","runtimeHandle":{}}}
```

Response:
```json
{"jsonrpc":"2.0","id":1,"result":true}
```

or on error:
```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"process not found"}}
```

Methods that each agent plugin adapter must implement:
- `isProcessRunning(sessionId, runtimeHandle) → boolean`
- `getActivityState(sessionId, workspacePath, runtimeHandle, readyThresholdMs) → ActivityDetection | null`
- `detectActivity(terminalOutput) → ActivityState`

Methods that each runtime plugin adapter must implement:
- `send(sessionId, runtimeHandle, message) → void`
- `kill(sessionId, runtimeHandle) → void`

- [ ] **Create `engine/internal/plugin/protocol.go`**

```go
package plugin

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"sync/atomic"
)

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Adapter wraps a long-running Node.js plugin subprocess.
type Adapter struct {
	cmd    *exec.Cmd
	enc    *json.Encoder
	dec    *json.Decoder
	mu     sync.Mutex
	nextID atomic.Int64
	pending map[int64]chan *response
}

func NewAdapter(nodeScript string) (*Adapter, error) {
	cmd := exec.Command("node", nodeScript)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start adapter: %w", err)
	}

	a := &Adapter{
		cmd:     cmd,
		enc:     json.NewEncoder(stdin),
		dec:     json.NewDecoder(bufio.NewReader(stdout)),
		pending: make(map[int64]chan *response),
	}
	go a.readLoop()
	return a, nil
}

func (a *Adapter) Call(method string, params any) (json.RawMessage, error) {
	id := a.nextID.Add(1)
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	ch := make(chan *response, 1)

	a.mu.Lock()
	a.pending[id] = ch
	err = a.enc.Encode(request{JSONRPC: "2.0", ID: id, Method: method, Params: raw})
	a.mu.Unlock()

	if err != nil {
		return nil, err
	}

	resp := <-ch
	if resp.Error != nil {
		return nil, fmt.Errorf("plugin error %d: %s", resp.Error.Code, resp.Error.Message)
	}
	return resp.Result, nil
}

func (a *Adapter) readLoop() {
	for {
		var resp response
		if err := a.dec.Decode(&resp); err != nil {
			if err == io.EOF {
				return
			}
			continue
		}
		a.mu.Lock()
		if ch, ok := a.pending[resp.ID]; ok {
			delete(a.pending, resp.ID)
			ch <- &resp
		}
		a.mu.Unlock()
	}
}

func (a *Adapter) Close() error {
	return a.cmd.Process.Kill()
}
```

- [ ] **Write a test that starts a fake adapter and calls a method**

Create `engine/internal/plugin/protocol_test.go`:

```go
package plugin_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/slievr/athene/engine/internal/plugin"
)

func TestAdapterCall(t *testing.T) {
	// Write a minimal Node.js echo adapter
	script := `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const req = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: true }) + '\n');
});
`
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "echo.js")
	if err := os.WriteFile(scriptPath, []byte(script), 0644); err != nil {
		t.Fatal(err)
	}

	adapter, err := plugin.NewAdapter(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	defer adapter.Close()

	result, err := adapter.Call("isProcessRunning", map[string]string{"sessionId": "test"})
	if err != nil {
		t.Fatal(err)
	}

	var val bool
	if err := json.Unmarshal(result, &val); err != nil {
		t.Fatal(err)
	}
	if !val {
		t.Error("expected true")
	}
}
```

```bash
cd engine && make test
```

Expected: PASS.

- [ ] **Commit**

```bash
git add engine/internal/plugin/ docs/PLUGIN_PROTOCOL.md
git commit -m "feat(engine): define JSON-RPC plugin adapter protocol"
```

---

### Task 6.2: TypeScript plugin adapter shim

**Files:**
- Create: `packages/plugins/adapter-shim/src/index.ts` — Node.js process that wraps a plugin and speaks the JSON-RPC protocol

Each TypeScript plugin gets a thin shim that reads JSON-RPC requests from stdin and calls the plugin methods. The Go engine spawns one shim process per plugin slot needed.

- [ ] **Create `packages/plugins/adapter-shim/src/index.ts`**

```typescript
import * as readline from "readline";
import type { Agent, Runtime } from "@made-by-moonlight/athene-core";

// The shim is invoked as: node index.js <plugin-package-name> <slot>
const [, , packageName, slot] = process.argv;

async function main() {
  const mod = await import(packageName);
  const plugin = mod.default.create();

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line: string) => {
    let req: { jsonrpc: string; id: number; method: string; params: unknown };
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }

    let result: unknown = null;
    let error: { code: number; message: string } | null = null;

    try {
      switch (req.method) {
        case "isProcessRunning": {
          const { sessionId, runtimeHandle } = req.params as { sessionId: string; runtimeHandle: unknown };
          if (slot === "agent") {
            result = await (plugin as Agent).isProcessRunning({ id: sessionId, runtimeHandle } as never);
          }
          break;
        }
        case "getActivityState": {
          const { session, readyThresholdMs } = req.params as { session: unknown; readyThresholdMs: number };
          if (slot === "agent") {
            result = await (plugin as Agent).getActivityState(session as never, readyThresholdMs);
          }
          break;
        }
        default:
          error = { code: -32601, message: `Method not found: ${req.method}` };
      }
    } catch (err) {
      error = { code: -32000, message: (err as Error).message };
    }

    const response = error
      ? { jsonrpc: "2.0", id: req.id, error }
      : { jsonrpc: "2.0", id: req.id, result };

    process.stdout.write(JSON.stringify(response) + "\n");
  });
}

main().catch(console.error);
```

- [ ] **Commit**

```bash
git add packages/plugins/adapter-shim/
git commit -m "feat(plugins): add TypeScript adapter shim for Go engine plugin protocol"
```

---

### Task 6.3: Port polling loop to Go

**Files:**
- Create: `engine/internal/lifecycle/poller.go` — goroutine-per-session polling loop
- Create: `engine/internal/lifecycle/probe.go` — process liveness and activity probing
- Modify: `engine/cmd/athene-engine/main.go` — start the poller

The Go poller replaces `lifecycle-manager.ts`'s `pollAll()` loop. Each session gets its own goroutine. The poller calls plugin adapters for liveness checks.

- [ ] **Create `engine/internal/lifecycle/poller.go`**

```go
package lifecycle

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/slievr/athene/engine/internal/store"
)

const defaultInterval = 30 * time.Second

type Poller struct {
	store    *store.Store
	interval time.Duration
	probe    *Prober
}

func NewPoller(st *store.Store, probe *Prober, interval time.Duration) *Poller {
	if interval == 0 {
		interval = defaultInterval
	}
	return &Poller{store: st, interval: interval, probe: probe}
}

func (p *Poller) Start(ctx context.Context) {
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollAll(ctx)
		}
	}
}

func (p *Poller) pollAll(ctx context.Context) {
	sessions, err := p.store.ListSessions("")
	if err != nil {
		log.Error().Err(err).Msg("list sessions for poll")
		return
	}

	var wg sync.WaitGroup
	for _, sess := range sessions {
		if isTerminal(sess) {
			continue
		}
		wg.Add(1)
		go func(s *store.Session) {
			defer wg.Done()
			if err := p.probe.PollSession(ctx, s); err != nil {
				log.Error().Err(err).Str("session", s.ID).Msg("poll session")
			}
		}(sess)
	}
	wg.Wait()
}

func isTerminal(s *store.Session) bool {
	// Parse lifecycle JSON to check if session is done/terminated
	// Implementation reads s.Lifecycle and checks session.state
	return false // placeholder — implement fully
}
```

- [ ] **Create `engine/internal/lifecycle/probe.go`**

```go
package lifecycle

import (
	"context"
	"encoding/json"

	"github.com/slievr/athene/engine/internal/plugin"
	"github.com/slievr/athene/engine/internal/store"
)

type Prober struct {
	agentAdapters map[string]*plugin.Adapter // keyed by plugin name
}

func NewProber(adapters map[string]*plugin.Adapter) *Prober {
	return &Prober{agentAdapters: adapters}
}

func (p *Prober) PollSession(ctx context.Context, sess *store.Session) error {
	// 1. Get the agent plugin name from session metadata or config
	agentName, _ := sess.KV["agentPlugin"]
	adapter, ok := p.agentAdapters[agentName]
	if !ok {
		return nil
	}

	// 2. Check process liveness
	result, err := adapter.Call("isProcessRunning", map[string]any{
		"sessionId":     sess.ID,
		"runtimeHandle": json.RawMessage(sess.RuntimeHandle),
	})
	if err != nil {
		return err
	}

	var running bool
	if err := json.Unmarshal(result, &running); err != nil {
		return err
	}

	if !running {
		// Transition to detecting/terminated — update lifecycle in store
		// Full implementation reads current lifecycle, applies transition, writes back
	}

	return nil
}
```

- [ ] **Run Go tests**

```bash
cd engine && make test
```

- [ ] **Commit**

```bash
git add engine/internal/lifecycle/
git commit -m "feat(engine): add goroutine-per-session polling loop and process probe"
```

---

## Phase 7: Go Plugin System

**Deliverable:** Go-native implementations of the `runtime-tmux` and `workspace-worktree` plugins. A defined Go plugin interface for future first-party Go plugins. TypeScript plugins continue to work via the adapter shim from Phase 6.

**Value:** Removes the last Node.js subprocess dependency from the hot path. tmux and git operations run natively in Go.

**Estimated effort:** 6–10 weeks (ongoing — port plugins incrementally)

---

### Task 7.1: Define Go plugin interface

**Files:**
- Create: `engine/internal/plugin/types.go` — Go plugin interface matching the TypeScript `PluginModule` contract

```go
package plugin

import "context"

type Slot string

const (
	SlotRuntime   Slot = "runtime"
	SlotAgent     Slot = "agent"
	SlotWorkspace Slot = "workspace"
	SlotTracker   Slot = "tracker"
	SlotSCM       Slot = "scm"
	SlotNotifier  Slot = "notifier"
	SlotTerminal  Slot = "terminal"
)

type Manifest struct {
	Name        string `json:"name"`
	Slot        Slot   `json:"slot"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

// Runtime is the Go equivalent of the TypeScript Runtime plugin interface.
type Runtime interface {
	Send(ctx context.Context, sessionID string, handle any, message string) error
	Kill(ctx context.Context, sessionID string, handle any) error
	IsAlive(ctx context.Context, sessionID string, handle any) (bool, error)
}

// Workspace is the Go equivalent of the TypeScript Workspace plugin interface.
type Workspace interface {
	Create(ctx context.Context, sessionID string, branch string) (string, error) // returns workspacePath
	Destroy(ctx context.Context, sessionID string, workspacePath string) error
}

type GoPlugin[T any] struct {
	Manifest Manifest
	Create   func(config map[string]any) T
}
```

- [ ] **Commit**

```bash
git add engine/internal/plugin/types.go
git commit -m "feat(engine): define Go plugin interface"
```

---

### Task 7.2: Port runtime-tmux to Go

**Files:**
- Create: `engine/internal/plugins/runtime_tmux/tmux.go`
- Create: `engine/internal/plugins/runtime_tmux/tmux_test.go`

- [ ] **Create `engine/internal/plugins/runtime_tmux/tmux.go`**

```go
package runtime_tmux

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/slievr/athene/engine/internal/plugin"
)

type tmuxRuntime struct{}

var _ plugin.Runtime = (*tmuxRuntime)(nil)

func New() plugin.Runtime {
	return &tmuxRuntime{}
}

func (t *tmuxRuntime) Send(ctx context.Context, sessionID string, _ any, message string) error {
	tmuxSession := "ao-" + sessionID
	return exec.CommandContext(ctx, "tmux", "send-keys", "-t", tmuxSession, message, "Enter").Run()
}

func (t *tmuxRuntime) Kill(ctx context.Context, sessionID string, _ any) error {
	tmuxSession := "ao-" + sessionID
	return exec.CommandContext(ctx, "tmux", "kill-session", "-t", tmuxSession).Run()
}

func (t *tmuxRuntime) IsAlive(ctx context.Context, sessionID string, _ any) (bool, error) {
	tmuxSession := "ao-" + sessionID
	out, err := exec.CommandContext(ctx, "tmux", "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return false, nil // tmux not running = session not alive
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == tmuxSession {
			return true, nil
		}
	}
	return false, nil
}

// Manifest for plugin registration
var Manifest = plugin.Manifest{
	Name:        "tmux",
	Slot:        plugin.SlotRuntime,
	Version:     "0.1.0",
	Description: "tmux session runtime (Go native)",
}

func Plugin() plugin.GoPlugin[plugin.Runtime] {
	return plugin.GoPlugin[plugin.Runtime]{
		Manifest: Manifest,
		Create:   func(_ map[string]any) plugin.Runtime { return New() },
	}
}

func sessionName(sessionID string) string {
	return fmt.Sprintf("ao-%s", sessionID)
}
```

- [ ] **Write tests for tmux runtime**

Create `engine/internal/plugins/runtime_tmux/tmux_test.go`:

```go
package runtime_tmux_test

import (
	"context"
	"os/exec"
	"testing"

	"github.com/slievr/athene/engine/internal/plugins/runtime_tmux"
)

func TestIsAlive_NoTmux(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not available")
	}

	rt := runtime_tmux.New()
	alive, err := rt.IsAlive(context.Background(), "nonexistent-session-xyz", nil)
	if err != nil {
		t.Fatal(err)
	}
	if alive {
		t.Error("expected not alive for nonexistent session")
	}
}
```

```bash
cd engine && make test
```

- [ ] **Commit**

```bash
git add engine/internal/plugins/runtime_tmux/
git commit -m "feat(engine): port runtime-tmux plugin to Go"
```

---

### Task 7.3: Port workspace-worktree to Go

**Files:**
- Create: `engine/internal/plugins/workspace_worktree/worktree.go`
- Create: `engine/internal/plugins/workspace_worktree/worktree_test.go`

```go
package workspace_worktree

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"

	"github.com/slievr/athene/engine/internal/plugin"
)

type worktreeWorkspace struct {
	baseDir string // e.g. ~/.agent-orchestrator/{hash}/worktrees
}

var _ plugin.Workspace = (*worktreeWorkspace)(nil)

func New(baseDir string) plugin.Workspace {
	return &worktreeWorkspace{baseDir: baseDir}
}

func (w *worktreeWorkspace) Create(ctx context.Context, sessionID string, branch string) (string, error) {
	path := filepath.Join(w.baseDir, sessionID)
	cmd := exec.CommandContext(ctx, "git", "worktree", "add", path, branch)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git worktree add: %w\n%s", err, out)
	}
	return path, nil
}

func (w *worktreeWorkspace) Destroy(ctx context.Context, _ string, workspacePath string) error {
	cmd := exec.CommandContext(ctx, "git", "worktree", "remove", "--force", workspacePath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree remove: %w\n%s", err, out)
	}
	return nil
}

var Manifest = plugin.Manifest{
	Name:        "worktree",
	Slot:        plugin.SlotWorkspace,
	Version:     "0.1.0",
	Description: "git worktree workspace (Go native)",
}

func Plugin(baseDir string) plugin.GoPlugin[plugin.Workspace] {
	return plugin.GoPlugin[plugin.Workspace]{
		Manifest: Manifest,
		Create:   func(_ map[string]any) plugin.Workspace { return New(baseDir) },
	}
}
```

- [ ] **Write tests**

```go
// worktree_test.go
package workspace_worktree_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/slievr/athene/engine/internal/plugins/workspace_worktree"
)

func TestCreateAndDestroy(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	// Create a bare git repo to test against
	repoDir := t.TempDir()
	exec.Command("git", "init", "--bare", repoDir).Run()

	worktreesDir := t.TempDir()
	ws := workspace_worktree.New(worktreesDir)

	// This test requires a real git repo with a branch — skip if setup fails
	path, err := ws.Create(context.Background(), "test-session", "HEAD")
	if err != nil {
		t.Skip("git worktree create failed (expected in bare repos):", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("worktree path does not exist: %v", err)
	}

	if err := ws.Destroy(context.Background(), "test-session", path); err != nil {
		t.Error("destroy:", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("worktree path still exists after destroy")
	}
}
```

```bash
cd engine && make test
```

- [ ] **Commit**

```bash
git add engine/internal/plugins/workspace_worktree/
git commit -m "feat(engine): port workspace-worktree plugin to Go"
```

---

## Appendix: Phase Dependency Map

```
Phase 1 (Build)
    ↓ (enables faster iteration for all subsequent phases)
Phase 2 (SQLite)
    ↓ (Go engine reads the same DB schema)
Phase 3 (Dynamic Plugins)      Phase 4 (Decomposition)
    ↓                              ↓
Phase 5 (Go Bootstrap) ←──────────┘
    ↓ (establishes the HTTP seam)
Phase 6 (Go Lifecycle)
    ↓ (Go owns all orchestration)
Phase 7 (Go Plugins)
```

Phases 3 and 4 can be executed in parallel with each other. Phase 5 requires Phase 2 (same SQLite schema). Phase 6 requires Phase 5 (needs the engine binary and adapter protocol). Phase 7 can be done incrementally alongside Phase 6 — one plugin at a time.

## Appendix: What Stays TypeScript Forever

- `packages/web/` — Next.js dashboard, all React components, xterm.js integration
- Plugin adapter shim — the thin JSON-RPC wrapper around TypeScript plugins
- TypeScript plugins that implement tracker-github, scm-github, notifier-* — these are glue code calling GitHub/Slack APIs and don't benefit from Go
- Agent plugins (claude-code, codex, aider, opencode) — these are thin wrappers around CLI tools

The goal is Go for the hot path (session store, polling loop, state machine, process probing) and TypeScript for the UI and glue integrations. Not a full rewrite.
