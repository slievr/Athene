"use client";

import { getProjectColor } from "@/lib/project-color";
import { getAttentionLevel, type DashboardSession } from "@/lib/types";
import { cn } from "@/lib/cn";
import { metaDashboardPath, projectSessionPath } from "@/lib/routes";

/** A meta orchestrator and its (optional) session, for the sidebar. */
export interface SidebarMetaOrchestrator {
  name: string;
  /** The meta orchestrator session (under projectId "_meta"), if running. */
  session: DashboardSession | null;
}

/** A per-project orchestrator link, same shape ProjectSidebar already sources. */
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

// Project-color dot classes keyed by palette slot. Spelled out (not interpolated)
// so the CSS var references are statically present for the bundler.
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
 * The ORCHESTRATORS sidebar section: meta orchestrators (◆) on top, a divider,
 * then per-project orchestrators (project-color dot). Each row carries a
 * right-aligned activity-state dot reusing the existing dot system. Renders a
 * compact glyph/dot cluster when the sidebar is collapsed.
 */
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
  const handleClick =
    (href: string, session?: DashboardSession) => (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      onNavigate(href, session ?? undefined);
    };

  if (collapsed) {
    return (
      <div className="project-sidebar__orch-collapsed flex flex-col items-center gap-1">
        {metaOrchestrators.map((m) => (
          <a
            key={m.name}
            href={metaDashboardPath(m.name)}
            onClick={handleClick(metaDashboardPath(m.name), m.session ?? undefined)}
            className="project-sidebar__orch-glyph"
            data-level={m.session ? getAttentionLevel(m.session) : undefined}
            title={`${m.name} (meta)`}
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
              onClick={handleClick(href, findSession(o.id) ?? undefined)}
              className={cn(
                "project-sidebar__orch-collapsed-dot shrink-0 rounded-full",
                PROJECT_DOT_CLASS[slot],
              )}
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
      <div className="project-sidebar__nav-label">
        <span>Orchestrators</span>
      </div>
      {metaOrchestrators.map((m) => {
        const href = metaDashboardPath(m.name);
        return (
          <a
            key={m.name}
            href={href}
            onClick={handleClick(href, m.session ?? undefined)}
            className={cn(
              "project-sidebar__orch-row",
              activeSessionId === m.name && "project-sidebar__orch-row--active",
            )}
            aria-label={`Open ${m.name} meta dashboard`}
          >
            <span className="project-sidebar__orch-glyph" aria-hidden="true">
              ◆
            </span>
            <span className="project-sidebar__orch-name min-w-0 flex-1">{m.name}</span>
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
            onClick={handleClick(href, session ?? undefined)}
            className={cn(
              "project-sidebar__orch-row",
              activeSessionId === o.id && "project-sidebar__orch-row--active",
            )}
            aria-label={`Open ${o.projectId} orchestrator`}
          >
            <span
              className={cn(
                "project-sidebar__orch-dot shrink-0 rounded-full",
                PROJECT_DOT_CLASS[slot],
              )}
              aria-hidden="true"
            />
            <span className="project-sidebar__orch-name min-w-0 flex-1">{o.projectId}</span>
            <ActivityDot session={session} />
          </a>
        );
      })}
    </div>
  );
}
