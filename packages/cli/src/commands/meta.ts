import chalk from "chalk";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import {
  loadConfig,
  getGlobalConfigPath,
  generateMetaOrchestratorPrompt,
  getSessionMetaOwner,
  isTerminalSession,
  resolveInScopeProjectIds,
  type LoadedConfig,
  type OrchestratorConfig,
  type Session,
} from "@made-by-moonlight/athene-core";
import { getSessionManager } from "../lib/create-session-manager.js";

/**
 * Load the GLOBAL registry config for cross-project meta commands. Meta
 * orchestrators are configured in (and span) the global registry, so loading the
 * nearest flat-local `agent-orchestrator.yaml` would collapse `config.projects`
 * (and thus the meta catalog/scope) to just the cwd project — defeating
 * scope:all/discover from a project dir. Falls back to the local config only when
 * no global registry exists. Mirrors `athene stop`.
 */
export function loadMetaRegistryConfig(): LoadedConfig {
  const globalPath = getGlobalConfigPath();
  return existsSync(globalPath) ? loadConfig(globalPath) : loadConfig();
}

/**
 * Resolve which meta orchestrator a command targets. Pure — throws with an
 * actionable message rather than guessing.
 */
export function resolveMetaName(metaNames: string[], requested?: string): string {
  if (metaNames.length === 0) {
    throw new Error(
      "No meta orchestrators are configured. Add a `metaOrchestrators` block to your global config.",
    );
  }
  if (requested) {
    if (!metaNames.includes(requested)) {
      throw new Error(
        `Unknown meta orchestrator "${requested}". Configured: ${metaNames.join(", ")}`,
      );
    }
    return requested;
  }
  if (metaNames.length === 1) {
    return metaNames[0]!;
  }
  throw new Error(
    `Multiple meta orchestrators are configured (${metaNames.join(", ")}); specify one by name.`,
  );
}

export interface MetaSessionPartition {
  /** Workers this meta orchestrator owns (metaOwner === name). */
  owned: Session[];
  /** Live, collision-relevant peers in-scope owned by another coordinator. */
  peers: Session[];
}

/**
 * Split the portfolio session list into the meta orchestrator's own fleet and
 * the collision-relevant peers (live sessions in its in-scope projects owned by
 * someone else). Pure.
 */
export function partitionMetaSessions(
  sessions: Session[],
  metaName: string,
  inScopeProjectIds: string[],
): MetaSessionPartition {
  const inScope = new Set(inScopeProjectIds);
  const owned: Session[] = [];
  const peers: Session[] = [];
  for (const s of sessions) {
    if (isTerminalSession(s)) continue; // exclude dead/done from both, like peers
    if (getSessionMetaOwner(s) === metaName) {
      owned.push(s);
    } else if (inScope.has(s.projectId)) {
      peers.push(s);
    }
  }
  return { owned, peers };
}

function metaNames(config: OrchestratorConfig): string[] {
  return Object.keys(config.metaOrchestrators ?? {});
}

/**
 * Honest `discover` status line for `meta-status`. There is NO live auto-discovery
 * in v1: scope is resolved from the global registry at `meta-start`. A `discover:true`
 * config is acknowledged as having no effect, not as an active feature. Pure.
 */
export function formatDiscoverStatus(discover: boolean): string {
  const state = discover ? "requested (no effect in v1)" : "off";
  return `${state} — resolved at meta-start; re-run \`athene meta-start\` to refresh.`;
}

export function registerMeta(program: Command): void {
  program
    .command("meta-start <name>")
    .description("Start the named meta orchestrator (portfolio-scoped coordinator)")
    .action(async (name: string) => {
      const config = loadMetaRegistryConfig();
      const meta = config.metaOrchestrators?.[name];
      if (!meta) {
        console.error(
          chalk.red(
            `Unknown meta orchestrator "${name}". Configure it under metaOrchestrators in your global config.`,
          ),
        );
        process.exit(1);
      }

      try {
        const systemPrompt = generateMetaOrchestratorPrompt({ config, name });
        const sm = await getSessionManager(config);
        const session = await sm.ensureMetaOrchestrator({
          name,
          systemPrompt,
          agent: meta.agent,
        });
        const port = config.port ?? 3000;
        console.log(chalk.green(`✓ Meta orchestrator ready: ${session.id}`));
        console.log(chalk.dim(`  Dashboard: http://localhost:${port}/meta/${name}`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  program
    .command("meta-status [name]")
    .description("Show the worker fleet owned by a meta orchestrator")
    .action(async (name?: string) => {
      const config = loadMetaRegistryConfig();
      let resolved: string;
      try {
        resolved = resolveMetaName(metaNames(config), name);
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }

      const meta = config.metaOrchestrators![resolved]!;
      const sm = await getSessionManager(config);
      const all = await sm.list();
      const inScopeIds = resolveInScopeProjectIds(config, meta);
      const { owned, peers } = partitionMetaSessions(all, resolved, inScopeIds);

      console.log(chalk.bold(`\nMeta orchestrator: ${resolved}`));
      console.log(chalk.dim(`  Scope: ${inScopeIds.join(", ") || "(none)"}`));
      // Honest discover semantics (ath-rev-23): the in-scope set is resolved from
      // the global registry at `meta-start`; there is no live auto-discovery, so a
      // running orchestrator won't auto-join projects registered afterwards.
      console.log(chalk.dim(`  Discover: ${formatDiscoverStatus(meta.discover)}\n`));

      if (owned.length === 0) {
        console.log(chalk.dim("  No owned workers yet."));
      } else {
        console.log(chalk.bold(`  Owned workers (${owned.length}):`));
        for (const s of owned) {
          console.log(`    ${chalk.green(s.id)}  ${chalk.dim(`${s.projectId} · ${s.status}`)}`);
        }
      }

      if (peers.length > 0) {
        console.log(chalk.dim(`\n  Peers in scope (${peers.length}):`));
        for (const s of peers) {
          console.log(chalk.dim(`    ${s.id}  ${s.projectId} · ${s.status}`));
        }
      }
      console.log("");
    });
}
