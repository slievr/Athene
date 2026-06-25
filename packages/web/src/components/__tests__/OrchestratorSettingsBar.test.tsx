import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrchestratorSettingsBar } from "@/components/OrchestratorSettingsBar";

const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

const defaultProps = {
  orchId: "orch-123",
  currentLabel: "My Orchestrator",
  currentScope: "all" as const,
  currentDiscover: true,
  projects: [
    { id: "proj-a", name: "Project Alpha", path: "/home/user/alpha" },
    { id: "proj-b", name: "Project Beta", path: "/home/user/beta" },
  ],
  sessionCount: 3,
};

describe("OrchestratorSettingsBar", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  it("renders the display name", () => {
    render(<OrchestratorSettingsBar {...defaultProps} />);
    expect(screen.getByText("My Orchestrator")).toBeInTheDocument();
  });

  it("clicking the name button enters edit mode (input appears)", () => {
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "My Orchestrator" }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My Orchestrator")).toBeInTheDocument();
  });

  it("pressing Escape in the input cancels and restores original name", () => {
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "My Orchestrator" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Changed Name" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("My Orchestrator")).toBeInTheDocument();
  });

  it("the delete button shows the confirmation strip when clicked", () => {
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete orchestrator/i }));
    expect(screen.getByText(/kill 3 sessions and remove\?/i)).toBeInTheDocument();
  });

  it("the confirmation strip shows the correct session count", () => {
    render(<OrchestratorSettingsBar {...defaultProps} sessionCount={5} />);
    fireEvent.click(screen.getByRole("button", { name: /delete orchestrator/i }));
    expect(screen.getByText(/kill 5 sessions and remove\?/i)).toBeInTheDocument();
  });

  it("cancel in the confirmation strip hides the confirmation strip", () => {
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete orchestrator/i }));
    expect(screen.getByText(/kill 3 sessions/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/kill 3 sessions/i)).toBeNull();
  });

  it("the scope pill shows 'All directories' when scope is 'all'", () => {
    render(<OrchestratorSettingsBar {...defaultProps} currentScope="all" />);
    expect(screen.getByText("All directories")).toBeInTheDocument();
  });

  it("the scope pill shows 'N directories' when scope is an array", () => {
    render(
      <OrchestratorSettingsBar
        {...defaultProps}
        currentScope={["/home/user/alpha", "/home/user/beta"]}
      />,
    );
    expect(screen.getByText("2 directories")).toBeInTheDocument();
  });

  it("reverts name on failed save", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "My Orchestrator" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByText("My Orchestrator")).toBeInTheDocument();
    });
  });

  it("handles failed delete by hiding confirmation strip", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    render(<OrchestratorSettingsBar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete orchestrator/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/kill 3 sessions/i)).toBeNull();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
