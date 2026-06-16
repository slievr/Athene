import { describe, it, expect } from "vitest";
import { checkSpawnCollision, formatHardRefusal } from "../spawn-collision.js";
import type { Session } from "../types.js";

const session = (over: Partial<Session>): Session =>
  ({ id: "web-2", projectId: "web", issueId: null, status: "working", metadata: {}, ...over }) as Session;

describe("checkSpawnCollision", () => {
  it("hard-refuses when a live session already owns the issue (any owner)", () => {
    const live = [session({ id: "web-2", issueId: "ENG-42", metadata: { ownerKind: "project" } })];
    const r = checkSpawnCollision(live, { projectId: "web", issueId: "ENG-42" });
    expect(r.hard?.id).toBe("web-2");
  });

  it("does not hard-refuse when issues differ", () => {
    const live = [session({ issueId: "ENG-1" })];
    expect(checkSpawnCollision(live, { projectId: "web", issueId: "ENG-42" }).hard).toBeNull();
  });

  it("hard-refuses case-variant issue IDs (ENG-42 vs eng-42)", () => {
    const live = [session({ id: "web-2", issueId: "ENG-42" })];
    expect(checkSpawnCollision(live, { projectId: "web", issueId: "eng-42" }).hard?.id).toBe(
      "web-2",
    );
    const live2 = [session({ id: "web-3", issueId: "eng-42" })];
    expect(checkSpawnCollision(live2, { projectId: "web", issueId: "ENG-42" }).hard?.id).toBe(
      "web-3",
    );
  });

  it("returns advisory peers for freeform work (no issueId)", () => {
    const live = [session({ id: "web-3" }), session({ id: "web-4" })];
    const r = checkSpawnCollision(live, { projectId: "web" });
    expect(r.hard).toBeNull();
    expect(r.advisory.map((s) => s.id)).toEqual(["web-3", "web-4"]);
  });

  it("returns empty when there are no live peers", () => {
    const r = checkSpawnCollision([], { projectId: "web", issueId: "ENG-42" });
    expect(r.hard).toBeNull();
    expect(r.advisory).toEqual([]);
  });

  it("ignores sessions in other projects", () => {
    const live = [session({ id: "api-1", projectId: "api", issueId: "ENG-42" })];
    const r = checkSpawnCollision(live, { projectId: "web", issueId: "ENG-42" });
    expect(r.hard).toBeNull();
    expect(r.advisory).toEqual([]);
  });

  it("formats a hard refusal message", () => {
    const existing = session({ id: "web-2", issueId: "ENG-42", status: "pr_open", metadata: { ownerKind: "project" } });
    expect(formatHardRefusal(existing)).toBe(
      "SPAWN REFUSED: web-2 already owns ENG-42 (owner=project, status=pr_open)",
    );
  });
});
