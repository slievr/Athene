import { describe, it, expect } from "vitest";
import { getSessionParentId } from "../types.js";
import type { Session } from "../types.js";

function stubSession(metadata: Record<string, string> = {}): Pick<Session, "metadata"> {
  return { metadata };
}

describe("getSessionParentId", () => {
  it("returns parentSessionId from metadata", () => {
    expect(getSessionParentId(stubSession({ parentSessionId: "orch-abc-123" }))).toBe("orch-abc-123");
  });

  it("returns null when not present", () => {
    expect(getSessionParentId(stubSession({}))).toBeNull();
  });

  it("returns null when metadata is undefined", () => {
    expect(getSessionParentId({})).toBeNull();
  });
});
