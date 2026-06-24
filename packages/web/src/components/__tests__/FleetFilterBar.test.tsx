import { render, screen, fireEvent } from "@testing-library/react";
import { FleetFilterBar } from "../FleetFilterBar";

describe("FleetFilterBar", () => {
  const names = ["fleet-meta", "api-orch"];

  it("renders All chip and one chip per orchestrator name", () => {
    render(
      <FleetFilterBar
        orchestratorNames={names}
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
        orchestratorNames={names}
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
        orchestratorNames={names}
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
        orchestratorNames={[]}
        activeFilter={null}
        totalWorkers={7}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("7 workers")).toBeInTheDocument();
  });
});
