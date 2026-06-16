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
  listDashboardOrchestrators,
} from "@/lib/serialize";
import { getAllProjects, type ProjectInfo } from "@/lib/project-name";
import { settlesWithin } from "@/lib/async-utils";
import {
  listSidebarMetaOrchestrators,
  buildSidebarProjectOrchestrators,
} from "@/lib/meta-orchestrators";
import type {
  SidebarMetaOrchestrator,
  SidebarProjectOrchestrator,
} from "@/components/SidebarOrchestrators";
import {
  DEFAULT_ATTENTION_ZONE_MODE,
  formatDashboardLoadError,
} from "@/lib/dashboard-page-data";

const FAST_METADATA_ENRICH_TIMEOUT_MS = 3_000;

export interface MetaPageData {
  name: string;
  sessions: DashboardSession[];
  /**
   * Full registered project set (registration order). Passed to Dashboard as
   * `projects`, which is the single canonical source for per-project color slots
   * (sidebar + card accents both resolve from this same ordered list).
   */
  projects: ProjectInfo[];
  /** Configured meta orchestrators (with their _meta session if running). */
  metaOrchestrators: SidebarMetaOrchestrator[];
  /** Per-project orchestrators (enriched sessions) for the sidebar section. */
  sidebarOrchestrators: SidebarProjectOrchestrator[];
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
    metaOrchestrators: [],
    sidebarOrchestrators: [],
    attentionZones: DEFAULT_ATTENTION_ZONE_MODE,
  };

  try {
    const services = await getServices();
    config = services.config;
    registry = services.registry;
    if (!config.metaOrchestrators?.[name]) {
      return null;
    }
    pageData.attentionZones = config.dashboard?.attentionZones ?? DEFAULT_ATTENTION_ZONE_MODE;
    pageData.metaOrchestrators = await listSidebarMetaOrchestrators(config, registry);
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

  // Per-project orchestrators (with enriched sessions) for the sidebar — all
  // projects (the sidebar is unscoped).
  pageData.sidebarOrchestrators = buildSidebarProjectOrchestrators(
    allSessions,
    listDashboardOrchestrators(allSessions, config.projects),
  );

  // The meta's fleet = worker sessions stamped with this meta owner. Coordinator
  // sessions are excluded defensively (meta-orchestrator sessions live under the
  // _meta scope and are not in this project-scoped list, but the guard is cheap).
  const allPrefixes = Object.entries(config.projects).map(([id, p]) => p.sessionPrefix ?? id);
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
