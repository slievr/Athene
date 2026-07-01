import { listSessions } from "@/lib/engine-client";
import { isOrchestratorSession } from "@made-by-moonlight/athene-core";

interface RawEngineSession {
  id: string;
  projectId: string;
  lifecycle?: {
    session?: { state?: string };
    pr?: { state?: string };
    runtime?: { state?: string };
  };
  metadata?: Record<string, string>;
  lastActivityAt?: number | null;
  createdAt?: number;
}

const TERMINAL_SESSION_STATES = new Set(["done", "terminated"]);
const TERMINAL_PR_STATES = new Set(["merged"]);
const TERMINAL_RUNTIME_STATES = new Set(["missing", "exited"]);

function isTerminalEngineSession(session: RawEngineSession): boolean {
  const lc = session.lifecycle;
  if (!lc) return false;
  return (
    TERMINAL_SESSION_STATES.has(lc.session?.state ?? "") ||
    TERMINAL_PR_STATES.has(lc.pr?.state ?? "") ||
    TERMINAL_RUNTIME_STATES.has(lc.runtime?.state ?? "")
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project") ?? undefined;
  const activeOnly = searchParams.get("active") === "true";
  const orchestratorOnly = searchParams.get("orchestratorOnly") === "true";

  let raw: RawEngineSession[];
  try {
    raw = (await listSessions(projectId)) as RawEngineSession[];
  } catch {
    // Go engine not available (binary not built or not running) — return empty response
    return Response.json({ sessions: [], stats: null, orchestratorId: null, orchestrators: [] });
  }

  if (orchestratorOnly) {
    const orchSessions = raw.filter((s) => isOrchestratorSession(s));
    const orchestratorId = orchSessions[0]?.id ?? null;
    const orchestrators = orchSessions.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      projectName: s.metadata?.["projectName"] ?? s.projectId,
    }));
    return Response.json({ sessions: [], orchestratorId, orchestrators });
  }

  let sessions = raw.filter((s) => !isOrchestratorSession(s));

  if (activeOnly) {
    sessions = sessions.filter((s) => !isTerminalEngineSession(s));
  }

  // Compute orchestrator info from the full session list
  const orchSessions = raw
    .filter((s) => isOrchestratorSession(s))
    .sort((a, b) => {
      const aTime = a.lastActivityAt ?? a.createdAt ?? 0;
      const bTime = b.lastActivityAt ?? b.createdAt ?? 0;
      return bTime - aTime || a.id.localeCompare(b.id);
    });
  const liveOrch = orchSessions.filter((s) => !isTerminalEngineSession(s));
  const preferredOrch = liveOrch.length > 0 ? liveOrch : orchSessions;
  const orchestratorId = projectId
    ? (preferredOrch.find((s) => s.projectId === projectId)?.id ?? null)
    : (preferredOrch[0]?.id ?? null);
  const orchestrators = preferredOrch.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    projectName: s.metadata?.["projectName"] ?? s.projectId,
  }));

  return Response.json({ sessions, stats: null, orchestratorId, orchestrators });
}
