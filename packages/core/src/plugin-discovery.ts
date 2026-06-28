import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PluginModule } from "./types.js";

const PLUGIN_PREFIX = "athene-plugin-";
const ENTRY_CANDIDATES = ["dist/index.js", "index.js"] as const;

function isValidPlugin(value: unknown): value is PluginModule<unknown> {
  const candidate = value as Partial<PluginModule<unknown>> | null | undefined;
  return Boolean(
    candidate?.manifest?.name && candidate.manifest.slot && typeof candidate.create === "function",
  );
}

function toPluginModule(value: unknown): PluginModule<unknown> | null {
  if (isValidPlugin(value)) return value;

  if (value && typeof value === "object" && "default" in value) {
    const inner = (value as { default?: unknown }).default;
    if (isValidPlugin(inner)) return inner;
    // Handle double-wrapped default (e.g. CJS module.exports = { default: pluginModule })
    if (inner && typeof inner === "object" && "default" in inner) {
      const innerDefault = (inner as { default?: unknown }).default;
      if (isValidPlugin(innerDefault)) return innerDefault;
    }
  }

  return null;
}

/** Resolve the entry file for a plugin directory, respecting package.json fields. */
function resolvePluginEntry(pluginPath: string): string | null {
  const pkgPath = join(pluginPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        exports?: unknown;
        module?: string;
        main?: string;
      };

      // exports["."].import or exports["."].default
      if (pkg.exports && typeof pkg.exports === "object") {
        const dot = (pkg.exports as Record<string, unknown>)["."];
        const importEntry =
          typeof dot === "string"
            ? dot
            : dot && typeof dot === "object"
              ? ((dot as Record<string, unknown>)["import"] as string | undefined) ??
                ((dot as Record<string, unknown>)["default"] as string | undefined)
              : undefined;
        if (importEntry) {
          const resolved = resolve(pluginPath, importEntry);
          if (existsSync(resolved)) return resolved;
        }
      }

      if (pkg.module) {
        const resolved = resolve(pluginPath, pkg.module);
        if (existsSync(resolved)) return resolved;
      }

      if (pkg.main) {
        const resolved = resolve(pluginPath, pkg.main);
        if (existsSync(resolved)) return resolved;
      }
    } catch {
      // fall through to candidates
    }
  }

  for (const candidate of ENTRY_CANDIDATES) {
    const entry = join(pluginPath, candidate);
    if (existsSync(entry)) return entry;
  }

  return null;
}

export async function discoverPlugins(searchPaths: string[]): Promise<PluginModule<unknown>[]> {
  const plugins: PluginModule<unknown>[] = [];

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    let entries: string[];
    try {
      entries = readdirSync(searchPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.startsWith(PLUGIN_PREFIX)) continue;

      const pluginPath = join(searchPath, entry);
      const entryFile = resolvePluginEntry(pluginPath);
      if (!entryFile) continue;

      try {
        const mod = toPluginModule(await import(pathToFileURL(entryFile).href));
        if (mod) {
          plugins.push(mod);
        }
      } catch (err) {
        console.warn(`[plugin-discovery] Failed to load ${entry}:`, err);
      }
    }
  }

  return plugins;
}

/** Returns the paths to scan for built-in plugins (the packages installed alongside core). */
export function getBuiltinPluginPaths(): string[] {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  // In an installed npm package, core lives at:
  //   node_modules/@made-by-moonlight/athene-core/dist/
  // Plugins live at:
  //   node_modules/@made-by-moonlight/athene-plugin-*/
  // so "../../../@made-by-moonlight" resolves to the scoped packages dir.
  //
  // In the monorepo during development, core source lives at:
  //   packages/core/src/ (or dist/)
  // Plugins live at:
  //   packages/cli/node_modules/@made-by-moonlight/
  // (pnpm workspace hoists plugin deps to the CLI's node_modules)
  return [
    join(thisDir, "../../../@made-by-moonlight"), // installed: node_modules/@made-by-moonlight
    join(thisDir, "../../cli/node_modules/@made-by-moonlight"), // monorepo dev: packages/cli/node_modules/@made-by-moonlight
  ];
}
