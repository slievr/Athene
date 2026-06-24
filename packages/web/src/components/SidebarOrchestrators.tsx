"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAttentionLevel, type DashboardSession } from "@/lib/types";
import { cn } from "@/lib/cn";
import { orchestratorDashboardPath, orchestratorSessionPath } from "@/lib/routes";

/** A named orchestrator and its (optional) session, for the sidebar. */
export interface SidebarOrchestrator {
  name: string;
  /** The orchestrator session (under projectId "_meta"), if running. */
  session: DashboardSession | null;
}

// ---------------------------------------------------------------------------
// Deprecated type aliases kept for callers not yet migrated.
// ---------------------------------------------------------------------------

/** @deprecated Use SidebarOrchestrator */
export type SidebarMetaOrchestrator = SidebarOrchestrator;

/**
 * @deprecated No longer used — per-project orchestrators now appear in the
 * project tree, not the Orchestrators section.
 */
export interface SidebarProjectOrchestrator {
  id: string;
  projectId: string;
  session?: DashboardSession | null;
}

interface SidebarOrchestratorsProps {
  collapsed: boolean;
  orchestrators: SidebarOrchestrator[];
  activeSessionId: string | undefined;
  onNavigate: (href: string, session?: DashboardSession) => void;
}

/** Reuses the existing sidebar dot styling (same classes + data-level). */
function ActivityDot({ session }: { session: DashboardSession | null }) {
  if (!session) return null;
  const level = getAttentionLevel(session);
  return (
    <div
      className={cn(
        "sidebar-session-dot shrink-0 rounded-full",
        level === "working" && "sidebar-session-dot--glow",
      )}
      data-level={level}
    />
  );
}

/**
 * The Orchestrators sidebar section: a flat list of configured named orchestrators,
 * each with a right-aligned activity-state dot. Renders a compact glyph cluster
 * when the sidebar is collapsed.
 */
export function SidebarOrchestrators({
  collapsed,
  orchestrators,
  activeSessionId,
  onNavigate,
}: SidebarOrchestratorsProps) {
  const router = useRouter();
  const [startingOrch, setStartingOrch] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreate) createInputRef.current?.focus();
  }, [showCreate]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/orchestrators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope: "all" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCreateError(data.error ?? "Failed to create");
        return;
      }
      setShowCreate(false);
      setCreateName("");
      router.refresh();
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  };

  if (orchestrators.length === 0 && !showCreate) {
    if (collapsed) return null;
    return (
      <div className="project-sidebar__orchestrators">
        <div className="project-sidebar__nav-label">
          <span>Orchestrators</span>
          <button
            type="button"
            className="project-sidebar__add-btn"
            aria-label="New orchestrator"
            onClick={() => setShowCreate(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const handleClick =
    (href: string, session?: DashboardSession) => (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      onNavigate(href, session ?? undefined);
    };

  const handleStartOrch = (name: string) => async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (startingOrch.has(name)) return;
    setStartingOrch((prev) => new Set(prev).add(name));
    try {
      await fetch(`/api/orchestrators/${encodeURIComponent(name)}/start`, { method: "POST" });
      router.refresh();
    } finally {
      setStartingOrch((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  if (collapsed) {
    return (
      <div className="project-sidebar__orch-collapsed flex flex-col items-center gap-1">
        {orchestrators.map((o) => {
          const dest = o.session ? orchestratorSessionPath(o.name) : orchestratorDashboardPath(o.name);
          return (
            <a
              key={o.name}
              href={dest}
              onClick={handleClick(dest, o.session ?? undefined)}
              className="project-sidebar__orch-glyph"
              data-level={o.session ? getAttentionLevel(o.session) : undefined}
              title={o.session ? `${o.name} (terminal)` : o.name}
              aria-label={
                o.session
                  ? `Open ${o.name} orchestrator terminal`
                  : `Open ${o.name} orchestrator dashboard`
              }
            >
              ◆
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="project-sidebar__orchestrators">
      <div className="project-sidebar__nav-label">
        <span>Orchestrators</span>
        <button
          type="button"
          className="project-sidebar__add-btn"
          aria-label="New orchestrator"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateError(null);
            setCreateName("");
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {showCreate && (
        <form
          onSubmit={handleCreateSubmit}
          className="project-sidebar__orch-create-form"
        >
          <input
            ref={createInputRef}
            type="text"
            value={createName}
            onChange={(e) => {
              setCreateName(e.target.value);
              setCreateError(null);
            }}
            placeholder="Name"
            className="project-sidebar__orch-create-input"
            disabled={creating}
            aria-label="Orchestrator name"
          />
          {createError && (
            <span className="project-sidebar__orch-create-error">{createError}</span>
          )}
          <div className="project-sidebar__orch-create-actions">
            <button
              type="submit"
              className="project-sidebar__orch-create-submit"
              disabled={creating || !createName.trim()}
            >
              {creating ? (
                <span className="project-sidebar__orch-start-spinner" aria-hidden="true" />
              ) : (
                "Create"
              )}
            </button>
            <button
              type="button"
              className="project-sidebar__orch-create-cancel"
              onClick={() => {
                setShowCreate(false);
                setCreateName("");
                setCreateError(null);
              }}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {orchestrators.map((o) => {
        const fleetHref = orchestratorDashboardPath(o.name);
        const terminalHref = orchestratorSessionPath(o.name);
        const isStarting = startingOrch.has(o.name);
        return (
          <a
            key={o.name}
            href={fleetHref}
            onClick={handleClick(fleetHref, o.session ?? undefined)}
            className={cn(
              "project-sidebar__orch-row",
              activeSessionId === o.name && "project-sidebar__orch-row--active",
            )}
            aria-label={`Open ${o.name} orchestrator dashboard`}
          >
            <span className="project-sidebar__orch-glyph" aria-hidden="true">
              ◆
            </span>
            <span className="project-sidebar__orch-name min-w-0 flex-1">{o.name}</span>
            {o.session === null ? (
              <button
                type="button"
                onClick={handleStartOrch(o.name)}
                disabled={isStarting}
                aria-label={`Start ${o.name}`}
                className="project-sidebar__orch-start-btn shrink-0"
              >
                {isStarting ? (
                  <span className="project-sidebar__orch-start-spinner" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">▶</span>
                )}
              </button>
            ) : (
              <span className="flex items-center gap-1 shrink-0">
                <a
                  href={terminalHref}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onNavigate(terminalHref, o.session ?? undefined);
                  }}
                  title="View orchestrator terminal"
                  aria-label={`Open ${o.name} terminal`}
                  className="project-sidebar__orch-terminal-btn"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="m8 10 3 3-3 3" />
                    <path d="M13 16h3" />
                  </svg>
                </a>
                <ActivityDot session={o.session} />
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
