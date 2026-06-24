import "server-only";

import { cache } from "react";
import { isCoordinatorSession } from "@made-by-moonlight/athene-core";
import {
  type DashboardSession,
  type DashboardAttentionZoneMode,
} from "@/lib/types";
import { getServices } from "@/lib/services";
import {
  sessionToDashboard,
  enrichSessionPR,
  enrichSessionsMetadataFast,
} from "@/lib/serialize";
import { getAllProjects, type ProjectInfo } from "@/lib/project-name";
import { settlesWithin } from "@/lib/async-utils";
import { listSidebarOrchestrators, type SidebarOrchestrator } from "@/lib/orchestrators";
import {
  DEFAULT_ATTENTION_ZONE_MODE,
  formatDashboardLoadError,
} from "@/lib/dashboard-page-data";

const FAST_METADATA_ENRICH_TIMEOUT_MS = 3_000;

export interface OrchestratorPageData {
  name: string;
  sessions: DashboardSession[];
  /**
   * Full registered project set (registration order). Passed to Dashboard as
   * `projects`, which is the single canonical source for per-project color slots
   * (sidebar + card accents both resolve from this same ordered list).
   */
  projects: ProjectInfo[];
  /** Configured orchestrators (with their _meta session if running). */
  orchestrators: SidebarOrchestrator[];
  attentionZones: DashboardAttentionZoneMode;
  dashboardLoadError?: string;
}

/**
 * Page data for `/orchestrators/<name>`: the worker fleet owned by the named
 * orchestrator, aggregated across all in-scope projects. Returns null when the
 * orchestrator is not configured (the route renders notFound()).
 */
export const getOrchestratorPageData = cache(async function getOrchestratorPageData(
  name: string,
): Promise<OrchestratorPageData | null> {
  let config: Awaited<ReturnType<typeof getServices>>["config"];
  let registry: Awaited<ReturnType<typeof getServices>>["registry"];
  let allSessions: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServices>>["sessionManager"]["listCached"]>
  >;

  const projects = getAllProjects();
  const pageData: OrchestratorPageData = {
    name,
    sessions: [],
    projects,
    orchestrators: [],
    attentionZones: DEFAULT_ATTENTION_ZONE_MODE,
  };

  try {
    const services = await getServices();
    config = services.config;
    registry = services.registry;
    const orchMap = config.orchestrators ?? config.metaOrchestrators;
    if (!orchMap?.[name]) {
      return null;
    }
    pageData.attentionZones = config.dashboard?.attentionZones ?? DEFAULT_ATTENTION_ZONE_MODE;
    pageData.orchestrators = await listSidebarOrchestrators(config, registry);
    try {
      allSessions = await services.sessionManager.listCached();
    } catch (listErr) {
      pageData.dashboardLoadError = formatDashboardLoadError(listErr);
      return pageData;
    }
  } catch (err) {
    pageData.dashboardLoadError = formatDashboardLoadError(err);
    return pageData;
  }

  // The orchestrator's fleet = worker sessions stamped with this orchestrator owner.
  // Coordinator sessions are excluded defensively (orchestrator sessions live under
  // the _meta scope and are not in this project-scoped list, but the guard is cheap).
  const coreSessions = allSessions.filter(
    (s) =>
      !isCoordinatorSession(s) &&
      (s.metadata["orchestratorOwner"] === name || s.metadata["metaOwner"] === name),
  );

  pageData.sessions = coreSessions.map(sessionToDashboard);

  try {
    await settlesWithin(
      enrichSessionsMetadataFast(coreSessions, pageData.sessions, config, registry),
      FAST_METADATA_ENRICH_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn("[orchestrator-page-data] metadata fast enrichment failed:", err);
  }

  for (let i = 0; i < coreSessions.length; i++) {
    if (!coreSessions[i].pr) continue;
    enrichSessionPR(pageData.sessions[i]);
  }

  return pageData;
});

// ---------------------------------------------------------------------------
// Deprecated alias — keep for callers not yet updated
// ---------------------------------------------------------------------------

/** @deprecated Use OrchestratorPageData */
export type MetaPageData = OrchestratorPageData & {
  metaOrchestrators: SidebarOrchestrator[];
  sidebarOrchestrators: never[];
};

/** @deprecated Use getOrchestratorPageData */
export const getMetaPageData = getOrchestratorPageData;
