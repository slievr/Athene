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
import type { DashboardSession } from "@/lib/types";

/** Default per-orchestrator liveness-probe budget on the SSR hot path. */
const META_PROBE_TIMEOUT_MS = 3_000;

/**
 * Probe whether a session's runtime is NOT definitely missing — conservative:
 * a probe failure returns true (don't claim dead). Mirrors the core relaunch
 * check used by ensureOrchestrator. BOUNDED: for tmux this shells out to
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

/** A named orchestrator and its (optional) running session, for the sidebar. */
export interface SidebarOrchestrator {
  /** YAML key slug (never changes). */
  name: string;
  /** Stable UUID from config. */
  id: string;
  /** Display label from config `name` field. Falls back to slug if absent. */
  label: string;
  session: DashboardSession | null;
}

/**
 * Build the sidebar's orchestrator list from config: each configured orchestrator
 * name paired with its `_meta/<name>` session (if running). Orchestrator sessions
 * live under the reserved `_meta` scope and are NOT supervised by the lifecycle
 * manager, so their persisted state can be stale — we probe the runtime handle here
 * and reflect a non-live (idle) activity when the runtime is gone, rather than a
 * glowing "working" dot.
 */
export async function listSidebarOrchestrators(
  config: OrchestratorConfig,
  registry: PluginRegistry,
  probeTimeoutMs: number = META_PROBE_TIMEOUT_MS,
): Promise<SidebarOrchestrator[]> {
  const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
  const names = Object.keys(orchMap);
  // Probe all orchestrators CONCURRENTLY under a bounded per-probe deadline, so a single
  // hung tmux/ps probe can't stall the dashboard SSR render (total ≈ slowest
  // probe, capped at probeTimeoutMs — not the sum of sequential probes).
  return Promise.all(
    names.map(async (name): Promise<SidebarOrchestrator> => {
      const orchEntry = orchMap[name] as { id?: string; name?: string } | undefined;
      const id = orchEntry?.id ?? name;
      const label = orchEntry?.name ?? name;
      const raw = readMetadataRaw(getMetaSessionsDir(name), name);
      if (!raw) {
        return { name, id, label, session: null };
      }
      const core = sessionFromMetadata(name, raw, {
        projectId: "_meta",
        sessionKind: "orchestrator",
      });
      const agentName = orchMap[name]?.agent ?? config.defaults.agent;
      const agent = registry.get<Agent>("agent", agentName);
      const dash = sessionToDashboard(core);
      if (!(await runtimeNotDefinitelyMissing(core, agent, probeTimeoutMs))) {
        // Runtime is gone — show a non-live dot, not a stale "working" one.
        // The sidebar dot level comes from getAttentionLevel → getDetailedAttentionLevel,
        // which reads `lifecycle.sessionState` FIRST and falls through to "working"
        // for any non-terminal lifecycle — so the activity/status overrides alone do
        // NOT stop the glow (the persisted `sessionState` stays "working" because
        // orchestrator sessions aren't lifecycle-supervised). Neutralize the lifecycle too:
        // `terminated` → isDashboardSessionDone → "done" level (no glow), and
        // `runtimeState = "exited"` truthfully reflects the dead runtime.
        dash.activity = "idle";
        dash.status = "idle";
        if (dash.lifecycle) {
          dash.lifecycle.sessionState = "terminated";
          dash.lifecycle.runtimeState = "exited";
        }
      }
      return { name, id, label, session: dash };
    }),
  );
}

// ---------------------------------------------------------------------------
// Deprecated aliases — keep for callers not yet updated
// ---------------------------------------------------------------------------

/** @deprecated Use SidebarOrchestrator */
export type SidebarMetaOrchestrator = SidebarOrchestrator;

/** @deprecated Use listSidebarOrchestrators */
export const listSidebarMetaOrchestrators = listSidebarOrchestrators;
