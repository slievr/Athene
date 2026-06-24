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
