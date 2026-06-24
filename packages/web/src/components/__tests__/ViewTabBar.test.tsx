import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewTabBar } from "@/components/ViewTabBar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("ViewTabBar", () => {
  it("marks Agents tab active on /", () => {
    mockPathname = "/";
    render(<ViewTabBar />);

    const agentsTab = screen.getByRole("link", { name: "Agents" });
    const fleetTab = screen.getByRole("link", { name: "Fleet" });

    expect(agentsTab).toHaveAttribute("aria-current", "page");
    expect(fleetTab).not.toHaveAttribute("aria-current");
  });

  it("marks Fleet tab active on /fleet", () => {
    mockPathname = "/fleet";
    render(<ViewTabBar />);

    const agentsTab = screen.getByRole("link", { name: "Agents" });
    const fleetTab = screen.getByRole("link", { name: "Fleet" });

    expect(fleetTab).toHaveAttribute("aria-current", "page");
    expect(agentsTab).not.toHaveAttribute("aria-current");
  });

  it("Agents tab links to /", () => {
    mockPathname = "/";
    render(<ViewTabBar />);
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "/");
  });

  it("Fleet tab links to /fleet", () => {
    mockPathname = "/";
    render(<ViewTabBar />);
    expect(screen.getByRole("link", { name: "Fleet" })).toHaveAttribute("href", "/fleet");
  });
});
