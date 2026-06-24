# Fleet Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/fleet` route that shows a single global kanban board of all worker sessions across all projects, grouped within each attention-level column by the orchestrator session that spawned them.

**Architecture:** A new `/fleet` page renders `FleetBoard`, which reads all sessions via the existing `useSessionEvents` hook (no project filter), filters out orchestrator sessions, groups workers by `parentSessionId` (falling back to `orchestratorOwner`), and renders five `FleetColumn` components each containing `OrchestratorGroup` sections. Filter state lives in the URL via `?orch=<name>`. The per-project page is converted to a read-only settings view.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, Vitest + @testing-library/react, existing `useSessionEvents` SSE hook.

## Global Constraints

- TypeScript strict mode — no `any`, consistent type imports
- Tailwind utility classes only — no inline `style=` attributes
- No external UI libraries (no Radix, shadcn, etc.)
- Dark theme preserved
- Component files max 400 lines
- Test files required for all new components
- `"use client"` directive for all client components
- SSE 5s interval unchanged — do not modify `useSessionEvents`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`
- Import alias: `@/` → `packages/web/src/`
- Cross-package imports: `@made-by-moonlight/athene-core`

---

## File Map

**Create:**
- `packages/web/src/lib/orchestrator-colors.ts` — color palette + hash utility
- `packages/web/src/components/FleetFilterBar.tsx` — filter chips + session count header
- `packages/web/src/components/OrchestratorGroup.tsx` — group header + worker cards
- `packages/web/src/components/FleetColumn.tsx` — single attention-level column
- `packages/web/src/components/FleetBoard.tsx` — board root: grouping logic + layout
- `packages/web/src/app/fleet/page.tsx` — Next.js route entry point
- `packages/web/src/components/__tests__/FleetFilterBar.test.tsx`
- `packages/web/src/components/__tests__/OrchestratorGroup.test.tsx`
- `packages/web/src/components/__tests__/FleetColumn.test.tsx`
- `packages/web/src/components/__tests__/FleetBoard.test.tsx`

**Modify:**
- `packages/core/src/types.ts` — add `getSessionParentId()` helper after `getSessionMetaOwner()`
- `packages/core/src/index.ts` — export `getSessionParentId`
- `packages/core/src/session-manager.ts` — stamp `parentSessionId` in worker metadata
- `packages/web/src/app/globals.css` — add orchestrator accent CSS classes
- `packages/web/src/components/SessionCard.tsx` — add optional `accentClass` prop for orchestrator border
- `packages/web/src/components/ProjectSidebar.tsx` — add Fleet nav entry
- `packages/web/src/app/projects/[projectId]/page.tsx` — convert to settings page

---

## Task 1: Core helper + spawn stamping

**Files:**
- Modify: `packages/core/src/types.ts` — add helper after `getSessionMetaOwner` (line ~379)
- Modify: `packages/core/src/index.ts` — export it
- Modify: `packages/core/src/session-manager.ts` — stamp in metadata object (~line 1800)
- Test: `packages/core/src/__tests__/types.test.ts` (create if absent, add test block if exists)

**Interfaces:**
- Produces: `getSessionParentId(session: { metadata?: Record<string, string> }): string | null` — used by FleetBoard to group sessions

- [ ] **Step 1: Write the failing test**

Find the core test file location: `find packages/core/src -name "*.test.ts" | head -5`. Add to the relevant test file (or create `packages/core/src/__tests__/session-parent.test.ts`):

```typescript
import { getSessionParentId } from "../types";
import type { Session } from "../types";

function stubSession(metadata: Record<string, string> = {}): Pick<Session, "metadata"> {
  return { metadata };
}

describe("getSessionParentId", () => {
  it("returns parentSessionId from metadata", () => {
    expect(getSessionParentId(stubSession({ parentSessionId: "orch-abc-123" }))).toBe("orch-abc-123");
  });

  it("returns null when not present", () => {
    expect(getSessionParentId(stubSession({}))).toBeNull();
  });

  it("returns null when metadata is undefined", () => {
    expect(getSessionParentId({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @made-by-moonlight/athene-core test
```

Expected: FAIL — `getSessionParentId is not a function`

- [ ] **Step 3: Add the helper to `packages/core/src/types.ts`**

Insert after `getSessionMetaOwner` (line ~379):

```typescript
/** Session ID of the orchestrator session that spawned this worker, or null. */
export function getSessionParentId(
  session: { metadata?: Record<string, string> },
): string | null {
  return session.metadata?.["parentSessionId"] ?? null;
}
```

- [ ] **Step 4: Export from `packages/core/src/index.ts`**

Add `getSessionParentId` to the existing export line that exports `getSessionOrchestratorOwner` and `getSessionMetaOwner`. Example (find the exact line and extend it):

```typescript
export { ..., getSessionParentId } from "./types";
```

- [ ] **Step 5: Stamp `parentSessionId` in `packages/core/src/session-manager.ts`**

Read the file around line 1800. The spawn metadata block currently sets `orchestratorOwner`. Find `ENV.SESSION_ID` in `packages/core/src/env.ts` to confirm the key name. Add `parentSessionId` in the same metadata object:

```typescript
// Add alongside the existing orchestratorOwner line:
...(getEnvString(ENV.SESSION_ID) ? { parentSessionId: getEnvString(ENV.SESSION_ID) } : {}),
```

`getEnvString(ENV.SESSION_ID)` reads `ATHENE_SESSION_ID` (with `AO_SESSION_ID` fallback). When a worker is spawned from within an orchestrator session, this env var holds the orchestrator's session ID.

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @made-by-moonlight/athene-core test
```

Expected: PASS

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/src/session-manager.ts packages/core/src/__tests__/
git commit -m "feat(core): add getSessionParentId helper and stamp parentSessionId at spawn"
```

---

## Task 2: Orchestrator color utility + CSS classes

**Files:**
- Create: `packages/web/src/lib/orchestrator-colors.ts`
- Modify: `packages/web/src/app/globals.css` — append orchestrator accent classes

**Interfaces:**
- Produces: `getOrchestratorColorIndex(id: string): number` (0–9) — consumed by OrchestratorGroup and FleetFilterBar
- Produces: CSS classes `.orch-border-{0-9}` (left border) and `.orch-dot-{0-9}` (background) — consumed by OrchestratorGroup and SessionCard

- [ ] **Step 1: Create `packages/web/src/lib/orchestrator-colors.ts`**

```typescript
const PALETTE_SIZE = 10;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  }
  return h % PALETTE_SIZE;
}

/** Returns a stable 0–9 index for a given orchestrator session ID. */
export function getOrchestratorColorIndex(parentSessionId: string): number {
  return hashId(parentSessionId);
}

/** Returns the Tailwind-compatible CSS class for the orchestrator dot. */
export function getOrchestratorDotClass(parentSessionId: string): string {
  return `orch-dot-${hashId(parentSessionId)}`;
}

/** Returns the CSS class for a card's left border accent. */
export function getOrchestratorBorderClass(parentSessionId: string): string {
  return `orch-border-${hashId(parentSessionId)}`;
}
```

- [ ] **Step 2: Append orchestrator CSS classes to `packages/web/src/app/globals.css`**

Find the end of the file and append (do not remove anything existing):

```css
/* ─── Orchestrator accent colors ─────────────────────────── */
.orch-dot-0  { background-color: #7c3aed; }
.orch-dot-1  { background-color: #0891b2; }
.orch-dot-2  { background-color: #e11d48; }
.orch-dot-3  { background-color: #d97706; }
.orch-dot-4  { background-color: #059669; }
.orch-dot-5  { background-color: #0284c7; }
.orch-dot-6  { background-color: #a21caf; }
.orch-dot-7  { background-color: #c2410c; }
.orch-dot-8  { background-color: #0f766e; }
.orch-dot-9  { background-color: #4338ca; }

.orch-border-0  { border-left-color: #7c3aed; }
.orch-border-1  { border-left-color: #0891b2; }
.orch-border-2  { border-left-color: #e11d48; }
.orch-border-3  { border-left-color: #d97706; }
.orch-border-4  { border-left-color: #059669; }
.orch-border-5  { border-left-color: #0284c7; }
.orch-border-6  { border-left-color: #a21caf; }
.orch-border-7  { border-left-color: #c2410c; }
.orch-border-8  { border-left-color: #0f766e; }
.orch-border-9  { border-left-color: #4338ca; }
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/orchestrator-colors.ts packages/web/src/app/globals.css
git commit -m "feat(web): add orchestrator color palette and CSS accent classes"
```

---

## Task 3: Add `accentClass` prop to SessionCard

**Files:**
- Modify: `packages/web/src/components/SessionCard.tsx` — add optional `accentClass?: string` prop

**Interfaces:**
- Consumes: `getOrchestratorBorderClass()` from `orchestrator-colors.ts` (called by parent — not imported here)
- Produces: SessionCard accepts `accentClass?: string` — used by OrchestratorGroup

- [ ] **Step 1: Read `packages/web/src/components/SessionCard.tsx` lines 140–175**

Find the exact prop interface and the border class logic (around `projectColorBorderClass`).

- [ ] **Step 2: Add `accentClass` to the SessionCard props interface**

In the props type definition, add:

```typescript
accentClass?: string;
```

- [ ] **Step 3: Update the border class logic**

Find the line that conditionally applies `border-l-2 ${projectColorBorderClass(projectAccent.slot)}`. Update it to fall back to `accentClass`:

```typescript
// Before (approximate — match the actual code):
className={`... ${projectAccent ? `border-l-2 ${projectColorBorderClass(projectAccent.slot)}` : ""}`}

// After:
className={`... ${
  projectAccent
    ? `border-l-2 ${projectColorBorderClass(projectAccent.slot)}`
    : accentClass
      ? `border-l-2 ${accentClass}`
      : ""
}`}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 5: Run existing web tests to confirm nothing broke**

```bash
pnpm --filter @made-by-moonlight/athene-web test
```

Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/SessionCard.tsx
git commit -m "feat(web): add accentClass prop to SessionCard for orchestrator border color"
```

---

## Task 4: FleetFilterBar component

**Files:**
- Create: `packages/web/src/components/FleetFilterBar.tsx`
- Create: `packages/web/src/components/__tests__/FleetFilterBar.test.tsx`

**Interfaces:**
- Consumes: `activeFilter: string | null`, `orchestratorNames: string[]`, `totalWorkers: number`, `onFilterChange: (name: string | null) => void`
- Produces: `<FleetFilterBar>` — used by FleetBoard

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/src/components/__tests__/FleetFilterBar.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { FleetFilterBar } from "../FleetFilterBar";

describe("FleetFilterBar", () => {
  const names = ["fleet-meta", "api-orch"];

  it("renders All chip and one chip per orchestrator name", () => {
    render(
      <FleetFilterBar
        orchestratorNames={names}
        activeFilter={null}
        totalWorkers={5}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("fleet-meta")).toBeInTheDocument();
    expect(screen.getByText("api-orch")).toBeInTheDocument();
  });

  it("calls onFilterChange with null when All is clicked", () => {
    const onChange = vi.fn();
    render(
      <FleetFilterBar
        orchestratorNames={names}
        activeFilter="fleet-meta"
        totalWorkers={3}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onFilterChange with the name when a chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <FleetFilterBar
        orchestratorNames={names}
        activeFilter={null}
        totalWorkers={5}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("api-orch"));
    expect(onChange).toHaveBeenCalledWith("api-orch");
  });

  it("displays the worker count", () => {
    render(
      <FleetFilterBar
        orchestratorNames={[]}
        activeFilter={null}
        totalWorkers={7}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("7 workers")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetFilterBar
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/web/src/components/FleetFilterBar.tsx`**

```typescript
"use client";

interface Props {
  orchestratorNames: string[];
  activeFilter: string | null;
  totalWorkers: number;
  onFilterChange: (name: string | null) => void;
}

export function FleetFilterBar({
  orchestratorNames,
  activeFilter,
  totalWorkers,
  onFilterChange,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[--color-border] shrink-0">
      <h1 className="text-sm font-semibold text-[--color-text-primary] mr-2">Fleet</h1>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onFilterChange(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            activeFilter === null
              ? "bg-[--color-surface-raised] border-[--color-border-focus] text-[--color-text-primary]"
              : "border-[--color-border] text-[--color-text-tertiary] hover:text-[--color-text-secondary]"
          }`}
        >
          All
        </button>
        {orchestratorNames.map((name) => (
          <button
            key={name}
            onClick={() => onFilterChange(name)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === name
                ? "bg-[--color-surface-raised] border-[--color-border-focus] text-[--color-text-primary]"
                : "border-[--color-border] text-[--color-text-tertiary] hover:text-[--color-text-secondary]"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-[--color-text-tertiary]">
        {totalWorkers} {totalWorkers === 1 ? "worker" : "workers"}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetFilterBar
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/FleetFilterBar.tsx packages/web/src/components/__tests__/FleetFilterBar.test.tsx
git commit -m "feat(web): add FleetFilterBar component"
```

---

## Task 5: OrchestratorGroup component

**Files:**
- Create: `packages/web/src/components/OrchestratorGroup.tsx`
- Create: `packages/web/src/components/__tests__/OrchestratorGroup.test.tsx`

**Interfaces:**
- Consumes: `OrchestratorGroupData` (defined in this task), `getOrchestratorDotClass`, `getOrchestratorBorderClass` from `orchestrator-colors.ts`, `SessionCard` from existing components
- Produces: `OrchestratorGroupData` interface (re-exported), `<OrchestratorGroup>` — used by FleetColumn

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/src/components/__tests__/OrchestratorGroup.test.tsx
import { render, screen } from "@testing-library/react";
import { OrchestratorGroup, type OrchestratorGroupData } from "../OrchestratorGroup";
import type { DashboardSession } from "@/lib/types";

vi.mock("../SessionCard", () => ({
  SessionCard: ({ session }: { session: DashboardSession }) => (
    <div data-testid="session-card">{session.id}</div>
  ),
}));

function makeGroup(overrides: Partial<OrchestratorGroupData> = {}): OrchestratorGroupData {
  return {
    parentSessionId: "orch-abc-1",
    orchestratorName: "fleet-meta",
    spawnedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    sessions: [],
    ...overrides,
  };
}

function makeSession(id: string): DashboardSession {
  return { id, projectId: "proj-1", metadata: {} } as DashboardSession;
}

describe("OrchestratorGroup", () => {
  it("renders the orchestrator name", () => {
    render(<OrchestratorGroup group={makeGroup()} />);
    expect(screen.getByText("fleet-meta")).toBeInTheDocument();
  });

  it("renders a card for each session", () => {
    const group = makeGroup({
      sessions: [makeSession("s-1"), makeSession("s-2")],
    });
    render(<OrchestratorGroup group={group} />);
    expect(screen.getAllByTestId("session-card")).toHaveLength(2);
  });

  it("renders relative time", () => {
    render(<OrchestratorGroup group={makeGroup()} />);
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test OrchestratorGroup
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/web/src/components/OrchestratorGroup.tsx`**

```typescript
"use client";

import type { DashboardSession } from "@/lib/types";
import { SessionCard } from "./SessionCard";
import { getOrchestratorDotClass, getOrchestratorBorderClass } from "@/lib/orchestrator-colors";

export interface OrchestratorGroupData {
  parentSessionId: string;
  orchestratorName: string;
  spawnedAt: string | null; // ISO string
  sessions: DashboardSession[];
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  group: OrchestratorGroupData;
}

export function OrchestratorGroup({ group }: Props) {
  const dotClass = getOrchestratorDotClass(group.parentSessionId);
  const borderClass = getOrchestratorBorderClass(group.parentSessionId);

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-1 py-1 mb-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-xs font-semibold text-[--color-text-secondary]">
          {group.orchestratorName}
        </span>
        <span className="text-[--color-text-tertiary] text-xs">·</span>
        <span className="text-xs text-[--color-text-tertiary]">
          {formatRelativeTime(group.spawnedAt)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {group.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            accentClass={borderClass}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test OrchestratorGroup
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/OrchestratorGroup.tsx packages/web/src/components/__tests__/OrchestratorGroup.test.tsx
git commit -m "feat(web): add OrchestratorGroup component"
```

---

## Task 6: FleetColumn component

**Files:**
- Create: `packages/web/src/components/FleetColumn.tsx`
- Create: `packages/web/src/components/__tests__/FleetColumn.test.tsx`

**Interfaces:**
- Consumes: `OrchestratorGroupData` from `OrchestratorGroup`, `AttentionLevel` from `@/lib/types`
- Produces: `<FleetColumn>` — used by FleetBoard

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/src/components/__tests__/FleetColumn.test.tsx
import { render, screen } from "@testing-library/react";
import { FleetColumn } from "../FleetColumn";
import type { OrchestratorGroupData } from "../OrchestratorGroup";

vi.mock("../OrchestratorGroup", () => ({
  OrchestratorGroup: ({ group }: { group: OrchestratorGroupData }) => (
    <div data-testid="orch-group">{group.orchestratorName}</div>
  ),
}));

describe("FleetColumn", () => {
  it("renders the column title", () => {
    render(<FleetColumn title="Working" groups={[]} attentionLevel="working" />);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("renders an OrchestratorGroup for each group", () => {
    const groups: OrchestratorGroupData[] = [
      { parentSessionId: "a", orchestratorName: "alpha", spawnedAt: null, sessions: [] },
      { parentSessionId: "b", orchestratorName: "beta", spawnedAt: null, sessions: [] },
    ];
    render(<FleetColumn title="Working" groups={groups} attentionLevel="working" />);
    expect(screen.getAllByTestId("orch-group")).toHaveLength(2);
  });

  it("shows empty state when no groups", () => {
    render(<FleetColumn title="Done" groups={[]} attentionLevel="done" />);
    expect(screen.getByText(/no sessions/i)).toBeInTheDocument();
  });

  it("shows the total session count in the header", () => {
    const groups: OrchestratorGroupData[] = [
      {
        parentSessionId: "a",
        orchestratorName: "alpha",
        spawnedAt: null,
        sessions: [{} as never, {} as never],
      },
    ];
    render(<FleetColumn title="Working" groups={groups} attentionLevel="working" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetColumn
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/web/src/components/FleetColumn.tsx`**

```typescript
"use client";

import { OrchestratorGroup, type OrchestratorGroupData } from "./OrchestratorGroup";
import type { AttentionLevel } from "@/lib/types";

const INDICATOR_CLASSES: Record<AttentionLevel, string> = {
  working: "bg-green-500",
  action:  "bg-amber-500",
  respond: "bg-amber-500",
  review:  "bg-indigo-400",
  pending: "bg-violet-400",
  merge:   "bg-violet-300",
  done:    "bg-[--color-border]",
};

interface Props {
  title: string;
  groups: OrchestratorGroupData[];
  attentionLevel: AttentionLevel;
}

export function FleetColumn({ title, groups, attentionLevel }: Props) {
  const totalSessions = groups.reduce((sum, g) => sum + g.sessions.length, 0);

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] mr-3 last:mr-0">
      <div className="flex items-center gap-1.5 px-1 pb-2.5 mb-3 border-b border-[--color-border]">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${INDICATOR_CLASSES[attentionLevel]}`} />
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[--color-text-tertiary]">
          {title}
        </span>
        {totalSessions > 0 && (
          <span className="ml-auto text-[10px] bg-[--color-surface-raised] text-[--color-text-tertiary] px-1.5 py-0.5 rounded-full">
            {totalSessions}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-xs text-[--color-text-tertiary] text-center py-6">No sessions</p>
        ) : (
          groups.map((group) => (
            <OrchestratorGroup key={group.parentSessionId} group={group} />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetColumn
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/FleetColumn.tsx packages/web/src/components/__tests__/FleetColumn.test.tsx
git commit -m "feat(web): add FleetColumn component"
```

---

## Task 7: FleetBoard component

**Files:**
- Create: `packages/web/src/components/FleetBoard.tsx`
- Create: `packages/web/src/components/__tests__/FleetBoard.test.tsx`

**Interfaces:**
- Consumes: `useSessionEvents` hook (no args), `FleetColumn`, `FleetFilterBar`, `OrchestratorGroupData`, `getOrchestratorColorIndex` from `orchestrator-colors`, `AttentionLevel` + `getAttentionLevel` from `@/lib/types`
- Produces: `<FleetBoard>` — used by `/fleet` page

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/src/components/__tests__/FleetBoard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { FleetBoard } from "../FleetBoard";
import type { DashboardSession } from "@/lib/types";

vi.mock("@/hooks/useSessionEvents", () => ({
  useSessionEvents: vi.fn(),
}));
vi.mock("../FleetColumn", () => ({
  FleetColumn: ({ title, groups }: { title: string; groups: unknown[] }) => (
    <div data-testid={`col-${title.toLowerCase()}`}>{groups.length} groups</div>
  ),
}));
vi.mock("../FleetFilterBar", () => ({
  FleetFilterBar: ({
    orchestratorNames,
    onFilterChange,
  }: {
    orchestratorNames: string[];
    onFilterChange: (n: string | null) => void;
  }) => (
    <div>
      {orchestratorNames.map((n) => (
        <button key={n} onClick={() => onFilterChange(n)}>
          {n}
        </button>
      ))}
      <button onClick={() => onFilterChange(null)}>All</button>
    </div>
  ),
}));

import { useSessionEvents } from "@/hooks/useSessionEvents";

function makeSession(
  id: string,
  opts: {
    role?: string;
    parentSessionId?: string;
    orchestratorOwner?: string;
    attentionLevel?: string;
  } = {},
): DashboardSession {
  return {
    id,
    projectId: "proj-1",
    metadata: {
      ...(opts.role ? { role: opts.role } : {}),
      ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
      ...(opts.orchestratorOwner ? { orchestratorOwner: opts.orchestratorOwner } : {}),
    },
    attentionLevel: (opts.attentionLevel ?? "working") as never,
    createdAt: new Date().toISOString(),
    status: "working" as never,
    activity: null,
    branch: null,
    issueId: null,
    issueUrl: null,
    issueLabel: null,
    issueTitle: null,
    userPrompt: null,
    displayName: null,
    displayNameUserSet: false,
    summary: null,
    summaryIsFallback: false,
    lastActivityAt: new Date().toISOString(),
    pr: null,
    prs: [],
  };
}

describe("FleetBoard", () => {
  beforeEach(() => {
    vi.mocked(useSessionEvents).mockReturnValue({ sessions: [], isConnected: true } as never);
  });

  it("filters out orchestrator sessions", () => {
    vi.mocked(useSessionEvents).mockReturnValue({
      sessions: [
        makeSession("orch-1", { role: "orchestrator" }),
        makeSession("worker-1", { parentSessionId: "orch-1", orchestratorOwner: "fleet-meta" }),
      ],
      isConnected: true,
    } as never);
    render(<FleetBoard />);
    // 1 worker should appear across the columns (orch-1 filtered out)
    // The working column gets 1 group with 1 session
    expect(screen.getByTestId("col-working")).toHaveTextContent("1 groups");
  });

  it("groups workers by parentSessionId", () => {
    vi.mocked(useSessionEvents).mockReturnValue({
      sessions: [
        makeSession("w-1", { parentSessionId: "orch-A", orchestratorOwner: "alpha" }),
        makeSession("w-2", { parentSessionId: "orch-A", orchestratorOwner: "alpha" }),
        makeSession("w-3", { parentSessionId: "orch-B", orchestratorOwner: "beta" }),
      ],
      isConnected: true,
    } as never);
    render(<FleetBoard />);
    // Working column: 2 distinct groups (orch-A and orch-B)
    expect(screen.getByTestId("col-working")).toHaveTextContent("2 groups");
  });

  it("filters groups by orchestratorName when filter is set", () => {
    vi.mocked(useSessionEvents).mockReturnValue({
      sessions: [
        makeSession("w-1", { parentSessionId: "orch-A", orchestratorOwner: "alpha" }),
        makeSession("w-2", { parentSessionId: "orch-B", orchestratorOwner: "beta" }),
      ],
      isConnected: true,
    } as never);
    render(<FleetBoard />);
    fireEvent.click(screen.getByText("alpha"));
    // After filtering to alpha, only 1 group
    expect(screen.getByTestId("col-working")).toHaveTextContent("1 groups");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetBoard
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/web/src/components/FleetBoard.tsx`**

Read `packages/web/src/hooks/useSessionEvents.ts` to confirm the exact return shape before writing. Then:

```typescript
"use client";

import { useState } from "react";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { FleetColumn } from "./FleetColumn";
import { FleetFilterBar } from "./FleetFilterBar";
import { getOrchestratorBorderClass } from "@/lib/orchestrator-colors";
import { type OrchestratorGroupData } from "./OrchestratorGroup";
import { getAttentionLevel, type DashboardSession, type AttentionLevel } from "@/lib/types";

const COLUMNS: { level: AttentionLevel; title: string }[] = [
  { level: "working", title: "Working" },
  { level: "action",  title: "Action" },
  { level: "pending", title: "Pending" },
  { level: "merge",   title: "Merge" },
  { level: "done",    title: "Done" },
];

function buildGroups(
  sessions: DashboardSession[],
  filterName: string | null,
): Map<AttentionLevel, OrchestratorGroupData[]> {
  const workerSessions = sessions.filter(
    (s) => s.metadata?.["role"] !== "orchestrator",
  );

  const groupMap = new Map<string, OrchestratorGroupData>();
  for (const session of workerSessions) {
    const key =
      session.metadata?.["parentSessionId"] ??
      session.metadata?.["orchestratorOwner"] ??
      "default";
    const name = session.metadata?.["orchestratorOwner"] ?? "default";

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        parentSessionId: key,
        orchestratorName: name,
        spawnedAt: session.createdAt,
        sessions: [],
      });
    }
    groupMap.get(key)!.sessions.push(session);
  }

  let groups = Array.from(groupMap.values());
  if (filterName) {
    groups = groups.filter((g) => g.orchestratorName === filterName);
  }

  const byLevel = new Map<AttentionLevel, OrchestratorGroupData[]>();
  for (const col of COLUMNS) byLevel.set(col.level, []);

  for (const group of groups) {
    const levelGroups = new Map<AttentionLevel, DashboardSession[]>();
    for (const session of group.sessions) {
      const level = getAttentionLevel(session);
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(session);
    }
    for (const [level, lvlSessions] of levelGroups) {
      if (!byLevel.has(level)) continue;
      byLevel.get(level)!.push({ ...group, sessions: lvlSessions });
    }
  }

  return byLevel;
}

export function FleetBoard() {
  const { sessions } = useSessionEvents();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const groupsByLevel = buildGroups(sessions, activeFilter);

  const allWorkers = sessions.filter((s) => s.metadata?.["role"] !== "orchestrator");
  const filteredWorkers = activeFilter
    ? allWorkers.filter((s) => s.metadata?.["orchestratorOwner"] === activeFilter)
    : allWorkers;

  const orchestratorNames = Array.from(
    new Set(
      allWorkers
        .map((s) => s.metadata?.["orchestratorOwner"] ?? "default")
        .filter(Boolean),
    ),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FleetFilterBar
        orchestratorNames={orchestratorNames}
        activeFilter={activeFilter}
        totalWorkers={filteredWorkers.length}
        onFilterChange={setActiveFilter}
      />
      <div className="flex flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
        {COLUMNS.map(({ level, title }) => (
          <FleetColumn
            key={level}
            title={title}
            groups={groupsByLevel.get(level) ?? []}
            attentionLevel={level}
          />
        ))}
      </div>
    </div>
  );
}
```

**Note:** `getAttentionLevel` may need to be checked in `packages/web/src/lib/types.ts` for the exact function signature. If it isn't exported, find the equivalent and import the correct function.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @made-by-moonlight/athene-web test FleetBoard
```

Expected: PASS

- [ ] **Step 5: Run full typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/FleetBoard.tsx packages/web/src/components/__tests__/FleetBoard.test.tsx
git commit -m "feat(web): add FleetBoard component with orchestrator grouping"
```

---

## Task 8: `/fleet` route

**Files:**
- Create: `packages/web/src/app/fleet/page.tsx`

**Interfaces:**
- Consumes: `FleetBoard` component

- [ ] **Step 1: Create `packages/web/src/app/fleet/page.tsx`**

```typescript
import type { Metadata } from "next";
import { FleetBoard } from "@/components/FleetBoard";

export const metadata: Metadata = {
  title: "Fleet — Athene",
};

export default function FleetPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--color-background]">
      <FleetBoard />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 3: Start dev server and verify the route loads**

```bash
pnpm dev
```

Open `http://localhost:3000/fleet` in a browser. Verify the fleet board renders with columns and no console errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/fleet/page.tsx
git commit -m "feat(web): add /fleet route"
```

---

## Task 9: Sidebar Fleet nav entry

**Files:**
- Modify: `packages/web/src/components/ProjectSidebar.tsx`

**Interfaces:**
- Consumes: Next.js `Link` or router for navigation
- Produces: "Fleet" link in sidebar above orchestrators section

- [ ] **Step 1: Read `packages/web/src/components/ProjectSidebar.tsx` lines 785–845**

Identify the exact JSX block for `SidebarBrand` and the start of `SidebarOrchestrators`. Find whether `Link` from `next/link` is already imported.

- [ ] **Step 2: Insert the Fleet nav link between SidebarBrand and SidebarOrchestrators**

Add a nav item that links to `/fleet`. Match the visual style of existing nav items. Use `usePathname()` from `next/navigation` to apply an active state when the current path is `/fleet`:

```typescript
// Near the top of the component (with other hooks):
const pathname = usePathname();
const isFleet = pathname === "/fleet";
```

```tsx
{/* Insert after <SidebarBrand> and before <SidebarOrchestrators>: */}
<Link
  href="/fleet"
  className={`flex items-center gap-2 px-3 py-1.5 mx-2 rounded-md text-xs font-medium transition-colors ${
    isFleet
      ? "bg-[--color-surface-raised] text-[--color-text-primary]"
      : "text-[--color-text-tertiary] hover:text-[--color-text-secondary] hover:bg-[--color-surface-raised]"
  }`}
>
  <span>⚡</span>
  Fleet
</Link>
```

Match the exact padding/margin of existing sidebar nav items — adjust the classes above to match the surrounding pattern.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 4: Run existing sidebar tests**

```bash
pnpm --filter @made-by-moonlight/athene-web test SidebarOrchestrators
pnpm --filter @made-by-moonlight/athene-web test ProjectSidebar
```

Expected: existing tests pass (Fleet link doesn't break any existing test)

- [ ] **Step 5: Verify in browser**

With `pnpm dev` running: open `http://localhost:3000`. Confirm "Fleet" appears in the sidebar above the orchestrators section. Click it — confirm it navigates to `/fleet` and the Fleet link is highlighted active.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ProjectSidebar.tsx
git commit -m "feat(web): add Fleet nav entry to sidebar"
```

---

## Task 10: Convert project page to settings

**Files:**
- Modify: `packages/web/src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: project config data already available as props (find `ProjectConfig` or `projects` in the existing page)
- Produces: read-only settings view showing project name, tracker, SCM, notifier config

- [ ] **Step 1: Read `packages/web/src/app/projects/[projectId]/page.tsx` in full**

Understand the full props shape, how `initialSessions` is fetched, and what `Dashboard` receives.

- [ ] **Step 2: Remove the Dashboard import and session fetching**

Delete:
- The `Dashboard` component import
- Any `initialSessions` fetching / session-related server-side data loading
- The `<Dashboard ... />` JSX

Keep:
- The project config loading (needed for the settings view)
- The page wrapper and metadata

- [ ] **Step 3: Add a simple ProjectSettings view inline**

Replace the `<Dashboard>` render with a settings display. Use only the config data already available on the page. Show the project name, projectId, and whichever config fields are present (tracker type, SCM type, notifier type). Display them as a simple labelled list:

```tsx
<div className="flex flex-col gap-6 p-6 max-w-xl">
  <div>
    <h1 className="text-base font-semibold text-[--color-text-primary] mb-1">
      {projectName}
    </h1>
    <p className="text-xs text-[--color-text-tertiary] font-mono">{projectId}</p>
  </div>
  <section className="flex flex-col gap-3">
    <h2 className="text-xs font-semibold tracking-widest uppercase text-[--color-text-tertiary]">
      Configuration
    </h2>
    {/* Render each config field as a row: label + value */}
    {/* Use the actual field names from the config object on this page */}
  </section>
</div>
```

Read the available config shape and fill in the actual field names — don't fabricate field names.

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @made-by-moonlight/athene-web typecheck
```

Expected: no errors

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000/projects/<any-project-id>`. Confirm the kanban is gone and the settings display renders. Confirm the sidebar still shows the project link and clicking it lands on the settings page.

- [ ] **Step 6: Run all web tests**

```bash
pnpm --filter @made-by-moonlight/athene-web test
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/app/projects/
git commit -m "feat(web): convert project page to settings view, remove kanban"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `parentSessionId` on Session | Task 1 |
| Stamp at spawn time | Task 1 |
| Both `parentSessionId` + `orchestratorOwner` stored | Task 1 (ID in metadata, name already stamped) |
| `/fleet` route | Task 8 |
| Per-project page → settings | Task 10 |
| Columns by attention level | Task 7 (FleetColumn) |
| Groups by `parentSessionId` | Task 7 (FleetBoard `buildGroups`) |
| Group header: name + start time + color dot | Task 5 (OrchestratorGroup) |
| Worker card left border = orchestrator color | Task 3 (SessionCard `accentClass`) |
| Filter bar per orchestrator name | Task 4 (FleetFilterBar) |
| Filter collapses sessions across runs by same name | Task 7 (`orchestratorName` filter in `buildGroups`) |
| Sidebar Fleet entry | Task 9 |
| Sidebar orchestrators above projects | Already true per existing code |
| Orchestrators not shown as cards | Task 7 (`metadata["role"] !== "orchestrator"` filter) |
| Fallback to `orchestratorOwner` for old sessions | Task 7 (`parentSessionId ?? orchestratorOwner` in `buildGroups`) |
| CSS classes not inline styles | Tasks 2, 5, 6, 7 |
| Tests for all new components | Tasks 4, 5, 6, 7 |
