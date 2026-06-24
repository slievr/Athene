import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarOrchestrators, type SidebarOrchestrator } from "@/components/SidebarOrchestrators";
import type { DashboardSession } from "@/lib/types";
import type { ProjectInfo } from "@/lib/project-name";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const orchSession = {
  id: "orch-1",
  projectId: "_meta",
  status: "working",
  activity: "active",
  metadata: {},
} as unknown as DashboardSession;

const noProjects: ProjectInfo[] = [];
const someProjects: ProjectInfo[] = [
  { id: "proj-a", name: "Project A" } as ProjectInfo,
];

describe("SidebarOrchestrators", () => {
  it("renders 'Orchestrators' label (not Parliament)", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: null }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText("Orchestrators")).toBeInTheDocument();
    expect(screen.queryByText("Parliament")).not.toBeInTheDocument();
  });

  it("renders flat list without Meta/Project sub-headers", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[
          { name: "alpha", session: null },
          { name: "beta", session: null },
        ]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(screen.queryByText("Meta")).not.toBeInTheDocument();
    expect(screen.queryByText("Project")).not.toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("renders 'Orchestrators' label with create button when there are no orchestrators", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText("Orchestrators")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new orchestrator/i })).toBeInTheDocument();
  });

  it("renders the ◆ glyph for each orchestrator row", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getAllByText("◆").length).toBeGreaterThan(0);
  });

  it("links to /orchestrators/<name> for each row", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('a[href="/orchestrators/fleet"]')).toBeTruthy();
  });

  it("renders no inline styles", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("renders the activity dot from the carried session", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector(".sidebar-session-dot[data-level]")).toBeTruthy();
  });

  it("renders no activity dot for an orchestrator without a carried session", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: null }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector(".sidebar-session-dot")).toBeNull();
  });

  it("renders the collapsed glyph cluster without inline styles", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed
        orchestrators={[{ name: "orch-1", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    // When a session is running the collapsed glyph links directly to the session terminal.
    expect(container.querySelector('a[href="/orchestrators/orch-1/sessions/orch-1"]')).toBeTruthy();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("collapsed glyph links to fleet dashboard when session is null", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed
        orchestrators={[{ name: "orch-1", session: null }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('a[href="/orchestrators/orch-1"]')).toBeTruthy();
  });

  it("navigates to fleet dashboard when fleet link is clicked", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={onNavigate}
      />,
    );
    const fleetLink = container.querySelector('a[href="/orchestrators/fleet"]') as HTMLAnchorElement;
    expect(fleetLink).toBeTruthy();
    fleetLink.click();
    expect(onNavigate).toHaveBeenCalledWith("/orchestrators/fleet", orchSession);
  });

  it("expands to show session list when chevron is clicked", () => {
    const workerSession = {
      id: "worker-1",
      projectId: "proj-a",
      status: "working",
      activity: "active",
      displayName: "My Worker",
      metadata: { orchestratorOwner: "fleet" },
    } as unknown as DashboardSession;

    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[workerSession]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );

    // Initially not expanded
    expect(screen.queryByText("My Worker")).not.toBeInTheDocument();

    // Click the toggle button (contains ◆ and "fleet")
    fireEvent.click(screen.getByRole("button", { name: /toggle fleet sessions/i }));

    // Now the session should be visible
    expect(screen.getByText("My Worker")).toBeInTheDocument();
  });

  it("shows '+ New session' button when expanded and projects exist", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[]}
        projects={someProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /toggle fleet sessions/i }));
    expect(screen.getByText("+ New session")).toBeInTheDocument();
  });

  it("does not show '+ New session' when no projects configured", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        allSessions={[]}
        projects={noProjects}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /toggle fleet sessions/i }));
    expect(screen.queryByText("+ New session")).not.toBeInTheDocument();
  });

  describe("start button on orchestrator rows", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => ({ sessionId: "orch-xyz" }) })),
      );
    });

    it("renders a start button when session is null", () => {
      render(
        <SidebarOrchestrators
          collapsed={false}
          orchestrators={[{ name: "fleet", session: null }]}
          allSessions={[]}
          projects={noProjects}
          activeSessionId={undefined}
          onNavigate={() => {}}
        />,
      );
      expect(screen.getByRole("button", { name: /start fleet/i })).toBeInTheDocument();
    });

    it("does not render a start button when session exists", () => {
      render(
        <SidebarOrchestrators
          collapsed={false}
          orchestrators={[{ name: "fleet", session: orchSession }]}
          allSessions={[]}
          projects={noProjects}
          activeSessionId={undefined}
          onNavigate={() => {}}
        />,
      );
      expect(screen.queryByRole("button", { name: /start fleet/i })).toBeNull();
    });

    it("calls the start API and refreshes when start button is clicked", async () => {
      render(
        <SidebarOrchestrators
          collapsed={false}
          orchestrators={[{ name: "fleet", session: null }]}
          allSessions={[]}
          projects={noProjects}
          activeSessionId={undefined}
          onNavigate={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /start fleet/i }));

      await waitFor(() => {
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
          "/api/orchestrators/fleet/start",
          { method: "POST" },
        );
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it("does not render a start button in the collapsed sidebar view", () => {
      render(
        <SidebarOrchestrators
          collapsed
          orchestrators={[{ name: "fleet", session: null }]}
          allSessions={[]}
          projects={noProjects}
          activeSessionId={undefined}
          onNavigate={() => {}}
        />,
      );
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});

// Verify the type alias still works (compile-time check)
const _typeCheck: SidebarOrchestrator = { name: "test", session: null };
void _typeCheck;
