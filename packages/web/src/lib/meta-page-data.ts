import "server-only";

import { cache } from "react";
import { getSessionMetaOwner, isCoordinatorSession } from "@made-by-moonlight/athene-core";
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
import {
  DEFAULT_ATTENTION_ZONE_MODE,
  formatDashboardLoadError,
} from "@/lib/dashboard-page-data";

const FAST_METADATA_ENRICH_TIMEOUT_MS = 3_000;

export interface MetaPageData {
  name: string;
  sessions: DashboardSession[];
  projects: ProjectInfo[];
  /** Ordered registered project IDs — drives per-project color resolution. */
  registeredProjectIds: string[];
  attentionZones: DashboardAttentionZoneMode;
  dashboardLoadError?: string;
}

/**
 * Page data for `/meta/<name>`: the worker fleet owned by the named meta
 * orchestrator, aggregated across all in-scope projects. Returns null when the
 * meta orchestrator is not configured (the route renders notFound()).
 */
export const getMetaPageData = cache(async function getMetaPageData(
  name: string,
): Promise<MetaPageData | null> {
  let config: Awaited<ReturnType<typeof getServices>>["config"];
  let registry: Awaited<ReturnType<typeof getServices>>["registry"];
  let allSessions: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServices>>["sessionManager"]["listCached"]>
  >;

  const projects = getAllProjects();
  const pageData: MetaPageData = {
    name,
    sessions: [],
    projects,
    registeredProjectIds: projects.map((p) => p.id),
    attentionZones: DEFAULT_ATTENTION_ZONE_MODE,
  };

  try {
    const services = await getServices();
    config = services.config;
    registry = services.registry;
    if (!config.metaOrchestrators?.[name]) {
      return null;
    }
    pageData.registeredProjectIds = Object.keys(config.projects);
    pageData.attentionZones = config.dashboard?.attentionZones ?? DEFAULT_ATTENTION_ZONE_MODE;
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

  // The meta's fleet = worker sessions stamped with this meta owner. Coordinator
  // sessions are excluded defensively (meta-orchestrator sessions live under the
  // _meta scope and are not in this project-scoped list, but the guard is cheap).
  const allPrefixes = Object.values(config.projects).map((p) => p.sessionPrefix);
  const coreSessions = allSessions.filter(
    (s) =>
      getSessionMetaOwner(s) === name &&
      !isCoordinatorSession(
        s,
        config.projects[s.projectId]?.sessionPrefix,
        allPrefixes,
      ),
  );

  pageData.sessions = coreSessions.map(sessionToDashboard);

  try {
    await settlesWithin(
      enrichSessionsMetadataFast(coreSessions, pageData.sessions, config, registry),
      FAST_METADATA_ENRICH_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn("[meta-page-data] metadata fast enrichment failed:", err);
  }

  for (let i = 0; i < coreSessions.length; i++) {
    if (!coreSessions[i].pr) continue;
    enrichSessionPR(pageData.sessions[i]);
  }

  return pageData;
});
