"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAttentionLevel, type DashboardSession } from "@/lib/types";
import { getSessionTitle } from "@/lib/format";
import { cn } from "@/lib/cn";
import { orchestratorDashboardPath, orchestratorSessionPath } from "@/lib/routes";
import type { ProjectInfo } from "@/lib/project-name";

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
  allSessions: DashboardSession[];
  projects: ProjectInfo[];
  activeSessionId: string | undefined;
  onNavigate: (href: string, session?: DashboardSession) => void;
}

function getOrchestratorWorkerSessions(
  sessions: DashboardSession[],
  orchestratorName: string,
): DashboardSession[] {
  return sessions.filter(
    (s) =>
      (s.metadata["orchestratorOwner"] === orchestratorName ||
        s.metadata["metaOwner"] === orchestratorName) &&
      s.metadata["role"] !== "orchestrator" &&
      s.metadata["role"] !== "meta-orchestrator",
  );
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

function SessionDot({ level }: { level: string }) {
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
 * The Orchestrators sidebar section: expandable list of named orchestrators
 * with their worker sessions. Renders a compact glyph cluster when collapsed.
 */
export function SidebarOrchestrators({
  collapsed,
  orchestrators,
  allSessions,
  projects,
  activeSessionId,
  onNavigate,
}: SidebarOrchestratorsProps) {
  const router = useRouter();
  const [startingOrch, setStartingOrch] = useState<Set<string>>(new Set());
  const [expandedOrchestrators, setExpandedOrchestrators] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Spawn form state — one orchestrator at a time
  const [spawnOrch, setSpawnOrch] = useState<string | null>(null);
  const [spawnProjectId, setSpawnProjectId] = useState("");
  const [spawnPrompt, setSpawnPrompt] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  useEffect(() => {
    if (showCreate) createInputRef.current?.focus();
  }, [showCreate]);

  // Auto-expand orchestrators that own the active session
  useEffect(() => {
    if (!activeSessionId) return;
    const owning = orchestrators.find((o) =>
      getOrchestratorWorkerSessions(allSessions, o.name).some((s) => s.id === activeSessionId),
    );
    if (owning) {
      setExpandedOrchestrators((prev) => {
        if (prev.has(owning.name)) return prev;
        const next = new Set(prev);
        next.add(owning.name);
        return next;
      });
    }
  }, [activeSessionId, orchestrators, allSessions]);

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

  const handleSpawn = async (orchName: string) => {
    if (!spawnProjectId || spawning) return;
    setSpawning(true);
    setSpawnError(null);
    try {
      const res = await fetch("/api/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: spawnProjectId,
          prompt: spawnPrompt.trim() || undefined,
          orchestratorOwner: orchName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        session?: { id: string };
        error?: string;
      };
      if (!res.ok) {
        setSpawnError(data.error ?? "Failed to spawn");
        return;
      }
      if (data.session) {
        setSpawnOrch(null);
        setSpawnPrompt("");
        onNavigate(orchestratorSessionPath(orchName, data.session.id));
      }
    } catch {
      setSpawnError("Network error");
    } finally {
      setSpawning(false);
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
          const dest = o.session
            ? orchestratorSessionPath(o.name, o.session.id)
            : orchestratorDashboardPath(o.name);
          const workerSessions = getOrchestratorWorkerSessions(allSessions, o.name);
          return (
            <div key={o.name} className="flex flex-col items-center gap-0.5 w-full px-1">
              <a
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
              {workerSessions.slice(0, 3).map((session) => {
                const level = getAttentionLevel(session);
                const title = session.displayName ?? getSessionTitle(session) ?? session.id;
                const abbr = title.replace(/\s+/g, "").slice(0, 3).toUpperCase();
                const isActive = activeSessionId === session.id;
                const sessionHref = orchestratorSessionPath(o.name, session.id);
                return (
                  <a
                    key={session.id}
                    href={sessionHref}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                      e.preventDefault();
                      onNavigate(sessionHref, session);
                    }}
                    className={cn(
                      "project-sidebar__collapsed-session-btn",
                      isActive && "project-sidebar__collapsed-session-btn--active",
                    )}
                    data-level={level}
                    title={title}
                    aria-label={title}
                  >
                    <span className="project-sidebar__session-abbr-first">{abbr[0]}</span>
                    <span className="project-sidebar__session-abbr-rest">{abbr.slice(1)}</span>
                  </a>
                );
              })}
              {workerSessions.length > 3 && (
                <span className="project-sidebar__collapsed-overflow">
                  +{workerSessions.length - 3}
                </span>
              )}
            </div>
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
        <form onSubmit={handleCreateSubmit} className="project-sidebar__orch-create-form">
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
        const terminalHref = o.session
          ? orchestratorSessionPath(o.name, o.session.id)
          : fleetHref;
        const isStarting = startingOrch.has(o.name);
        const isExpanded = expandedOrchestrators.has(o.name);
        const workerSessions = getOrchestratorWorkerSessions(allSessions, o.name);

        return (
          <div key={o.name} className="project-sidebar__project">
            {/* Orchestrator row */}
            <div className="project-sidebar__proj-row flex items-center">
              <button
                type="button"
                onClick={() => {
                  setExpandedOrchestrators((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.name)) next.delete(o.name);
                    else next.add(o.name);
                    return next;
                  });
                }}
                className={cn(
                  "project-sidebar__proj-toggle",
                  activeSessionId === o.name && "project-sidebar__proj-toggle--active",
                )}
                aria-expanded={isExpanded}
                aria-label={`Toggle ${o.name} sessions`}
              >
                <svg
                  className={cn(
                    "project-sidebar__proj-chevron",
                    isExpanded && "project-sidebar__proj-chevron--open",
                  )}
                  width="10"
                  height="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="project-sidebar__orch-glyph" aria-hidden="true">◆</span>
                <span className="project-sidebar__orch-name min-w-0 flex-1 text-left">{o.name}</span>
              </button>

              {/* Action buttons — outside the toggle button */}
              <div className="flex items-center gap-0.5 pr-2 shrink-0">
                {/* Fleet dashboard link */}
                <a
                  href={fleetHref}
                  onClick={handleClick(fleetHref, o.session ?? undefined)}
                  title={`${o.name} fleet dashboard`}
                  aria-label={`Open ${o.name} fleet dashboard`}
                  className="project-sidebar__orch-terminal-btn"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                </a>

                {/* Terminal link (only when session is running) */}
                {o.session && (
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
                )}

                {/* Start / activity */}
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
                  <ActivityDot session={o.session} />
                )}
              </div>
            </div>

            {/* Expanded session list */}
            {isExpanded && (
              <div className="project-sidebar__sessions">
                {workerSessions.map((session) => {
                  const sessionHref = orchestratorSessionPath(o.name, session.id);
                  const isActive = activeSessionId === session.id;
                  const level = getAttentionLevel(session);
                  const title =
                    session.displayName ?? getSessionTitle(session) ?? session.id;
                  return (
                    <a
                      key={session.id}
                      href={sessionHref}
                      onClick={handleClick(sessionHref, session)}
                      className={cn(
                        "project-sidebar__sess-row group",
                        isActive && "project-sidebar__sess-row--active",
                      )}
                    >
                      <SessionDot level={level} />
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "project-sidebar__sess-label",
                            isActive && "project-sidebar__sess-label--active",
                          )}
                        >
                          {title}
                        </span>
                      </div>
                    </a>
                  );
                })}

                {/* Spawn form / button */}
                {projects.length > 0 && (
                  spawnOrch === o.name ? (
                    <div className="project-sidebar__orch-create-form">
                      <select
                        value={spawnProjectId}
                        onChange={(e) => {
                          setSpawnProjectId(e.target.value);
                          setSpawnError(null);
                        }}
                        className="project-sidebar__orch-create-input"
                        disabled={spawning}
                        aria-label="Project"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={spawnPrompt}
                        onChange={(e) => setSpawnPrompt(e.target.value)}
                        placeholder="Prompt (optional)"
                        className="project-sidebar__orch-create-input"
                        disabled={spawning}
                      />
                      {spawnError && (
                        <span className="project-sidebar__orch-create-error">{spawnError}</span>
                      )}
                      <div className="project-sidebar__orch-create-actions">
                        <button
                          type="button"
                          onClick={() => void handleSpawn(o.name)}
                          disabled={spawning || !spawnProjectId}
                          className="project-sidebar__orch-create-submit"
                        >
                          {spawning ? (
                            <span className="project-sidebar__orch-start-spinner" aria-hidden="true" />
                          ) : (
                            "Spawn"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSpawnOrch(null);
                            setSpawnError(null);
                            setSpawnPrompt("");
                          }}
                          className="project-sidebar__orch-create-cancel"
                          disabled={spawning}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSpawnOrch(o.name);
                        setSpawnProjectId(projects[0]?.id ?? "");
                        setSpawnError(null);
                      }}
                      className="project-sidebar__orch-spawn-row"
                    >
                      + New session
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
