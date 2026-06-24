import { type NextRequest } from "next/server";
import {
  appendOrchestrator,
  generateOrchestratorPrompt,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { validateIdentifier } from "@/lib/validation";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/orchestrators — Create a new named orchestrator and start it. */
export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  const nameErr = validateIdentifier(body.name, "name");
  if (nameErr) {
    return jsonWithCorrelation({ error: nameErr }, { status: 400 }, correlationId);
  }
  const name = body.name as string;

  // Validate scope shape
  const scope = body.scope;
  if (scope !== "all" && (typeof scope !== "object" || !Array.isArray((scope as Record<string, unknown>).projects))) {
    return jsonWithCorrelation(
      { error: 'scope must be "all" or { projects: string[] }' },
      { status: 400 },
      correlationId,
    );
  }

  const agent = typeof body.agent === "string" && body.agent.length > 0 ? body.agent : undefined;

  try {
    const { config } = await getServices();

    const orchMap = config.orchestrators ?? config.metaOrchestrators ?? {};
    if (Object.hasOwn(orchMap, name)) {
      return jsonWithCorrelation(
        { error: `An orchestrator named '${name}' already exists` },
        { status: 409 },
        correlationId,
      );
    }

    // Validate explicit project IDs exist
    if (typeof scope === "object" && scope !== null) {
      const projectIds = (scope as { projects: string[] }).projects;
      for (const id of projectIds) {
        if (!Object.hasOwn(config.projects, id)) {
          return jsonWithCorrelation(
            { error: `Unknown project ID: '${id}'` },
            { status: 400 },
            correlationId,
          );
        }
      }
    }

    // Write to config file
    appendOrchestrator(config.configPath, {
      name,
      scope: scope as "all" | { projects: string[] },
      agent,
    });

    // Reload config so ensureOrchestrator sees the new entry
    invalidatePortfolioServicesCache();
    const { config: freshConfig, sessionManager: freshSm } = await getServices();

    const systemPrompt = generateOrchestratorPrompt({ config: freshConfig, name });
    const freshOrchMap = freshConfig.orchestrators ?? freshConfig.metaOrchestrators;
    const orchCfg = freshOrchMap?.[name];
    const session = await freshSm.ensureOrchestrator({
      name,
      systemPrompt,
      agent: orchCfg?.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 201 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to create orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
