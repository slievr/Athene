/**
 * Backward-compat: `ao meta-start` forwards to `ao orchestrator start`.
 * Hidden so it doesn't appear in `ao --help`.
 *
 * @deprecated Use registerOrchestratorCommands from ./orchestrator.js
 */

import type { Command } from "commander";
import { registerOrchestratorCommands } from "./orchestrator.js";

// Re-export helpers used by existing tests so imports don't break.
export {
  loadOrchestratorRegistryConfig as loadMetaRegistryConfig,
  resolveMetaName,
  partitionMetaSessions,
  type MetaSessionPartition,
  type OrchestratorSessionPartition,
} from "./orchestrator.js";

export function registerMeta(program: Command): void {
  // Register the real commands under their canonical names.
  registerOrchestratorCommands(program);

  // Hidden alias: `ao meta-start <name>` → `ao orchestrator start <name>`.
  program
    .command("meta-start <name>", { hidden: true })
    .description("(deprecated) Use: ao orchestrator start")
    .allowUnknownOption()
    .action((name: string) => {
      console.warn(
        "\n⚠️  ao meta-start is deprecated. Use: ao orchestrator start\n",
      );
      program.parse(["orchestrator", "start", name], { from: "user" });
    });
}
