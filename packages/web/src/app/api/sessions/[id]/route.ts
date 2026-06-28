import { type NextRequest } from "next/server";
import {
  getProjectSessionsDir,
  isOpenCodeSessionManager,
  updateMetadata,
} from "@made-by-moonlight/athene-core";
import { getServices } from "@/lib/services";
import { sessionToDashboard } from "@/lib/serialize";
import { stripControlChars, validateIdentifier } from "@/lib/validation";
import { getCorrelationId, jsonWithCorrelation, recordApiObservation } from "@/lib/observability";
import { getSession } from "@/lib/engine-client";

/** Max length of the user-set display name. Matches the spawn-time derivation cap. */
const DISPLAY_NAME_MAX_LENGTH = 80;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return new Response(null, { status: 404 });
  return Response.json(session);
}

/**
 * PATCH /api/sessions/:id — update mutable fields on a session.
 *
 * Currently supports:
 *   - `displayName` (string | null): user-set rename. Empty string or `null`
 *     clears the field, reverting the session to its default title.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(request);
  const startedAt = Date.now();
  const { id } = await params;

  const idErr = validateIdentifier(id, "id");
  if (idErr) {
    return jsonWithCorrelation({ error: idErr }, { status: 400 }, correlationId);
  }

  let body: Record<string, unknown> | null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonWithCorrelation(
      { error: "Invalid JSON in request body" },
      { status: 400 },
      correlationId,
    );
  }
  if (!body || typeof body !== "object") {
    return jsonWithCorrelation({ error: "Invalid request body" }, { status: 400 }, correlationId);
  }

  // Only one mutable field for now — keep validation explicit so adding
  // future fields here is a deliberate edit.
  if (!Object.prototype.hasOwnProperty.call(body, "displayName")) {
    return jsonWithCorrelation(
      { error: "displayName is required" },
      { status: 400 },
      correlationId,
    );
  }
  const raw = body["displayName"];
  if (raw !== null && typeof raw !== "string") {
    return jsonWithCorrelation(
      { error: "displayName must be a string or null" },
      { status: 400 },
      correlationId,
    );
  }

  // Empty / null / whitespace-only ⇒ clear the field (revert to default).
  // Otherwise sanitize: strip control chars, collapse whitespace, trim, cap length.
  const cleaned =
    raw === null
      ? ""
      : stripControlChars(raw).replace(/\s+/g, " ").trim().slice(0, DISPLAY_NAME_MAX_LENGTH);

  try {
    const { config, sessionManager } = await getServices();
    const coreSession = await sessionManager.get(id);
    if (!coreSession) {
      return jsonWithCorrelation({ error: "Session not found" }, { status: 404 }, correlationId);
    }

    const sessionsDir = getProjectSessionsDir(coreSession.projectId);
    // Empty string in updateMetadata removes the key — exactly the "revert to
    // default" semantic. The user-set flag tracks provenance: we set it when
    // the user types a name, clear it when they revert, so the dashboard's
    // fallback chain knows whether to promote `displayName` over PR/issue
    // titles or treat it as an auto-derived spawn artifact.
    updateMetadata(sessionsDir, id, {
      displayName: cleaned,
      displayNameUserSet: cleaned === "" ? "" : "true",
    });

    if (isOpenCodeSessionManager(sessionManager)) {
      sessionManager.invalidateCache();
    }

    const updated = await sessionManager.get(id);
    const dashboardSession = updated
      ? sessionToDashboard(updated)
      : sessionToDashboard(coreSession);

    recordApiObservation({
      config,
      method: "PATCH",
      path: "/api/sessions/[id]",
      correlationId,
      startedAt,
      outcome: "success",
      statusCode: 200,
      projectId: coreSession.projectId,
      sessionId: id,
    });

    return jsonWithCorrelation(dashboardSession, { status: 200 }, correlationId);
  } catch (error) {
    const { config } = await getServices().catch(() => ({ config: undefined }));
    if (config) {
      recordApiObservation({
        config,
        method: "PATCH",
        path: "/api/sessions/[id]",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 500,
        sessionId: id,
        reason: error instanceof Error ? error.message : "Internal server error",
      });
    }
    return jsonWithCorrelation({ error: "Internal server error" }, { status: 500 }, correlationId);
  }
}
