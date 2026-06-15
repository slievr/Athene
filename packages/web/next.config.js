import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const homeDir = os.homedir().replace(/\\/g, "/");
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@made-by-moonlight/athene-plugin-agent-claude-code",
    "@made-by-moonlight/athene-plugin-agent-codex",
    "@made-by-moonlight/athene-plugin-agent-opencode",
    "@made-by-moonlight/athene-plugin-runtime-tmux",
    "@made-by-moonlight/athene-plugin-scm-github",
    "@made-by-moonlight/athene-plugin-tracker-github",
    "@made-by-moonlight/athene-plugin-tracker-linear",
    "@made-by-moonlight/athene-plugin-workspace-worktree",
  ],
  serverExternalPackages: [
    "yaml",
    "zod",
    "@made-by-moonlight/athene-core",
    "better-sqlite3",
  ],
  webpack: (config, { isServer }) => {
    if (process.platform === "win32") {
      config.snapshot = {
        ...config.snapshot,
        managedPaths: [/^(.+?[\\/]node_modules[\\/])/],
      };
      // Prevent nft from globbing the home directory during server file tracing.
      // ao-core resolves paths like ~/.agent-orchestrator at runtime; nft tries to
      // scan them at build time and hits EPERM on Windows junction points
      // (e.g. C:\Users\<user>\Application Data).
      if (isServer) {
        const tracePlugin = config.plugins.find(
          (p) => p.constructor?.name === "TraceEntryPointsPlugin"
        );
        if (tracePlugin) {
          tracePlugin.traceIgnores = [
            ...(tracePlugin.traceIgnores ?? []),
            `${homeDir}/**`,
          ];
        }
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

// Only load bundle analyzer when ANALYZE=true (dev-only dependency)
let config = nextConfig;
if (process.env.ANALYZE === "true") {
  const { default: bundleAnalyzer } = await import("@next/bundle-analyzer");
  config = bundleAnalyzer({ enabled: true })(nextConfig);
}

export default config;
