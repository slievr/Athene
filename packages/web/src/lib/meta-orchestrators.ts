import "server-only";

import {
  getMetaSessionsDir,
  readMetadataRaw,
  sessionFromMetadata,
  type Agent,
  type OrchestratorConfig,
  type PluginRegistry,
  type Session,
} from "@made-by-moonlight/athene-core";
import { sessionToDashboard } from "@/lib/serialize";
import type { DashboardOrchestratorLink } from "@/lib/types";
import type {
  SidebarMetaOrchestrator,
  SidebarProjectOrchestrator,
} from "@/components/SidebarOrchestrators";

/**
 * Probe whether a session's runtime is NOT definitely missing — conservative:
 * a probe failure returns true (don't claim dead). Mirrors the core relaunch
 * check used by ensureMetaOrchestrator.
 */
async function runtimeNotDefinitelyMissing(
  session: Session,
  agent: Agent | null,
): Promise<boolean> {
  if (!session.runtimeHandle || !agent) return false;
  try {
    return (await agent.isProcessRunning(session.runtimeHandle)) !== false;
  } catch {
    return true;
  }
}

/**
 * Build the sidebar's meta-orchestrator list from config: each configured meta
 * orchestrator name paired with its `_meta/<name>` session (if running). Meta
 * sessions live under the reserved `_meta` scope and are NOT supervised by the
 * lifecycle manager, so their persisted state can be stale — we probe the runtime
 * handle here and reflect a non-live (idle) activity when the runtime is gone,
 * rather than a glowing "working" dot.
 */
export async function listSidebarMetaOrchestrators(
  config: OrchestratorConfig,
  registry: PluginRegistry,
): Promise<SidebarMetaOrchestrator[]> {
  const names = Object.keys(config.metaOrchestrators ?? {});
  const result: SidebarMetaOrchestrator[] = [];
  for (const name of names) {
    const raw = readMetadataRaw(getMetaSessionsDir(name), name);
    if (!raw) {
      result.push({ name, session: null });
      continue;
    }
    const core = sessionFromMetadata(name, raw, {
      projectId: "_meta",
      sessionKind: "meta-orchestrator",
    });
    const agentName = config.metaOrchestrators?.[name]?.agent ?? config.defaults.agent;
    const agent = registry.get<Agent>("agent", agentName);
    const dash = sessionToDashboard(core);
    if (!(await runtimeNotDefinitelyMissing(core, agent))) {
      // Runtime is gone — show a non-live dot, not a stale "working" one.
      dash.activity = "idle";
      dash.status = "idle";
    }
    result.push({ name, session: dash });
  }
  return result;
}

/**
 * Build the sidebar's per-project orchestrator list, carrying each orchestrator's
 * ENRICHED session so its activity dot renders. The orchestrator sessions come
 * from the already-enriched session list (they are stripped from `/api/sessions`'
 * worker stream, so the client can't look them up there — finding ath-rev-12 #2).
 */
export function buildSidebarProjectOrchestrators(
  allSessions: Session[],
  links: DashboardOrchestratorLink[],
): SidebarProjectOrchestrator[] {
  return links.map((link) => {
    const core = allSessions.find((s) => s.id === link.id);
    return {
      id: link.id,
      projectId: link.projectId,
      session: core ? sessionToDashboard(core) : null,
    };
  });
}
