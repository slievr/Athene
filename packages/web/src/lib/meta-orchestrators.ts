import "server-only";

import {
  getMetaSessionsDir,
  readMetadataRaw,
  sessionFromMetadata,
  type OrchestratorConfig,
} from "@made-by-moonlight/athene-core";
import { sessionToDashboard } from "@/lib/serialize";
import type { SidebarMetaOrchestrator } from "@/components/SidebarOrchestrators";

/**
 * Build the sidebar's meta-orchestrator list from config: each configured meta
 * orchestrator name paired with its `_meta/<name>` session (if running). Meta
 * sessions live under the reserved `_meta` scope and are NOT in the
 * project-scoped session listing, so they are read directly here.
 */
export function listSidebarMetaOrchestrators(
  config: OrchestratorConfig,
): SidebarMetaOrchestrator[] {
  const names = Object.keys(config.metaOrchestrators ?? {});
  return names.map((name) => {
    const raw = readMetadataRaw(getMetaSessionsDir(name), name);
    const session = raw
      ? sessionToDashboard(
          sessionFromMetadata(name, raw, { sessionKind: "meta-orchestrator" }),
        )
      : null;
    return { name, session };
  });
}
