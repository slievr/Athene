import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionCard } from "../SessionCard";
import { makeSession } from "../../__tests__/helpers";

describe("SessionCard project accent", () => {
  it("renders a project-color rail + name when an accent is provided, without inline styles", () => {
    const { container } = render(
      <SessionCard
        session={makeSession({ id: "web-1", status: "working", activity: "active" })}
        projectAccent={{ slot: 2, name: "Web App" }}
      />,
    );

    // Project name chip is rendered (never color alone).
    expect(screen.getByText("Web App")).toBeInTheDocument();
    // Left rail uses the project color var via a Tailwind arbitrary-value class.
    expect(container.querySelector('[class*="border-l-[color:var(--project-color-2)]"]')).toBeTruthy();
    // Project dot uses the palette bg var.
    expect(container.querySelector('[class*="var(--project-color-2)"]')).toBeTruthy();
    // No inline styles on the card root.
    const card = container.querySelector(".session-card");
    expect(card?.getAttribute("style")).toBeNull();
  });

  it("omits the accent when none is provided", () => {
    const { container } = render(
      <SessionCard session={makeSession({ id: "web-2", status: "working", activity: "active" })} />,
    );
    expect(container.querySelector('[class*="var(--project-color-"]')).toBeNull();
  });
});
