import { render, screen, fireEvent } from "@testing-library/react";
import { FleetFilterBar, type OrchestratorChipData } from "../FleetFilterBar";

describe("FleetFilterBar", () => {
  const orchestrators: OrchestratorChipData[] = [
    { name: "fleet-meta", colorIndex: 0, spawnedAt: null },
    { name: "api-orch", colorIndex: 1, spawnedAt: null },
  ];

  it("renders All chip and one chip per orchestrator name", () => {
    render(
      <FleetFilterBar
        orchestrators={orchestrators}
        activeFilter={null}
        totalWorkers={5}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("fleet-meta")).toBeInTheDocument();
    expect(screen.getByText("api-orch")).toBeInTheDocument();
  });

  it("calls onFilterChange with null when All is clicked", () => {
    const onChange = vi.fn();
    render(
      <FleetFilterBar
        orchestrators={orchestrators}
        activeFilter="fleet-meta"
        totalWorkers={3}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onFilterChange with the name when a chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <FleetFilterBar
        orchestrators={orchestrators}
        activeFilter={null}
        totalWorkers={5}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("api-orch"));
    expect(onChange).toHaveBeenCalledWith("api-orch");
  });

  it("displays the worker count", () => {
    render(
      <FleetFilterBar
        orchestrators={[]}
        activeFilter={null}
        totalWorkers={7}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("7 workers")).toBeInTheDocument();
  });

  it("renders colored dot for each orchestrator chip", () => {
    const { container } = render(
      <FleetFilterBar
        orchestrators={[{ name: "fleet-meta", colorIndex: 3, spawnedAt: null }]}
        activeFilter={null}
        totalWorkers={2}
        onFilterChange={() => {}}
      />,
    );
    expect(container.querySelector(".orch-dot-3")).toBeInTheDocument();
  });

  it("renders relative timestamp when spawnedAt is provided", () => {
    const spawnedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    render(
      <FleetFilterBar
        orchestrators={[{ name: "fleet-meta", colorIndex: 0, spawnedAt }]}
        activeFilter={null}
        totalWorkers={1}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("2h ago")).toBeInTheDocument();
  });
});
