import { describe, it, expect } from "vitest";
import { metaDashboardPath } from "../routes";

describe("metaDashboardPath", () => {
  it("builds /meta/<name> and encodes the name", () => {
    expect(metaDashboardPath("meta-1")).toBe("/meta/meta-1");
    expect(metaDashboardPath("a b")).toBe("/meta/a%20b");
  });
});
