import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextWindowBadge } from "@/components/ContextWindowBadge";

describe("ContextWindowBadge", () => {
  it("renders nothing when context window is unavailable", () => {
    const { container } = render(<ContextWindowBadge contextWindow={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders occupancy label without a warning under the threshold", () => {
    render(
      <ContextWindowBadge
        contextWindow={{ usedTokens: 100_000, limitTokens: 200_000, pct: 0.5 }}
      />,
    );
    expect(screen.getByText("100k / 200k · 50%")).toBeInTheDocument();
    expect(screen.queryByText("⚠")).not.toBeInTheDocument();
  });

  it("shows a warning marker and error tint above the threshold", () => {
    const { container } = render(
      <ContextWindowBadge
        contextWindow={{ usedTokens: 180_000, limitTokens: 200_000, pct: 0.9 }}
      />,
    );
    expect(screen.getByText("180k / 200k · 90%")).toBeInTheDocument();
    expect(screen.getByText("⚠")).toBeInTheDocument();
    const badge = container.querySelector("[data-warning]");
    expect(badge).not.toBeNull();
  });
});
