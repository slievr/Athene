import { describe, it, expect } from "vitest";
import { orchestratorDashboardPath, metaDashboardPath } from "../routes";

describe("orchestratorDashboardPath", () => {
  it("builds /orchestrators/<name> and encodes the name", () => {
    expect(orchestratorDashboardPath("orch-1")).toBe("/orchestrators/orch-1");
    expect(orchestratorDashboardPath("a b")).toBe("/orchestrators/a%20b");
  });
});

describe("metaDashboardPath (deprecated alias)", () => {
  it("delegates to orchestratorDashboardPath", () => {
    expect(metaDashboardPath("meta-1")).toBe("/orchestrators/meta-1");
    expect(metaDashboardPath("a b")).toBe("/orchestrators/a%20b");
  });
});
