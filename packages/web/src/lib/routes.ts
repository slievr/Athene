export function projectDashboardPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function projectDashboardSessionPath(projectId: string, sessionId: string): string {
  return `${projectDashboardPath(projectId)}?session=${encodeURIComponent(sessionId)}`;
}

export function projectReviewPath(projectId: string | undefined): string {
  return projectId ? `/review?project=${encodeURIComponent(projectId)}` : "/review?project=all";
}

export function projectSessionPath(projectId: string, sessionId: string): string {
  return `${projectDashboardPath(projectId)}/sessions/${encodeURIComponent(sessionId)}`;
}

export function projectSessionHashPath(projectId: string, sessionId: string, hash: string): string {
  return `${projectSessionPath(projectId, sessionId)}${hash}`;
}

export function orchestratorDashboardPath(name: string): string {
  return `/orchestrators/${encodeURIComponent(name)}`;
}

export function orchestratorSessionPath(name: string, sessionId: string): string {
  return `/orchestrators/${encodeURIComponent(name)}/sessions/${encodeURIComponent(sessionId)}`;
}

/** @deprecated Use orchestratorDashboardPath */
export function metaDashboardPath(name: string): string {
  return orchestratorDashboardPath(name);
}
