import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCallerType, isHumanCaller } from "../../src/lib/caller-context.js";

describe("getCallerType / isHumanCaller", () => {
  const originalEnv = process.env["AO_CALLER_TYPE"];

  beforeEach(() => {
    delete process.env["AO_CALLER_TYPE"];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["AO_CALLER_TYPE"];
    } else {
      process.env["AO_CALLER_TYPE"] = originalEnv;
    }
  });

  it("treats a meta orchestrator as a non-human (orchestrator) caller", () => {
    process.env["AO_CALLER_TYPE"] = "meta-orchestrator";
    expect(getCallerType()).toBe("orchestrator");
    expect(isHumanCaller()).toBe(false);
  });

  it("passes through orchestrator/agent/human verbatim", () => {
    process.env["AO_CALLER_TYPE"] = "orchestrator";
    expect(getCallerType()).toBe("orchestrator");
    process.env["AO_CALLER_TYPE"] = "agent";
    expect(getCallerType()).toBe("agent");
    process.env["AO_CALLER_TYPE"] = "human";
    expect(isHumanCaller()).toBe(true);
  });
});
