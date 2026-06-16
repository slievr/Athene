import { type NextRequest } from "next/server";
import {
  appendMetaOrchestrator,
  generateMetaOrchestratorPrompt,
} from "@made-by-moonlight/athene-core";
import { getServices, invalidatePortfolioServicesCache } from "@/lib/services";
import { validateIdentifier } from "@/lib/validation";
import { getCorrelationId, jsonWithCorrelation } from "@/lib/observability";

/** POST /api/meta — Create a new named meta orchestrator and start it. */
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

    if (Object.hasOwn(config.metaOrchestrators ?? {}, name)) {
      return jsonWithCorrelation(
        { error: `A meta orchestrator named '${name}' already exists` },
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
    appendMetaOrchestrator(config.configPath, {
      name,
      scope: scope as "all" | { projects: string[] },
      agent,
    });

    // Reload config so ensureMetaOrchestrator sees the new entry
    invalidatePortfolioServicesCache();
    const { config: freshConfig, sessionManager: freshSm } = await getServices();

    const systemPrompt = generateMetaOrchestratorPrompt({ config: freshConfig, name });
    const metaCfg = freshConfig.metaOrchestrators?.[name];
    const session = await freshSm.ensureMetaOrchestrator({
      name,
      systemPrompt,
      agent: metaCfg?.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id }, { status: 201 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to create meta orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
