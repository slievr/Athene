import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { makeSession } from "@/__tests__/helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meta/meta-1",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Dashboard meta-board scope", () => {
  beforeEach(() => {
    global.EventSource = vi.fn(
      () =>
        ({ onmessage: null, onerror: null, close: vi.fn() }) as unknown as EventSource,
    );
    global.fetch = vi.fn();
  });

  it("shows only the meta orchestrator's owned fleet, not the whole portfolio", () => {
    // `useSessionEvents` seeds from initialSessions and (post-SSE) holds ALL
    // projects' sessions. With metaOwner set, the kanban must self-restrict to
    // metaOwner === "meta-1" — even though unowned sessions are in the list.
    render(
      <Dashboard
        metaOwner="meta-1"
        projects={[
          { id: "web", name: "Web", sessionPrefix: "web" },
          { id: "api", name: "Api", sessionPrefix: "api" },
        ]}
        initialSessions={[
          makeSession({
            id: "web-1",
            projectId: "web",
            ownerKind: "meta",
            metaOwner: "meta-1",
            summary: "Owned by meta-1",
          }),
          makeSession({
            id: "api-9",
            projectId: "api",
            ownerKind: "project",
            metaOwner: null,
            summary: "Project-owned peer",
          }),
          makeSession({
            id: "web-2",
            projectId: "web",
            ownerKind: "meta",
            metaOwner: "other-meta",
            summary: "Owned by a different meta",
          }),
        ]}
      />,
    );

    const board = document.querySelector(".kanban-board");
    expect(board).toBeTruthy();
    const boardText = board!.textContent ?? "";
    // Only the meta-1-owned session appears on the board.
    expect(boardText).toContain("web-1");
    expect(boardText).not.toContain("api-9");
    expect(boardText).not.toContain("web-2");
  });

  it("gives done/terminated cards a per-project accent on the meta board", () => {
    const { container } = render(
      <Dashboard
        metaOwner="meta-1"
        projects={[
          { id: "web", name: "Web", sessionPrefix: "web" },
          { id: "api", name: "Api", sessionPrefix: "api" },
        ]}
        initialSessions={[
          makeSession({
            id: "api-3",
            projectId: "api", // registration index 1 → palette slot 2
            ownerKind: "meta",
            metaOwner: "meta-1",
            status: "merged",
            activity: "exited",
            summary: "Finished api work",
          }),
        ]}
      />,
    );

    // The Done / Terminated section is collapsed by default — expand it.
    const toggle = container.querySelector(".done-bar__toggle");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);

    const doneCard = container.querySelector(".done-card");
    expect(doneCard).toBeTruthy();
    // Project name chip + slot-2 color var (api is registration index 1).
    expect(doneCard!.textContent).toContain("Api");
    expect(doneCard!.querySelector('[class*="var(--project-color-2)"]')).toBeTruthy();
  });
});
