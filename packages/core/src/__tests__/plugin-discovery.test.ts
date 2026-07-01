import { describe, it, expect } from "vitest";
import { discoverPlugins } from "../plugin-discovery.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("discoverPlugins", () => {
  it("returns empty array when no directories exist", async () => {
    const result = await discoverPlugins(["/nonexistent/path"]);
    expect(result).toEqual([]);
  });

  it("loads a valid plugin from a search path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "athene-plugin-test-"));
    try {
      const pluginDir = join(dir, "athene-plugin-runtime-fake");
      mkdirSync(pluginDir);
      writeFileSync(
        join(pluginDir, "index.js"),
        `module.exports = { default: { manifest: { name: "fake", slot: "runtime", version: "0.0.1" }, create: () => ({}) } };`,
      );
      writeFileSync(
        join(pluginDir, "package.json"),
        JSON.stringify({ name: "athene-plugin-runtime-fake", main: "index.js" }),
      );

      const plugins = await discoverPlugins([dir]);
      expect(plugins).toHaveLength(1);
      expect(plugins[0].manifest.name).toBe("fake");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("skips directories that do not match the plugin naming convention", async () => {
    const dir = mkdtempSync(join(tmpdir(), "athene-skip-test-"));
    try {
      mkdirSync(join(dir, "not-a-plugin"));
      const plugins = await discoverPlugins([dir]);
      expect(plugins).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
