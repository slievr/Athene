import type { Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const rawMarkdown: Plugin = {
  name: "raw-markdown",
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js",
      };
    });
  },
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "activity-log": "src/activity-log.ts",
    config: "src/config.ts",
    "lifecycle-manager": "src/lifecycle-manager.ts",
    metadata: "src/metadata.ts",
    observability: "src/observability.ts",
    "orchestrator-prompt": "src/orchestrator-prompt.ts",
    paths: "src/paths.ts",
    "plugin-registry": "src/plugin-registry.ts",
    types: "src/types.ts",
    utils: "src/utils.ts",
    "scm-webhook-utils": "src/scm-webhook-utils.ts",
    "session-manager": "src/session-manager.ts",
    "migration/storage-v2": "src/migration/storage-v2.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["better-sqlite3"],
  esbuildPlugins: [rawMarkdown],
});
