import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCallerType, isHumanCaller } from "../../src/lib/caller-context.js";

describe("getCallerType / isHumanCaller", () => {
  const originalEnv = process.env["ATHENE_CALLER_TYPE"];
  const originalLegacyEnv = process.env["AO_CALLER_TYPE"];

  beforeEach(() => {
    delete process.env["ATHENE_CALLER_TYPE"];
    delete process.env["AO_CALLER_TYPE"];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["ATHENE_CALLER_TYPE"];
    } else {
      process.env["ATHENE_CALLER_TYPE"] = originalEnv;
    }
    if (originalLegacyEnv === undefined) {
      delete process.env["AO_CALLER_TYPE"];
    } else {
      process.env["AO_CALLER_TYPE"] = originalLegacyEnv;
    }
  });

  it("treats a meta orchestrator as a non-human (orchestrator) caller", () => {
    process.env["ATHENE_CALLER_TYPE"] = "meta-orchestrator";
    expect(getCallerType()).toBe("orchestrator");
    expect(isHumanCaller()).toBe(false);
  });

  it("passes through orchestrator/agent/human verbatim", () => {
    process.env["ATHENE_CALLER_TYPE"] = "orchestrator";
    expect(getCallerType()).toBe("orchestrator");
    process.env["ATHENE_CALLER_TYPE"] = "agent";
    expect(getCallerType()).toBe("agent");
    process.env["ATHENE_CALLER_TYPE"] = "human";
    expect(isHumanCaller()).toBe(true);
  });

  it("falls back to the legacy AO_CALLER_TYPE when ATHENE_CALLER_TYPE is unset", () => {
    process.env["AO_CALLER_TYPE"] = "orchestrator";
    expect(getCallerType()).toBe("orchestrator");
    expect(isHumanCaller()).toBe(false);
  });

  it("prefers ATHENE_CALLER_TYPE over the legacy AO_CALLER_TYPE", () => {
    process.env["ATHENE_CALLER_TYPE"] = "agent";
    process.env["AO_CALLER_TYPE"] = "human";
    expect(getCallerType()).toBe("agent");
  });
});
