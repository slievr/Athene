import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dashboardUrl } from "../../src/lib/dashboard-url.js";

describe("dashboardUrl", () => {
  const original = process.env.ATHENE_PUBLIC_URL;
  const originalLegacy = process.env.AO_PUBLIC_URL;

  beforeEach(() => {
    delete process.env.ATHENE_PUBLIC_URL;
    delete process.env.AO_PUBLIC_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ATHENE_PUBLIC_URL;
    } else {
      process.env.ATHENE_PUBLIC_URL = original;
    }
    if (originalLegacy === undefined) {
      delete process.env.AO_PUBLIC_URL;
    } else {
      process.env.AO_PUBLIC_URL = originalLegacy;
    }
  });

  it("falls back to localhost when ATHENE_PUBLIC_URL is unset", () => {
    expect(dashboardUrl(3000)).toBe("http://localhost:3000");
  });

  it("falls back to localhost when ATHENE_PUBLIC_URL is empty", () => {
    process.env.ATHENE_PUBLIC_URL = "";
    expect(dashboardUrl(8094)).toBe("http://localhost:8094");
  });

  it("falls back to localhost when ATHENE_PUBLIC_URL is whitespace only", () => {
    process.env.ATHENE_PUBLIC_URL = "   ";
    expect(dashboardUrl(8094)).toBe("http://localhost:8094");
  });

  it("uses ATHENE_PUBLIC_URL when set", () => {
    process.env.ATHENE_PUBLIC_URL = "https://ao.example.com";
    expect(dashboardUrl(3000)).toBe("https://ao.example.com");
  });

  it("ignores the port argument when ATHENE_PUBLIC_URL is set", () => {
    process.env.ATHENE_PUBLIC_URL = "https://ao.example.com";
    expect(dashboardUrl(3000)).toBe("https://ao.example.com");
    expect(dashboardUrl(8094)).toBe("https://ao.example.com");
  });

  it("strips a trailing slash from ATHENE_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "https://ao.example.com/";
    expect(dashboardUrl(3000)).toBe("https://ao.example.com");
  });

  it("strips multiple trailing slashes from ATHENE_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "https://ao.example.com///";
    expect(dashboardUrl(3000)).toBe("https://ao.example.com");
  });

  it("preserves a sub-path in ATHENE_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "https://example.com/ao";
    expect(dashboardUrl(3000)).toBe("https://example.com/ao");
  });

  it("trims surrounding whitespace from ATHENE_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "  https://ao.example.com  ";
    expect(dashboardUrl(3000)).toBe("https://ao.example.com");
  });

  it("supports a non-default port in ATHENE_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "http://192.168.1.5:9000";
    expect(dashboardUrl(3000)).toBe("http://192.168.1.5:9000");
  });

  it("falls back to the legacy AO_PUBLIC_URL when ATHENE_PUBLIC_URL is unset", () => {
    process.env.AO_PUBLIC_URL = "https://legacy.example.com";
    expect(dashboardUrl(3000)).toBe("https://legacy.example.com");
  });

  it("prefers ATHENE_PUBLIC_URL over the legacy AO_PUBLIC_URL", () => {
    process.env.ATHENE_PUBLIC_URL = "https://new.example.com";
    process.env.AO_PUBLIC_URL = "https://legacy.example.com";
    expect(dashboardUrl(3000)).toBe("https://new.example.com");
  });
});
