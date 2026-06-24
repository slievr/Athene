import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getProjectRouteDataMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/project-route-data", () => ({
  getProjectRouteData: hoisted.getProjectRouteDataMock,
}));

import ProjectPage from "./page";

describe("ProjectPage", () => {
  it("renders project settings with name and id", async () => {
    hoisted.getProjectRouteDataMock.mockResolvedValue({
      projectId: "project-1",
      project: {
        name: "Project 1",
        path: "/tmp/project-1",
        defaultBranch: "main",
        sessionPrefix: "proj",
        repo: "owner/repo",
        agent: "claude-code",
        tracker: { plugin: "github" },
        scm: { plugin: "github" },
      },
      projects: [{ id: "project-1", name: "Project 1" }],
      degradedProject: null,
    });

    render(await ProjectPage({ params: Promise.resolve({ projectId: "project-1" }) }));

    expect(screen.getByText("Project 1")).toBeInTheDocument();
    expect(screen.getByText("project-1")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("/tmp/project-1")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
  });

  it("renders degraded project state when the project is degraded", async () => {
    hoisted.getProjectRouteDataMock.mockResolvedValue({
      projectId: "broken",
      project: null,
      projects: [{ id: "broken", name: "Broken" }],
      degradedProject: {
        projectId: "broken",
        path: "/tmp/broken",
        resolveError: "Local config failed validation",
      },
    });

    render(await ProjectPage({ params: Promise.resolve({ projectId: "broken" }) }));

    expect(screen.getByText("This project's config failed to load")).toBeInTheDocument();
    expect(screen.getByText("Local config failed validation")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Edit settings" })).not.toBeInTheDocument();
  });
});
