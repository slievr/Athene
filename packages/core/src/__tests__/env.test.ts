import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ENV,
  ENV_PREFIX,
  LEGACY_ENV_PREFIX,
  legacyEnvName,
  getEnvString,
  isEnvFlagEnabled,
  withLegacyEnvAliases,
  bashEnvRead,
  nodeEnvRead,
} from "../env.js";

describe("env module", () => {
  describe("constants + legacyEnvName", () => {
    it("uses ATHENE_ as canonical prefix and AO_ as legacy prefix", () => {
      expect(ENV_PREFIX).toBe("ATHENE_");
      expect(LEGACY_ENV_PREFIX).toBe("AO_");
      expect(ENV.SESSION_ID).toBe("ATHENE_SESSION_ID");
    });

    it("maps a canonical name to its legacy AO_ name by prefix swap", () => {
      expect(legacyEnvName(ENV.SESSION_ID)).toBe("AO_SESSION_ID");
      expect(legacyEnvName(ENV.CONFIG_PATH)).toBe("AO_CONFIG_PATH");
    });
  });

  describe("getEnvString dual-read", () => {
    const canonical = ENV.CONFIG_PATH;
    const legacy = legacyEnvName(canonical);

    beforeEach(() => {
      delete process.env[canonical];
      delete process.env[legacy];
    });
    afterEach(() => {
      delete process.env[canonical];
      delete process.env[legacy];
    });

    it("returns undefined when neither is set", () => {
      expect(getEnvString(canonical)).toBeUndefined();
    });

    it("prefers the canonical ATHENE_ value when set", () => {
      process.env[canonical] = "athene-value";
      process.env[legacy] = "ao-value";
      expect(getEnvString(canonical)).toBe("athene-value");
    });

    it("falls back to the legacy AO_ value when canonical is unset", () => {
      process.env[legacy] = "ao-value";
      expect(getEnvString(canonical)).toBe("ao-value");
    });

    it("falls back to the legacy AO_ value when canonical is empty", () => {
      process.env[canonical] = "";
      process.env[legacy] = "ao-value";
      expect(getEnvString(canonical)).toBe("ao-value");
    });
  });

  describe("isEnvFlagEnabled dual-read", () => {
    const canonical = ENV.DEBUG;
    const legacy = legacyEnvName(canonical);

    beforeEach(() => {
      delete process.env[canonical];
      delete process.env[legacy];
    });
    afterEach(() => {
      delete process.env[canonical];
      delete process.env[legacy];
    });

    it("is true when only the legacy AO_ flag is '1'", () => {
      process.env[legacy] = "1";
      expect(isEnvFlagEnabled(canonical)).toBe(true);
    });

    it("is true when the canonical ATHENE_ flag is '1'", () => {
      process.env[canonical] = "1";
      expect(isEnvFlagEnabled(canonical)).toBe(true);
    });

    it("is false when neither is set", () => {
      expect(isEnvFlagEnabled(canonical)).toBe(false);
    });
  });

  describe("withLegacyEnvAliases dual-set", () => {
    it("adds an AO_ alias for every ATHENE_ key", () => {
      const out: Record<string, string | undefined> = withLegacyEnvAliases({
        [ENV.SESSION_ID]: "s1",
        [ENV.ISSUE_ID]: "GH-1",
        PATH: "/usr/bin",
      });
      expect(out[ENV.SESSION_ID]).toBe("s1");
      expect(out["AO_SESSION_ID"]).toBe("s1");
      expect(out[ENV.ISSUE_ID]).toBe("GH-1");
      expect(out["AO_ISSUE_ID"]).toBe("GH-1");
      // Non-Athene keys are untouched and not aliased.
      expect(out["PATH"]).toBe("/usr/bin");
      expect(out["AO_PATH"]).toBeUndefined();
    });

    it("does not overwrite an existing legacy key", () => {
      const out: Record<string, string | undefined> = withLegacyEnvAliases({
        [ENV.SESSION_ID]: "new",
        AO_SESSION_ID: "preset",
      });
      expect(out["AO_SESSION_ID"]).toBe("preset");
    });
  });

  describe("template helpers", () => {
    it("bashEnvRead emits an ATHENE_-preferred, AO_-fallback expansion", () => {
      expect(bashEnvRead(ENV.DATA_DIR)).toBe("${ATHENE_DATA_DIR:-${AO_DATA_DIR:-}}");
    });

    it("nodeEnvRead emits an ATHENE_-preferred, AO_-fallback expression", () => {
      expect(nodeEnvRead(ENV.SESSION)).toBe(
        '(process.env["ATHENE_SESSION"] ?? process.env["AO_SESSION"])',
      );
    });
  });
});
