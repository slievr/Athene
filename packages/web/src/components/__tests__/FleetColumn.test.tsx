import { render, screen } from "@testing-library/react";
import { FleetColumn } from "../FleetColumn";
import type { OrchestratorGroupData } from "../OrchestratorGroup";

vi.mock("../OrchestratorGroup", () => ({
  OrchestratorGroup: ({ group }: { group: OrchestratorGroupData }) => (
    <div data-testid="orch-group">{group.orchestratorName}</div>
  ),
}));

describe("FleetColumn", () => {
  it("renders the column title", () => {
    render(<FleetColumn title="Working" groups={[]} attentionLevel="working" />);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("renders an OrchestratorGroup for each group", () => {
    const groups: OrchestratorGroupData[] = [
      { parentSessionId: "a", orchestratorName: "alpha", spawnedAt: null, sessions: [] },
      { parentSessionId: "b", orchestratorName: "beta", spawnedAt: null, sessions: [] },
    ];
    render(<FleetColumn title="Working" groups={groups} attentionLevel="working" />);
    expect(screen.getAllByTestId("orch-group")).toHaveLength(2);
  });

  it("shows empty state when no groups", () => {
    render(<FleetColumn title="Done" groups={[]} attentionLevel="done" />);
    expect(screen.getByText(/no sessions/i)).toBeInTheDocument();
  });

  it("shows the total session count in the header", () => {
    const groups: OrchestratorGroupData[] = [
      {
        parentSessionId: "a",
        orchestratorName: "alpha",
        spawnedAt: null,
        sessions: [{} as never, {} as never],
      },
    ];
    render(<FleetColumn title="Working" groups={groups} attentionLevel="working" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
