import { describe, it, expect } from "vitest";
import {
  CONTEXT_WINDOW_WARN_PCT,
  formatTokenCount,
  formatContextWindowLabel,
  isContextWindowWarning,
} from "@/lib/context-window";

describe("formatTokenCount", () => {
  it("formats thousands and millions", () => {
    expect(formatTokenCount(145_000)).toBe("145k");
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(500)).toBe("500");
  });
});

describe("formatContextWindowLabel", () => {
  it("renders used / limit and rounded percentage", () => {
    expect(
      formatContextWindowLabel({ usedTokens: 145_000, limitTokens: 200_000, pct: 0.725 }),
    ).toBe("145k / 200k · 73%");
  });
});

describe("isContextWindowWarning", () => {
  it("warns strictly above the threshold", () => {
    expect(isContextWindowWarning({ usedTokens: 170_000, limitTokens: 200_000, pct: 0.85 })).toBe(
      true,
    );
  });

  it("does not warn at or below the threshold", () => {
    expect(
      isContextWindowWarning({
        usedTokens: 160_000,
        limitTokens: 200_000,
        pct: CONTEXT_WINDOW_WARN_PCT,
      }),
    ).toBe(false);
    expect(isContextWindowWarning({ usedTokens: 100_000, limitTokens: 200_000, pct: 0.5 })).toBe(
      false,
    );
  });
});
