import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewTabBar } from "@/components/ViewTabBar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("ViewTabBar", () => {
  it("marks Dashboard tab active on /", () => {
    mockPathname = "/";
    render(<ViewTabBar />);

    const dashboardTab = screen.getByRole("link", { name: "Dashboard" });
    const fleetTab = screen.getByRole("link", { name: "Fleet" });

    expect(dashboardTab).toHaveAttribute("aria-current", "page");
    expect(fleetTab).not.toHaveAttribute("aria-current");
  });

  it("marks Fleet tab active on /fleet", () => {
    mockPathname = "/fleet";
    render(<ViewTabBar />);

    const dashboardTab = screen.getByRole("link", { name: "Dashboard" });
    const fleetTab = screen.getByRole("link", { name: "Fleet" });

    expect(fleetTab).toHaveAttribute("aria-current", "page");
    expect(dashboardTab).not.toHaveAttribute("aria-current");
  });

  it("Dashboard tab links to /", () => {
    mockPathname = "/";
    render(<ViewTabBar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
  });

  it("Fleet tab links to /fleet", () => {
    mockPathname = "/";
    render(<ViewTabBar />);
    expect(screen.getByRole("link", { name: "Fleet" })).toHaveAttribute("href", "/fleet");
  });
});
