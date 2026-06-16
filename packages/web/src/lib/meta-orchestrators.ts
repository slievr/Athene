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

/** Default per-meta liveness-probe budget on the SSR hot path. */
const META_PROBE_TIMEOUT_MS = 3_000;

/**
 * Probe whether a session's runtime is NOT definitely missing — conservative:
 * a probe failure returns true (don't claim dead). Mirrors the core relaunch
 * check used by ensureMetaOrchestrator. BOUNDED: for tmux this shells out to
 * ps/tmux, which can hang on an unresponsive server or stale handle; this runs on
 * the dashboard SSR hot path, so the probe is raced against a timeout. A timeout
 * is treated as UNCERTAIN → returns true (keep the live dot), consistent with the
 * catch-returns-true behavior, rather than stalling the whole render.
 * (`settlesWithin` can't be reused here — it returns only whether the promise
 * settled, not the probe's boolean result.)
 */
async function runtimeNotDefinitelyMissing(
  session: Session,
  agent: Agent | null,
  timeoutMs: number,
): Promise<boolean> {
  if (!session.runtimeHandle || !agent) return false;
  const handle = session.runtimeHandle;
  const probe = (async () => {
    try {
      return (await agent.isProcessRunning(handle)) !== false;
    } catch {
      return true;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  try {
    return await Promise.race([probe, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
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
  probeTimeoutMs: number = META_PROBE_TIMEOUT_MS,
): Promise<SidebarMetaOrchestrator[]> {
  const names = Object.keys(config.metaOrchestrators ?? {});
  // Probe all metas CONCURRENTLY under a bounded per-probe deadline, so a single
  // hung tmux/ps probe can't stall the dashboard SSR render (total ≈ slowest
  // probe, capped at probeTimeoutMs — not the sum of sequential probes).
  return Promise.all(
    names.map(async (name): Promise<SidebarMetaOrchestrator> => {
      const raw = readMetadataRaw(getMetaSessionsDir(name), name);
      if (!raw) {
        return { name, session: null };
      }
      const core = sessionFromMetadata(name, raw, {
        projectId: "_meta",
        sessionKind: "meta-orchestrator",
      });
      const agentName = config.metaOrchestrators?.[name]?.agent ?? config.defaults.agent;
      const agent = registry.get<Agent>("agent", agentName);
      const dash = sessionToDashboard(core);
      if (!(await runtimeNotDefinitelyMissing(core, agent, probeTimeoutMs))) {
        // Runtime is gone — show a non-live dot, not a stale "working" one.
        // The sidebar dot level comes from getAttentionLevel → getDetailedAttentionLevel,
        // which reads `lifecycle.sessionState` FIRST and falls through to "working"
        // for any non-terminal lifecycle — so the activity/status overrides alone do
        // NOT stop the glow (the persisted `sessionState` stays "working" because
        // _meta sessions aren't lifecycle-supervised). Neutralize the lifecycle too:
        // `terminated` → isDashboardSessionDone → "done" level (no glow), and
        // `runtimeState = "exited"` truthfully reflects the dead runtime.
        dash.activity = "idle";
        dash.status = "idle";
        if (dash.lifecycle) {
          dash.lifecycle.sessionState = "terminated";
          dash.lifecycle.runtimeState = "exited";
        }
      }
      return { name, session: dash };
    }),
  );
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
