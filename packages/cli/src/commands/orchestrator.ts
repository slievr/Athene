import chalk from "chalk";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import {
  loadConfig,
  getGlobalConfigPath,
  generateOrchestratorPrompt,
  getSessionOrchestratorOwner,
  isTerminalSession,
  resolveInScopeProjectIds,
  type LoadedConfig,
  type OrchestratorConfig,
  type Session,
} from "@made-by-moonlight/athene-core";
import { getSessionManager } from "../lib/create-session-manager.js";

/**
 * Load the GLOBAL registry config for cross-project orchestrator commands.
 * Orchestrators are configured in (and span) the global registry, so loading
 * the nearest flat-local `agent-orchestrator.yaml` would collapse
 * `config.projects` (and thus the catalog/scope) to just the cwd project —
 * defeating scope:all/discover from a project dir. Falls back to local config
 * only when no global registry exists. Mirrors `athene stop`.
 */
export function loadOrchestratorRegistryConfig(): LoadedConfig {
  const globalPath = getGlobalConfigPath();
  return existsSync(globalPath) ? loadConfig(globalPath) : loadConfig();
}

/** @deprecated Use loadOrchestratorRegistryConfig */
export const loadMetaRegistryConfig = loadOrchestratorRegistryConfig;

/**
 * Resolve which orchestrator a command targets. Pure — throws with an
 * actionable message rather than guessing.
 */
export function resolveOrchestratorName(
  orchestratorNames: string[],
  requested?: string,
): string {
  if (orchestratorNames.length === 0) {
    throw new Error(
      "No orchestrators are configured. Add an `orchestrators` block to your global config.",
    );
  }
  if (requested) {
    if (!orchestratorNames.includes(requested)) {
      throw new Error(
        `Unknown orchestrator "${requested}". Configured: ${orchestratorNames.join(", ")}`,
      );
    }
    return requested;
  }
  if (orchestratorNames.length === 1) {
    return orchestratorNames[0]!;
  }
  throw new Error(
    `Multiple orchestrators are configured (${orchestratorNames.join(", ")}); specify one by name.`,
  );
}

/** @deprecated Use resolveOrchestratorName */
export function resolveMetaName(
  orchestratorNames: string[],
  requested?: string,
): string {
  return resolveOrchestratorName(orchestratorNames, requested);
}

export interface OrchestratorSessionPartition {
  /** Workers this orchestrator owns (orchestratorOwner === name). */
  owned: Session[];
  /** Live, collision-relevant peers in-scope owned by another coordinator. */
  peers: Session[];
}

/** @deprecated Use OrchestratorSessionPartition */
export type MetaSessionPartition = OrchestratorSessionPartition;

/**
 * Split the portfolio session list into the orchestrator's own fleet and
 * the collision-relevant peers (live sessions in its in-scope projects owned
 * by someone else). Pure.
 */
export function partitionOrchestratorSessions(
  sessions: Session[],
  orchestratorName: string,
  inScopeProjectIds: string[],
): OrchestratorSessionPartition {
  const inScope = new Set(inScopeProjectIds);
  const owned: Session[] = [];
  const peers: Session[] = [];
  for (const s of sessions) {
    if (isTerminalSession(s)) continue;
    if (getSessionOrchestratorOwner(s) === orchestratorName) {
      owned.push(s);
    } else if (inScope.has(s.projectId)) {
      peers.push(s);
    }
  }
  return { owned, peers };
}

/** @deprecated Use partitionOrchestratorSessions */
export function partitionMetaSessions(
  sessions: Session[],
  metaName: string,
  inScopeProjectIds: string[],
): OrchestratorSessionPartition {
  return partitionOrchestratorSessions(sessions, metaName, inScopeProjectIds);
}

function orchestratorNames(config: OrchestratorConfig): string[] {
  return Object.keys(config.orchestrators ?? config.metaOrchestrators ?? {});
}

export function registerOrchestratorCommands(program: Command): void {
  const orchestratorCmd = program
    .command("orchestrator")
    .description("Manage portfolio-scoped orchestrators");

  orchestratorCmd
    .command("start <name>")
    .description("Start the named orchestrator (portfolio-scoped coordinator)")
    .action(async (name: string) => {
      const config = loadOrchestratorRegistryConfig();
      const entry =
        config.orchestrators?.[name] ?? config.metaOrchestrators?.[name];
      if (!entry) {
        console.error(
          chalk.red(
            `Unknown orchestrator "${name}". Configure it under orchestrators in your global config.`,
          ),
        );
        process.exit(1);
      }

      try {
        const systemPrompt = generateOrchestratorPrompt({ config, name });
        const sm = await getSessionManager(config);
        const session = await sm.ensureOrchestrator({
          name,
          systemPrompt,
          agent: entry.agent,
        });
        const port = config.port ?? 3000;
        console.log(chalk.green(`✓ Orchestrator ready: ${session.id}`));
        console.log(
          chalk.dim(
            `  Dashboard: http://localhost:${port}/orchestrator/${name}`,
          ),
        );
      } catch (err) {
        console.error(
          chalk.red(
            `✗ ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }
    });

  orchestratorCmd
    .command("status [name]")
    .description("Show the worker fleet owned by an orchestrator")
    .action(async (name?: string) => {
      const config = loadOrchestratorRegistryConfig();
      let resolved: string;
      try {
        resolved = resolveOrchestratorName(orchestratorNames(config), name);
      } catch (err) {
        console.error(
          chalk.red(
            `✗ ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exit(1);
      }

      const entry =
        config.orchestrators![resolved] ?? config.metaOrchestrators![resolved];
      const sm = await getSessionManager(config);
      const all = await sm.list();
      const inScopeIds = resolveInScopeProjectIds(config, entry!);
      const { owned, peers } = partitionOrchestratorSessions(
        all,
        resolved,
        inScopeIds,
      );

      console.log(chalk.bold(`\nOrchestrator: ${resolved}`));
      console.log(chalk.dim(`  Scope: ${inScopeIds.join(", ") || "(none)"}\n`));

      if (owned.length === 0) {
        console.log(chalk.dim("  No owned workers yet."));
      } else {
        console.log(chalk.bold(`  Owned workers (${owned.length}):`));
        for (const s of owned) {
          console.log(
            `    ${chalk.green(s.id)}  ${chalk.dim(`${s.projectId} · ${s.status}`)}`,
          );
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
