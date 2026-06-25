import { type NextRequest } from "next/server";
import {
  updateOrchestrator,
  deleteOrchestrator,
  type OrchestratorUpdateInput,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** PATCH /api/orchestrators/[id] — Update orchestrator display name, scope, or discovery. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  const updates: OrchestratorUpdateInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return jsonWithCorrelation({ error: "name must be a string" }, { status: 400 }, correlationId);
    }
    updates.name = body.name.trim();
  }
  if (body.scope !== undefined) {
    if (body.scope !== "all" && !Array.isArray(body.scope)) {
      return jsonWithCorrelation(
        { error: 'scope must be "all" or an array of directory paths' },
        { status: 400 },
        correlationId,
      );
    }
    updates.scope = body.scope as "all" | string[];
  }
  if (body.discover !== undefined) {
    if (typeof body.discover !== "boolean") {
      return jsonWithCorrelation({ error: "discover must be a boolean" }, { status: 400 }, correlationId);
    }
    updates.discover = body.discover;
  }

  try {
    const { config } = await getServices();
    updateOrchestrator(config.configPath, id, updates);
    invalidatePortfolioServicesCache();
    return jsonWithCorrelation({ ok: true }, { status: 200 }, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update orchestrator";
    const status = msg.includes("not found") ? 404 : 500;
    return jsonWithCorrelation({ error: msg }, { status }, correlationId);
  }
}

/** DELETE /api/orchestrators/[id] — Kill all sessions then remove from config. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = getCorrelationId(request);
  const { id } = await params;

  try {
    const { config, sessionManager } = await getServices();

    // Verify orchestrator exists by UUID
    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    const orchEntry = Object.entries(orchMap).find(([, v]) => (v as { id?: string }).id === id);
    if (!orchEntry) {
      return jsonWithCorrelation({ error: `Orchestrator "${id}" not found` }, { status: 404 }, correlationId);
    }
    const [orchSlug] = orchEntry;

    // Find all worker sessions owned by this orchestrator (by UUID or legacy slug)
    const allSessions = await sessionManager.list();
    const owned = allSessions.filter(
      (s) =>
        s.metadata["orchestratorId"] === id ||
        s.metadata["orchestratorOwner"] === orchSlug ||
        s.metadata["metaOwner"] === orchSlug,
    );

    // Kill all owned sessions concurrently, best-effort, 10s timeout
    const KILL_TIMEOUT_MS = 10_000;
    const killResults = await Promise.allSettled(
      owned.map((s) =>
        Promise.race([
          sessionManager.kill(s.id),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("kill timeout")), KILL_TIMEOUT_MS),
          ),
        ]),
      ),
    );
    const killed = killResults.filter((r) => r.status === "fulfilled").length;

    deleteOrchestrator(config.configPath, id);
    invalidatePortfolioServicesCache();

    return jsonWithCorrelation({ killed }, { status: 200 }, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete orchestrator";
    const status = msg.includes("not found") ? 404 : 500;
    return jsonWithCorrelation({ error: msg }, { status }, correlationId);
  }
}
