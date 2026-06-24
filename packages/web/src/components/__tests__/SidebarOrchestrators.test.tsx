import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarOrchestrators, type SidebarOrchestrator } from "@/components/SidebarOrchestrators";
import type { DashboardSession } from "@/lib/types";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const orchSession = {
  id: "orch-1",
  projectId: "_meta",
  status: "working",
  activity: "active",
} as unknown as DashboardSession;

describe("SidebarOrchestrators", () => {
  it("renders 'Orchestrators' label (not Parliament)", () => {
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: null }]}
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
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    const row = container.querySelector(".project-sidebar__orch-row");
    expect(row).toBeTruthy();
    expect(row!.querySelector(".sidebar-session-dot[data-level]")).toBeTruthy();
  });

  it("renders no activity dot for an orchestrator without a carried session", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "orch-1", session: null }]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    const row = container.querySelector(".project-sidebar__orch-row");
    expect(row).toBeTruthy();
    expect(row!.querySelector(".sidebar-session-dot")).toBeNull();
  });

  it("renders the collapsed glyph cluster without inline styles", () => {
    const { container } = render(
      <SidebarOrchestrators
        collapsed
        orchestrators={[{ name: "orch-1", session: orchSession }]}
        activeSessionId={undefined}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('a[href="/orchestrators/orch-1"]')).toBeTruthy();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("navigates on click", () => {
    const onNavigate = vi.fn();
    render(
      <SidebarOrchestrators
        collapsed={false}
        orchestrators={[{ name: "fleet", session: orchSession }]}
        activeSessionId={undefined}
        onNavigate={onNavigate}
      />,
    );
    screen.getByText("fleet").closest("a")!.click();
    expect(onNavigate).toHaveBeenCalledWith("/orchestrators/fleet", orchSession);
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
