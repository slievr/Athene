import { describe, it, expect } from "vitest";
import {
  isMetaOrchestratorSession,
  isCoordinatorSession,
  getSessionOwnerKind,
  getSessionMetaOwner,
} from "../types.js";

const s = (metadata: Record<string, string>) => ({ id: "x-1", metadata });

describe("meta session helpers", () => {
  it("detects a meta orchestrator session", () => {
    expect(isMetaOrchestratorSession(s({ role: "meta-orchestrator" }))).toBe(true);
    expect(isMetaOrchestratorSession(s({ role: "orchestrator" }))).toBe(false);
    expect(isMetaOrchestratorSession(s({}))).toBe(false);
  });

  it("treats both orchestrator and meta orchestrator as coordinators", () => {
    expect(isCoordinatorSession(s({ role: "meta-orchestrator" }))).toBe(true);
    expect(isCoordinatorSession(s({ role: "orchestrator" }))).toBe(true);
    expect(isCoordinatorSession(s({ role: "worker" }))).toBe(false);
  });

  it("defaults ownerKind to project and reads meta owner", () => {
    expect(getSessionOwnerKind(s({}))).toBe("project");
    expect(getSessionOwnerKind(s({ ownerKind: "meta" }))).toBe("meta");
    expect(getSessionMetaOwner(s({ metaOwner: "meta-1" }))).toBe("meta-1");
    expect(getSessionMetaOwner(s({}))).toBeNull();
  });
});
