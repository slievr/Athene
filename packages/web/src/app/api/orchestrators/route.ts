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
  if (scope !== "all" && !Array.isArray(scope)) {
    return jsonWithCorrelation(
      { error: 'scope must be "all" or an array of project paths' },
      { status: 400 },
      correlationId,
    );
  }

  const agent = typeof body.agent === "string" && body.agent.length > 0 ? body.agent : undefined;
  const label = typeof body.label === "string" ? body.label.trim() || undefined : undefined;

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

    // Validate that array entries are non-empty strings (they are directory paths)
    if (Array.isArray(scope)) {
      for (const entry of scope) {
        if (typeof entry !== "string" || !entry) {
          return jsonWithCorrelation(
            { error: "scope array entries must be non-empty strings" },
            { status: 400 },
            correlationId,
          );
        }
      }
    }

    // Write to config file
    appendOrchestrator(config.configPath, {
      name,
      scope: scope as "all" | string[],
      agent,
      label,
    });

    // Reload config so ensureOrchestrator sees the new entry
    invalidatePortfolioServicesCache();
    const { config: freshConfig, sessionManager: freshSm } = await getServices();

    const systemPrompt = generateOrchestratorPrompt({ config: freshConfig, name });
    const freshOrchMap = freshConfig.orchestrators ?? freshConfig.metaOrchestrators ?? {};
    const orchCfg = freshOrchMap[name];
    const newId = (freshOrchMap[name] as { id?: string })?.id ?? name;
    const session = await freshSm.ensureOrchestrator({
      name,
      systemPrompt,
      agent: orchCfg?.agent,
    });

    return jsonWithCorrelation({ sessionId: session.id, id: newId }, { status: 201 }, correlationId);
  } catch (err) {
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to create orchestrator" },
      { status: 500 },
      correlationId,
    );
  }
}
