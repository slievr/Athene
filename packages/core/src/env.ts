/**
 * Single source of truth for Athene environment variables.
 *
 * Every `ATHENE_*` environment variable name lives here — read sites, env-object
 * builders, and generated hook scripts all derive their names from {@link ENV}
 * so the prefix can never drift. Change {@link ENV_PREFIX} in exactly one place
 * to re-namespace the whole surface.
 *
 * Compatibility: `ATHENE_*` is the canonical/preferred prefix, but the legacy
 * `AO_*` prefix is still fully supported (a live `ao` fleet, existing `~/.ao/bin`
 * wrappers, and external scripts depend on it). The read side prefers
 * `ATHENE_*` and falls back to `AO_*`; the set side emits BOTH names so old and
 * new readers keep working. See {@link getEnvString} and
 * {@link withLegacyEnvAliases}.
 *
 * NOTE: This module is Node-only (it reads `process.env`). Browser / Next.js
 * client code must not import it — client-exposed values flow through the
 * `NEXT_PUBLIC_*` mechanism instead.
 */

/** Canonical/preferred prefix applied to every Athene environment variable. */
export const ENV_PREFIX = "ATHENE_";

/** Legacy prefix, retained for backward compatibility (read fallback + dual-set). */
export const LEGACY_ENV_PREFIX = "AO_";

/**
 * Canonical names for every Athene environment variable, keyed by a stable
 * logical name. Built from {@link ENV_PREFIX} so the prefix is defined once.
 */
export const ENV = {
  // -- Identity / session context (set on agent child processes) --
  /** Who is invoking the CLI: "human" | "orchestrator" | "agent" | "meta-orchestrator". */
  CALLER_TYPE: `${ENV_PREFIX}CALLER_TYPE`,
  /** Name of the owning orchestrator (set on orchestrator-spawned workers). */
  ORCHESTRATOR_NAME: `${ENV_PREFIX}ORCHESTRATOR_NAME`,
  /** @deprecated Use ORCHESTRATOR_NAME */
  META_NAME: `${ENV_PREFIX}META_NAME`,
  /** Session id exposed to the agent process (used by `ao report`, hooks, etc.). */
  SESSION_ID: `${ENV_PREFIX}SESSION_ID`,
  /** Internal session identifier passed to runtime children. */
  SESSION: `${ENV_PREFIX}SESSION`,
  /** User-facing session name. */
  SESSION_NAME: `${ENV_PREFIX}SESSION_NAME`,
  /** Tracker issue id associated with the session, if any. */
  ISSUE_ID: `${ENV_PREFIX}ISSUE_ID`,
  /** Project id the session belongs to. */
  PROJECT_ID: `${ENV_PREFIX}PROJECT_ID`,
  /** Orchestrator session id (used to suppress self-references in prompts). */
  ORCHESTRATOR_SESSION_ID: `${ENV_PREFIX}ORCHESTRATOR_SESSION_ID`,
  /** tmux session name when using the tmux runtime. */
  TMUX_NAME: `${ENV_PREFIX}TMUX_NAME`,
  /** Per-session sessions/metadata directory passed to children. */
  DATA_DIR: `${ENV_PREFIX}DATA_DIR`,

  // -- Config resolution --
  /** Explicit path to the project `agent-orchestrator.yaml`. */
  CONFIG_PATH: `${ENV_PREFIX}CONFIG_PATH`,
  /** Explicit path to the global config (`~/.agent-orchestrator/config.yaml`). */
  GLOBAL_CONFIG: `${ENV_PREFIX}GLOBAL_CONFIG`,
  /** Dashboard port. */
  PORT: `${ENV_PREFIX}PORT`,
  /** Public URL when AO is fronted by a reverse proxy. */
  PUBLIC_URL: `${ENV_PREFIX}PUBLIC_URL`,

  // -- Observability / tracing --
  /** Structured log level override. */
  LOG_LEVEL: `${ENV_PREFIX}LOG_LEVEL`,
  /** Mirror structured logs to stderr when truthy. */
  OBSERVABILITY_STDERR: `${ENV_PREFIX}OBSERVABILITY_STDERR`,
  /** When set, agent `gh` wrapper writes a trace; value is the trace file path. */
  AGENT_GH_TRACE: `${ENV_PREFIX}AGENT_GH_TRACE`,
  /** Destination file for AO-side `gh` traces. */
  GH_TRACE_FILE: `${ENV_PREFIX}GH_TRACE_FILE`,
  /** Enable verbose debug output. */
  DEBUG: `${ENV_PREFIX}DEBUG`,

  // -- Shell / process / runtime --
  /** Override shell resolution (PowerShell vs /bin/sh). */
  SHELL: `${ENV_PREFIX}SHELL`,
  /** Path to a bash executable for the Windows script runner. */
  BASH_PATH: `${ENV_PREFIX}BASH_PATH`,
  /** Override the resolved repo root for the script runner. */
  REPO_ROOT: `${ENV_PREFIX}REPO_ROOT`,
  /** Override the script layout ("source-checkout" | "package-install"). */
  SCRIPT_LAYOUT: `${ENV_PREFIX}SCRIPT_LAYOUT`,
  /** Development mode flag. */
  DEV: `${ENV_PREFIX}DEV`,
  /** Test mode flag (integration tests). */
  TEST: `${ENV_PREFIX}TEST`,
  /** Path to the node-pty spawn helper (web mux). */
  NODE_PTY_SPAWN_HELPER_PATH: `${ENV_PREFIX}NODE_PTY_SPAWN_HELPER_PATH`,
  /** Route the dashboard through the path-based mux single-port server. */
  PATH_BASED_MUX: `${ENV_PREFIX}PATH_BASED_MUX`,

  // -- Update / install --
  /** Skip the update notifier when set to "1". */
  NO_UPDATE_NOTIFIER: `${ENV_PREFIX}NO_UPDATE_NOTIFIER`,
  /** Run the installer non-interactively (set by /api/update). */
  NON_INTERACTIVE_INSTALL: `${ENV_PREFIX}NON_INTERACTIVE_INSTALL`,
  /** Git remote used by the source-checkout updater. */
  UPDATE_GIT_REMOTE: `${ENV_PREFIX}UPDATE_GIT_REMOTE`,
  /** Git branch used by the source-checkout updater (TS). */
  UPDATE_GIT_BRANCH: `${ENV_PREFIX}UPDATE_GIT_BRANCH`,
  /** Git branch used by the update shell scripts. */
  UPDATE_BRANCH: `${ENV_PREFIX}UPDATE_BRANCH`,

  // -- Plugin marketplace --
  /** Remote marketplace registry URL override. */
  PLUGIN_REGISTRY_URL: `${ENV_PREFIX}PLUGIN_REGISTRY_URL`,
  /** Local marketplace registry cache path override. */
  PLUGIN_REGISTRY_CACHE_PATH: `${ENV_PREFIX}PLUGIN_REGISTRY_CACHE_PATH`,

  // -- Desktop / notifier setup --
  /** Override the detected platform during desktop setup. */
  DESKTOP_SETUP_PLATFORM: `${ENV_PREFIX}DESKTOP_SETUP_PLATFORM`,
  /** Override the desktop app install path. */
  DESKTOP_APP_INSTALL_PATH: `${ENV_PREFIX}DESKTOP_APP_INSTALL_PATH`,
  /** Override the macOS notifier app path. */
  NOTIFIER_MACOS_APP_PATH: `${ENV_PREFIX}NOTIFIER_MACOS_APP_PATH`,

  // -- Feature flags / misc --
  /** Enable portfolio mode (default on; "0"/"false" disables). */
  ENABLE_PORTFOLIO: `${ENV_PREFIX}ENABLE_PORTFOLIO`,
  /** Command used by the review board to execute code reviews. */
  CODE_REVIEW_COMMAND: `${ENV_PREFIX}CODE_REVIEW_COMMAND`,
  /** Keep e2e artifacts instead of cleaning them up when set to "1". */
  E2E_KEEP_ARTIFACTS: `${ENV_PREFIX}E2E_KEEP_ARTIFACTS`,
  /** Override the doctor script temp root (tests). */
  DOCTOR_TMP_ROOT: `${ENV_PREFIX}DOCTOR_TMP_ROOT`,
} as const;

/** A logical environment-variable key (e.g. `"CALLER_TYPE"`). */
export type EnvKey = keyof typeof ENV;

/** A fully-qualified canonical Athene environment-variable name (e.g. `"ATHENE_CALLER_TYPE"`). */
export type EnvName = (typeof ENV)[EnvKey];

/**
 * Map a canonical `ATHENE_*` name to its legacy `AO_*` equivalent by swapping
 * the prefix (e.g. `ATHENE_CALLER_TYPE` → `AO_CALLER_TYPE`). Derived so the two
 * names can never drift apart.
 */
export function legacyEnvName(name: EnvName): string {
  return `${LEGACY_ENV_PREFIX}${name.slice(ENV_PREFIX.length)}`;
}

/**
 * Read an Athene environment variable, preferring the canonical `ATHENE_*` name
 * and falling back to the legacy `AO_*` name. An empty value on the canonical
 * name is treated as unset so the legacy value can still win.
 * Returns `undefined` if neither is set.
 */
export function getEnvString(name: EnvName): string | undefined {
  const primary = process.env[name];
  if (primary !== undefined && primary !== "") return primary;
  const legacy = process.env[legacyEnvName(name)];
  return legacy !== undefined && legacy !== "" ? legacy : primary;
}

/**
 * Read a flag that is considered enabled only when set to exactly "1", checking
 * the canonical `ATHENE_*` name first and the legacy `AO_*` name as a fallback.
 * Matches the historical `=== "1"` idiom used across the codebase.
 */
export function isEnvFlagEnabled(name: EnvName): boolean {
  return getEnvString(name) === "1";
}

/**
 * Return a copy of `env` with a legacy `AO_*` alias added for every canonical
 * `ATHENE_*` key, so child processes carry BOTH names. Old readers (the `ao`
 * fleet, existing `~/.ao/bin` wrappers, already-spawned sessions) keep working
 * while new code prefers `ATHENE_*`. Non-Athene keys are left untouched, and an
 * existing legacy key is never overwritten.
 */
export function withLegacyEnvAliases<T extends Record<string, string | undefined>>(
  env: T,
): T {
  const out: Record<string, string | undefined> = { ...env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || !key.startsWith(ENV_PREFIX)) continue;
    const legacy = `${LEGACY_ENV_PREFIX}${key.slice(ENV_PREFIX.length)}`;
    if (!(legacy in out)) out[legacy] = value;
  }
  return out as T;
}

/**
 * Bash parameter-expansion snippet that reads the canonical `ATHENE_*` variable
 * and falls back to the legacy `AO_*` variable (then empty). For use when
 * templating generated hook/wrapper scripts so their names can't drift.
 * e.g. `bashEnvRead(ENV.DATA_DIR)` → `${ATHENE_DATA_DIR:-${AO_DATA_DIR:-}}`.
 */
export function bashEnvRead(name: EnvName): string {
  return `\${${name}:-\${${legacyEnvName(name)}:-}}`;
}

/**
 * Node expression that reads the canonical `ATHENE_*` variable and falls back
 * to the legacy `AO_*` variable. For use when templating generated Node hook
 * scripts.
 * e.g. `nodeEnvRead(ENV.SESSION)` → `(process.env["ATHENE_SESSION"] ?? process.env["AO_SESSION"])`.
 */
export function nodeEnvRead(name: EnvName): string {
  return `(process.env[${JSON.stringify(name)}] ?? process.env[${JSON.stringify(legacyEnvName(name))}])`;
}
