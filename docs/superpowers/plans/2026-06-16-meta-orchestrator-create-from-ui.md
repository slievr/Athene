# Meta Orchestrator: Create from UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a new named meta orchestrator from the dashboard sidebar — no YAML editing required — with the entry persisted to the config file and the session started immediately.

**Architecture:** A `+` button in the Parliament sidebar header opens a `CreateMetaOrchestratorModal`. On submit, the modal POSTs to `POST /api/meta`, which calls a new core helper (`appendMetaOrchestrator`) to write the entry to the config YAML file, invalidates the services cache, then calls `ensureMetaOrchestrator` to start the session.

**Tech Stack:** TypeScript strict, Next.js 15 App Router, React 19, Tailwind v4, Vitest + @testing-library/react, `yaml` package (already in core dependencies).

## Global Constraints

- No inline `style=` attributes — Tailwind utility classes only
- No external UI component libraries (no Radix, shadcn, etc.)
- TypeScript strict — no `any`
- Component files max 400 lines
- `pnpm typecheck` and `pnpm test` must pass after every task
- Dark theme must be preserved
- Use `workspace:*` for cross-package deps

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/meta-orchestrator-config-writer.ts` | Create | Read/write YAML config to append a new meta orchestrator entry |
| `packages/core/src/index.ts` | Modify | Export `appendMetaOrchestrator` and `MetaOrchestratorWriteInput` |
| `packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts` | Create | Unit tests for the writer |
| `packages/web/src/app/api/meta/route.ts` | Create | `POST /api/meta` — validate, write config, start session |
| `packages/web/src/__tests__/meta-create.test.ts` | Create | API route tests |
| `packages/web/src/components/CreateMetaOrchestratorModal.tsx` | Create | Form modal: name, scope, agent fields |
| `packages/web/src/components/__tests__/CreateMetaOrchestratorModal.test.tsx` | Create | Modal component tests |
| `packages/web/src/components/SidebarOrchestrators.tsx` | Modify | Add `projects` prop, `+` button, render modal |
| `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx` | Modify | Add `projects` prop to existing renders; test `+` button |
| `packages/web/src/components/ProjectSidebar.tsx` | Modify | Thread `projects` prop down to `SidebarOrchestrators` |

---

## Task 1: Core config writer

**Files:**
- Create: `packages/core/src/meta-orchestrator-config-writer.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts`

**Interfaces:**
- Produces: `appendMetaOrchestrator(configPath: string, input: MetaOrchestratorWriteInput): void`
- Produces: `interface MetaOrchestratorWriteInput { name: string; scope: "all" | { projects: string[] }; agent?: string; }`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendMetaOrchestrator } from "../meta-orchestrator-config-writer.js";

describe("appendMetaOrchestrator", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ao-test-"));
    configPath = join(tmpDir, "agent-orchestrator.yaml");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("adds a new entry to a config with no existing metaOrchestrators", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendMetaOrchestrator(configPath, { name: "main", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("main:");
    expect(result).toContain("scope: all");
    expect(result).toContain("discover: true");
  });

  it("adds a new entry alongside an existing metaOrchestrators block", () => {
    writeFileSync(
      configPath,
      "projects: {}\nmetaOrchestrators:\n  existing:\n    scope: all\n    discover: true\n",
      "utf-8",
    );

    appendMetaOrchestrator(configPath, { name: "new-one", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("existing:");
    expect(result).toContain("new-one:");
  });

  it("writes explicit project scope", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendMetaOrchestrator(configPath, {
      name: "scoped",
      scope: { projects: ["proj-a", "proj-b"] },
    });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("proj-a");
    expect(result).toContain("proj-b");
  });

  it("writes agent field when provided", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendMetaOrchestrator(configPath, { name: "m", scope: "all", agent: "codex" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("agent: codex");
  });

  it("omits agent field when not provided", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendMetaOrchestrator(configPath, { name: "m", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).not.toContain("agent:");
  });

  it("always sets discover: true", () => {
    writeFileSync(configPath, "projects: {}\n", "utf-8");

    appendMetaOrchestrator(configPath, { name: "m", scope: "all" });

    const result = readFileSync(configPath, "utf-8");
    expect(result).toContain("discover: true");
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/core && pnpm test --reporter=verbose 2>&1 | grep -A3 "meta-orchestrator-config-writer"
```
Expected: FAIL — `appendMetaOrchestrator` not found.

- [ ] **Step 3: Implement the writer**

Create `packages/core/src/meta-orchestrator-config-writer.ts`:

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export interface MetaOrchestratorWriteInput {
  name: string;
  scope: "all" | { projects: string[] };
  agent?: string;
}

/**
 * Append a new meta orchestrator entry to the config YAML file at configPath.
 * Reads, merges, and writes back. Normalizes YAML formatting (comments lost).
 */
export function appendMetaOrchestrator(
  configPath: string,
  input: MetaOrchestratorWriteInput,
): void {
  const raw = readFileSync(configPath, "utf-8");
  const doc = (parse(raw) ?? {}) as Record<string, unknown>;
  const existing = (doc.metaOrchestrators ?? {}) as Record<string, unknown>;
  existing[input.name] = {
    scope: input.scope,
    discover: true,
    ...(input.agent !== undefined ? { agent: input.agent } : {}),
  };
  doc.metaOrchestrators = existing;
  writeFileSync(configPath, stringify(doc), "utf-8");
}
```

- [ ] **Step 4: Export from core index**

In `packages/core/src/index.ts`, find the existing meta-orchestrator exports and add:

```typescript
export { appendMetaOrchestrator, type MetaOrchestratorWriteInput } from "./meta-orchestrator-config-writer.js";
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd packages/core && pnpm test --reporter=verbose 2>&1 | grep -A3 "meta-orchestrator-config-writer"
```
Expected: all 6 tests PASS.

- [ ] **Step 6: Typecheck**

```bash
cd packages/core && pnpm typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/meta-orchestrator-config-writer.ts \
        packages/core/src/index.ts \
        packages/core/src/__tests__/meta-orchestrator-config-writer.test.ts
git commit -m "feat(core): add appendMetaOrchestrator config writer"
```

---

## Task 2: `POST /api/meta` route

**Files:**
- Create: `packages/web/src/app/api/meta/route.ts`
- Create: `packages/web/src/__tests__/meta-create.test.ts`

**Interfaces:**
- Consumes: `appendMetaOrchestrator`, `MetaOrchestratorWriteInput` from `@made-by-moonlight/athene-core`
- Consumes: `getServices`, `invalidatePortfolioServicesCache` from `@/lib/services`
- Consumes: `generateMetaOrchestratorPrompt` from `@made-by-moonlight/athene-core`
- Consumes: `validateIdentifier` from `@/lib/validation`
- Consumes: `getCorrelationId`, `jsonWithCorrelation` from `@/lib/observability`
- Produces: `POST /api/meta` → `{ sessionId: string }` (201) or `{ error: string }` (400/409/500)

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/__tests__/meta-create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/services", () => ({
  getServices: vi.fn(),
  invalidatePortfolioServicesCache: vi.fn(),
}));

vi.mock("@made-by-moonlight/athene-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@made-by-moonlight/athene-core")>();
  return {
    ...actual,
    appendMetaOrchestrator: vi.fn(),
    generateMetaOrchestratorPrompt: vi.fn(() => "system-prompt"),
  };
});

vi.mock("@/lib/observability", () => ({
  getCorrelationId: vi.fn(() => "test-correlation-id"),
  jsonWithCorrelation: vi.fn(
    (body: unknown, init: ResponseInit) => new Response(JSON.stringify(body), init),
  ),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────

import { POST } from "@/app/api/meta/route";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { appendMetaOrchestrator } from "@made-by-moonlight/athene-core";

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/meta", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const mockEnsureMetaOrchestrator = vi.fn(async () => ({ id: "meta-session-1" }));

const mockConfig = {
  configPath: "/tmp/agent-orchestrator.yaml",
  metaOrchestrators: {} as Record<string, unknown>,
  projects: { "proj-a": {}, "proj-b": {} },
};

beforeEach(() => {
  vi.mocked(getServices).mockResolvedValue({
    config: mockConfig,
    sessionManager: { ensureMetaOrchestrator: mockEnsureMetaOrchestrator },
  } as never);
  mockEnsureMetaOrchestrator.mockResolvedValue({ id: "meta-session-1" });
  vi.mocked(appendMetaOrchestrator).mockImplementation(() => undefined);
  vi.mocked(invalidatePortfolioServicesCache).mockImplementation(() => undefined);
  mockConfig.metaOrchestrators = {};
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/meta", () => {
  it("returns 400 for invalid name characters", async () => {
    const res = await POST(makeRequest({ name: "bad name!", scope: "all" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/);
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(makeRequest({ scope: "all" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when name already exists", async () => {
    mockConfig.metaOrchestrators = { existing: { scope: "all", discover: true } };
    const res = await POST(makeRequest({ name: "existing", scope: "all" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("existing");
  });

  it("returns 400 for unknown project ID in scope", async () => {
    const res = await POST(
      makeRequest({ name: "m", scope: { projects: ["proj-a", "unknown-project"] } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unknown-project");
  });

  it("happy path: writes config, invalidates cache, starts session, returns 201", async () => {
    const res = await POST(makeRequest({ name: "main", scope: "all" }));
    expect(res.status).toBe(201);

    expect(appendMetaOrchestrator).toHaveBeenCalledWith("/tmp/agent-orchestrator.yaml", {
      name: "main",
      scope: "all",
      agent: undefined,
    });
    expect(invalidatePortfolioServicesCache).toHaveBeenCalled();
    expect(mockEnsureMetaOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ name: "main" }),
    );

    const body = await res.json();
    expect(body).toEqual({ sessionId: "meta-session-1" });
  });

  it("happy path with specific project scope and agent override", async () => {
    const res = await POST(
      makeRequest({ name: "scoped", scope: { projects: ["proj-a"] }, agent: "codex" }),
    );
    expect(res.status).toBe(201);
    expect(appendMetaOrchestrator).toHaveBeenCalledWith(
      "/tmp/agent-orchestrator.yaml",
      expect.objectContaining({ scope: { projects: ["proj-a"] }, agent: "codex" }),
    );
  });

  it("returns 500 when ensureMetaOrchestrator throws", async () => {
    mockEnsureMetaOrchestrator.mockRejectedValueOnce(new Error("runtime failure"));
    const res = await POST(makeRequest({ name: "m", scope: "all" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("runtime failure");
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -A3 "meta-create"
```
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `packages/web/src/app/api/meta/route.ts`:

```typescript
import { type NextRequest } from "next/server";
import {
  appendMetaOrchestrator,
  generateMetaOrchestratorPrompt,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { validateIdentifier } from "@/lib/validation";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/meta — Create a new named meta orchestrator and start it. */
export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  const nameErr = validateIdentifier(body.name, "name");
  if (nameErr) {
    return jsonWithCorrelation({ error: nameErr }, { status: 400 }, correlationId);
  }
  const name = body.name as string;

  // Validate scope shape
  const scope = body.scope;
  if (scope !== "all" && (typeof scope !== "object" || !Array.isArray((scope as Record<string, unknown>).projects))) {
    return jsonWithCorrelation(
      { error: 'scope must be "all" or { projects: string[] }' },
      { status: 400 },
      correlationId,
    );
  }

  const agent = typeof body.agent === "string" && body.agent.length > 0 ? body.agent : undefined;

  try {
    const { config, sessionManager } = await getServices();

    if (Object.hasOwn(config.metaOrchestrators ?? {}, name)) {
      return jsonWithCorrelation(
        { error: `A meta orchestrator named '${name}' already exists` },
        { status: 409 },
        correlationId,
      );
    }

    // Validate explicit project IDs exist
    if (typeof scope === "object" && scope !== null) {
      const projectIds = (scope as { projects: string[] }).projects;
      for (const id of projectIds) {
        if (!Object.hasOwn(config.projects, id)) {
          return jsonWithCorrelation(
            { error: `Unknown project ID: '${id}'` },
            { status: 400 },
            correlationId,
          );
        }
      }
    }

    // Write to config file
    appendMetaOrchestrator(config.configPath, {
      name,
      scope: scope as "all" | { projects: string[] },
      agent,
    });

    // Reload config so ensureMetaOrchestrator sees the new entry
    invalidatePortfolioServicesCache();
    const { config: freshConfig, sessionManager: freshSm } = await getServices();

    const systemPrompt = generateMetaOrchestratorPrompt({ config: freshConfig, name });
    const metaCfg = freshConfig.metaOrchestrators?.[name];
    const session = await freshSm.ensureMetaOrchestrator({
      name,
      systemPrompt,
      agent: metaCfg?.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 201 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to create meta orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -A3 "meta-create"
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/app/api/meta/route.ts \
        packages/web/src/__tests__/meta-create.test.ts
git commit -m "feat(web): add POST /api/meta to create and start a meta orchestrator"
```

---

## Task 3: `CreateMetaOrchestratorModal` component

**Files:**
- Create: `packages/web/src/components/CreateMetaOrchestratorModal.tsx`
- Create: `packages/web/src/components/__tests__/CreateMetaOrchestratorModal.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (self-contained; fetches via `POST /api/meta`)
- Produces: `interface CreateMetaOrchestratorModalProps { projects: Array<{ id: string; name: string }>; existingNames: string[]; onClose: () => void; onSuccess: () => void; }`
- Produces: `export function CreateMetaOrchestratorModal(props: CreateMetaOrchestratorModalProps): React.JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/__tests__/CreateMetaOrchestratorModal.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateMetaOrchestratorModal } from "@/components/CreateMetaOrchestratorModal";

const projects = [
  { id: "proj-a", name: "Project Alpha" },
  { id: "proj-b", name: "Project Beta" },
];

describe("CreateMetaOrchestratorModal", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("renders the form fields", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByText(/all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/specific projects/i)).toBeInTheDocument();
  });

  it("shows project multi-select only when 'Specific projects' is selected", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.queryByText("Project Alpha")).toBeNull();

    fireEvent.click(screen.getByText(/specific projects/i));
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();
  });

  it("shows name validation error on blur for invalid characters", async () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "bad name!" } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(screen.getByText(/\[a-zA-Z0-9_-\]/)).toBeInTheDocument();
    });
  });

  it("shows error when name already exists", async () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={["existing"]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "existing" } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  it("disables submit and shows spinner while in-flight", async () => {
    vi.mocked(global.fetch).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    });
  });

  it("calls onSuccess and onClose after successful submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "s1" }), { status: 201 }),
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows inline API error on failed submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Name already exists on server" }), { status: 409 }),
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText(/Name already exists on server/)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel/close is clicked", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -A3 "CreateMetaOrchestratorModal"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the modal**

Create `packages/web/src/components/CreateMetaOrchestratorModal.tsx`:

```typescript
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Built-in agents available in the dashboard (matches static imports in services.ts). */
const BUILT_IN_AGENTS = ["claude-code", "codex", "cursor", "kimicode", "grok", "opencode"] as const;

export interface CreateMetaOrchestratorModalProps {
  projects: Array<{ id: string; name: string }>;
  existingNames: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function validateName(value: string, existingNames: string[]): string | null {
  if (!value.trim()) return "name is required";
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return "name must match [a-zA-Z0-9_-]+";
  if (existingNames.includes(value)) return `'${value}' already exists`;
  return null;
}

export function CreateMetaOrchestratorModal({
  projects,
  existingNames,
  onClose,
  onSuccess,
}: CreateMetaOrchestratorModalProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<"all" | "specific">("all");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [agent, setAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleNameBlur = () => {
    setNameError(validateName(name, existingNames));
  };

  const toggleProject = (id: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(name, existingNames);
    if (err) {
      setNameError(err);
      return;
    }

    const scope =
      scopeMode === "all"
        ? "all"
        : ({ projects: [...selectedProjects] } as { projects: string[] });

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch("/api/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scope, agent: agent || undefined }),
      });
      const body = (await res.json()) as { sessionId?: string; error?: string };
      if (!res.ok) {
        setApiError(body.error ?? "Failed to create meta orchestrator");
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setApiError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--color-text-primary)]">
          New Meta Orchestrator
        </h2>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          {/* Name */}
          <div className="mb-4">
            <label
              htmlFor="meta-name"
              className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Name
            </label>
            <input
              id="meta-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g. main"
              autoFocus
              className={cn(
                "w-full rounded border px-3 py-2 text-sm",
                "bg-[var(--color-bg-input)] text-[var(--color-text-primary)]",
                "placeholder:text-[var(--color-text-muted)]",
                nameError
                  ? "border-[var(--color-text-error)]"
                  : "border-[var(--color-border-subtle)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]",
              )}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-[var(--color-text-error)]">{nameError}</p>
            ) : null}
          </div>

          {/* Scope */}
          <div className="mb-4">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
              Scope
            </span>
            <div className="flex gap-3">
              {(["all", "specific"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScopeMode(mode)}
                  className={cn(
                    "rounded border px-3 py-1 text-sm",
                    scopeMode === mode
                      ? "border-[var(--color-border-focus)] bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
                      : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
                  )}
                >
                  {mode === "all" ? "All projects" : "Specific projects"}
                </button>
              ))}
            </div>

            {scopeMode === "specific" && projects.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="accent-[var(--color-border-focus)]"
                    />
                    <span className="text-[var(--color-text-primary)]">{p.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {/* Agent */}
          <div className="mb-6">
            <label
              htmlFor="meta-agent"
              className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Agent{" "}
              <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <select
              id="meta-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className={cn(
                "w-full rounded border px-3 py-2 text-sm",
                "bg-[var(--color-bg-input)] text-[var(--color-text-primary)]",
                "border-[var(--color-border-subtle)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]",
              )}
            >
              <option value="">Default</option>
              {BUILT_IN_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {apiError ? (
            <p className="mb-4 text-sm text-[var(--color-text-error)]">{apiError}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-label="Create & Start"
              className={cn(
                "rounded px-4 py-2 text-sm font-medium",
                "bg-[var(--color-action-primary)] text-[var(--color-text-on-action)]",
                "disabled:opacity-50",
              )}
            >
              {submitting ? "Creating…" : "Create & Start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -A3 "CreateMetaOrchestratorModal"
```
Expected: all 7 tests PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/CreateMetaOrchestratorModal.tsx \
        packages/web/src/components/__tests__/CreateMetaOrchestratorModal.test.tsx
git commit -m "feat(web): add CreateMetaOrchestratorModal component"
```

---

## Task 4: Wire `+` button into SidebarOrchestrators

**Files:**
- Modify: `packages/web/src/components/SidebarOrchestrators.tsx`
- Modify: `packages/web/src/components/ProjectSidebar.tsx`
- Modify: `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx`

**Interfaces:**
- Consumes: `CreateMetaOrchestratorModal`, `CreateMetaOrchestratorModalProps` from Task 3
- `SidebarOrchestratorsProps` gains: `projects: Array<{ id: string; name: string }>`

- [ ] **Step 1: Add `projects` prop to `SidebarOrchestrators` and update its tests**

In `packages/web/src/components/SidebarOrchestrators.tsx`, update the props interface:

```typescript
interface SidebarOrchestratorsProps {
  collapsed: boolean;
  metaOrchestrators: SidebarMetaOrchestrator[];
  orchestrators: SidebarProjectOrchestrator[];
  registeredProjectIds: string[];
  projects: Array<{ id: string; name: string }>;   // ← add this
  activeSessionId: string | undefined;
  onNavigate: (href: string, session?: DashboardSession) => void;
}
```

Add `projects` to the destructured params:

```typescript
export function SidebarOrchestrators({
  collapsed,
  metaOrchestrators,
  orchestrators,
  registeredProjectIds,
  projects,              // ← add
  activeSessionId,
  onNavigate,
}: SidebarOrchestratorsProps) {
```

- [ ] **Step 2: Update existing tests to pass the new prop**

In `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx`, add `projects={[]}` to every existing `<SidebarOrchestrators ... />` render call. There are approximately 7 render calls — add the prop to all of them:

```tsx
<SidebarOrchestrators
  collapsed={false}
  metaOrchestrators={[...]}
  orchestrators={[...]}
  registeredProjectIds={[...]}
  projects={[]}           {/* ← add to every existing render */}
  activeSessionId={undefined}
  onNavigate={() => {}}
/>
```

- [ ] **Step 3: Run existing tests — confirm they still pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -A5 "SidebarOrchestrators"
```
Expected: all existing tests PASS.

- [ ] **Step 4: Add the `+` button and modal wiring**

In `packages/web/src/components/SidebarOrchestrators.tsx`:

Add import at top:
```typescript
import { CreateMetaOrchestratorModal } from "./CreateMetaOrchestratorModal";
```

Add modal state inside the function body (before the early-return guard):
```typescript
const [showCreateModal, setShowCreateModal] = useState(false);
```

Replace the Parliament label div with a version that includes the `+` button (expanded view only):

```tsx
<div className="project-sidebar__nav-label">
  <span>Parliament</span>
  {!collapsed ? (
    <button
      type="button"
      onClick={() => setShowCreateModal(true)}
      aria-label="New meta orchestrator"
      className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
    >
      +
    </button>
  ) : null}
</div>
```

At the end of the component's return, before the closing `</div>`, add the modal:

```tsx
{showCreateModal ? (
  <CreateMetaOrchestratorModal
    projects={projects}
    existingNames={metaOrchestrators.map((m) => m.name)}
    onClose={() => setShowCreateModal(false)}
    onSuccess={() => {
      setShowCreateModal(false);
      router.refresh();
    }}
  />
) : null}
```

- [ ] **Step 5: Thread `projects` prop in `ProjectSidebar`**

In `packages/web/src/components/ProjectSidebar.tsx`, find where `SidebarOrchestrators` is rendered. There are two call sites (collapsed and expanded). Both must receive `projects`.

The component already has `projects: ProjectInfo[]` as a prop (line 29). Pass it through:

```tsx
<SidebarOrchestrators
  ...
  projects={projects.map((p) => ({ id: p.id, name: p.name }))}
/>
```

Do this for both call sites in the file.

- [ ] **Step 6: Write the new SidebarOrchestrators test for the `+` button**

Append to `packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx`:

```typescript
it("renders a + button in the Parliament header when expanded", () => {
  render(
    <SidebarOrchestrators
      collapsed={false}
      metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
      orchestrators={[]}
      registeredProjectIds={[]}
      projects={[{ id: "proj-a", name: "Project Alpha" }]}
      activeSessionId={undefined}
      onNavigate={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /new meta orchestrator/i })).toBeInTheDocument();
});

it("does not render the + button when collapsed", () => {
  render(
    <SidebarOrchestrators
      collapsed={true}
      metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
      orchestrators={[]}
      registeredProjectIds={[]}
      projects={[]}
      activeSessionId={undefined}
      onNavigate={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: /new meta orchestrator/i })).toBeNull();
});

it("opens the create modal when + button is clicked", async () => {
  render(
    <SidebarOrchestrators
      collapsed={false}
      metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
      orchestrators={[]}
      registeredProjectIds={[]}
      projects={[{ id: "proj-a", name: "Project Alpha" }]}
      activeSessionId={undefined}
      onNavigate={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /new meta orchestrator/i }));
  await waitFor(() => {
    expect(screen.getByText("New Meta Orchestrator")).toBeInTheDocument();
  });
});
```

Note: add `fireEvent` and `waitFor` to the existing `@testing-library/react` import at the top of the test file if not already present.

- [ ] **Step 7: Run all tests**

```bash
pnpm --filter @made-by-moonlight/athene-web test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|SidebarOrchestrators"
```
Expected: all PASS.

- [ ] **Step 8: Full typecheck and test run**

```bash
pnpm typecheck && pnpm test
```
Expected: no type errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/SidebarOrchestrators.tsx \
        packages/web/src/components/ProjectSidebar.tsx \
        packages/web/src/components/__tests__/SidebarOrchestrators.test.tsx
git commit -m "feat(web): add + button to Parliament sidebar to create meta orchestrators"
```
