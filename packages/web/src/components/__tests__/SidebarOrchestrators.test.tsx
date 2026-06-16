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

    expect(screen.getByText("meta-1")).toBeInTheDocument();
    expect(container.querySelector('a[href="/meta/meta-1"]')).toBeTruthy();
    expect(screen.getByText("◆")).toBeInTheDocument();
    // web is registration index 0 → slot 1
    expect(container.querySelector('[class*="var(--project-color-1)"]')).toBeTruthy();
    // Reuses the existing activity dot system (data-level present).
    expect(container.querySelector("[data-level]")).toBeTruthy();
    // No inline styles.
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("renders nothing when there are no orchestrators", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[]}
        orchestrators={[]}
        sessions={[]}
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

  it("navigates on click", () => {
    const onNavigate = vi.fn();
    render(
      <SidebarOrchestrators
        collapsed={false}
        metaOrchestrators={[{ name: "meta-1", session: metaSession }]}
        orchestrators={[]}
        sessions={[]}
        registeredProjectIds={[]}
        activeSessionId={undefined}
        onNavigate={onNavigate}
      />,
    );
    screen.getByText("meta-1").closest("a")!.click();
    expect(onNavigate).toHaveBeenCalledWith("/meta/meta-1", metaSession);
  });
});
