import { describe, it, expect } from "vitest";
import { getMetaSessionsDir, getMetaSessionPath } from "../paths.js";

describe("meta session paths", () => {
  it("places meta sessions under projects/_meta/<name>/sessions", () => {
    expect(getMetaSessionsDir("meta-1").replace(/\\/g, "/")).toMatch(
      /projects\/_meta\/meta-1\/sessions$/,
    );
    expect(getMetaSessionPath("meta-1").replace(/\\/g, "/")).toMatch(
      /projects\/_meta\/meta-1\/sessions\/meta-1\.json$/,
    );
  });
});
