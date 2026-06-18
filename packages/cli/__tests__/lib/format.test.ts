import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatAge,
  statusColor,
  header,
  banner,
  formatTokenCount,
  formatContextWindow,
  CONTEXT_WINDOW_WARN_PCT,
} from "../../src/lib/format.js";

describe("formatAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats seconds ago", () => {
    const thirtySecsAgo = Date.now() - 30_000;
    expect(formatAge(thirtySecsAgo)).toBe("30s ago");
  });

  it("formats minutes ago", () => {
    const fiveMinsAgo = Date.now() - 5 * 60_000;
    expect(formatAge(fiveMinsAgo)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    expect(formatAge(twoHoursAgo)).toBe("2h ago");
  });

  it("formats days ago", () => {
    const threeDaysAgo = Date.now() - 3 * 86400_000;
    expect(formatAge(threeDaysAgo)).toBe("3d ago");
  });

  it("handles zero difference", () => {
    expect(formatAge(Date.now())).toBe("0s ago");
  });
});

describe("statusColor", () => {
  it("returns colored string for known statuses", () => {
    // We just check it returns a non-empty string (chalk will wrap it)
    expect(statusColor("working")).toBeTruthy();
    expect(statusColor("idle")).toBeTruthy();
    expect(statusColor("ci_failed")).toBeTruthy();
    expect(statusColor("approved")).toBeTruthy();
    expect(statusColor("merged")).toBeTruthy();
    expect(statusColor("spawning")).toBeTruthy();
    expect(statusColor("killed")).toBeTruthy();
    expect(statusColor("needs_input")).toBeTruthy();
    expect(statusColor("pr_open")).toBeTruthy();
    expect(statusColor("review_pending")).toBeTruthy();
    expect(statusColor("changes_requested")).toBeTruthy();
  });

  it("returns the raw string for unknown statuses", () => {
    expect(statusColor("unknown_state")).toBe("unknown_state");
  });
});

describe("header", () => {
  it("returns multiline box drawing string", () => {
    const result = header("My Project");
    expect(result).toContain("My Project");
    // Should have 3 lines (top border, content, bottom border)
    const lines = result.split("\n");
    expect(lines.length).toBe(3);
  });
});

describe("banner", () => {
  it("returns multiline double-line box string", () => {
    const result = banner("STATUS");
    expect(result).toContain("STATUS");
    const lines = result.split("\n");
    expect(lines.length).toBe(3);
  });
});

describe("formatTokenCount", () => {
  it("renders thousands with a k suffix", () => {
    expect(formatTokenCount(145_000)).toBe("145k");
    expect(formatTokenCount(1_500)).toBe("2k"); // rounds
    expect(formatTokenCount(200_000)).toBe("200k");
  });

  it("renders millions with one decimal", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
  });

  it("renders small counts verbatim", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
  });
});

describe("formatContextWindow", () => {
  it("includes used/limit tokens and percentage", () => {
    const out = formatContextWindow({ usedTokens: 145_000, limitTokens: 200_000, pct: 0.725 });
    expect(out).toContain("ctx 145k/200k (73%)");
    expect(out).not.toContain("⚠");
  });

  it("prefixes a warning marker above the warn threshold", () => {
    const pct = CONTEXT_WINDOW_WARN_PCT + 0.05;
    const out = formatContextWindow({
      usedTokens: Math.round(pct * 200_000),
      limitTokens: 200_000,
      pct,
    });
    expect(out).toContain("⚠");
    expect(out).toContain("ctx");
  });

  it("does not warn exactly at the threshold (strictly greater triggers it)", () => {
    const out = formatContextWindow({
      usedTokens: Math.round(CONTEXT_WINDOW_WARN_PCT * 200_000),
      limitTokens: 200_000,
      pct: CONTEXT_WINDOW_WARN_PCT,
    });
    expect(out).not.toContain("⚠");
  });
});
