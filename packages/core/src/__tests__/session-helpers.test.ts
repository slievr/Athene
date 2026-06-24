import { describe, it, expect } from "vitest";
import {
  isOrchestratorSession,
  isMetaOrchestratorSession,
  isCoordinatorSession,
  getSessionOrchestratorOwner,
  getSessionMetaOwner,
} from "../types.js";

const s = (metadata: Record<string, string>) => ({ id: "x-1", metadata });

describe("isOrchestratorSession (new: tolerant read)", () => {
  it("returns true for role='orchestrator' (new value)", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "orchestrator" } })).toBe(true);
  });
  it("returns true for role='meta-orchestrator' (legacy value)", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });
  it("returns false for a worker session", () => {
    expect(isOrchestratorSession({ id: "x", metadata: { role: "worker" } })).toBe(false);
  });
  it("returns false when no role metadata", () => {
    expect(isOrchestratorSession({ id: "x", metadata: {} })).toBe(false);
  });
});

describe("isCoordinatorSession", () => {
  it("returns true for orchestrator sessions", () => {
    expect(isCoordinatorSession({ id: "x", metadata: { role: "orchestrator" } })).toBe(true);
    expect(isCoordinatorSession({ id: "x", metadata: { role: "meta-orchestrator" } })).toBe(true);
  });
  it("returns false for workers", () => {
    expect(isCoordinatorSession({ id: "x", metadata: {} })).toBe(false);
  });
});

describe("getSessionOrchestratorOwner", () => {
  it("reads orchestratorOwner (new field)", () => {
    expect(getSessionOrchestratorOwner({ metadata: { orchestratorOwner: "alpha" } })).toBe("alpha");
  });
  it("falls back to metaOwner (legacy field)", () => {
    expect(getSessionOrchestratorOwner({ metadata: { metaOwner: "beta" } })).toBe("beta");
  });
  it("returns 'default' when neither field is set", () => {
    expect(getSessionOrchestratorOwner({ metadata: {} })).toBe("default");
  });
});

describe("meta session helpers (legacy)", () => {
  it("detects a meta orchestrator session", () => {
    expect(isMetaOrchestratorSession(s({ role: "meta-orchestrator" }))).toBe(true);
    expect(isMetaOrchestratorSession(s({ role: "orchestrator" }))).toBe(false);
    expect(isMetaOrchestratorSession(s({}))).toBe(false);
  });

  it("reads meta owner", () => {
    expect(getSessionMetaOwner(s({ metaOwner: "meta-1" }))).toBe("meta-1");
    expect(getSessionMetaOwner(s({}))).toBeNull();
  });
});
