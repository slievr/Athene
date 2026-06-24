"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getAttentionLevel, type DashboardSession } from "@/lib/types";
import { getSessionTitle } from "@/lib/format";
import { cn } from "@/lib/cn";
import { orchestratorDashboardPath, orchestratorSessionPath, projectSessionPath } from "@/lib/routes";
import type { ProjectInfo } from "@/lib/project-name";

/** A named orchestrator and its (optional) session, for the sidebar. */
export interface SidebarOrchestrator {
  /** YAML key slug (never changes). */
  name: string;
  /** Stable UUID from config. */
  id: string;
  /** Display label from config `name` field. Falls back to slug if absent. */
  label: string;
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

/** Returns orchestrator-role sessions spawned by this orchestrator (sub-orchestrators only). */
function getOrchestratorSubSessions(
  sessions: DashboardSession[],
  orchestratorName: string,
): DashboardSession[] {
  return sessions.filter(
    (s) =>
      (s.metadata["orchestratorOwner"] === orchestratorName ||
        s.metadata["metaOwner"] === orchestratorName) &&
      (s.metadata["role"] === "orchestrator" || s.metadata["role"] === "meta-orchestrator"),
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
 * with their own session and any sub-orchestrators. Worker sessions spawned for
 * a project appear under that project, not here.
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
  const pathname = usePathname();
  const isFleet = pathname?.startsWith("/fleet") ?? false;
  const [startingOrch, setStartingOrch] = useState<Set<string>>(new Set());
  const [expandedOrchestrators, setExpandedOrchestrators] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Kill state — tracks in-flight kill requests
  const [killingSessionIds, setKillingSessionIds] = useState<Set<string>>(new Set());

  // Spawn form state — one orchestrator at a time
  const [spawnOrch, setSpawnOrch] = useState<string | null>(null);
  const [spawnProjectId, setSpawnProjectId] = useState("");
  const [spawnPrompt, setSpawnPrompt] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  useEffect(() => {
    if (showCreate) createInputRef.current?.focus();
  }, [showCreate]);

  // Auto-expand orchestrators whose own session or sub-sessions contain the active session
  useEffect(() => {
    if (!activeSessionId) return;
    const owning = orchestrators.find(
      (o) =>
        o.session?.id === activeSessionId ||
        getOrchestratorSubSessions(allSessions, o.name).some((s) => s.id === activeSessionId),
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

  const handleKillSession = async (sessionId: string) => {
    if (killingSessionIds.has(sessionId)) return;
    setKillingSessionIds((prev) => new Set(prev).add(sessionId));
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/kill`, { method: "POST" });
      router.refresh();
    } finally {
      setKillingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

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
        onNavigate(projectSessionPath(spawnProjectId, data.session.id));
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
        const isStarting = startingOrch.has(o.name);
        const isExpanded = expandedOrchestrators.has(o.name);
        const subSessions = getOrchestratorSubSessions(allSessions, o.name);
        // Dropdown: the orchestrator's own session first, then sub-orchestrators.
        const dropdownSessions: Array<{ session: DashboardSession; href: string }> = [];
        if (o.session) {
          dropdownSessions.push({
            session: o.session,
            href: orchestratorSessionPath(o.name, o.session.id),
          });
        }
        for (const s of subSessions) {
          dropdownSessions.push({ session: s, href: orchestratorSessionPath(o.name, s.id) });
        }

        return (
          <div key={o.name} className="project-sidebar__project">
            {/* Orchestrator row */}
            <div className="project-sidebar__proj-row flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (isFleet) {
                    router.push(`/fleet?orch=${encodeURIComponent(o.name)}`);
                    return;
                  }
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
                aria-expanded={isFleet ? undefined : isExpanded}
                aria-label={isFleet ? `Filter fleet by ${o.name}` : `Toggle ${o.name} sessions`}
              >
                <svg
                  className={cn(
                    "project-sidebar__proj-chevron",
                    !isFleet && isExpanded && "project-sidebar__proj-chevron--open",
                    isFleet && "opacity-0",
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
                {dropdownSessions.map(({ session, href }) => {
                  const isActive = activeSessionId === session.id;
                  const level = getAttentionLevel(session);
                  const title =
                    session.displayName ?? getSessionTitle(session) ?? session.id;
                  const isKilling = killingSessionIds.has(session.id);
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "project-sidebar__sess-row group",
                        isActive && "project-sidebar__sess-row--active",
                      )}
                    >
                      <a
                        href={href}
                        onClick={handleClick(href, session)}
                        className="project-sidebar__sess-link flex flex-1 min-w-0 items-center gap-[7px]"
                        aria-current={isActive ? "page" : undefined}
                        aria-label={`Open ${title}`}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleKillSession(session.id);
                        }}
                        disabled={isKilling}
                        className="project-sidebar__sess-rename-btn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                        title="Kill session"
                        aria-label={`Kill ${session.id}`}
                      >
                        {isKilling ? (
                          <span className="project-sidebar__orch-start-spinner" aria-hidden="true" />
                        ) : (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Spawn form / button */}
                {projects.length > 0 && (
                  spawnOrch === o.name ? (
                    <div className="project-sidebar__orch-create-form">
                      {/* Only show the project selector when there are multiple projects */}
                      {projects.length > 1 && (
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
                      )}
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
                            setSpawnProjectId("");
                          }}
                          className="project-sidebar__orch-create-cancel"
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
