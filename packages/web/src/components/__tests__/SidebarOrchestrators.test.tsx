import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarOrchestrators } from "@/components/SidebarOrchestrators";
import type { DashboardSession } from "@/lib/types";

const metaSession = {
  id: "meta-1",
  projectId: "_meta",
  status: "working",
  activity: "active",
} as unknown as DashboardSession;

const orchSession = {
  id: "web-orchestrator",
  projectId: "web",
  status: "working",
  activity: "active",
} as unknown as DashboardSession;

describe("SidebarOrchestrators", () => {
  it("renders Parliament label and meta/project sub-groups when both types present", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web", session: orchSession }]}
        registeredProjectIds={["web", "api"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );

    expect(screen.getByText("Parliament")).toBeInTheDocument();
    expect(screen.getByText("Meta")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("meta-1")).toBeInTheDocument();
    expect(container.querySelector('a[href="/meta/meta-1"]')).toBeTruthy();
    expect(screen.getByText("◆")).toBeInTheDocument();
    // web is registration index 0 → slot 1
    expect(container.querySelector('[class*="var(--project-color-1)"]')).toBeTruthy();
    // No inline styles.
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("renders Parliament label without sub-group headers when only one type present", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[]}
        registeredProjectIds={[]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );

    expect(screen.getByText("Parliament")).toBeInTheDocument();
    expect(screen.queryByText("Meta")).toBeNull();
    expect(screen.queryByText("Project")).toBeNull();
  });

  it("renders the per-project orchestrator activity dot from its CARRIED session", () => {
    // No meta orchestrators — only a project orchestrator. Its activity dot must
    // render from the carried session (not via the orchestrator-stripped list).
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web", session: orchSession }]}
        registeredProjectIds={["web"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    const row = container.querySelector(".project-sidebar__orch-row");
    expect(row).toBeTruthy();
    // The activity dot (reusing the existing data-level system) is present.
    expect(row!.querySelector(".sidebar-session-dot[data-level]")).toBeTruthy();
  });

  it("renders no activity dot for a project orchestrator without a carried session", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web", session: null }]}
        registeredProjectIds={["web"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    const row = container.querySelector(".project-sidebar__orch-row");
    expect(row).toBeTruthy();
    expect(row!.querySelector(".sidebar-session-dot")).toBeNull();
  });

  it("renders nothing when there are no orchestrators", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[]}
        orchestrators={[]}
        registeredProjectIds={[]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the collapsed glyph/dot cluster without inline styles", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[{ id: "web-orchestrator", projectId: "web", session: orchSession }]}
        registeredProjectIds={["web"]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('a[href="/meta/meta-1"]')).toBeTruthy();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("navigates on click", () => {
    const onNavigate = vi.fn();
    render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[]}
        registeredProjectIds={[]}
        activeSessionId={undefined}
        onNavigate={onNavigate}
      />,
    );
    screen.getByText("meta-1").closest("a")!.click();
    expect(onNavigate).toHaveBeenCalledWith("/meta/meta-1", metaSession);
  });
});
